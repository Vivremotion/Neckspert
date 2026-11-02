#!/usr/bin/env node
// Serves this checkout on the port of a ticket: 5200 + issue number.
// Each port is its own origin, so each preview keeps its own IndexedDB,
// apart from production and from the other previews (docs/flux-de-travail.md).
//
//   node scripts/preview.mjs <issue>        build, then serve the production build
//   node scripts/preview.mjs <issue> --dev  the dev server instead (/dev, diagnostic, local exercises)

import { spawn } from 'node:child_process';

const PORT_BASE = 5200;
const PORT_MAX = 65535;

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const issue = Number(args.find((arg) => !arg.startsWith('--')));

if (!Number.isInteger(issue) || issue <= 0 || PORT_BASE + issue > PORT_MAX) {
	console.error('usage: node scripts/preview.mjs <issue> [--dev]');
	process.exit(2);
}

const port = String(PORT_BASE + issue);
const serve = ['--port', port, '--strictPort'];

function run(command, commandArgs) {
	return new Promise((resolve) => {
		const child = spawn(command, commandArgs, { stdio: 'inherit' });
		for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
		child.on('exit', (code) => resolve(code ?? 1));
	});
}

if (dev) {
	process.exit(await run('npx', ['vite', 'dev', ...serve]));
}

const built = await run('npx', ['vite', 'build']);
if (built !== 0) process.exit(built);
console.log(`\nPreview of #${issue}: http://localhost:${port}\n`);
process.exit(await run('npx', ['vite', 'preview', ...serve]));
