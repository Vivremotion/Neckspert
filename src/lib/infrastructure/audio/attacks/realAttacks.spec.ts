import { describe, expect, it } from 'vitest';
import { readWav } from '../chords/testing/wav';
import index from '../chords/fixtures/index.json';
import { AttackTracker, type DetectedAttack } from './AttackTracker';
import { feed } from './testing/signals';

interface Fixture {
	file: string;
	input: string;
	/** Gain the app applies to these frames (built-in mic), as WebAudioInput does. */
	builtInGain: number;
	/** The gesture: `plaque` (strummed), `arpege` or `melange`. */
	style: string;
	/** Expected attack, seconds from the excerpt's start (`BEFORE_S` of the cutting script). */
	beatSec: number;
}

const FIXTURES = index as Fixture[];
/** Each WAV as a base64 data URL, through Vite: no file system access in the spec. */
const WAVS = import.meta.glob<string>('../chords/fixtures/*.wav', {
	query: '?inline',
	import: 'default',
	eager: true
});

/** How far from the expected beat the strum may land (the player is not a machine). */
const NEAR_BEAT_S = 0.15;
/** Up to here, a strummed excerpt holds its one chord and nothing else… */
const QUIET_UNTIL_S = 1.5;
/**
 * …but the metronome of the corpus page sounded in the room (80 bpm), and the built-in mic heard
 * it: a click one beat after the chord, some 50 ms late (output and input latency). It is a real
 * attack (spec: the click bleed is measured by hearing the clicks), not part of the chord.
 */
const CORPUS_BEAT_S = 60 / 80;
const CLICK_HEARD_WITHIN_S = 0.1;

function attacksOf(fixture: Fixture): DetectedAttack[] {
	const url = WAVS[`../chords/fixtures/${fixture.file}`];
	if (!url) throw new Error(`Missing fixture ${fixture.file}`);
	const binary = atob(url.slice(url.indexOf(',') + 1));
	const { sampleRate, samples } = readWav(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
	const heard = samples.map((v) => Math.max(-1, Math.min(1, v * fixture.builtInGain)));
	return feed(new AttackTracker(sampleRate), heard, sampleRate);
}

const strummed = FIXTURES.filter((f) => f.style === 'plaque');
const arpeggiated = FIXTURES.filter((f) => f.style === 'arpege');

describe('the attack tracker on real recorded triads', () => {
	it('has the strummed and arpeggiated fixtures', () => {
		expect([strummed.length, arpeggiated.length]).toEqual([7, 3]);
	});

	it.each(strummed.map((f) => [f.file, f] as const))(
		'hears one attack for the strummed chord %s',
		(_, fixture) => {
			const early = attacksOf(fixture).filter((a) => a.time < QUIET_UNTIL_S);
			const click = fixture.beatSec + CORPUS_BEAT_S;
			const isClick = (a: DetectedAttack) =>
				fixture.input === 'micro' && a.time >= click && a.time - click <= CLICK_HEARD_WITHIN_S;
			const chord = early.filter((a) => !isClick(a));
			expect(chord).toHaveLength(1);
			expect(Math.abs(chord[0].time - fixture.beatSec)).toBeLessThan(NEAR_BEAT_S);
			expect(early.filter(isClick)).toHaveLength(fixture.input === 'micro' ? 1 : 0);
		}
	);

	it.each(arpeggiated.map((f) => [f.file, f] as const))(
		'hears the strings of the arpeggio %s apart',
		(_, fixture) => {
			expect(attacksOf(fixture).length).toBeGreaterThanOrEqual(2);
		}
	);
});

/**
 * Picked single notes through an audio interface (FM3), cut from 8.9 s to 10.5 s of a diagnostic
 * take of the offbeats exercise (2026-10-16, 16 kHz). Each note comes as a faint touch of the pick
 * (≈ −42 dBFS) then, 25–40 ms later, the note itself, ≈ 25 dB louder: the musical onset is the
 * second. Onsets measured on the envelope (0.25 ms RMS), seconds from the excerpt's start.
 */
const PICKED_NOTES = import.meta.glob<string>('./fixtures/picked-notes-fm3.wav', {
	query: '?inline',
	import: 'default',
	eager: true
})['./fixtures/picked-notes-fm3.wav'];
const PICKED_ONSETS_S = [0.2665, 0.6267, 1.342];
const PICKED_TOLERANCE_S = 0.005;

describe('the attack tracker on picked notes through an interface', () => {
	it('hears one attack per note, at the loud onset, not at the touch of the pick', () => {
		const binary = atob(PICKED_NOTES.slice(PICKED_NOTES.indexOf(',') + 1));
		const { sampleRate, samples } = readWav(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
		const attacks = feed(new AttackTracker(sampleRate), samples, sampleRate);
		expect(attacks.map((a) => a.time)).toHaveLength(PICKED_ONSETS_S.length);
		attacks.forEach((a, i) =>
			expect(Math.abs(a.time - PICKED_ONSETS_S[i])).toBeLessThanOrEqual(PICKED_TOLERANCE_S)
		);
	});
});

/**
 * Picked notes through the interface, cut from the oracle suites of 2026-10-18 (16 kHz): before
 * most notes the nail touches the string, 45 to 90 ms earlier and 12 to 40 dB fainter, unheard
 * in the sound. Onsets are the player's labels in Audacity, seconds from the excerpt's start.
 */
const PRE_ATTACK_WAVS = import.meta.glob<string>('./fixtures/pre-attack*-fm3.wav', {
	query: '?inline',
	import: 'default',
	eager: true
});
const PRE_ATTACK_CASES = [
	{
		file: './fixtures/pre-attacks-fm3.wav',
		onsetsS: [0.1906, 0.5574, 0.9318],
		/** Each note's pre-attack, ms before its onset; null when the sensor heard none. */
		preAttackMs: [null, 48, 49]
	},
	{ file: './fixtures/pre-attack-far-fm3.wav', onsetsS: [0.2786], preAttackMs: [87] }
];
/** The oracle's pairing: the same attack within this. */
const ORACLE_PAIR_S = 0.025;

describe('the attack tracker on pre-attacks of the nail', () => {
	it.each(PRE_ATTACK_CASES.map((c) => [c.file, c] as const))(
		'hears one attack per note in %s, the pre-attack kept on it',
		(_, { file, onsetsS, preAttackMs }) => {
			const url = PRE_ATTACK_WAVS[file];
			const binary = atob(url.slice(url.indexOf(',') + 1));
			const { sampleRate, samples } = readWav(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
			const attacks = feed(new AttackTracker(sampleRate), samples, sampleRate);
			expect(attacks).toHaveLength(onsetsS.length);
			attacks.forEach((a, i) => {
				expect(Math.abs(a.time - onsetsS[i])).toBeLessThanOrEqual(ORACLE_PAIR_S);
				const before = preAttackMs[i];
				if (before === null) return;
				expect(a.preAttack?.beforeMs).toBeGreaterThan(before - 15);
				expect(a.preAttack?.beforeMs).toBeLessThan(before + 15);
			});
		}
	);
});
