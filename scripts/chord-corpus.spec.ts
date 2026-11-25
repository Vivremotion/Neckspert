// Measures the chord verifier on the triad detection corpus (format neckspert-triads-corpus v1,
// recorded on the spike's /dev/corpus page, kept outside git: `/corpus` is ignored, the takes
// live in the author's main checkout): every well-played chord of every take is judged as a round would,
// and the share recognized is printed by input and style. A measuring run, not a test: it only
// runs when TRIAD_CORPUS names the corpus folder, and compares nothing by itself.
//
//   TRIAD_CORPUS=../corpus/triades npx vitest run scripts/chord-corpus.spec.ts
//   OCTAVE_DOWN=1 … reads each take at half its sample rate: the same strings an octave lower,
//   twice as slow, a stand-in for bass strings until real takes exist (indicative only).
//   CORPUS_OUT=<file.json> writes one line per chord, to diff two runs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChordCandidate, ChordReport } from '$lib/application/ports';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingCandidates,
	voicingOccurrences,
	type StringNumber
} from '$lib/domain/music';
import { WebAudioAttackDetector } from '$lib/infrastructure/audio/attacks';
import { NnlsChordVerifier } from '$lib/infrastructure/audio/chords/NnlsChordVerifier';
import { FakeFrameSource } from '$lib/infrastructure/audio/chords/testing/frames';
import { toCandidate } from '$lib/infrastructure/audio/chords/testing/synthChord';
import { readWav } from '$lib/infrastructure/audio/chords/testing/wav';

const CORPUS_DIR = process.env.TRIAD_CORPUS;
const OCTAVE_DOWN = process.env.OCTAVE_DOWN === '1';
const OUT = process.env.CORPUS_OUT;

/** The round opens a little before the beat: early strums still count. */
const OPENS_BEFORE_BEAT_S = 0.2;

interface CorpusVoicing {
	root: string;
	quality: 'major' | 'minor';
	rootString: 'G' | 'B' | 'E';
	frets: number[];
}

interface CorpusEvent {
	kind: 'root' | 'chord';
	voicing: CorpusVoicing;
	previous: CorpusVoicing | null;
	timeSec: number;
	ok: boolean;
}

interface Take {
	id: string;
	script: string;
	style: string;
	input: { kind: string; builtInGain: number };
	wav: string;
	events: CorpusEvent[];
}

const ROOT_STRING: Record<CorpusVoicing['rootString'], StringNumber> = { G: 3, B: 2, E: 1 };
/** closeTriadVoicings order: root on the lowest string, on the highest, on the middle one. */
const INVERSION_OF: Partial<Record<StringNumber, number>> = { 3: 0, 1: 1, 2: 2 };

function candidatesOf(event: CorpusEvent): ChordCandidate[] {
	const { voicing } = event;
	const chord = {
		root: parseSpelledNote(voicing.root),
		quality: qualityById(voicing.quality === 'major' ? 'maj' : 'min')
	};
	const inversions = closeTriadVoicings(chord, [3, 2, 1]);
	const own = inversions[INVERSION_OF[ROOT_STRING[voicing.rootString]] ?? 0];
	const occurrence = voicingOccurrences(own).find(
		(o) => o.notes.map((n) => n.fret).join(',') === voicing.frets.join(',')
	);
	if (!occurrence) throw new Error(`No occurrence at ${voicing.frets} for ${voicing.root}`);
	const previous = event.previous?.frets.join(',');
	return voicingCandidates(occurrence, inversions)
		.map(toCandidate)
		.filter((candidate) => candidate.id !== previous)
		.map((candidate) =>
			OCTAVE_DOWN
				? { ...candidate, notes: candidate.notes.map((n) => ({ ...n, midi: n.midi - 12 })) }
				: candidate
		);
}

