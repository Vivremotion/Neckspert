import { describe, expect, it } from 'vitest';
import { TraceBuilder } from './trace';

describe('TraceBuilder', () => {
	it('nests a child in the innermost open segment', () => {
		const trace = new TraceBuilder(0);
		trace.open('series', 1, { exerciseId: 'x' });
		trace.open('run', 2);
		trace.open('round', 2);
		const round = trace.tree().children[0].children[0].children[0];
		expect(round.role).toBe('round');
		expect(round.startS).toBe(2);
	});

	it('closing a parent cuts its open children as interrupted', () => {
		const trace = new TraceBuilder(0);
		const run = trace.open('run', 2);
		trace.open('round', 3);
		trace.close(run, 4.5, 'interrupted');
		const closed = trace.tree().children[0];
		expect(closed).toMatchObject({ endS: 4.5, ended: 'interrupted' });
		expect(closed.children[0]).toMatchObject({ endS: 4.5, ended: 'interrupted' });
	});

	it('closes as done by default', () => {
		const trace = new TraceBuilder(0);
		const run = trace.open('run', 1);
		trace.close(run, 3);
		expect(trace.tree().children[0]).toMatchObject({ endS: 3, ended: 'done' });
	});

	it('keeps the family laminar', () => {
		const trace = new TraceBuilder(0);
		const run = trace.open('run', 2);
		expect(() => trace.open('round', 1)).toThrow(RangeError);
		expect(() => trace.close(run, 1)).toThrow(RangeError);
	});

	it('a closed segment takes no child', () => {
		const trace = new TraceBuilder(0);
		trace.open('series', 0);
		const run = trace.open('run', 1);
		trace.close(run, 5);
		trace.open('breath', 6);
		const series = trace.tree().children[0];
		expect(series.children.map((s) => s.role)).toEqual(['run', 'breath']);
		expect(series.children[0].children).toEqual([]);
	});

	it('startOf tells when a segment started', () => {
		const trace = new TraceBuilder(0);
		const run = trace.open('run', 2.5);
		expect(trace.startOf(run)).toBe(2.5);
		expect(() => trace.startOf(99)).toThrow(RangeError);
	});

	it('set merges fields', () => {
		const trace = new TraceBuilder(0);
		const round = trace.open('round', 1, { level: 2, item: 'a@2' });
		trace.set(round, { attemptId: 7 });
		expect(trace.tree().children[0]).toMatchObject({ attemptId: 7, level: 2, item: 'a@2' });
	});

	it('an open segment ends at the latest instant seen', () => {
		const trace = new TraceBuilder(0);
		trace.open('run', 1);
		trace.open('round', 4);
		const tree = trace.tree();
		expect(tree.endS).toBe(4);
		expect(tree.children[0].endS).toBe(4);
	});

	it('closeAll closes the root too', () => {
		const trace = new TraceBuilder(0);
		trace.open('run', 1);
		trace.closeAll(9, 'interrupted');
		const tree = trace.tree();
		expect(tree).toMatchObject({ role: 'session', endS: 9, ended: 'interrupted' });
		expect(tree.children[0]).toMatchObject({ endS: 9, ended: 'interrupted' });
	});

	it('tree is a copy', () => {
		const trace = new TraceBuilder(0);
		trace.open('run', 1);
		trace.tree().children[0].role = 'pause';
		expect(trace.tree().children[0].role).toBe('run');
	});
});
