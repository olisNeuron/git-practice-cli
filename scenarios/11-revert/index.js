'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '11-revert',
    title: '安全撤销提交（revert）',
    difficulty: '进阶',
    description: 'main 上的最后一次提交「添加了有问题的文件」引入了一个坏文件 bad.txt，而这次提交已经推送到远程了，不能改写历史。',
    goal: '用 revert 撤销那次提交：新增一个反向提交去掉 bad.txt，同时保留完整历史',
    hints: [
      'revert 不会删除原有提交，而是新增一个「反向操作」的提交',
      'git revert --no-edit HEAD 可以撤销最后一次提交且不打开编辑器',
      '用 git log --oneline 观察历史变化',
    ],
    solution: 'git revert --no-edit HEAD',
  },

  async setup(git) {
    const write = (name, content) => fs.promises.writeFile(path.join(git.cwd, name), content);

    await write('a.txt', 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await write('bad.txt', 'oops\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '添加了有问题的文件']);
  },

  async validate(git) {
    const status = await git.run(['status', '--porcelain']);
    if (status.stdout) {
      return { passed: false, message: `工作区还不干净：\n${status.stdout}` };
    }

    const badInHead = await git.run(['cat-file', '-e', 'HEAD:bad.txt']);
    if (badInHead.ok) {
      return { passed: false, message: 'HEAD 里仍然有 bad.txt，还没有撤销那次提交。' };
    }

    const count = await git.run(['rev-list', '--count', 'HEAD']);
    if (parseInt(count.stdout, 10) !== 3) {
      return {
        passed: false,
        message: `历史应保留为 3 个提交（初始 + 问题提交 + revert），当前 ${count.stdout} 个。revert 是新增提交而不是删历史。`,
      };
    }

    return { passed: true, message: '🎉 完成！你用 revert 安全地撤销了坏提交，历史保持完整。' };
  },
};
