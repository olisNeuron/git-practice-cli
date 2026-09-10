'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '10-amend',
    title: '修正最后一次提交（amend）',
    difficulty: '进阶',
    description: '上一次提交忘记把 b.txt 加进去了，b.txt 现在还是未跟踪状态。你不想多出一个「补交」的提交。',
    goal: '把 b.txt 追加进上一次提交，使仓库仍然只有 1 个提交，且它同时包含 a.txt 和 b.txt',
    hints: [
      '先把文件加入暂存区：git add b.txt',
      '再用 git commit --amend 把暂存区内容并入上一次提交',
      '--no-edit 表示沿用原来的提交信息',
    ],
    solution: ['git add b.txt', 'git commit --amend --no-edit'].join('\n'),
  },

  async setup(git) {
    await fs.promises.writeFile(path.join(git.cwd, 'a.txt'), 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);
    // b.txt 未跟踪，等待 amend 补进去
    await fs.promises.writeFile(path.join(git.cwd, 'b.txt'), 'b\n');
  },

  async validate(git) {
    const count = await git.run(['rev-list', '--count', 'HEAD']);
    if (parseInt(count.stdout, 10) !== 1) {
      return { passed: false, message: `应该仍然只有 1 个提交（当前 ${count.stdout} 个），请用 amend 而不是新建提交。` };
    }

    const hasA = await git.run(['cat-file', '-e', 'HEAD:a.txt']);
    const hasB = await git.run(['cat-file', '-e', 'HEAD:b.txt']);
    if (!hasA.ok || !hasB.ok) {
      return { passed: false, message: '最后一次提交应同时包含 a.txt 和 b.txt。' };
    }

    const status = await git.run(['status', '--porcelain']);
    if (status.stdout) {
      return { passed: false, message: `工作区还不干净：\n${status.stdout}` };
    }

    return { passed: true, message: '🎉 完成！你把 b.txt 补进了上一次提交。' };
  },
};
