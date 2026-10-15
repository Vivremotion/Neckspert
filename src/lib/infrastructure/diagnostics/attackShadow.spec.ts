import { describe, expect, it } from 'vitest';
import { attackTimesOf, compareAttacks, hasNoteDetector } from './attackShadow';

describe('attackTimesOf', () => {
	it('collects the times of both detectors from a take journal', () => {
		const jsonl = [
			'{"kind":"note.attack","audioTime":1,"data":{"midi":64}}',
			'{"kind":"attack.detected","audioTime":1.004,"data":{"strength":0.8}}',
			'{"kind":"note.rejected","audioTime":2,"data":{"reason":"unclear"}}',
			''
		].join('\n');
		expect(attackTimesOf(jsonl)).toEqual({
			notes: [1],
			attacks: [1.004],
			rejected: [2],
			skipped: 0
		});
	});

	it('counts and skips a line that is not JSON, such as a truncated last one', () => {
		const jsonl = '{"kind":"note.attack","audioTime":1,"data":{}}\n{"kind":"attack.det';
		expect(attackTimesOf(jsonl)).toEqual({ notes: [1], attacks: [], rejected: [], skipped: 1 });
	});

	it('skips events without a numeric audio time or that are not objects', () => {
		const jsonl = [
			'null',
			'{"kind":"note.attack"}',
			'[1]',
			'{"kind":"note.attack","audioTime":"1"}'
		];
		expect(attackTimesOf(jsonl.join('\n'))).toEqual({
			notes: [],
			attacks: [],
			rejected: [],
			skipped: 4
		});
	});
});

describe('compareAttacks', () => {
	it('pairs onsets with the nearest attack within 30 ms, one to one', () => {
		const stats = compareAttacks([1.0, 2.0, 3.0], [1.004, 2.05, 3.002, 4.0]);
		expect(stats).toMatchObject({ both: 2, onlyNotes: 1, onlyAttacks: 2 });
		expect(stats.biasMs).toBeCloseTo(3, 0);
	});

	it('returns null deltas without any pair', () => {
		const stats = compareAttacks([1], [5]);
		expect(stats.medianDeltaMs).toBeNull();
		expect(stats.p90AbsDeltaMs).toBeNull();
		expect(stats.biasMs).toBeNull();
		expect(stats).toMatchObject({ both: 0, onlyNotes: 1, onlyAttacks: 1 });
	});

	it('gives an attack to only one note, the nearest', () => {
		const stats = compareAttacks([1.0, 1.01], [1.012]);
		expect(stats).toMatchObject({ both: 1, onlyNotes: 1, onlyAttacks: 0 });
		expect(stats.medianDeltaMs).toBeCloseTo(2, 0);
	});

	it('signs the delta attack minus note and reports the median and the 90th percentile', () => {
		const stats = compareAttacks([1, 2, 3, 4], [0.99, 2.01, 3.02, 3.98]);
		expect(stats.both).toBe(4);
		expect(stats.biasMs).toBeCloseTo(0, 0);
		expect(stats.medianDeltaMs).toBeCloseTo(0, 0);
		expect(stats.p90AbsDeltaMs).toBeCloseTo(20, 0);
	});

	it('handles empty inputs', () => {
		expect(compareAttacks([], [])).toEqual({
			both: 0,
			onlyNotes: 0,
			onlyAttacks: 0,
			rejectedByNotes: 0,
			medianDeltaMs: null,
			p90AbsDeltaMs: null,
			biasMs: null
		});
	});

	it('counts attacks the note detector heard but rejected apart from the attacks it missed', () => {
		const stats = compareAttacks([1.0], [1.003, 2.01, 3.0, 4.0], [2.0, 3.5]);
		expect(stats).toMatchObject({ both: 1, onlyNotes: 0, onlyAttacks: 2, rejectedByNotes: 1 });
	});

	it('pairs against accepted notes first: a rejection never takes an attack from a note', () => {
		const stats = compareAttacks([1.0], [1.01], [1.005]);
		expect(stats).toMatchObject({ both: 1, onlyAttacks: 0, rejectedByNotes: 0 });
	});

	it('gives one rejection to one attack, the nearest, and reaches only 30 ms', () => {
		const stats = compareAttacks([], [1.0, 1.01, 2.0], [1.012, 2.05]);
		expect(stats).toMatchObject({ onlyAttacks: 2, rejectedByNotes: 1 });
	});
});

describe('hasNoteDetector', () => {
	it('is false for a take without any note event, true once notes or rejections are journaled', () => {
		const empty = { notes: [], attacks: [1], rejected: [], skipped: 0 };
		expect(hasNoteDetector(empty)).toBe(false);
		expect(hasNoteDetector({ ...empty, notes: [1] })).toBe(true);
		expect(hasNoteDetector({ ...empty, rejected: [1] })).toBe(true);
	});
});
