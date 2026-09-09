'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const { loadScenarios } = require('../core/loader');
const { Session } = require('../core/session');

const PORT = Number(process.env.PORT) || 3000;
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
  return {
    id: s.meta.id,
    title: s.meta.title,
    difficulty: s.meta.difficulty,
  };
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/scenarios')) {
    sendJSON(res, 200, loadScenarios().map(scenarioSummary));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server });

// 所有活跃会话，用于退出时统一清理
const activeSessions = new Set();

function shutdown() {
  for (const s of activeSessions) s.cleanup();
  activeSessions.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

wss.on('connection', (ws) => {
  let session = null;
  const scenarios = loadScenarios();

  const send = (obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  send({ type: 'scenarios', scenarios: scenarios.map(scenarioSummary) });

  const startSession = async (id) => {
    if (session) {
      session.cleanup();
      activeSessions.delete(session);
    }
    const scenario = scenarios.find((s) => s.meta.id === id) || scenarios[0];
    session = new Session(scenario);
    activeSessions.add(session);
    await session.init();
    const snap = await session.snapshot();
    const index = scenarios.findIndex((s) => s.meta.id === scenario.meta.id);
    send({
      type: 'scenario',
      meta: {
        id: scenario.meta.id,
        title: scenario.meta.title,
        difficulty: scenario.meta.difficulty,
        description: scenario.meta.description,
        goal: scenario.meta.goal,
      },
      index,
      total: scenarios.length,
      graph: snap.graph,
      status: snap.status,
    });
  };

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (_) {
      return;
    }

    if (msg.type === 'start') {
      await startSession(msg.id);
      return;
    }

    if (msg.type === 'input') {
      if (!session) {
        send({ type: 'response', output: '请先选择一个场景。', action: 'continue', passed: false });
        return;
      }
      const result = await session.run(msg.text);
      send({
        type: 'response',
        output: result.output,
        graph: result.graph,
        status: result.status,
        action: result.action,
        passed: result.passed,
      });
      return;
    }

    if (msg.type === 'reset') {
      if (session) {
        const result = await session.run('reset');
        send({
          type: 'response',
          output: result.output,
          graph: result.graph,
          status: result.status,
          action: result.action,
          passed: result.passed,
        });
      }
    }
  });

  ws.on('close', () => {
    if (session) {
      session.cleanup();
      activeSessions.delete(session);
      session = null;
    }
  });

  ws.on('error', () => {
    // 忽略连接级错误，避免进程崩溃；清理交给 close 事件
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('Git 练习工具 Web 版已启动');
  console.log(`请用浏览器打开: ${url}`);
  console.log('按 Ctrl+C 退出');
  console.log('');

  // 尽力自动打开浏览器（无图形环境时静默失败）
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