interface Result {
	take: string;
	input: string;
	style: string;
	script: string;
	expected: string;
	decided: string | null;
	outcome: 'recognized' | 'none' | 'wrong';
	/** Scores of the active variant on the window that decided. */
	scores: Record<string, number>;
}

function judgeTake(dir: string, take: Take): Result[] {
	const wav = readWav(new Uint8Array(readFileSync(join(dir, take.wav))));
	// The corpus keeps raw frames; the app boosts the built-in mic by this gain first.
	const gain = take.input.kind === 'micro' ? take.input.builtInGain : 1;
	const heard = wav.samples.map((v) => Math.max(-1, Math.min(1, v * gain)));
	const scale = OCTAVE_DOWN ? 2 : 1;
	const source = new FakeFrameSource(wav.sampleRate / scale, heard);
	const verifier = new NnlsChordVerifier(source, new WebAudioAttackDetector(source));
	let reports: ChordReport[] = [];
	verifier.onReport((report) => reports.push(report));

	const results: Result[] = [];
	const events = take.events;
	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		const opensAt = (event.timeSec - OPENS_BEFORE_BEAT_S) * scale;
		const closesAt = events[i + 1]
			? (events[i + 1].timeSec - OPENS_BEFORE_BEAT_S) * scale
			: Infinity;
		source.playUntil(opensAt);
		if (event.kind !== 'chord' || !event.ok) continue;
		const expected = event.voicing.frets.join(',');
		reports = [];
		verifier.expect({
			opensAt,
			expected: [expected],
			candidates: candidatesOf(event),
			style: 'unknown'
		});
		source.playUntil(closesAt);
		verifier.expect(null);
		let decided: string | null = null;
		let scores: Record<string, number> = {};
		if (reports.length > 0) {
			const first = Math.min(...reports.map((r) => r.time));
			const longest = reports
				.filter((r) => r.time === first)
				.reduce((a, b) => (b.windowMs > a.windowMs ? b : a));
			decided = longest.decided;
			scores = longest.variants[0]?.scores ?? {};
		}
		results.push({
			take: take.id,
			input: take.input.kind,
			style: take.style,
			script: take.script,
			expected,
			decided,
			outcome: decided === expected ? 'recognized' : decided === null ? 'none' : 'wrong',
			scores
		});
	}
	return results;
}

function table(results: Result[]): string {
	const groups = new Map<string, Result[]>();
	for (const r of results) {
		const key = `${r.input} · ${r.style} · ${r.script}`;
		groups.set(key, [...(groups.get(key) ?? []), r]);
	}
	const row = (name: string, rs: Result[]) => {
		const count = (o: Result['outcome']) => rs.filter((r) => r.outcome === o).length;
		const pct = ((100 * count('recognized')) / rs.length).toFixed(1);
		return `| ${name} | ${rs.length} | ${count('recognized')} (${pct} %) | ${count('none')} | ${count('wrong')} |`;
	};
	return [
		'| condition | n | reconnus | rien | autre |',
		'|---|---|---|---|---|',
		...[...groups.keys()].sort().map((key) => row(key, groups.get(key)!)),
		row('**total**', results)
	].join('\n');
}

describe.skipIf(!CORPUS_DIR)('the chord verifier on the triad corpus', () => {
	/** Sixty takes through the verifier take well over vitest's five seconds. */
	const RUN_TIMEOUT_MS = 600_000;

	it('judges every well-played chord', { timeout: RUN_TIMEOUT_MS }, () => {
		const dir = CORPUS_DIR!;
		const takes = readdirSync(dir)
			.filter((f) => f.endsWith('.json'))
			.sort()
			.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Take);
		const results = takes.flatMap((take) => judgeTake(dir, take));
		console.log(
			`\n${OCTAVE_DOWN ? 'Octave down. ' : ''}${takes.length} takes.\n${table(results)}\n`
		);
		if (OUT) {
			writeFileSync(OUT, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
		}
		expect(results.length).toBeGreaterThan(0);
	});
});
