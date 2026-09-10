'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    id: '04-conflict',
    title: '解决合并冲突',
    difficulty: '进阶',
    description: 'main 和 feature 修改了同一个文件的同一行，合并时会产生冲突。当前 HEAD 在 main。',
    goal: '把 feature 合并到 main，解决冲突，让 app.txt 同时包含两边的改动',
    hints: [
      'git merge feature 会报冲突，用 git status 查看哪个文件冲突',
      '打开 app.txt 会看到 <<<<<<<、=======、>>>>>>> 这些冲突标记',
      '手动编辑 app.txt（或重写它）保留两边内容，再 git add app.txt',
      '最后 git commit 完成合并提交',
    ],
    solution: [
      'git merge feature',
      "printf 'line1\\nline2 (main)\\nline2 (feature)\\nline3\\n' > app.txt",
      'git add app.txt',
      'git commit -m "merge feature, resolve conflict"',
    ].join('\n'),
  },

  async setup(git) {
    const file = path.join(git.cwd, 'app.txt');
    await fs.promises.writeFile(file, 'line1\nline2\nline3\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', '初始提交']);

    await git.run(['checkout', '-b', 'feature']);
    await fs.promises.writeFile(file, 'line1\nline2 (feature)\nline3\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', 'feature 修改 line2']);

    await git.run(['checkout', 'main']);
    await fs.promises.writeFile(file, 'line1\nline2 (main)\nline3\n');
    await git.run(['add', '.']);
    await git.run(['commit', '-m', 'main 修改 line2']);
  },

  async validate(git) {
    const branch = await git.run(['branch', '--show-current']);
    if (branch.stdout !== 'main') {
      return { passed: false, message: `当前在 "${branch.stdout}" 分支，请切回 main。` };
    }

    const status = await git.run(['status', '--porcelain']);
    if (status.stdout) {
      return { passed: false, message: `还有未提交的改动（冲突可能还没解决）：\n${status.stdout}` };
    }

    const merges = await git.run(['rev-list', '--merges', 'HEAD']);
    if (!merges.stdout) {
      return { passed: false, message: '没有产生合并提交，请把 feature 合并到 main。' };
    }

    const content = await fs.promises.readFile(path.join(git.cwd, 'app.txt'), 'utf8');
    if (content.includes('<<<<<<<') || content.includes('>>>>>>>')) {
      return { passed: false, message: 'app.txt 里还有冲突标记，需要手动解决冲突。' };
    }
    if (!content.includes('line2 (main)') || !content.includes('line2 (feature)')) {
      return { passed: false, message: 'app.txt 需要同时保留两边的改动（line2 (main) 与 line2 (feature)）。' };
    }

    return { passed: true, message: '🎉 完成！你成功解决了合并冲突。' };
  },
};
