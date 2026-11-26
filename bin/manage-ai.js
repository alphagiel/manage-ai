#!/usr/bin/env node
// npx manage-ai — starts the local dashboard and opens it in your browser.

import { spawn } from 'node:child_process';
import { start } from '../server/index.js';

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  manage-ai — see and clean up what your AI tools save on this computer

  Usage: npx manage-ai [--port 4747] [--no-open]

  Runs on 127.0.0.1 only. Nothing leaves your machine.
`);
  process.exit(0);
}

const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT) || 4747;

const url = await start(port).catch((e) => {
  console.error(`\n  Couldn't start manage-ai: ${e.message}\n`);
  process.exit(1);
});

console.log(`\n  🤖 manage-ai is running → ${url}`);
console.log('  Nothing leaves your machine. Press Ctrl+C to stop.\n');

if (!args.includes('--no-open') && !process.env.CI) {
  const [cmd, ...rest] = process.platform === 'darwin' ? ['open']
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '""'] : ['xdg-open'];
  spawn(cmd, [...rest, url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
