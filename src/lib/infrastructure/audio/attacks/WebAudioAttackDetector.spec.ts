import { describe, expect, it } from 'vitest';
import type { AttackEvent } from '$lib/application/ports';
import { FakeDiagnosticSink } from '$lib/testing/fakes';
import { FRAME_SIZE, FakeFrameSource } from '../chords/testing/frames';
import type { AudioFrame, FrameSource } from '../input/WebAudioInput';
import { WebAudioAttackDetector } from './WebAudioAttackDetector';
import { plucks } from './testing/signals';

const RATE = 48000;
const START = 10;

function setup(options?: ConstructorParameters<typeof WebAudioAttackDetector>[1]) {
	const signal = plucks({ rate: RATE, durationS: 1, attacksS: [0.3, 0.6] });
	const source = new FakeFrameSource(RATE, signal, START);
	return { source, detector: new WebAudioAttackDetector(source, options) };
}

describe('WebAudioAttackDetector', () => {
	it('subscribes to the frames with its first listener and unsubscribes with its last', () => {
		const { source, detector } = setup();
		expect(source.subscribers).toBe(0);
		const first = detector.onAttack(() => {});
		expect(source.subscribers).toBe(1);
		const second = detector.onAttack(() => {});
		expect(source.subscribers).toBe(1);
		first();
		expect(source.subscribers).toBe(1);
		second();
		expect(source.subscribers).toBe(0);
	});

	it('emits the attacks of the frames with their audio time', () => {
		const { source, detector } = setup();
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.playUntil();
		expect(attacks).toHaveLength(2);
		expect(Math.abs(attacks[0].time - (START + 0.3))).toBeLessThan(0.002);
		expect(Math.abs(attacks[1].time - (START + 0.6))).toBeLessThan(0.002);
		expect(attacks[0].strength).toBeGreaterThan(0);
		expect(attacks[0].channel).toBeUndefined();
	});

	it('stamps its channel on every attack', () => {
		const { source, detector } = setup({ channel: 2 });
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.playUntil();
		expect(attacks.map((attack) => attack.channel)).toEqual([2, 2]);
	});

	it('journals each attack as attack.detected when the journal is on', () => {
		const diagnostics = new FakeDiagnosticSink(true);
		const { source, detector } = setup({ diagnostics });
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.playUntil();
		expect(diagnostics.events.map((event) => event.kind)).toEqual([
			'attack.detected',
			'attack.detected'
		]);
		expect(Math.abs(diagnostics.events[0].audioTime - (START + 0.3))).toBeLessThan(0.002);
		expect(diagnostics.events[0].data).toEqual({ strength: attacks[0].strength });
	});

	it('passes on and journals the pre-attack folded into an attack', () => {
		const faint = plucks({ rate: RATE, durationS: 1, attacksS: [0.25], hz: 330, amplitude: 0.04 });
		const firm = plucks({ rate: RATE, durationS: 1, attacksS: [0.3], hz: 330, amplitude: 0.4 });
		const source = new FakeFrameSource(
			RATE,
			firm.map((v, i) => v + faint[i]),
			START
		);
		const diagnostics = new FakeDiagnosticSink(true);
		const detector = new WebAudioAttackDetector(source, { diagnostics });
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.playUntil();
		expect(attacks).toHaveLength(1);
		expect(attacks[0].preAttack?.beforeMs).toBeGreaterThan(40);
		expect(diagnostics.events[0].data).toEqual({
			strength: attacks[0].strength,
			preAttack: attacks[0].preAttack
		});
	});

	it('journals nothing when the journal is off', () => {
		const diagnostics = new FakeDiagnosticSink(false);
		const { source, detector } = setup({ diagnostics });
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.playUntil();
		expect(attacks).toHaveLength(2);
		expect(diagnostics.events).toEqual([]);
	});
});

/** An input whose rate is known only once it plays, and may change between two runs. */
class LateRateSource implements FrameSource {
	rate = 0;
	private readonly listeners = new Set<(frame: AudioFrame) => void>();

	get sampleRate(): number {
		return this.rate;
	}

	onFrame(callback: (frame: AudioFrame) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Opens the input at `rate` and plays `signal` in 512-sample frames from `startTime`. */
	play(rate: number, signal: Float32Array, startTime: number): void {
		this.rate = rate;
		for (let at = 0; at + FRAME_SIZE <= signal.length; at += FRAME_SIZE) {
			const frame = {
				samples: signal.slice(at, at + FRAME_SIZE),
				frameTime: startTime + at / (rate || 1)
			};
			this.listeners.forEach((listener) => listener(frame));
		}
	}
}

describe('WebAudioAttackDetector with an input that opens after the listener', () => {
	it('reads the rate when the frames arrive, not when the listener is added', () => {
		const source = new LateRateSource();
		const detector = new WebAudioAttackDetector(source);
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		expect(source.sampleRate).toBe(0);

		source.play(RATE, plucks({ rate: RATE, durationS: 1, attacksS: [0.3, 0.6] }), START);
		expect(attacks).toHaveLength(2);
		expect(Math.abs(attacks[0].time - (START + 0.3))).toBeLessThan(0.002);
		expect(Math.abs(attacks[1].time - (START + 0.6))).toBeLessThan(0.002);
	});

	it('starts a fresh tracker when the rate changes between two runs', () => {
		const source = new LateRateSource();
		const detector = new WebAudioAttackDetector(source);
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));

		source.play(RATE, plucks({ rate: RATE, durationS: 1, attacksS: [0.3] }), START);
		source.play(44100, plucks({ rate: 44100, durationS: 1, attacksS: [0.4] }), START + 20);
		expect(attacks).toHaveLength(2);
		expect(Math.abs(attacks[0].time - (START + 0.3))).toBeLessThan(0.002);
		expect(Math.abs(attacks[1].time - (START + 20 + 0.4))).toBeLessThan(0.002);
	});

	it('builds nothing while the rate is still 0', () => {
		const source = new LateRateSource();
		const detector = new WebAudioAttackDetector(source);
		const attacks: AttackEvent[] = [];
		detector.onAttack((attack) => attacks.push(attack));
		source.play(0, new Float32Array(FRAME_SIZE * 4), START);
		expect(attacks).toEqual([]);
	});
});
