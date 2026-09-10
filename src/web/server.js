'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const { loadScenarios } = require('../core/loader');
const { Session } = require('../core/session');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(PUBLIC_DIR, urlPath);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

function scenarioSummary(s) {
  return { id: s.meta.id, title: s.meta.title, difficulty: s.meta.difficulty };
}

function scenarioMeta(s) {
  return {
    id: s.meta.id,
    title: s.meta.title,
    difficulty: s.meta.difficulty,
    description: s.meta.description,
    goal: s.meta.goal,
  };
}

/**
 * 启动会话服务器。
 * 维护一个全局唯一会话（沙盒 + 场景状态），所有客户端（Web / CLI attach）共享，
 * 任一客户端执行命令后，结果广播给所有客户端，实现实时切换。
 */
function startServer({ openBrowser = true, port } = {}) {
  const PORT = port !== undefined ? port : Number(process.env.PORT) || 3000;
  const scenarios = loadScenarios();
  const total = scenarios.length;

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/scenarios')) {
      sendJSON(res, 200, scenarios.map(scenarioSummary));
      return;
    }
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ server });

  // 全局唯一会话状态
  let session = null;
  let currentIndex = -1;
  let advanceTimer = null;
  const activeSessions = new Set();

  function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  }

  function sendTo(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  async function startSession(id) {
    clearTimeout(advanceTimer);
    if (session) {
      session.cleanup();
      activeSessions.delete(session);
      session = null;
    }
    const scenario = scenarios.find((s) => s.meta.id === id) || scenarios[0];
    currentIndex = scenarios.findIndex((s) => s.meta.id === scenario.meta.id);
    session = new Session(scenario);
    activeSessions.add(session);
    await session.init();
    const snap = await session.snapshot();
    broadcast({
      type: 'scenario',
      meta: scenarioMeta(scenario),
      index: currentIndex,
      total,
      graph: snap.graph,
      status: snap.status,
    });
  }

  async function handleInput(text) {
    if (!session || !session.sandbox) {
      broadcast({ type: 'output', text: '会话正在初始化，请稍候…' });
      return;
    }
    const result = await session.run(text);
    broadcast({ type: 'output', text: result.output });
    broadcast({
      type: 'state',
      graph: result.graph,
      status: result.status,
      action: result.action,
      passed: result.passed,
    });

    if (result.action === 'passed' && currentIndex + 1 < total) {
      // 达成目标后稍作停留，自动进入下一场景
      advanceTimer = setTimeout(() => {
        startSession(scenarios[currentIndex + 1].meta.id);
      }, 1200);
    } else if (result.action === 'next' && currentIndex + 1 < total) {
      await startSession(scenarios[currentIndex + 1].meta.id);
    }
  }

  wss.on('connection', (ws) => {
    sendTo(ws, { type: 'scenarios', scenarios: scenarios.map(scenarioSummary) });

    if (session && session.sandbox) {
      const s = session.scenario;
      session.snapshot().then((snap) =>
        sendTo(ws, {
          type: 'scenario',
          meta: scenarioMeta(s),
          index: currentIndex,
          total,
          graph: snap.graph,
          status: snap.status,
        })
      );
    } else if (!session) {
      // 首个客户端接入时自动开始第一个场景（广播给所有客户端）
      startSession(scenarios[0].meta.id);
    }
    // 若 session 正在初始化（非 null 但 sandbox 尚未就绪），
    // 无需额外处理：startSession 完成后的广播会到达此客户端。

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (_) {
        return;
      }
      if (msg.type === 'start') await startSession(msg.id);
      else if (msg.type === 'input') await handleInput(msg.text);
    });

    ws.on('error', () => {
      // 连接级错误忽略，清理交给 close / shutdown
    });
  });

  function cleanupSession() {
    clearTimeout(advanceTimer);
    for (const s of activeSessions) s.cleanup();
    activeSessions.clear();
    session = null;
  }

  function shutdown() {
    cleanupSession();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 服务器关闭时（含测试直接 close）也清理共享会话
  server.on('close', cleanupSession);

  server.listen(PORT, () => {
    const actualPort = server.address().port;
    const url = `http://localhost:${actualPort}`;
    console.log('');
    console.log('Git 练习工具会话服务器已启动');
    console.log(`  Web 视图:  ${url}`);
    console.log(`  CLI 视图:  node src/cli/cli.js attach${actualPort !== 3000 ? `  (PORT=${actualPort})` : ''}`);
    console.log('  两端实时同步，任一端操作另一端即时刷新');
    console.log('  按 Ctrl+C 退出服务器');
    console.log('');
    if (openBrowser) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${opener} ${url}`, () => {});
    }
  });

  return server;
}

module.exports = { startServer };

if (require.main === module) {
  startServer({ openBrowser: true });
}
