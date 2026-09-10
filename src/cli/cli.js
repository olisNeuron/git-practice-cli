#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { loadScenarios } = require('../core/loader');
const { Session } = require('../core/session');
const { c } = require('../core/colors');

// 当前活动会话，供信号处理时清理沙盒
let activeSession = null;

function cleanupAndExit() {
  if (activeSession) {
    activeSession.cleanup();
    activeSession = null;
  }
  console.log('\n已退出（沙盒已清理）。');
  process.exit(0);
}

// Ctrl+C / kill 时优雅退出，确保沙盒被清理
// 注意：信号处理器只在 CLI 模式（main 里）注册，避免与 web 模式的处理器冲突
process.on('SIGPIPE', () => {});
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
});

/**
 * 逐行读取器：同时支持交互式 TTY 和管道输入。
 * next() 返回一行文本；输入结束（EOF）时返回 null。
 */
function createLineReader(onInterrupt) {
  // 关键：传 output 并开启 terminal 模式，否则方向键/历史/光标移动全部失效
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    historySize: 200,
  });
  const queue = [];
  let waiters = [];
  let done = false;

  // 交互终端里 readline 处于 raw 模式，Ctrl+C 不会产生 SIGINT 信号，
  // 而是触发接口的 SIGINT 事件，这里手动接管（默认清理沙盒并退出）。
  const handleInterrupt = onInterrupt || cleanupAndExit;
  rl.on('SIGINT', () => handleInterrupt());

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });

  rl.on('close', () => {
    done = true;
    for (const w of waiters) w(null);
    waiters = [];
  });

  return {
    next() {
      if (queue.length) return Promise.resolve(queue.shift());
      if (done) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    // 显示提示符：交给 readline 管理，以支持 ↑↓ 历史、←→ 光标移动等行编辑
    prompt(text) {
      rl.setPrompt(text);
      rl.prompt();
    },
    close() {
      rl.close();
    },
  };
}

function printScenarioIntro(scenario, progress) {
  const m = scenario.meta;
  const badge = progress ? `  ${c.dim}[第 ${progress.index + 1}/${progress.total} 个场景]${c.reset}` : '';
  console.log('');
  console.log(`${c.bold}${c.cyan}════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${m.id}  ${m.title}${c.reset}`);
  console.log(`${c.dim}  难度: ${m.difficulty}${badge}`);
  console.log(`${c.bold}${c.cyan}════════════════════════════════════════${c.reset}`);
  console.log('');
  console.log(`${c.bold}场景说明${c.reset}`);
  console.log(`  ${m.description}`);
  console.log('');
  console.log(`${c.bold}${c.green}目标${c.reset}`);
  console.log(`  ${c.yellow}${m.goal}${c.reset}`);
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(`${c.bold}可用命令${c.reset}`);
  console.log(`  直接输入任何 shell / git 命令，会在沙盒中真实执行`);
  console.log(`  ${c.cyan}check${c.reset}      校验当前是否达成目标`);
  console.log(`  ${c.cyan}graph${c.reset}      查看提交图`);
  console.log(`  ${c.cyan}status${c.reset}     查看工作区状态`);
  console.log(`  ${c.cyan}hint${c.reset}       查看下一条提示`);
  console.log(`  ${c.cyan}solution${c.reset}   查看参考答案`);
  console.log(`  ${c.cyan}reset${c.reset}      重置当前场景（重新开始）`);
  console.log(`  ${c.cyan}next${c.reset}       跳过当前场景，进入下一个`);
  console.log(`  ${c.cyan}quit${c.reset}       退出整个练习`);
  console.log(`  ${c.cyan}web${c.reset}        提示：可在浏览器中体验可视化版（见 README）`);
  console.log('');
}

/** 运行单个场景，返回 'passed' | 'next' | 'quit' */
async function runScenario(scenario, progress, reader) {
  printScenarioIntro(scenario, progress);
  printHelp();

  const session = new Session(scenario);
  await session.init();
  activeSession = session;

  console.log(`${c.dim}已准备好沙盒仓库，初始状态：${c.reset}`);
  console.log(`${c.dim}${await session.status()}${c.reset}`);
  console.log(`${c.dim}${await session.graph()}${c.reset}`);
  console.log(`${c.yellow}小提示:${c.reset} 先运行 ${c.cyan}git status${c.reset} 看看当前状态，随时输入 ${c.cyan}check${c.reset} 校验进度。`);

  const promptStr = `${c.bold}${c.magenta}${session.sandbox.name}${c.reset} > `;

  while (true) {
    reader.prompt(promptStr);
    const line = await reader.next();

    if (line === null) {
      console.log(`${c.dim}输入结束，已退出（沙盒已清理）。${c.reset}`);
      session.cleanup();
      activeSession = null;
      return 'quit';
    }

    const input = line.trim();
    if (!input) continue;

    const result = await session.run(input);

    if (result.output) console.log(result.output);

    if (result.action === 'passed') {
      console.log(`${c.dim}最终提交图：${c.reset}`);
      console.log(`${c.dim}${result.graph}${c.reset}`);
      session.cleanup();
      activeSession = null;
      return 'passed';
    }
    if (result.action === 'next') {
      session.cleanup();
      activeSession = null;
      return 'next';
    }
    if (result.action === 'quit') {
      session.cleanup();
      activeSession = null;
      return 'quit';
    }
  }
}

