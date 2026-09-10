'use strict';

// Web 前端集成测试：在模拟浏览器环境下加载 app.js，
// 验证方向键不再回显乱码、历史可调出。

const { test } = require('node:test');
const assert = require('node:assert/strict');

function mockElement() {
  return {
    textContent: '',
    innerHTML: '',
    value: '',
    dataset: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
  };
}

function loadApp() {
  const termWrites = [];
  const sent = [];

  class MockTerminal {
    constructor() { globalThis.__term = this; }
    loadAddon() {}
    open() {}
    onData(cb) { this._onData = cb; }
    write(s) { termWrites.push(s); }
    reset() { termWrites.push('__RESET__'); }
  }
  class MockFitAddon { fit() {} }

  globalThis.Terminal = MockTerminal;
  globalThis.FitAddon = { FitAddon: MockFitAddon };
  globalThis.LineEditor = require('../src/web/public/line-editor.js');
  globalThis.location = { protocol: 'http:', host: 'localhost:3000' };
  globalThis.window = { addEventListener() {} };
  globalThis.WebSocket = class {
    constructor() { globalThis.__ws = this; }
    send(s) { sent.push(JSON.parse(s)); }
  };
  globalThis.document = {
    getElementById: () => mockElement(),
    querySelector: () => mockElement(),
    querySelectorAll: () => [],
  };

  delete require.cache[require.resolve('../src/web/public/app.js')];
  require('../src/web/public/app.js');

  return { termWrites, sent, term: globalThis.__term, ws: globalThis.__ws };
}

function type(term, text) {
  for (const ch of text) term._onData(ch);
}

test('web app: 加载后初始化终端并连接 WebSocket', () => {
  const { term, ws } = loadApp();
  assert.ok(term, '应创建终端');
  assert.equal(typeof term._onData, 'function', '应注册 onData');
  assert.ok(ws, '应创建 WebSocket');
});

test('web app: 输入回车会发送命令', () => {
  const { term, sent } = loadApp();
  type(term, 'git status');
  term._onData('\r');
  const inputs = sent.filter((m) => m.type === 'input').map((m) => m.text);
  assert.deepEqual(inputs, ['git status']);
});

test('web app: 方向键不产生 [A 乱码，且 ↑ 能调出历史', () => {
  const { term, sent, termWrites, ws } = loadApp();

  type(term, 'echo hi');
  term._onData('\r');
  // 模拟服务器返回 state，解除 busy 并显示新提示符
  ws.onmessage({ data: JSON.stringify({ type: 'state', graph: '', status: '', action: 'continue', passed: false }) });

  term._onData('\x1b[A'); // ↑ 调历史
  term._onData('\r');

  const allWritten = termWrites.join('');
  assert.ok(!allWritten.includes('[A'), `输出不应包含裸的 [A，实际: ${JSON.stringify(allWritten)}`);

  const inputs = sent.filter((m) => m.type === 'input').map((m) => m.text);
  assert.deepEqual(inputs, ['echo hi', 'echo hi'], '应执行原始命令和历史重放');
});

test('web app: 方向键左右移动光标后插入', () => {
  const { term, sent } = loadApp();
  type(term, 'ac');
  term._onData('\x1b[D'); // ← 光标移到 a 和 c 之间
  type(term, 'b');        // 插入 b -> abc
  term._onData('\r');
  const inputs = sent.filter((m) => m.type === 'input').map((m) => m.text);
  assert.deepEqual(inputs, ['abc']);
});
