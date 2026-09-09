'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '02-branch',
    title: '创建分支',
    difficulty: '入门',
    description: '仓库在 main 分支上已有一次提交。你需要创建一个名为 feature 的新分支。',
    goal: '创建分支 feature，让它与 main 指向同一个提交',
    hints: [
      'git branch feature 可以在当前提交上创建新分支',
      '也可以用 git checkout -b feature 创建并切换过去',
      '完成后用 git branch 查看分支列表',
    ],
    solution: 'git branch feature',
  },

  async setup(git) {
    await fs.promises.writeFile(path.join(git.cwd, 'a.txt'), '版本 A\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);
  },

  async validate(git) {
    const main = await git.run(['rev-parse', 'main']);
    const feature = await git.run(['rev-parse', 'feature']);

    if (!feature.ok) {
      return { passed: false, message: '分支 feature 还不存在。' };
    }

    if (main.stdout !== feature.stdout) {
      return { passed: false, message: 'feature 和 main 指向不同的提交，请让它们指向同一个提交。' };
    }

    return { passed: true, message: '🎉 完成！feature 分支已创建并指向与 main 相同的提交。' };
  },
};
