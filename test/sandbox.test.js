'use strict';

// 沙盒生命周期测试：创建、初始化、清理。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createSandbox, cleanupSandbox } = require('../src/core/sandbox');

test('sandbox: 创建为已初始化的 git 仓库，默认分支 main', async () => {
  const sb = await createSandbox('test');
  try {
    assert.ok(fs.existsSync(sb.dir), '沙盒目录应存在');

    const inside = await sb.git.run(['rev-parse', '--is-inside-work-tree']);
    assert.equal(inside.stdout, 'true', '应是一个 git 工作区');

    const branch = await sb.git.run(['branch', '--show-current']);
    assert.equal(branch.stdout, 'main', '默认分支应为 main');

    const status = await sb.git.run(['status', '--porcelain']);
    assert.equal(status.stdout, '', '初始工作区应为干净');
  } finally {
    cleanupSandbox(sb);
  }
});

test('sandbox: cleanup 后目录被删除', async () => {
  const sb = await createSandbox('test');
  assert.ok(fs.existsSync(sb.dir));
  cleanupSandbox(sb);
  assert.equal(fs.existsSync(sb.dir), false, 'cleanup 后目录应被删除');
});

test('sandbox: cleanup 可重复调用且不抛异常', async () => {
  const sb = await createSandbox('test');
  cleanupSandbox(sb);
  assert.doesNotThrow(() => cleanupSandbox(sb));
});
