/**
 * Git 提交图的可视化布局与 SVG 渲染。
 *
 * buildLayout(commits) -> { nodes, edges, laneCount }
 *   commits: [{ hash, parents: [], refs: [], subject }]，拓扑序（新的在前）
 * toSVG(layout) -> SVG 字符串
 *
 * 纯逻辑，不依赖 DOM，便于单元测试。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GitGraph = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 统一饱和度/明度的色家族，避免“彩虹感”
  const PALETTE = ['#2b6cb0', '#2f855a', '#b7791f', '#6b46c1', '#c53030', '#2c7a7b'];

  /** 为每个提交分配行（row）与泳道（lane），并生成父子连线 */
  function buildLayout(commits) {
    const lanes = []; // 每条泳道当前「等待」的提交 hash，null 表示空闲
    const nodes = [];
    const byHash = new Map();

    commits.forEach((commit, row) => {
      let lane = lanes.indexOf(commit.hash);
      if (lane === -1) {
        lane = lanes.indexOf(null);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(null);
        }
        lanes[lane] = commit.hash;
      }
      // 其它泳道若也在等待此提交（分支汇合点），释放它们
      for (let i = 0; i < lanes.length; i++) {
        if (i !== lane && lanes[i] === commit.hash) lanes[i] = null;
      }

      const node = { ...commit, row, lane };
      nodes.push(node);
      byHash.set(commit.hash, node);

      // 首个父提交沿用当前泳道，其余父提交（merge）新开泳道
      lanes[lane] = commit.parents[0] || null;
      for (let i = 1; i < commit.parents.length; i++) {
        const p = commit.parents[i];
        if (lanes.indexOf(p) === -1) {
          let pl = lanes.indexOf(null);
          if (pl === -1) {
            pl = lanes.length;
            lanes.push(null);
          }
          lanes[pl] = p;
        }
      }
    });

    const edges = [];
    for (const node of nodes) {
      for (const p of node.parents) {
        const target = byHash.get(p);
        if (target) {
          edges.push({ fromRow: node.row, fromLane: node.lane, toRow: target.row, toLane: target.lane });
        }
      }
    }

    const laneCount = nodes.reduce((m, n) => Math.max(m, n.lane + 1), 1);
    return { nodes, edges, laneCount };
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function refBadge(ref) {
    if (ref.startsWith('HEAD -> ')) return { text: `[${ref.slice(8)}]`, color: '#b7791f' };
    if (ref === 'HEAD') return { text: '[HEAD]', color: '#b7791f' };
    if (ref.startsWith('tag: ')) return { text: `[${ref.slice(5)}]`, color: '#6b46c1' };
    return { text: `[${ref}]`, color: '#2f855a' };
  }

  function toSVG(layout, opts) {
    const o = Object.assign(
      { rowH: 34, laneW: 20, padX: 16, padY: 20, radius: 5, labelWidth: 420, colors: PALETTE },
      opts || {}
    );
    const { nodes, edges, laneCount } = layout;
    const labelX = o.padX + laneCount * o.laneW + 14;
    const height = o.padY * 2 + Math.max(1, nodes.length) * o.rowH;
    const width = labelX + o.labelWidth;

    const x = (lane) => o.padX + lane * o.laneW;
    const y = (row) => o.padY + row * o.rowH;
    const colorOf = (lane) => o.colors[lane % o.colors.length];

    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'SF Mono','JetBrains Mono',Menlo,Consolas,monospace">`
    );

    for (const e of edges) {
      const x1 = x(e.fromLane);
      const y1 = y(e.fromRow);
      const x2 = x(e.toLane);
      const y2 = y(e.toRow);
      const my = (y1 + y2) / 2;
      parts.push(
        `<path d="M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}" fill="none" stroke="${colorOf(
          e.fromLane
        )}" stroke-width="2" opacity="0.85"/>`
      );
    }

    for (const n of nodes) {
      const cx = x(n.lane);
      const cy = y(n.row);
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${o.radius}" fill="${colorOf(n.lane)}" stroke="#111111" stroke-width="1.5"/>`
      );

      const tspans = [];
      for (const ref of n.refs) {
        const b = refBadge(ref);
        tspans.push(`<tspan fill="${b.color}" font-weight="700">${esc(b.text)} </tspan>`);
      }
      tspans.push(`<tspan fill="#8a8a8a">${esc(n.hash.slice(0, 7))} </tspan>`);
      tspans.push(`<tspan fill="#111111">${esc(n.subject)}</tspan>`);
      parts.push(`<text x="${labelX}" y="${cy + 4}" font-size="12.5">${tspans.join('')}</text>`);
    }

    parts.push('</svg>');
    return parts.join('');
  }

  return { buildLayout, toSVG, PALETTE };
});
