# git-practice-tool

场景化 Git 练习工具：在隔离的沙盒仓库里，用**真实的 git 命令**完成一个个挑战，工具实时校验你是否达成目标。支持 **CLI 终端模式** 和 **Web 浏览器模式**，两种模式共用同一套场景和校验逻辑。

## 特点

- ✅ 真实 git 行为（在临时目录中运行，不污染你的仓库）
- ✅ 场景化挑战 + 即时校验，完成一个自动进入下一个
- ✅ 分步提示 / 参考答案 / 一键重置 / 跳过
- ✅ 提交图可视化（CLI 文本图 + Web 彩色图）
- ✅ 双端一致：CLI 与 Web 共用同一批场景

## 快速开始

```bash
npm install

# CLI 模式：从头开始，连续闯关
node src/cli/cli.js

# 从指定场景开始
node src/cli/cli.js 02-branch

# 查看所有场景
node src/cli/cli.js --list

# Web 模式：启动本地服务 + 自动打开浏览器
node src/cli/cli.js web
# 或
npm run web
```

Web 版默认监听 `http://localhost:3000`，可用 `PORT=8080` 指定端口。

### 特殊命令

CLI 里直接输入；Web 里可以直接在终端输入，也可以点侧边栏按钮：

| 命令 | 作用 |
|------|------|
| `check` | 校验当前是否达成目标（达成后自动进入下一场景） |
| `graph` | 查看提交图 |
| `status` | 查看工作区状态 |
| `hint` | 查看下一条提示 |
| `solution` | 查看参考答案 |
| `reset` | 重置当前场景重新开始 |
| `next` | 跳过当前场景，进入下一个 |
| `quit` | 退出（仅 CLI） |

## 当前场景

| id | 标题 | 难度 |
|----|------|------|
| 01-init-commit | 初始化并创建第一次提交 | 入门 |
| 02-branch | 创建分支 | 入门 |
| 03-merge | 合并分支 | 入门 |
| 04-conflict | 解决合并冲突 | 进阶 |
| 05-rebase | 变基 | 进阶 |
| 06-reset | 撤销提交（保留改动） | 进阶 |
| 07-stash | 暂存改动 | 进阶 |
| 08-cherry-pick | 挑选提交 | 进阶 |
| 09-tag | 打附注标签 | 进阶 |
| 10-amend | 修正最后一次提交 | 进阶 |
| 11-revert | 安全撤销提交 | 进阶 |

## 测试

使用 Node 内置测试运行器（`node:test`，无需额外依赖）：

```bash
npm test
```

测试覆盖：

- **场景正确性**：每个场景的初始状态必须「未通过」、参考答案必须「通过」——新增场景会自动纳入测试
- **沙盒生命周期**：创建、默认分支、清理
- **Session 命令**：check / hint / graph / status / reset / next / quit 等
- **会话服务器**：HTTP 接口、WebSocket 实时广播、达成目标广播

## 项目结构

```
src/
├── core/               # 共享核心（CLI 与 Web 共用）
│   ├── git.js          # git 命令封装
│   ├── sandbox.js      # 隔离沙盒（临时仓库 + 自动清理）
│   ├── render.js       # 提交图/状态文本
│   ├── loader.js       # 场景加载
│   ├── session.js      # 场景会话（命令分发、校验、提示）
│   └── colors.js       # ANSI 颜色常量
├── cli/
│   └── cli.js          # CLI 前端（终端 REPL）
└── web/
    ├── server.js       # HTTP + WebSocket 服务
    └── public/         # 浏览器前端（xterm.js 终端 + 提交图面板）
```

## 如何新增场景

在 `scenarios/` 下新建一个目录，放入 `index.js`，导出三个部分。**CLI 和 Web 会自动同时生效**：

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
