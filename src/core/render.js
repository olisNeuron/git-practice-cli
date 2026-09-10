'use strict';

const { Git } = require('./git');

/**
 * 生成提交图 + 分支状态的文本视图。
 */

async function renderGraph(git) {
  const r = await git.run(['log', '--graph', '--oneline', '--all', '--decorate', '--color=never']);
  return r.stdout || '(还没有任何提交)';
}

async function renderStatus(git) {
  const s = await git.run(['status', '--short', '--branch']);
  return s.stdout || '(工作区干净)';
}

/**
 * 结构化提交图数据，供前端绘制 SVG。
 * 返回 [{ hash, parents: [], refs: [], subject }]，按拓扑序（新的在前）。
 */
async function renderGraphData(git) {
  const r = await git.run([
    'log',
    '--all',
    '--pretty=format:%H%x1f%P%x1f%D%x1f%s',
    '--topo-order',
  ]);
  if (!r.ok || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, parents, refs, ...rest] = line.split('\x1f');
      return {
        hash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs ? refs.split(', ').filter(Boolean) : [],
        subject: rest.join('\x1f'),
      };
    });
}

module.exports = { renderGraph, renderStatus, renderGraphData };
