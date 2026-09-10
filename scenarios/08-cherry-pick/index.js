'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '08-cherry-pick',
    title: '挑选提交（cherry-pick）',
    difficulty: '进阶',
    description: 'feature 分支上有两个提交：「新增 c.txt」和「新增 d.txt」。你只想把「新增 c.txt」这一个提交搬到 main 上。当前 HEAD 在 main。',
    goal: '只把 feature 上「新增 c.txt」那个提交 cherry-pick 到 main，不要 d.txt',
    hints: [
      'feature 的提交顺序是：先 c.txt，后 d.txt',
      'git cherry-pick feature~1 可以选中倒数第二个提交（即 c.txt 那个）',
      '完成后 main 应包含 c.txt，且没有 d.txt',
    ],
    solution: 'git cherry-pick feature~1',
  },

  async setup(git) {
    const write = (name, content) => fs.promises.writeFile(path.join(git.cwd, name), content);

    await write('a.txt', 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await git.run(['checkout', '-b', 'feature']);
    await write('c.txt', 'c\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '新增 c.txt']);

    await write('d.txt', 'd\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '新增 d.txt']);

    await git.run(['checkout', 'main']);
  },

  async validate(git) {
    const current = await git.run(['branch', '--show-current']);
    if (current.stdout !== 'main') {
      return { passed: false, message: `请在 main 分支上操作（当前是 "${current.stdout}"）。` };
    }

    const hasC = await git.run(['cat-file', '-e', 'HEAD:c.txt']);
    if (!hasC.ok) {
      return { passed: false, message: 'main 上还没有 c.txt，请把「新增 c.txt」提交 cherry-pick 过来。' };
    }

    const hasD = await git.run(['cat-file', '-e', 'HEAD:d.txt']);
    if (hasD.ok) {
      return { passed: false, message: 'main 上出现了 d.txt，你多挑了一个提交，只需要 c.txt 那个。' };
    }

    const count = await git.run(['rev-list', '--count', 'HEAD']);
    if (parseInt(count.stdout, 10) !== 2) {
      return { passed: false, message: `main 应该有 2 个提交（初始 + cherry-pick），当前 ${count.stdout} 个。` };
    }

    return { passed: true, message: '🎉 完成！你精准地 cherry-pick 了需要的提交。' };
  },
};
