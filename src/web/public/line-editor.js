/**
 * 浏览器终端行编辑器：支持 ↑↓ 历史、←→ 光标、Home/End、Delete
 * 以及 Ctrl+A/E/U/K/L 等常用快捷键。
 *
 * 纯逻辑，不依赖 DOM，方便单元测试。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LineEditor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createLineEditor(opts) {
    const write = opts.write; // (str) => void，输出（含 ANSI 转义）
    const prompt = opts.prompt;
    const onCommand = opts.onCommand; // (cmd) => void，非空命令回车时调用
    const onInterrupt = opts.onInterrupt || function () {};

    let buffer = '';
    let cursor = 0;
    const history = [];
    let historyIndex = -1; // -1 表示正在编辑新命令
    let historyDraft = '';
    const maxHistory = opts.maxHistory || 200;

    function redraw() {
      write('\r\x1b[K' + prompt + buffer);
      const back = buffer.length - cursor;
      if (back > 0) write('\x1b[' + back + 'D');
    }

    function insert(text) {
      buffer = buffer.slice(0, cursor) + text + buffer.slice(cursor);
      cursor += text.length;
      redraw();
    }

    function deleteBackward() {
      if (cursor === 0) return;
      buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
      cursor--;
      redraw();
    }

    function deleteForward() {
      if (cursor >= buffer.length) return;
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
      redraw();
    }

    function move(delta) {
      const next = Math.max(0, Math.min(buffer.length, cursor + delta));
      const diff = next - cursor;
      cursor = next;
      if (diff > 0) write('\x1b[' + diff + 'C');
      else if (diff < 0) write('\x1b[' + -diff + 'D');
    }

    function prevHistory() {
      if (history.length === 0) return;
      if (historyIndex === -1) {
        historyDraft = buffer;
        historyIndex = history.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      } else {
        return;
      }
      buffer = history[historyIndex];
      cursor = buffer.length;
      redraw();
    }

    function nextHistory() {
      if (historyIndex === -1) return;
      if (historyIndex < history.length - 1) {
        historyIndex++;
        buffer = history[historyIndex];
      } else {
        historyIndex = -1;
        buffer = historyDraft;
      }
      cursor = buffer.length;
      redraw();
    }

    function reset() {
      buffer = '';
      cursor = 0;
      historyIndex = -1;
      historyDraft = '';
      write(prompt);
    }

    function submit() {
      write('\r\n');
      const cmd = buffer.trim();
      buffer = '';
      cursor = 0;
      historyIndex = -1;
      historyDraft = '';
      if (cmd) {
        if (history[history.length - 1] !== cmd) {
          history.push(cmd);
          if (history.length > maxHistory) history.shift();
        }
        onCommand(cmd);
      } else {
        write(prompt);
      }
    }

    function handleData(data) {
      // 功能键以整段转义序列投递
      switch (data) {
        case '\x1b[A': case '\x1bOA': return prevHistory();
        case '\x1b[B': case '\x1bOB': return nextHistory();
        case '\x1b[C': case '\x1bOC': return move(1);
        case '\x1b[D': case '\x1bOD': return move(-1);
        case '\x1b[H': case '\x1bOH': case '\x1b[1~': return move(-cursor);
        case '\x1b[F': case '\x1bOF': case '\x1b[4~': return move(buffer.length - cursor);
        case '\x1b[3~': return deleteForward();
        default: break;
      }

      for (const ch of data) {
        const code = ch.codePointAt(0);
        if (ch === '\r' || ch === '\n') submit();
        else if (ch === '\x7f' || ch === '\b') deleteBackward();
        else if (ch === '\x03') {
          write('^C\r\n');
          buffer = '';
          cursor = 0;
          onInterrupt();
          reset();
        } else if (ch === '\x01') move(-cursor); // Ctrl+A 行首
        else if (ch === '\x05') move(buffer.length - cursor); // Ctrl+E 行尾
        else if (ch === '\x0b') {
          buffer = buffer.slice(0, cursor); // Ctrl+K 删到行尾
          redraw();
        } else if (ch === '\x15') {
          buffer = buffer.slice(cursor); // Ctrl+U 删到行首
          cursor = 0;
          redraw();
        } else if (ch === '\x0c') {
          write('\x1b[2J\x1b[H'); // Ctrl+L 清屏
          redraw();
        } else if (code >= 32) {
          insert(ch);
        }
      }
    }

    return {
      handleData,
      reset,
      // 供测试
      getState: () => ({ buffer, cursor, history: history.slice(), historyIndex }),
    };
  }

  return { createLineEditor };
});
