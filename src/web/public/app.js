'use strict';

/* global Terminal, FitAddon, LineEditor, GitGraph */

(() => {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Space Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
    theme: {
      background: '#101010',
      foreground: '#f3f0e7',
      cursor: '#ffc800',
      selectionBackground: '#ffc80055',
      brightBlack: '#6b6b6b',
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
  const graphText = $('#graph-text');
  const scenarioInfo = $('#scenario-info');
  const scenarioSelect = $('#scenario-select');
  const progressEl = $('#progress');
  const toast = $('#toast');

  let scenarios = [];
  let currentIndex = 0;
  let total = 0;
  let busy = false;
  let toastTimer = null;

  // 支持 ?scenario=04-conflict 深链接
  const initialScenario = new URLSearchParams(location.search).get('scenario');

  const PROMPT = '\x1b[1;35m> \x1b[0m';

  // 提交图状态：视图（图形/文本）× 来源（我的/目标）
  let graphView = 'graph';
  let graphSource = 'mine';
  let graphMine = { text: '', data: [] };
  let graphTarget = { text: '', data: [] };

  // ---------- 工具函数 ----------
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(text, ms = 1600) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
  }

  // ---------- 命令发送 ----------
  function sendCommand(cmd) {
    if (busy) return;
    busy = true;
    ws.send(JSON.stringify({ type: 'input', text: cmd }));
  }

  function startScenario(id) {
    busy = false;
    ws.send(JSON.stringify({ type: 'start', id }));
  }

  // ---------- 行编辑器（↑↓ 历史、←→ 光标、常用快捷键）----------
  const editor = LineEditor.createLineEditor({
    write: (str) => term.write(str),
    prompt: PROMPT,
    onCommand: (cmd) => sendCommand(cmd),
  });

  function writePrompt() {
    editor.reset();
  }

  function writeOutput(text) {
    if (!text) return;
    term.write(text.replace(/\n/g, '\r\n') + '\r\n');
  }

  // ---------- 面板更新 ----------
  function renderGraphPanel() {
    const src = graphSource === 'target' ? graphTarget : graphMine;
    const showText = graphView === 'text';
    graphBox.classList.toggle('hidden', showText);
    graphText.classList.toggle('hidden', !showText);

    if (showText) {
      graphText.textContent = src.text || '(还没有提交)';
      return;
    }
    if (!src.data || src.data.length === 0) {
      graphBox.innerHTML = '<div class="graph-empty">(还没有提交)</div>';
      return;
    }
    const layout = GitGraph.buildLayout(src.data);
    graphBox.innerHTML = GitGraph.toSVG(layout);
  }

  function updateStatus(status) {
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

  // ---------- 终端输入 ----------
  term.onData((data) => {
    if (busy) return;
    editor.handleData(data);
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
      // 若带 ?scenario= 参数，切换到指定场景（服务器默认已开始第一个）
      if (initialScenario && scenarios.some((s) => s.id === initialScenario)) {
        startScenario(initialScenario);
      }
    } else if (msg.type === 'scenario') {
      currentIndex = msg.index;
      total = msg.total;
      updateInfo(msg.meta);
      updateProgress(msg.index, msg.total);
      updateStatus(msg.status);
      graphMine = { text: msg.graph || '', data: msg.graphData || [] };
      graphTarget = { text: msg.targetGraph || '', data: msg.targetGraphData || [] };
      renderGraphPanel();
      scenarioSelect.value = msg.meta.id;
      term.reset();
      term.write(`\x1b[1;36m${escapeHtml(msg.meta.id)}  ${escapeHtml(msg.meta.title)}\x1b[0m\r\n\r\n`);
      busy = false;
      writePrompt();
    } else if (msg.type === 'output') {
      writeOutput(msg.text);
      busy = false;
    } else if (msg.type === 'state') {
      updateStatus(msg.status);
      graphMine = { text: msg.graph || '', data: msg.graphData || [] };
      renderGraphPanel();
      busy = false;

      if (msg.action === 'passed') {
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

  document.querySelectorAll('.graph-tools .tab[data-gview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      graphView = btn.dataset.gview;
      document.querySelectorAll('.tab[data-gview]').forEach((b) => b.classList.toggle('active', b === btn));
      renderGraphPanel();
    });
  });

  document.querySelectorAll('.graph-tools .tab[data-gsource]').forEach((btn) => {
    btn.addEventListener('click', () => {
      graphSource = btn.dataset.gsource;
      document.querySelectorAll('.tab[data-gsource]').forEach((b) => b.classList.toggle('active', b === btn));
      renderGraphPanel();
    });
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
