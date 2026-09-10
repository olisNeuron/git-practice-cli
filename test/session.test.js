'use strict';

// Session 命令分发测试：check / hint / graph / status / reset / next / quit 等。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScenarios } = require('../src/core/loader');
const { Session, runShellCommand } = require('../src/core/session');

const scenarios = loadScenarios();
const first = scenarios[0];

function solutionCommands(scenario) {
  return (scenario.meta.solution || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function solve(session, scenario) {
  for (const cmd of solutionCommands(scenario)) {
    await runShellCommand(cmd, session.sandbox.dir);
  }
}

test('session: check 未完成时返回 continue', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const r = await s.run('check');
    assert.equal(r.action, 'continue');
    assert.equal(r.passed, false);
    assert.match(r.output, /尚未达成目标/);
  } finally {
    s.cleanup();
  }
});

test('session: 完成目标后 check 返回 passed 且带提交图', async () => {
  const s = new Session(first);
  await s.init();
  try {
    await solve(s, first);
    const r = await s.run('check');
    assert.equal(r.action, 'passed');
    assert.equal(r.passed, true);
    assert.ok(r.graph.length > 0, '应返回提交图');
  } finally {
    s.cleanup();
  }
});

test('session: hint 逐条返回，用完后提示无更多', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const n = (first.meta.hints || []).length;
    assert.ok(n > 0, '场景应至少有一条提示');
    for (let i = 0; i < n; i++) {
      const r = await s.run('hint');
      assert.match(r.output, new RegExp(`提示 ${i + 1}/${n}`));
    }
    const r = await s.run('hint');
    assert.match(r.output, /没有更多提示/);
  } finally {
    s.cleanup();
  }
});

test('session: graph / status 返回当前状态', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const g = await s.run('graph');
    assert.match(g.output, /还没有任何提交/);
    const st = await s.run('status');
    assert.match(st.output, /main/);
  } finally {
    s.cleanup();
  }
});

test('session: solution 返回参考答案', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const r = await s.run('solution');
    assert.match(r.output, /参考答案/);
  } finally {
    s.cleanup();
  }
});

test('session: reset 后回到初始状态', async () => {
  const s = new Session(first);
  await s.init();
  try {
    await solve(s, first);
    assert.equal((await s.run('check')).passed, true);
    await s.run('reset');
    assert.equal((await s.run('check')).passed, false);
  } finally {
    s.cleanup();
  }
});

test('session: next / quit 返回对应 action', async () => {
  const s = new Session(first);
  await s.init();
  try {
    assert.equal((await s.run('next')).action, 'next');
    assert.equal((await s.run('skip')).action, 'next');
    assert.equal((await s.run('quit')).action, 'quit');
    assert.equal((await s.run('exit')).action, 'quit');
  } finally {
    s.cleanup();
  }
});

test('session: git init 被拦截并给出友好提示', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const r = await s.run('git init');
    assert.match(r.output, /已经初始化/);
  } finally {
    s.cleanup();
  }
});

test('session: 普通 shell 命令会被执行并返回输出', async () => {
  const s = new Session(first);
  await s.init();
  try {
    const r = await s.run('echo hello');
    assert.match(r.output, /hello/);
    assert.equal(r.action, 'continue');
  } finally {
    s.cleanup();
  }
});
