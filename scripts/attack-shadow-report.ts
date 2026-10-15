// Reports how the pitchless attack detector and the note detector agreed, take by take, from an
// unzipped diagnostic export (Settings > Diagnostic > export). Each take's evenements.jsonl holds
// `note.attack` (the note detector) and `attack.detected` (the attack detector), both stamped with
// the audio time of the attack.
//
//   node --experimental-transform-types scripts/attack-shadow-report.ts <unzipped-archive>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	compareAttacks,
	type ShadowStats
} from '../src/lib/infrastructure/diagnostics/attackShadow.ts';

interface Times {
	notes: number[];
	attacks: number[];
}

/** The audio times of both detectors' attacks in one take's events, one JSON per line. */
function timesOf(jsonl: string): Times {
	const times: Times = { notes: [], attacks: [] };
	for (const line of jsonl.split('\n')) {
		if (line.trim() === '') continue;
		const event = JSON.parse(line) as { kind?: string; audioTime?: number };
		if (typeof event.audioTime !== 'number') continue;
		if (event.kind === 'note.attack') times.notes.push(event.audioTime);
		else if (event.kind === 'attack.detected') times.attacks.push(event.audioTime);
	}
	return times;
}

const ms = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)} ms`);

function describe(label: string, stats: ShadowStats): string {
	return (
		`${label}: both ${stats.both}, only notes ${stats.onlyNotes}, only attacks ${stats.onlyAttacks}, ` +
		`median ${ms(stats.medianDeltaMs)}, p90 |delta| ${ms(stats.p90AbsDeltaMs)}, bias ${ms(stats.biasMs)}`
	);
}

const root = process.argv[2];
if (!root) {
	console.error(
		'usage: node --experimental-transform-types scripts/attack-shadow-report.ts <unzipped-archive>'
	);
	process.exit(1);
}

const takesDir = join(root, 'prises');
if (!existsSync(takesDir)) {
	console.error(`no prises/ folder in ${root}: pass the unzipped diagnostic archive`);
	process.exit(1);
}

const all: Times = { notes: [], attacks: [] };
let counted = 0;
let offset = 0;
for (const take of readdirSync(takesDir).sort()) {
	const file = join(takesDir, take, 'evenements.jsonl');
	if (!existsSync(file)) continue;
	const times = timesOf(readFileSync(file, 'utf8'));
	if (times.notes.length === 0 && times.attacks.length === 0) {
		console.log(`${take}: no attack events (journal off, or recorded before the shadow)`);
		continue;
	}
	console.log(describe(take, compareAttacks(times.notes, times.attacks)));
	// Audio times restart with each context: keep takes apart in the total by shifting them.
	const last = Math.max(0, ...times.notes, ...times.attacks);
	all.notes.push(...times.notes.map((time) => time + offset));
	all.attacks.push(...times.attacks.map((time) => time + offset));
	offset += last + 1;
	counted++;
}

if (counted === 0) console.log('no take with attack events');
else console.log(describe(`total (${counted} takes)`, compareAttacks(all.notes, all.attacks)));
