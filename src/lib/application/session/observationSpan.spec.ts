import { describe, expect, it } from 'vitest';
import type { PlannedItem } from '$lib/domain/types';
import { ObservationSpan } from './observationSpan';

const planned = { mechanic: 'locate' } as unknown as PlannedItem;
const heard = (time: number, payload: unknown = { midi: 60 }) => ({
	time,
	payload,
	readable: true
});

describe('ObservationSpan', () => {
	it('records the time relative to the prompt, in ms', () => {
		const span = new ObservationSpan(10, planned);
		span.add('note', heard(10.25), 'answer', true);
		expect(span.snapshot()[0].atMs).toBeCloseTo(250);
	});

	it('records a negative time before the prompt', () => {
		const span = new ObservationSpan(10, planned);
		span.add('note', heard(9.9), 'before-window', null);
		expect(span.snapshot()[0].atMs).toBeCloseTo(-100);
	});

	it('copies sensor, fate, correct and payload', () => {
		const span = new ObservationSpan(0, planned);
		const payload = { midi: 64 };
		span.add('note', heard(1, payload), 'answer', false);
		expect(span.snapshot()[0]).toMatchObject({
			sensor: 'note',
			fate: 'answer',
			correct: false,
			payload
		});
	});

	it('keeps the planned item', () => {
		expect(new ObservationSpan(0, planned).planned).toBe(planned);
	});

	it('returns a snapshot unaffected by later adds', () => {
		const span = new ObservationSpan(0, planned);
		span.add('note', heard(1), 'answer', true);
		const snap = span.snapshot();
		span.add('note', heard(2), 'unreadable', null);
		expect(snap).toHaveLength(1);
		expect(span.snapshot()).toHaveLength(2);
	});

	it('is empty without observations', () => {
		expect(new ObservationSpan(0, planned).close()).toEqual([]);
	});

	it('refuses an add after close', () => {
		const span = new ObservationSpan(0, planned);
		span.add('note', heard(1), 'answer', true);
		expect(span.close()).toHaveLength(1);
		expect(() => span.add('note', heard(2), 'answer', true)).toThrow(Error);
	});

	it('stores null for an undefined payload so it survives a JSON round trip', () => {
		const span = new ObservationSpan(0, planned);
		span.add('tap', { time: 1, payload: undefined, readable: true }, 'answer', true);
		expect(Object.hasOwn(JSON.parse(JSON.stringify(span.snapshot()[0])), 'payload')).toBe(true);
	});
});
