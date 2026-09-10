'use strict';

// 会话服务器测试：HTTP 接口 + WebSocket 实时广播（CLI/Web 共享会话的核心）。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const WebSocket = require('ws');
const { startServer } = require('../src/web/server');

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

/** 收集 WebSocket 消息，支持按类型等待（避免竞态丢消息） */
function collector(ws) {
  const buffer = [];
  const waiters = [];
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (_) {
      return;
    }
    const idx = waiters.findIndex((w) => w.type === msg.type);
    if (idx >= 0) {
      const w = waiters.splice(idx, 1)[0];
      w.resolve(msg);
    } else {
      buffer.push(msg);
    }
  });
  return {
    wait(type, timeout = 4000) {
      const idx = buffer.findIndex((m) => m.type === type);
      if (idx >= 0) return Promise.resolve(buffer.splice(idx, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`等待消息超时: ${type}`)), timeout);
        waiters.push({ type, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
  };
}

async function closeServer(server) {
  await new Promise((resolve) => {
    server.close(resolve);
    setTimeout(resolve, 500).unref();
  });
}

test('server: /api/scenarios 返回场景列表', async () => {
  const server = startServer({ openBrowser: false, port: 0 });
  if (!server.listening) await once(server, 'listening');
  const port = server.address().port;
  try {
    const res = await httpGet(port, '/api/scenarios');
    assert.equal(res.status, 200);
    const list = JSON.parse(res.body);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    assert.ok(list[0].id && list[0].title);
  } finally {
    await closeServer(server);
  }
});

test('server: 首页与静态资源可访问', async () => {
  const server = startServer({ openBrowser: false, port: 0 });
  if (!server.listening) await once(server, 'listening');
  const port = server.address().port;
  try {
    const home = await httpGet(port, '/');
    assert.equal(home.status, 200);
    assert.match(home.body, /Git 练习工具/);

    const app = await httpGet(port, '/app.js');
    assert.equal(app.status, 200);
  } finally {
    await closeServer(server);
  }
});

test('server: 两个客户端共享同一会话并实时广播', async () => {
  const server = startServer({ openBrowser: false, port: 0 });
  if (!server.listening) await once(server, 'listening');
  const port = server.address().port;

  const a = new WebSocket(`ws://127.0.0.1:${port}`);
  const b = new WebSocket(`ws://127.0.0.1:${port}`);
  const ca = collector(a);
  const cb = collector(b);

  try {
    await Promise.all([once(a, 'open'), once(b, 'open')]);

    // 两个客户端都应收到同一个场景（服务器自动开始第一个场景）
    const sa = await ca.wait('scenario');
    const sb = await cb.wait('scenario');
    assert.equal(sa.meta.id, sb.meta.id, '两端应共享同一场景');
    assert.ok(sa.graph !== undefined);

    // A 执行命令，B 应实时收到同样的广播输出
    const bOutput = cb.wait('output');
    a.send(JSON.stringify({ type: 'input', text: 'git status' }));
    const msg = await bOutput;
    assert.equal(typeof msg.text, 'string');

    // B 也应收到状态更新
    const bState = await cb.wait('state');
    assert.ok(bState.graph !== undefined);
  } finally {
    try { a.terminate(); } catch (_) {}
    try { b.terminate(); } catch (_) {}
    await closeServer(server);
  }
});

test('server: 达成目标后 action=passed 并广播', async () => {
  const server = startServer({ openBrowser: false, port: 0 });
  if (!server.listening) await once(server, 'listening');
  const port = server.address().port;

  const a = new WebSocket(`ws://127.0.0.1:${port}`);
  const ca = collector(a);
  try {
    await once(a, 'open');
    await ca.wait('scenario');

    a.send(JSON.stringify({ type: 'input', text: 'git add notes.txt' }));
    await ca.wait('state');
    a.send(JSON.stringify({ type: 'input', text: 'git commit -m "add notes"' }));
    await ca.wait('state');
    a.send(JSON.stringify({ type: 'input', text: 'check' }));

    // 等待 passed 状态
    let msg;
    for (let i = 0; i < 10; i++) {
      msg = await ca.wait('state');
      if (msg.passed) break;
    }
    assert.equal(msg.passed, true, '完成 01 场景后应 passed');
    assert.equal(msg.action, 'passed');
  } finally {
    try { a.terminate(); } catch (_) {}
    await closeServer(server);
  }
});
