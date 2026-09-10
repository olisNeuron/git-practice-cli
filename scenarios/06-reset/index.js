'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '06-reset',
    title: '撤销提交（reset）',
    difficulty: '进阶',
    description: 'main 上有两次提交，最后一次「误提交」不小心把 b.txt 提交了进去。',
    goal: '撤销最后一次提交，但保留 b.txt 文件本身（改动回到工作区/暂存区，不能丢）',
    hints: [
      'git reset HEAD~1 会把 HEAD 回退一个提交，默认保留改动在工作区',
      'git reset --soft HEAD~1 会保留改动在暂存区',
      '千万不要用 --hard，那会连同文件改动一起丢弃',
    ],
    solution: 'git reset HEAD~1',
  },

  async setup(git) {
    await fs.promises.writeFile(path.join(git.cwd, 'a.txt'), 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await fs.promises.writeFile(path.join(git.cwd, 'b.txt'), 'b (不小心提交的)\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '误提交']);
  },

  async validate(git) {
    const count = await git.run(['rev-list', '--count', 'HEAD']);
    if (parseInt(count.stdout, 10) !== 1) {
      return { passed: false, message: `应该只剩下 1 个提交（当前 ${count.stdout} 个），请撤销最后一次提交。` };
    }

    const badInHead = await git.run(['cat-file', '-e', 'HEAD:b.txt']);
    if (badInHead.ok) {
      return { passed: false, message: 'HEAD 里还包含 b.txt，最后一次提交没有被撤销。' };
    }

    const exists = fs.existsSync(path.join(git.cwd, 'b.txt'));
    if (!exists) {
      return { passed: false, message: 'b.txt 被删掉了！撤销提交时要保留改动（用 git reset，不要用 --hard）。' };
    }

    return { passed: true, message: '🎉 完成！提交已撤销，b.txt 的改动保留在工作区。' };
  },
};
