'use strict';

// Web 终端行编辑器测试：历史、光标移动、编辑快捷键。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLineEditor } = require('../src/web/public/line-editor.js');

function makeEditor() {
  let out = '';
  const cmds = [];
  const editor = createLineEditor({
    write: (s) => { out += s; },
    prompt: '> ',
    onCommand: (c) => cmds.push(c),
  });
  return { editor, cmds, getOut: () => out };
}

test('line-editor: 输入并回车提交命令', () => {
  const { editor, cmds } = makeEditor();
  editor.handleData('git status');
  editor.handleData('\r');
  assert.deepEqual(cmds, ['git status']);
});

test('line-editor: 回车不提交空命令', () => {
  const { editor, cmds } = makeEditor();
  editor.handleData('   \r');
  assert.deepEqual(cmds, []);
});

test('line-editor: ↑ 调出上一条历史并重新执行', () => {
  const { editor, cmds } = makeEditor();
  editor.handleData('echo hi\r');
  editor.handleData('\x1b[A'); // ↑
  editor.handleData('\r');
  assert.deepEqual(cmds, ['echo hi', 'echo hi']);
});

test('line-editor: ↑↓ 在历史与草稿间切换', () => {
  const { editor } = makeEditor();
  editor.handleData('first\r');
  editor.handleData('second\r');
  editor.handleData('draft');
  editor.handleData('\x1b[A'); // -> second
  assert.equal(editor.getState().buffer, 'second');
  editor.handleData('\x1b[A'); // -> first
  assert.equal(editor.getState().buffer, 'first');
  editor.handleData('\x1b[A'); // 已在最旧，保持 first
  assert.equal(editor.getState().buffer, 'first');
  editor.handleData('\x1b[B'); // -> second
  assert.equal(editor.getState().buffer, 'second');
  editor.handleData('\x1b[B'); // -> draft
  assert.equal(editor.getState().buffer, 'draft');
});

test('line-editor: ←→ 移动光标后在中间插入', () => {
  const { editor } = makeEditor();
  editor.handleData('abc');
  editor.handleData('\x1b[D'); // ←
  editor.handleData('\x1b[D'); // ←
  editor.handleData('X');
  assert.equal(editor.getState().buffer, 'aXbc');
  assert.equal(editor.getState().cursor, 2);
});

test('line-editor: Backspace 与 Delete', () => {
  const { editor } = makeEditor();
  editor.handleData('abc');
  editor.handleData('\x7f'); // 退格 -> ab
  assert.equal(editor.getState().buffer, 'ab');
  editor.handleData('\x1b[D'); // 光标移到 1
  editor.handleData('\x1b[3~'); // Delete -> a
  assert.equal(editor.getState().buffer, 'a');
});

test('line-editor: Home / End', () => {
  const { editor } = makeEditor();
  editor.handleData('hello');
  editor.handleData('\x1b[H'); // Home
  assert.equal(editor.getState().cursor, 0);
  editor.handleData('\x1b[F'); // End
  assert.equal(editor.getState().cursor, 5);
});

test('line-editor: Ctrl+A / Ctrl+E / Ctrl+U / Ctrl+K', () => {
  const { editor } = makeEditor();
  editor.handleData('hello');
  editor.handleData('\x01'); // Ctrl+A
  assert.equal(editor.getState().cursor, 0);
  editor.handleData('\x05'); // Ctrl+E
  assert.equal(editor.getState().cursor, 5);
  editor.handleData('\x15'); // Ctrl+U 删到行首
  assert.equal(editor.getState().buffer, '');
});

test('line-editor: reset 清空缓冲并重新显示提示符', () => {
  const { editor, getOut } = makeEditor();
  editor.handleData('partial');
  editor.reset();
  assert.equal(editor.getState().buffer, '');
  assert.equal(editor.getState().cursor, 0);
  assert.ok(getOut().includes('> '));
});

test('line-editor: 重复命令不重复入历史', () => {
  const { editor } = makeEditor();
  editor.handleData('ls\r');
  editor.handleData('ls\r');
  assert.deepEqual(editor.getState().history, ['ls']);
});
