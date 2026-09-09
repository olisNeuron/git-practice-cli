'use strict';

const { execFile } = require('child_process');

/**
 * 在指定目录中执行 git 命令的轻量封装。
 * 统一返回 { ok, code, stdout, stderr }，不抛异常，方便 setup/validate 判断状态。
 */
class Git {
  constructor(cwd) {
    this.cwd = cwd;
  }

  run(args) {
    return new Promise((resolve) => {
      execFile(
        'git',
        args,
        { cwd: this.cwd, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            code: err ? err.code : 0,
            stdout: (stdout || '').trim(),
            stderr: (stderr || '').trim(),
          });
        }
      );
    });
  }
}

module.exports = { Git };
