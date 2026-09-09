# git-practice-tool

场景化 Git 练习工具：在隔离的沙盒仓库里，用**真实的 git 命令**完成一个个挑战，工具实时校验你是否达成目标。

## 特点

- ✅ 真实 git 行为（在临时目录中运行，不污染你的仓库）
- ✅ 场景化挑战 + 即时校验
- ✅ 分步提示 / 参考答案 / 一键重置
- ✅ 提交图可视化（`graph` 命令）

## 快速开始

```bash
# 从头开始，连续闯关（完成一个自动进入下一个）
node src/cli.js

# 从指定场景开始，往后连续闯关
node src/cli.js 02-branch

# 查看所有场景
node src/cli.js --list
```

进入场景后，直接输入 git 命令即可操作；另有以下特殊命令：

| 命令 | 作用 |
|------|------|
| `check` | 校验当前是否达成目标（达成后自动进入下一场景） |
| `graph` | 查看提交图 |
| `status` | 查看工作区状态 |
| `hint` | 查看下一条提示 |
| `solution` | 查看参考答案 |
| `reset` | 重置当前场景重新开始 |
| `next` | 跳过当前场景，进入下一个 |
| `quit` | 退出 |

## 当前场景

| id | 标题 | 难度 |
|----|------|------|
| 01-init-commit | 初始化并创建第一次提交 | 入门 |
| 02-branch | 创建分支 | 入门 |
| 03-merge | 合并分支 | 入门 |

## 如何新增场景

在 `scenarios/` 下新建一个目录，放入 `index.js`，导出三个部分：

```js
module.exports = {
  meta: {
    id: '04-rebase',
    title: '变基',
    difficulty: '进阶',
    description: '...',
    goal: '...',
    hints: ['...'],
    solution: '...',
  },

  async setup(git) {
    // 用 git.run([...]) 构建初始仓库状态
  },

  async validate(git) {
    // 检查目标状态，返回 { passed, message }
    return { passed: true, message: '🎉 完成！' };
  },
};
```

- `git.run(args)` 返回 `{ ok, code, stdout, stderr }`，不会抛异常。
- `git.cwd` 是沙盒目录，可用 `fs` 直接写入文件来准备内容。
