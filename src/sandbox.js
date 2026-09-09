'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Git } = require('./git');

/**
 * 创建一个隔离的临时 git 仓库沙盒。
 * 每个场景都在全新的目录中初始化，练习不会污染真实仓库。
 */
async function createSandbox(scenarioId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `git-practice-${scenarioId}-`));
  const git = new Git(dir);

  await git.run(['init', '-q']);
  await git.run(['config', 'user.name', 'practice']);
  await git.run(['config', 'user.email', 'practice@example.com']);
  // 避免 commit 不带 -m 时打开编辑器导致挂起
  await git.run(['config', 'core.editor', 'true']);
  // 让默认分支名确定为 main，避免不同环境 init.defaultBranch 差异
  await git.run(['branch', '-M', 'main']);

  return { dir, git, name: path.basename(dir) };
}

function cleanupSandbox(sandbox) {
  try {
    fs.rmSync(sandbox.dir, { recursive: true, force: true });
  } catch (_) {
    // 清理失败不影响退出
  }
}

module.exports = { createSandbox, cleanupSandbox };
