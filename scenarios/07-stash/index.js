'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '07-stash',
    title: '暂存改动（stash）',
    difficulty: '进阶',
    description: '你正在 main 上改 a.txt（未提交），这时 hotfix 分支需要紧急追加一个修复文件 fix.txt。',
    goal: '暂存当前改动 → 切到 hotfix 并新增 fix.txt 提交 → 切回 main → 恢复之前的改动',
    hints: [
      'git stash 先把 main 上未提交的改动收起来',
      '切到 hotfix：git checkout hotfix，然后新增 fix.txt 并提交',
      '最后切回 main，用 git stash pop 恢复改动',
    ],
    solution: [
      'git stash',
      'git checkout hotfix',
      "printf 'fixed\\n' > fix.txt",
      'git add fix.txt',
      'git commit -m "hotfix: 新增 fix.txt"',
      'git checkout main',
      'git stash pop',
    ].join('\n'),
  },

  async setup(git) {
    const file = path.join(git.cwd, 'a.txt');
    await fs.promises.writeFile(file, 'base\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await git.run(['checkout', '-b', 'hotfix']);
    await fs.promises.writeFile(file, 'hotfix change\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', 'hotfix: 修改 a.txt']);

    await git.run(['checkout', 'main']);
    await fs.promises.writeFile(file, 'wip change\n'); // 未提交的改动
  },

  async validate(git) {
    const branch = await git.run(['branch', '--show-current']);
    if (branch.stdout !== 'main') {
      return { passed: false, message: `最终应回到 main 分支（当前是 "${branch.stdout}"）。` };
    }

    const mainCount = await git.run(['rev-list', '--count', 'main']);
    if (parseInt(mainCount.stdout, 10) !== 1) {
      return { passed: false, message: 'main 上不应该多出提交（未提交的改动要用 stash，不要 commit）。' };
    }

    const fixOnHotfix = await git.run(['cat-file', '-e', 'hotfix:fix.txt']);
    if (!fixOnHotfix.ok) {
      return { passed: false, message: 'hotfix 分支上还没有 fix.txt，请切过去新增并提交。' };
    }

    const branched = await git.run(['merge-base', '--is-ancestor', 'main', 'hotfix']);
    if (!branched.ok) {
      return { passed: false, message: 'hotfix 应该是从 main 分出去的，请检查操作。' };
    }

    const stash = await git.run(['stash', 'list']);
    if (stash.stdout) {
      return { passed: false, message: '还有未处理的 stash，请用 git stash pop 恢复改动。' };
    }

    const content = await fs.promises.readFile(path.join(git.cwd, 'a.txt'), 'utf8');
    if (!content.includes('wip change')) {
      return { passed: false, message: 'main 工作区的改动没有恢复，请用 git stash pop。' };
    }

    return { passed: true, message: '🎉 完成！你熟练掌握了 stash 暂存与恢复。' };
  },
};
