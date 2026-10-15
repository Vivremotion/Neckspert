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
