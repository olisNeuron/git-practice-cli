'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '09-tag',
    title: '打附注标签（tag）',
    difficulty: '进阶',
    description: 'main 上已经有两次提交，现在要发布 1.0.0 版本。',
    goal: '给当前提交打一个附注标签 v1.0.0（annotated tag）',
    hints: [
      '轻量标签：git tag v1.0.0（只是一个指针）',
      '附注标签：git tag -a v1.0.0 -m "release 1.0.0"（带作者、时间、说明）',
      '用 git tag 查看，git show v1.0.0 查看详情',
    ],
    solution: 'git tag -a v1.0.0 -m "release 1.0.0"',
  },

  async setup(git) {
    const write = (name, content) => fs.promises.writeFile(path.join(git.cwd, name), content);
    await write('a.txt', 'a\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await write('b.txt', 'b\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '第二次提交']);
  },

  async validate(git) {
    const tag = await git.run(['tag', '-l', 'v1.0.0']);
    if (tag.stdout !== 'v1.0.0') {
      return { passed: false, message: '标签 v1.0.0 不存在。' };
    }

    const type = await git.run(['cat-file', '-t', 'v1.0.0']);
    if (type.stdout !== 'tag') {
      return { passed: false, message: 'v1.0.0 应该是附注标签（git tag -a），而不是轻量标签。' };
    }

    const tagCommit = await git.run(['rev-parse', 'v1.0.0^{commit}']);
    const head = await git.run(['rev-parse', 'HEAD']);
    if (tagCommit.stdout !== head.stdout) {
      return { passed: false, message: '标签应该指向当前提交（HEAD）。' };
    }

    return { passed: true, message: '🎉 完成！你创建了附注标签 v1.0.0。' };
  },
};
