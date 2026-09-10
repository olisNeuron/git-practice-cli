'use strict';

// 场景正确性测试：
//   1. 初始状态不应通过校验（否则场景没意义）
//   2. 场景的参考答案必须能通过校验（否则答案是错的）
// 动态遍历 scenarios/ 下所有场景，新增场景会自动纳入测试。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScenarios } = require('../src/core/loader');
const { Session, runShellCommand } = require('../src/core/session');

const scenarios = loadScenarios();

function solutionCommands(scenario) {
  return (scenario.meta.solution || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

for (const scenario of scenarios) {
  const id = scenario.meta.id;

  test(`场景 ${id}: 初始状态不应通过校验`, async () => {
    const session = new Session(scenario);
    await session.init();
    try {
      const result = await scenario.validate(session.sandbox.git);
      assert.equal(
        result.passed,
        false,
        `初始状态就通过了，场景校验可能有问题：${result.message}`
      );
    } finally {
      session.cleanup();
    }
  });

  test(`场景 ${id}: 参考答案应能通过校验`, async () => {
    const session = new Session(scenario);
    await session.init();
    try {
      const commands = solutionCommands(scenario);
      assert.ok(commands.length > 0, '场景缺少 meta.solution');

      for (const cmd of commands) {
        const r = await runShellCommand(cmd, session.sandbox.dir);
        assert.equal(r.ok, true, `参考答案命令执行失败: ${cmd}\n${r.stderr}`);
      }

      const result = await scenario.validate(session.sandbox.git);
      assert.equal(result.passed, true, `参考答案未能通过校验：${result.message}`);
    } finally {
      session.cleanup();
    }
  });
}

test('场景目录非空', () => {
  assert.ok(scenarios.length > 0, '没有加载到任何场景');
});
