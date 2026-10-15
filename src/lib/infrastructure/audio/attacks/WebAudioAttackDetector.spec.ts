import { describe, expect, it } from 'vitest';
import type { AttackEvent } from '$lib/application/ports';
import { FakeDiagnosticSink } from '$lib/testing/fakes';
import { FakeFrameSource } from '../chords/testing/frames';
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
