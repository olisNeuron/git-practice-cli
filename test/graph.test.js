'use strict';

// 提交图布局与 SVG 渲染测试。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildLayout, toSVG } = require('../src/web/public/graph.js');

// 线性历史：A <- B <- C（C 最新）
const linear = [
  { hash: 'ccc', parents: ['bbb'], refs: ['HEAD -> main'], subject: 'C' },
  { hash: 'bbb', parents: ['aaa'], refs: [], subject: 'B' },
  { hash: 'aaa', parents: [], refs: [], subject: 'A' },
];

// 分支汇合：merge M（父 H、F），H、F 共同父 A
const merge = [
  { hash: 'mmm', parents: ['hhh', 'fff'], refs: ['HEAD -> main'], subject: 'merge' },
  { hash: 'hhh', parents: ['aaa'], refs: [], subject: 'H' },
  { hash: 'fff', parents: ['aaa'], refs: ['feature'], subject: 'F' },
  { hash: 'aaa', parents: [], refs: [], subject: 'A' },
];

test('graph: 空历史', () => {
  const layout = buildLayout([]);
  assert.equal(layout.nodes.length, 0);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.laneCount, 1);
});

test('graph: 线性历史所有提交在同一泳道', () => {
  const layout = buildLayout(linear);
  assert.deepEqual(layout.nodes.map((n) => n.lane), [0, 0, 0]);
  assert.deepEqual(layout.nodes.map((n) => n.row), [0, 1, 2]);
  assert.equal(layout.edges.length, 2); // C->B, B->A
  assert.equal(layout.laneCount, 1);
});

test('graph: 分支汇合产生两个泳道', () => {
  const layout = buildLayout(merge);
  assert.equal(layout.nodes.length, 4);
  // merge 提交在 lane 0，其后某个父提交会占用 lane 1
  assert.ok(layout.laneCount >= 2, `应有至少 2 条泳道，实际 ${layout.laneCount}`);
  const lanes = new Set(layout.nodes.map((n) => n.lane));
  assert.ok(lanes.size >= 2, '节点应分布在多条泳道');
  // 4 条边：M->H, M->F, H->A, F->A
  assert.equal(layout.edges.length, 4);
});

test('graph: 每条边都能找到目标节点', () => {
  const layout = buildLayout(merge);
  const hashes = new Set(layout.nodes.map((n) => n.hash));
  for (const node of layout.nodes) {
    for (const p of node.parents) {
      assert.ok(hashes.has(p), `父提交 ${p} 应存在于图中`);
    }
  }
});

test('graph: SVG 包含节点、路径与标签', () => {
  const svg = toSVG(buildLayout(merge));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.equal((svg.match(/<circle/g) || []).length, 4, '应有 4 个节点圆点');
  assert.equal((svg.match(/<path/g) || []).length, 4, '应有 4 条边');
  assert.match(svg, /merge/);
  assert.match(svg, /feature/);
});

test('graph: SVG 对 HTML 特殊字符做转义', () => {
  const commits = [
    { hash: 'aaa', parents: [], refs: [], subject: '<script>&"x"' },
  ];
  const svg = toSVG(buildLayout(commits));
  assert.ok(!svg.includes('<script>'), '不应原样输出 <script>');
  assert.match(svg, /&lt;script&gt;/);
});
