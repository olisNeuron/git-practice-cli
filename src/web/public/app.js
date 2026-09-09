'use strict';

/* global Terminal, FitAddon */

(() => {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    theme: {
      background: '#010409',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
    },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('terminal'));
  fit.fit();
  window.addEventListener('resize', () => fit.fit());

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProto}://${location.host}`);

  const $ = (sel) => document.querySelector(sel);
  const statusBox = $('#status-box');
  const graphBox = $('#graph-box');
  const scenarioInfo = $('#scenario-info');
  const scenarioSelect = $('#scenario-select');
  const progressEl = $('#progress');
  const toast = $('#toast');

  let scenarios = [];
  let currentIndex = 0;
  let total = 0;
  let busy = false;
  let lineBuffer = '';
  let toastTimer = null;

  const PROMPT = '\x1b[1;35m> \x1b[0m';

  // ---------- 工具函数 ----------
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightGraph(text) {
    let s = escapeHtml(text);
    s = s.replace(/\b([0-9a-f]{7,40})\b/g, '<span class="hash">$1</span>');
    s = s.replace(/\(([^)]*)\)/g, (_m, inner) => {
      let t = inner.replace(/HEAD/g, '\u00a7HEAD\u00a7').replace(/-&gt;/g, '\u00a7ARROW\u00a7');
      t = t.replace(/([A-Za-z0-9_.\/-]+)/g, '<span class="branch">$1</span>');
      t = t.replace(/\u00a7HEAD\u00a7/g, '<span class="head">HEAD</span>');
      t = t.replace(/\u00a7ARROW\u00a7/g, '<span class="arrow">-&gt;</span>');
      return '(' + t + ')';
    });
    return s;
  }

  function showToast(text, ms = 1600) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
  }

  function writePrompt() {
    term.write(PROMPT);
  }

  function writeOutput(text) {
    if (!text) return;
    term.write(text.replace(/\n/g, '\r\n') + '\r\n');
  }

  function updatePanels(graph, status) {
    if (graph !== undefined) graphBox.innerHTML = highlightGraph(graph);
    if (status !== undefined) statusBox.textContent = status;
  }

  function updateInfo(meta) {
    scenarioInfo.innerHTML = `
      <div class="difficulty">难度: ${escapeHtml(meta.difficulty)}</div>
      <h2>${escapeHtml(meta.title)}</h2>
      <div class="label">场景说明</div>
      <p class="desc">${escapeHtml(meta.description)}</p>
      <div class="label">目标</div>
      <p class="goal">${escapeHtml(meta.goal)}</p>
    `;
  }

  function updateProgress(index, totalCount) {
    progressEl.textContent = `第 ${index + 1}/${totalCount} 个场景`;
  }

  // ---------- 命令发送 ----------
  function sendCommand(cmd) {
    if (busy) return;
    busy = true;
    ws.send(JSON.stringify({ type: 'input', text: cmd }));
  }

  function startScenario(id) {
    lineBuffer = '';
    busy = false;
    ws.send(JSON.stringify({ type: 'start', id }));
  }

  // ---------- 终端输入处理 ----------
  term.onData((data) => {
    if (busy) return;
    for (const ch of data) {
      if (ch === '\r') {
        term.write('\r\n');
        const cmd = lineBuffer.trim();
        lineBuffer = '';
        if (cmd) sendCommand(cmd);
        else writePrompt();
      } else if (ch === '\x7f') {
        if (lineBuffer.length) {
          lineBuffer = lineBuffer.slice(0, -1);
          term.write('\b \b');
        }
      } else if (ch === '\x03') {
        term.write('^C\r\n');
        lineBuffer = '';
        writePrompt();
      } else if (ch >= ' ') {
        lineBuffer += ch;
        term.write(ch);
      }
    }
  });

  // ---------- WebSocket 消息 ----------
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (msg.type === 'scenarios') {
      scenarios = msg.scenarios || [];
      scenarioSelect.innerHTML = scenarios
        .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)}</option>`)
        .join('');
      // 服务器会在首个客户端接入时自动开始第一个场景，这里无需手动 start
    } else if (msg.type === 'scenario') {
      currentIndex = msg.index;
      total = msg.total;
      updateInfo(msg.meta);
      updateProgress(msg.index, msg.total);
      updatePanels(msg.graph, msg.status);
      scenarioSelect.value = msg.meta.id;
      term.reset();
      term.write(`\x1b[1;36m${escapeHtml(msg.meta.id)}  ${escapeHtml(msg.meta.title)}\x1b[0m\r\n\r\n`);
      busy = false;
      writePrompt();
    } else if (msg.type === 'output') {
      writeOutput(msg.text);
      busy = false;
    } else if (msg.type === 'state') {
      updatePanels(msg.graph, msg.status);
      busy = false;

      if (msg.action === 'passed') {
        // 服务器会在稍后自动进入下一场景（广播新的 scenario）
        showToast(currentIndex + 1 < total ? '🎉 完成！即将进入下一题...' : '🎉 恭喜！你已完成全部场景！', 2000);
      } else if (msg.action === 'next') {
        showToast('已跳过，进入下一题');
      }
      writePrompt();
    }
  };

  ws.onclose = () => {
    term.write('\r\n\x1b[31m[连接已断开，请刷新页面或重启服务]\x1b[0m\r\n');
  };

  // ---------- 界面控件 ----------
  scenarioSelect.addEventListener('change', () => {
    startScenario(scenarioSelect.value);
  });

  $('#restart-btn').addEventListener('click', () => {
    startScenario(currentIndex >= 0 && scenarios[currentIndex] ? scenarios[currentIndex].id : scenarios[0]?.id);
  });

  document.querySelectorAll('.actions button[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (busy) return;
      const cmd = btn.dataset.cmd;
      term.write(cmd + '\r\n');
      sendCommand(cmd);
    });
  });
})();
