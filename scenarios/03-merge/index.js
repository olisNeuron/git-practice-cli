'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '03-merge',
    title: '合并分支',
    difficulty: '入门',
    description: 'feature 分支上新增了 b.txt 并提交，main 分支还没有这些改动。当前 HEAD 位于 main。',
    goal: '把 feature 分支合并到 main，使 main 包含 b.txt',
    hints: [
      '先确认当前在 main 分支：git branch',
      '用 git merge feature 把 feature 合并进来',
      '合并后可以用 git log --oneline 查看历史',
    ],
    solution: 'git merge feature',
  },

  async setup(git) {
    await fs.promises.writeFile(path.join(git.cwd, 'a.txt'), '版本 A\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await git.run(['checkout', '-b', 'feature']);
    await fs.promises.writeFile(path.join(git.cwd, 'b.txt'), '来自 feature 的内容\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '在 feature 上新增 b.txt']);

    await git.run(['checkout', 'main']);
  },

  async validate(git) {
    const current = await git.run(['branch', '--show-current']);
    if (current.stdout !== 'main') {
      return { passed: false, message: `当前在 "${current.stdout}" 分支，请先切回 main（git checkout main）。` };
    }

    const status = await git.run(['status', '--porcelain']);
    if (status.stdout) {
      return { passed: false, message: `工作区还有未提交的改动：\n${status.stdout}` };
    }

    const mainHasB = await git.run(['cat-file', '-e', 'main:b.txt']);
    if (!mainHasB.ok) {
      return { passed: false, message: 'main 分支上还没有 b.txt，请把 feature 合并到 main。' };
    }

    return { passed: true, message: '🎉 完成！feature 已合并到 main，main 现在包含 b.txt。' };
  },
};
