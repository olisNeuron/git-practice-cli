'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 加载 scenarios/ 目录下的所有场景模块。
 * 每个场景目录包含一个 index.js，导出 { meta, setup, validate }。
 */
function loadScenarios() {
  const dir = path.join(__dirname, '..', '..', 'scenarios');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const scenarios = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const modPath = path.join(dir, entry.name);
    try {
      const mod = require(modPath);
      if (mod && mod.meta) scenarios.push(mod);
    } catch (err) {
      console.error(`[警告] 无法加载场景 ${entry.name}: ${err.message}`);
    }
  }

  scenarios.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  return scenarios;
}

module.exports = { loadScenarios };
