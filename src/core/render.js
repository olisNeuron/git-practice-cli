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

module.exports = { renderGraph, renderStatus };
