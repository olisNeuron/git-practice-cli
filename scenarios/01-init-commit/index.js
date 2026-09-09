'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '01-init-commit',
    title: '初始化并创建第一次提交',
    difficulty: '入门',
    description: '仓库里有一个尚未跟踪的文件 notes.txt，工作区里它还没有被纳入版本控制。',
    goal: '把 notes.txt 加入暂存区并完成一次提交',
    hints: [
      '先用 git status 查看当前状态',
      '用 git add notes.txt 把文件加入暂存区',
      '用 git commit -m "..." 创建提交',
    ],
    solution: 'git add notes.txt\ngit commit -m "add notes"',
  },

  async setup(git) {
    await fs.promises.writeFile(path.join(git.cwd, 'notes.txt'), '第一次练习：你好，Git！\n');
  },

  async validate(git) {
    const log = await git.run(['log', '--oneline']);
    if (!log.ok || !log.stdout) {
      return { passed: false, message: '还没有任何提交，先创建一次提交吧。' };
    }

    const status = await git.run(['status', '--porcelain']);
    if (status.stdout) {
      return { passed: false, message: `还有未提交的改动，请先完成提交：\n${status.stdout}` };
    }

    const tracked = await git.run(['ls-files', 'notes.txt']);
    if (!tracked.stdout.includes('notes.txt')) {
      return { passed: false, message: 'notes.txt 还没有被跟踪（加入暂存区）。' };
    }

    return { passed: true, message: '🎉 完成！你成功创建了第一次提交。' };
  },
};
