'use strict';

const { exec } = require('child_process');
const { createSandbox, cleanupSandbox } = require('./sandbox');
const { renderGraph, renderStatus } = require('./render');
const { c } = require('./colors');

/** 在沙盒目录中用 shell 执行一条命令 */
function runShellCommand(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/**
 * 单个场景的运行时会话。
 * 封装了沙盒生命周期 + 命令分发（check/hint/graph/status/solution/reset/next/quit）。
 * CLI 与 Web 共用，保证两端行为一致。
 *
 * run(input) 返回：
 *   { action, passed, output, graph, status }
 *     action: 'continue' | 'passed' | 'next' | 'quit'
 */
class Session {
  constructor(scenario) {
    this.scenario = scenario;
    this.sandbox = null;
    this.hintIndex = 0;
  }

  async init() {
    this.sandbox = await createSandbox(this.scenario.meta.id);
    await this.scenario.setup(this.sandbox.git);
    this.hintIndex = 0;
    return this;
  }

  cleanup() {
    if (this.sandbox) {
      cleanupSandbox(this.sandbox);
      this.sandbox = null;
    }
  }

  async graph() {
    return renderGraph(this.sandbox.git);
  }

  async status() {
    return renderStatus(this.sandbox.git);
  }

  async snapshot() {
    return { graph: await this.graph(), status: await this.status() };
  }

  async run(input) {
    const first = input.split(/\s+/)[0];
    let output = '';
    let action = 'continue';
    let passed = false;

    switch (first) {
      case 'check': {
        const r = await this.scenario.validate(this.sandbox.git);
        if (r.passed) {
          passed = true;
          action = 'passed';
          output = `${c.green}${c.bold}${r.message || '🎉 完成！'}${c.reset}`;
        } else {
          output = `${c.red}✗ 尚未达成目标${c.reset}\n  ${r.message}`;
        }
        break;
      }

      case 'hint': {
        const hints = this.scenario.meta.hints || [];
        if (this.hintIndex < hints.length) {
          output = `${c.yellow}提示 ${this.hintIndex + 1}/${hints.length}:${c.reset} ${hints[this.hintIndex]}`;
          this.hintIndex++;
        } else {
          output = `${c.dim}没有更多提示了，试试 ${c.cyan}solution${c.reset}${c.dim} 查看答案。${c.reset}`;
        }
        break;
      }

      case 'graph':
        output = await this.graph();
        break;

      case 'status':
        output = await this.status();
        break;

      case 'solution':
        output = `${c.yellow}参考答案:${c.reset}\n  ${(this.scenario.meta.solution || '').replace(/\n/g, '\n  ')}`;
        break;

      case 'reset': {
        this.cleanup();
        await this.init();
        output = `${c.dim}场景已重置，重新开始。${c.reset}`;
        break;
      }

      case 'next':
      case 'skip':
        action = 'next';
        output = `${c.dim}已跳过当前场景。${c.reset}`;
        break;

      case 'quit':
      case 'exit':
        action = 'quit';
        output = `${c.dim}已退出。${c.reset}`;
        break;

      default: {
        // 沙盒创建时已 git init，拦截 git init 避免「Reinitialized」误导
        if (/^git\s+init(\s|$)/.test(input)) {
          output = `${c.yellow}提示:${c.reset} 这个沙盒仓库已经初始化好了（工具会自动完成 git init），直接输入 ${c.cyan}git status${c.reset} 开始吧。`;
        } else {
          const r = await runShellCommand(input, this.sandbox.dir);
          let o = r.stdout;
          if (r.stderr) o += (o ? '\n' : '') + r.stderr;
          if (!r.ok) o += `${o ? '\n' : ''}${c.red}(命令退出码 ${r.code})${c.reset}`;
          output = o;
        }
        break;
      }
    }

    const snap = await this.snapshot();
    return { action, passed, output, graph: snap.graph, status: snap.status };
  }
}

module.exports = { Session, runShellCommand };
