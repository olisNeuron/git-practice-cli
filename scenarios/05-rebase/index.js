'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '05-rebase',
    title: '变基（rebase）',
    difficulty: '进阶',
    description: 'feature 从「初始提交」分支出去并提交了 c.txt，而 main 上又多了 b.txt 的提交，两者已经分叉。当前 HEAD 在 feature。',
    goal: '把 feature 变基到 main 上，使 feature 的历史线性地接在 main 之后，并同时包含 b.txt 和 c.txt',
    hints: [
      'git rebase main 会把当前分支（feature）的提交搬到 main 之后',
      'rebase 后 feature 的历史应是一条直线，没有合并提交',
      '用 git log --oneline --graph --all 观察变化',
    ],
    solution: 'git rebase main',
  },

  async setup(git) {
    const write = (name, content) => fs.promises.writeFile(path.join(git.cwd, name), content);

    await write('a.txt', 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await write('b.txt', 'b\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', 'main 上的新提交']);

    // feature 从「初始提交」分叉出去
    await git.run(['checkout', '-b', 'feature', 'HEAD~1']);
    await write('c.txt', 'c\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', 'feature 提交']);
  },

  async validate(git) {
    const current = await git.run(['branch', '--show-current']);
    if (current.stdout !== 'feature') {
      return { passed: false, message: `请在 feature 分支上操作（当前是 "${current.stdout}"）。` };
    }

    const anc = await git.run(['merge-base', '--is-ancestor', 'main', 'feature']);
    if (!anc.ok) {
      return { passed: false, message: 'feature 还没有变基到 main 上（main 不是 feature 的祖先）。' };
    }

    const merges = await git.run(['rev-list', '--merges', 'feature']);
    if (merges.stdout) {
      return { passed: false, message: 'feature 历史里出现了合并提交，rebase 应该是线性的。' };
    }

    const hasB = await git.run(['cat-file', '-e', 'feature:b.txt']);
    const hasC = await git.run(['cat-file', '-e', 'feature:c.txt']);
    if (!hasB.ok || !hasC.ok) {
      return { passed: false, message: 'feature 应该同时包含 main 的 b.txt 和自己的 c.txt。' };
    }

    return { passed: true, message: '🎉 完成！feature 已线性变基到 main 之上。' };
  },
};