/** 从 startIndex 开始连续闯关 */
async function runAll(scenarios, startIndex, reader) {
  for (let i = startIndex; i < scenarios.length; i++) {
    const action = await runScenario(scenarios[i], { index: i, total: scenarios.length }, reader);

    if (action === 'quit') return;

    if (action === 'passed' && i + 1 < scenarios.length) {
      console.log(`${c.dim}────────── 进入下一个场景 ──────────${c.reset}`);
    }
  }
  console.log('');
  console.log(`${c.green}${c.bold}🎉 恭喜！你已完成全部场景！${c.reset}`);
  console.log('');
}

async function listScenarios() {
  const scenarios = loadScenarios();
  console.log('');
  console.log(`${c.bold}可用场景：${c.reset}`);
  for (const s of scenarios) {
    console.log(`  ${c.cyan}${s.meta.id}${c.reset}  ${s.meta.title}  ${c.dim}(${s.meta.difficulty})${c.reset}`);
  }
  console.log('');
  console.log(`用法:`);
  console.log(`  git-practice                 从头开始，连续闯关（独立 CLI 模式）`);
  console.log(`  git-practice <场景id>        从指定场景开始，往后连续闯关`);
  console.log(`  git-practice --list          列出所有场景`);
  console.log(`  git-practice web             启动共享服务器 + 浏览器（Web 视图）`);
  console.log(`  git-practice attach          以 CLI 方式连接共享服务器（实时切换）`);
  console.log(`  git-practice serve           仅启动共享服务器（不开浏览器）`);
  console.log('');
  return scenarios;
}

function printAttachHeader(meta, index, total) {
  console.log('');
  console.log(`${c.bold}${c.cyan}════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${meta.id}  ${meta.title}${c.reset}`);
  console.log(`${c.dim}  难度: ${meta.difficulty}  [第 ${index + 1}/${total} 个场景]${c.reset}`);
  console.log(`${c.bold}${c.cyan}════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}目标${c.reset}: ${c.yellow}${meta.goal}${c.reset}`);
  console.log('');
}

/** 以 CLI 客户端方式连接共享会话服务器，实现与 Web 的实时切换 */
async function attachCli() {
  const PORT = Number(process.env.PORT) || 3000;
  const url = `ws://localhost:${PORT}`;
  console.log(`${c.dim}正在连接会话服务器 ${url} ...${c.reset}`);

  const ws = new WebSocket(url);
  const reader = createLineReader(() => {
    console.log(`\n${c.dim}已断开连接（服务器仍在运行）。${c.reset}`);
    ws.close();
    process.exit(0);
  });

  ws.onopen = () => {
    console.log(`${c.green}已连接${c.reset}。输入命令操作；${c.cyan}quit${c.reset} 断开连接（不影响服务器）。`);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (msg.type === 'scenario') {
      printAttachHeader(msg.meta, msg.index, msg.total);
      console.log(`${c.dim}${msg.status}${c.reset}`);
      console.log(`${c.dim}${msg.graph}${c.reset}`);
    } else if (msg.type === 'output') {
      if (msg.text) console.log(msg.text);
    } else if (msg.type === 'state') {
      if (msg.action === 'passed') {
        console.log(`${c.dim}最终提交图：${c.reset}`);
        console.log(`${c.dim}${msg.graph}${c.reset}`);
      }
    }
  };

  ws.onerror = () => {
    console.error(`${c.red}连接失败${c.reset}：请先启动服务器（${c.cyan}node src/cli/cli.js web${c.reset} 或 ${c.cyan}serve${c.reset}）`);
    process.exit(1);
  };

  ws.onclose = () => {
    console.log(`${c.dim}连接已断开。${c.reset}`);
    process.exit(0);
  };

  while (true) {
    reader.prompt(`${c.bold}${c.magenta}attach${c.reset} > `);
    const line = await reader.next();
    if (line === null) {
      ws.close();
      return;
    }
    const input = line.trim();
    if (!input) continue;
    if (input === 'quit' || input === 'exit') {
      console.log(`${c.dim}已断开连接（服务器仍在运行）。${c.reset}`);
      ws.close();
      return;
    }
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input', text: input }));
    }
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--list' || arg === '-l') {
    await listScenarios();
    return;
  }

  if (arg === 'web') {
    require('../web/server').startServer({ openBrowser: true });
    return;
  }
  if (arg === 'serve') {
    require('../web/server').startServer({ openBrowser: false });
    return;
  }
  if (arg === 'attach') {
    await attachCli();
    return;
  }

  // CLI 模式：注册信号处理器，确保 Ctrl+C 时清理沙盒
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  const scenarios = loadScenarios();
  if (scenarios.length === 0) {
    console.error('没有找到任何场景，请在 scenarios/ 目录下添加。');
    process.exit(1);
  }

  // 整个会话共用一个行读取器，避免多个 readline 实例争抢 stdin
  const reader = createLineReader();

  let startIndex = 0;
  if (arg) {
    const found = scenarios.findIndex((s) => s.meta.id === arg);
    if (found === -1) {
      console.log(`${c.red}未找到场景 "${arg}"${c.reset}\n`);
      await listScenarios();

      if (process.stdin.isTTY) {
        reader.prompt(`请输入场景 id（默认 ${scenarios[0].meta.id}）: `);
        const choice = await reader.next();
        const chosen = (choice || '').trim();
        startIndex = scenarios.findIndex((s) => s.meta.id === chosen);
        if (startIndex === -1) startIndex = 0;
      }
    } else {
      startIndex = found;
    }
  }

  await runAll(scenarios, startIndex, reader);
  reader.close();
}

main().catch((err) => {
  console.error('出错了：', err);
  process.exit(1);
});
