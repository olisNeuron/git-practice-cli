#!/usr/bin/env node
'use strict';

const { exec } = require('child_process');
const readline = require('readline');
const { loadScenarios } = require('./loader');
const { createSandbox, cleanupSandbox } = require('./sandbox');
const { renderGraph, renderStatus } = require('./render');

// ---------- 颜色 ----------
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// 当前正在使用的沙盒，供信号处理时清理
let currentSandbox = null;

function cleanupAndExit() {
  if (currentSandbox) {
    cleanupSandbox(currentSandbox);
    currentSandbox = null;
  }
  console.log('\n已退出（沙盒已清理）。');
  process.exit(0);
}

// Ctrl+C / kill 时优雅退出，确保沙盒被清理
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
// 忽略管道关闭（如 | head）导致的 SIGPIPE，避免残留临时目录
process.on('SIGPIPE', () => {});
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
});

/** 在沙盒目录中用 shell 执行用户输入的命令 */
function runShellCommand(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/**
 * 逐行读取器：同时支持交互式 TTY 和管道输入。
 * next() 返回一行文本；输入结束（EOF）时返回 null。
 */
function createLineReader() {
  const rl = readline.createInterface({ input: process.stdin });
  const queue = [];
  let waiters = [];
  let done = false;

  // 交互终端里 readline 处于 raw 模式，Ctrl+C 不会产生 SIGINT 信号，
  // 而是触发接口的 SIGINT 事件，这里手动接管并清理沙盒。
  rl.on('SIGINT', () => {
    cleanupAndExit();
  });

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
  console.log('');
}

/**
 * 运行单个场景，返回结束动作：
 *   'passed' —— 达成目标，应进入下一个场景
 *   'next'   —— 用户主动跳过
 *   'quit'   —— 退出整个练习
 */
async function runScenario(scenario, progress, reader) {
  printScenarioIntro(scenario, progress);
  printHelp();

  const sandbox = await createSandbox(scenario.meta.id);
  currentSandbox = sandbox;
  let hintIndex = 0;

  const boot = async () => {
    await scenario.setup(sandbox.git);
  };
  await boot();

  console.log(`${c.dim}已准备好沙盒仓库，初始状态：${c.reset}`);
  console.log(`${c.dim}${await renderStatus(sandbox.git)}${c.reset}`);
  console.log(`${c.dim}${await renderGraph(sandbox.git)}${c.reset}`);
  console.log(`${c.yellow}小提示:${c.reset} 先运行 ${c.cyan}git status${c.reset} 看看当前状态，随时输入 ${c.cyan}check${c.reset} 校验进度。`);

  const prompt = () =>
    process.stdout.write(`${c.bold}${c.magenta}${sandbox.name}${c.reset} > `);

  while (true) {
    prompt();
    const line = await reader.next();

    if (line === null) {
      console.log(`${c.dim}输入结束，已退出（沙盒已清理）。${c.reset}`);
      cleanupSandbox(sandbox);
      currentSandbox = null;
      return 'quit';
    }

    const input = line.trim();
    if (!input) continue;

    const first = input.split(/\s+/)[0];

    switch (first) {
      case 'check': {
        const result = await scenario.validate(sandbox.git);
        if (result.passed) {
          console.log('');
          console.log(`${c.green}${c.bold}${result.message || '🎉 完成！'}${c.reset}`);
          console.log(`${c.dim}最终提交图：${c.reset}`);
          console.log(`${c.dim}${await renderGraph(sandbox.git)}${c.reset}`);
          cleanupSandbox(sandbox);
          currentSandbox = null;
          return 'passed';
        }
        console.log(`${c.red}✗ 尚未达成目标${c.reset}`);
        console.log(`  ${result.message}`);
        break;
      }

      case 'hint': {
        const hints = scenario.meta.hints || [];
        if (hintIndex < hints.length) {
          console.log(`${c.yellow}提示 ${hintIndex + 1}/${hints.length}:${c.reset} ${hints[hintIndex]}`);
          hintIndex++;
        } else {
          console.log(`${c.dim}没有更多提示了，试试 ${c.cyan}solution${c.reset}${c.dim} 查看答案。${c.reset}`);
        }
        break;
      }

      case 'graph':
        console.log(await renderGraph(sandbox.git));
        break;

      case 'status':
        console.log(await renderStatus(sandbox.git));
        break;

      case 'solution':
        console.log(`${c.yellow}参考答案:${c.reset}`);
        console.log(`  ${(scenario.meta.solution || '').replace(/\n/g, '\n  ')}`);
        break;

      case 'reset': {
        cleanupSandbox(sandbox);
        const fresh = await createSandbox(scenario.meta.id);
        Object.assign(sandbox, fresh);
        await boot();
        hintIndex = 0;
        console.log(`${c.dim}场景已重置，重新开始。${c.reset}`);
        console.log(`${c.dim}${await renderStatus(sandbox.git)}${c.reset}`);
        break;
      }

      case 'next':
      case 'skip': {
        if (progress && progress.index + 1 >= progress.total) {
          console.log(`${c.dim}这已经是最后一个场景了。${c.reset}`);
          break;
        }
        console.log(`${c.dim}已跳过当前场景。${c.reset}`);
        cleanupSandbox(sandbox);
        currentSandbox = null;
        return 'next';
      }

      case 'help':
        printHelp();
        break;

      case 'quit':
      case 'exit':
        console.log(`${c.dim}已退出（沙盒已清理）。${c.reset}`);
        cleanupSandbox(sandbox);
        currentSandbox = null;
        return 'quit';

      default: {
        // 沙盒在创建时已经 git init 过，拦截 git init 避免「Reinitialized」误导
        if (/^git\s+init(\s|$)/.test(input)) {
          console.log(`${c.yellow}提示:${c.reset} 这个沙盒仓库已经初始化好了（工具会自动完成 git init），直接输入 ${c.cyan}git status${c.reset} 开始吧。`);
          break;
        }

        const r = await runShellCommand(input, sandbox.dir);
        if (r.stdout) process.stdout.write(r.stdout.endsWith('\n') ? r.stdout : r.stdout + '\n');
        if (r.stderr) process.stderr.write(r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n');
        if (!r.ok) console.log(`${c.red}(命令退出码 ${r.code})${c.reset}`);
        break;
      }
    }
  }
}

/** 从 startIndex 开始连续闯关，直到退出或全部完成 */
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
  console.log(`  node src/cli.js            从头开始，连续闯关`);
  console.log(`  node src/cli.js <场景id>   从指定场景开始，往后连续闯关`);
  console.log(`  node src/cli.js --list     列出所有场景`);
  console.log('');
  return scenarios;
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--list' || arg === '-l') {
    await listScenarios();
    return;
  }

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
        process.stdout.write(`请输入场景 id（默认 ${scenarios[0].meta.id}）: `);
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
