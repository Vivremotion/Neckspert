// Cuts labelled chord excerpts from the triad detection corpus (format neckspert-triads-corpus
// v1, recorded on the spike's /dev/corpus page) into small WAV fixtures for the chord verifier.
//
//   node --experimental-transform-types scripts/cut-triad-fixtures.ts <corpusDir> <outDir>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Excerpt from BEFORE_S before the scheduled beat to AFTER_S after it. */
const BEFORE_S = 0.4;
const AFTER_S = 2.1;

interface Pick {
	key: string;
	frets: number[];
	previous: number[] | null;
	expect: 'recognized' | 'frozen';
	/** Frozen cases: the decision the verifier gave when the fixture was cut (non-regression). */
	frozenDecision?: string | null;
}

const PICKS: Pick[] = [
	{ key: 'relier_D_plaque_di', frets: [2, 3, 2], previous: null, expect: 'recognized' },
	{ key: 'relier_G_plaque_di', frets: [4, 3, 3], previous: null, expect: 'recognized' },
	{ key: 'relier_Ebm_plaque_di', frets: [3, 4, 2], previous: null, expect: 'recognized' },
	{ key: 'relier_A_arpege_di', frets: [2, 2, 0], previous: null, expect: 'recognized' },
	{ key: 'relier_Fsm_arpege_di', frets: [2, 2, 2], previous: null, expect: 'recognized' },
	{ key: 'relier_C_melange_di', frets: [0, 1, 0], previous: null, expect: 'recognized' },
	{ key: 'relier_F_melange_di', frets: [2, 1, 1], previous: null, expect: 'recognized' },
	{ key: 'relier_D_plaque_micro', frets: [2, 3, 2], previous: null, expect: 'recognized' },
	{ key: 'relier_Em_plaque_micro', frets: [0, 0, 0], previous: null, expect: 'recognized' },
	{ key: 'relier_Ab_arpege_micro', frets: [5, 4, 4], previous: null, expect: 'recognized' },
	// The spike's two octave traps: a shape sharing two notes with the chord still ringing.
	// The ringing chord is never a candidate. D: a FALSE ACCEPTANCE today, another inversion
	// (11-10-10) is retained instead of 2-3-2 — a known risk for the memory mechanics.
	// Ab: nothing is retained.
	{
		key: 'relier_D_plaque_di',
		frets: [2, 3, 2],
		previous: [7, 7, 5],
		expect: 'frozen',
		frozenDecision: '11,10,10'
	},
	{
		key: 'relier_Ab_plaque_di',
		frets: [8, 9, 8],
		previous: [5, 4, 4],
		expect: 'frozen',
		frozenDecision: null
	}
];

interface CorpusEvent {
	kind: string;
	voicing: {
		chord: string;
		root: string;
		quality: string;
		rootString: string;
		frets: number[];
		midi: number[];
	};
	previous: { frets: number[] } | null;
	timeSec: number;
	ok: boolean;
}

function readPcm16Mono(buffer: Buffer): { sampleRate: number; samples: Int16Array } {
	let offset = 12;
	let sampleRate = 0;
	while (offset + 8 <= buffer.length) {
		const id = buffer.toString('ascii', offset, offset + 4);
		const size = buffer.readUInt32LE(offset + 4);
		const body = offset + 8;
		if (id === 'fmt ') {
			if (buffer.readUInt16LE(body) !== 1 || buffer.readUInt16LE(body + 2) !== 1) {
				throw new Error('Expected PCM mono');
			}
			sampleRate = buffer.readUInt32LE(body + 4);
		} else if (id === 'data') {
			const samples = new Int16Array(size / 2);
			for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(body + i * 2);
			return { sampleRate, samples };
		}
		offset = body + size + (size % 2);
	}
	throw new Error('No data chunk');
}

function writePcm16Mono(path: string, sampleRate: number, samples: Int16Array): void {
	const data = samples.length * 2;
	const out = Buffer.alloc(44 + data);
	out.write('RIFF', 0, 'ascii');
	out.writeUInt32LE(36 + data, 4);
	out.write('WAVE', 8, 'ascii');
	out.write('fmt ', 12, 'ascii');
	out.writeUInt32LE(16, 16);
	out.writeUInt16LE(1, 20);
	out.writeUInt16LE(1, 22);
	out.writeUInt32LE(sampleRate, 24);
	out.writeUInt32LE(sampleRate * 2, 28);
	out.writeUInt16LE(2, 32);
	out.writeUInt16LE(16, 34);
	out.write('data', 36, 'ascii');
	out.writeUInt32LE(data, 40);
	for (let i = 0; i < samples.length; i++) out.writeInt16LE(samples[i], 44 + i * 2);
	writeFileSync(path, out);
}

const same = (a: readonly number[] | null, b: readonly number[] | null) =>
	a === b || (!!a && !!b && a.join() === b.join());

function main(corpusDir: string, outDir: string): void {
	mkdirSync(outDir, { recursive: true });
	const files = readdirSync(corpusDir);
	const index = PICKS.map((pick, n) => {
		const json = files
			.filter((f) => f.startsWith(`${pick.key}_`) && f.endsWith('.json'))
			.sort()
			.at(-1);
		if (!json) throw new Error(`No take for ${pick.key}`);
		const take = JSON.parse(readFileSync(join(corpusDir, json), 'utf8'));
		const event = (take.events as CorpusEvent[]).find(
			(e) =>
				e.kind === 'chord' &&
				e.ok &&
				same(e.voicing.frets, pick.frets) &&
				same(e.previous?.frets ?? null, pick.previous)
		);
		if (!event) throw new Error(`No event ${pick.frets} after ${pick.previous} in ${json}`);
		const { sampleRate, samples } = readPcm16Mono(readFileSync(join(corpusDir, take.wav)));
		const from = Math.round((event.timeSec - BEFORE_S) * sampleRate);
		const to = Math.round((event.timeSec + AFTER_S) * sampleRate);
		const file = `${String(n + 1).padStart(2, '0')}-${pick.key}-${pick.frets.join('-')}.wav`;
		writePcm16Mono(join(outDir, file), sampleRate, samples.slice(from, to));
		const { root, quality, rootString, frets, midi } = event.voicing;
		return {
			file,
			take: take.id,
			input: take.input.kind,
			// The corpus keeps raw frames; the app boosts the built-in mic by this gain first.
			builtInGain: take.input.kind === 'micro' ? take.input.builtInGain : 1,
			style: take.style,
			root,
			quality,
			rootString,
			frets,
			midi,
			previous: event.previous?.frets ?? null,
			beatSec: BEFORE_S,
			expect: pick.expect,
			...(pick.expect === 'frozen' ? { frozenDecision: pick.frozenDecision ?? null } : {})
		};
	});
	writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, '\t') + '\n');
}

const [corpusDir, outDir] = process.argv.slice(2);
if (!corpusDir || !outDir) {
	console.error('usage: cut-triad-fixtures.ts <corpusDir> <outDir>');
	process.exit(1);
}
main(corpusDir, outDir);
