import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChordReport } from '$lib/application/ports';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingCandidates,
	voicingOccurrences,
	type StringNumber
} from '$lib/domain/music';
import { NnlsChordVerifier } from './NnlsChordVerifier';
import { FakeFrameSource } from './testing/frames';
import { toCandidate } from './testing/synthChord';
import { readWav } from './testing/wav';

interface Fixture {
	file: string;
	input: string;
	/** Gain the app applies to these frames (built-in mic), as WebAudioInput does. */
	builtInGain: number;
	style: string;
	root: string;
	quality: 'major' | 'minor';
	rootString: 'G' | 'B' | 'E';
	frets: number[];
	previous: number[] | null;
	beatSec: number;
	expect: 'recognized' | 'frozen';
	frozenDecision?: string | null;
}

const DIR = join(import.meta.dirname, 'fixtures');
const FIXTURES: Fixture[] = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));

/** The round opens a little before the beat: early strums still count. */
const OPENS_BEFORE_BEAT_S = 0.2;

const ROOT_STRING: Record<Fixture['rootString'], StringNumber> = { G: 3, B: 2, E: 1 };
/** closeTriadVoicings order: root on the lowest string, on the highest, on the middle one. */
const INVERSION_OF: Record<StringNumber, number> = { 3: 0, 1: 1, 2: 2 } as Record<
	StringNumber,
	number
>;

function candidatesOf(fixture: Fixture) {
	const chord = {
		root: parseSpelledNote(fixture.root),
		quality: qualityById(fixture.quality === 'major' ? 'maj' : 'min')
	};
	const inversions = closeTriadVoicings(chord, [3, 2, 1]);
	const voicing = inversions[INVERSION_OF[ROOT_STRING[fixture.rootString]]];
	const occurrence = voicingOccurrences(voicing).find(
		(o) => o.notes.map((n) => n.fret).join(',') === fixture.frets.join(',')
	);
	if (!occurrence) throw new Error(`${fixture.file}: no occurrence at ${fixture.frets}`);
	return voicingCandidates(occurrence, inversions).map(toCandidate);
}

/** The decision on the longest window of the first attack in the round. */
function decisionOf(fixture: Fixture): string | null {
	const { sampleRate, samples } = readWav(readFileSync(join(DIR, fixture.file)));
	const heard = samples.map((v) => Math.max(-1, Math.min(1, v * fixture.builtInGain)));
	const source = new FakeFrameSource(sampleRate, heard);
	const verifier = new NnlsChordVerifier(source);
	const reports: ChordReport[] = [];
	verifier.onReport((report) => reports.push(report));
	verifier.expect({
		opensAt: fixture.beatSec - OPENS_BEFORE_BEAT_S,
		expected: fixture.frets.join(','),
		candidates: candidatesOf(fixture),
		style: 'unknown'
	});
	source.playUntil();
	verifier.expect(null);
	if (reports.length === 0) return null;
	const first = Math.min(...reports.map((r) => r.time));
	const longest = reports
		.filter((r) => r.time === first)
		.reduce((a, b) => (b.windowMs > a.windowMs ? b : a));
	return longest.decided;
}

describe('the chord verifier on real recorded triads', () => {
	for (const fixture of FIXTURES) {
		const name = `${fixture.file} (${fixture.input}, ${fixture.style})`;
		if (fixture.expect === 'recognized') {
			it(`recognizes ${name}`, () => {
				expect(decisionOf(fixture)).toBe(fixture.frets.join(','));
			});
		} else {
			it(`keeps today's decision on ${name}`, () => {
				expect(decisionOf(fixture)).toBe(fixture.frozenDecision ?? null);
			});
		}
	}
});
