#!/usr/bin/env node

import { runUnderstandGit, type UnderstandGitAction } from './git.js';

function main(): void {
  const { action, cwd, target, refresh } = parseArgs(process.argv.slice(2));
  const result = runUnderstandGit({
    action,
    cwd,
    target,
    refresh
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseArgs(argv: string[]): {
  action: UnderstandGitAction;
  cwd?: string;
  target?: string;
  refresh: boolean;
} {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') {
    printUsageAndExit(0);
  }

  if (!isAction(command)) {
    printUsageAndExit(1, `Unknown command: ${command}`);
  }

  let cwd: string | undefined;
  let target: string | undefined;
  let refresh = command !== 'uncommitted-manifest';

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) {
      continue;
    }

    if (token === '--cwd') {
      cwd = rest[index + 1];
      index += 1;
      continue;
    }

    if (token === '--target') {
      target = rest[index + 1];
      index += 1;
      continue;
    }

    if (token === '--refresh') {
      refresh = true;
      continue;
    }

    if (token === '--no-refresh') {
      refresh = false;
      continue;
    }

    if (!target && command === 'branch-manifest') {
      target = token;
      continue;
    }

    printUsageAndExit(1, `Unexpected argument: ${token}`);
  }

  if (command === 'branch-manifest' && !target) {
    printUsageAndExit(1, 'branch-manifest requires --target <branch-or-ref>');
  }

  return {
    action: command,
    cwd,
    target,
    refresh
  };
}

function isAction(value: string): value is UnderstandGitAction {
  return value === 'targets' || value === 'branch-manifest' || value === 'uncommitted-manifest';
}

function printUsageAndExit(code: number, message?: string): never {
  const usage = [
    'Usage:',
    '  understand-cli targets [--cwd <repo>] [--refresh|--no-refresh]',
    '  understand-cli branch-manifest --target <branch-or-ref> [--cwd <repo>] [--refresh|--no-refresh]',
    '  understand-cli uncommitted-manifest [--cwd <repo>]'
  ].join('\n');

  const output = message ? `${message}\n\n${usage}\n` : `${usage}\n`;
  const stream = code === 0 ? process.stdout : process.stderr;
  stream.write(output);
  process.exit(code);
}

main();
