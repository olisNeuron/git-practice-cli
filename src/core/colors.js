'use strict';

// 终端 ANSI 颜色常量（CLI 直接使用；Web 端经 xterm.js 也能解析）
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

module.exports = { c };
