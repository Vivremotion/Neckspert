import { describe, expect, it } from 'vitest';
import { parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { occurrencePosition } from '$lib/domain/triads/position';
import { TRIAD_ORDER } from '$lib/testing/catalog';
import { drawNamed } from './draws';

function seeded(seed: number): () => number {
	return () => {
		seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
		return seed / 2 ** 32;
	};
}

type Asked = { voicingKey: string; position: number | 'open'; fret?: number };

describe('the draws of a set', () => {
	const another = drawNamed('another-place', 'voicing-on-strings');

	it('is registered on the voicings only', () => {
		expect(another).not.toBeNull();
		expect(drawNamed('another-place', 'note-on-string')).toBeNull();
		expect(drawNamed('nope', 'voicing-on-strings')).toBeNull();
	});

	it('never asks the shape last asked when another exists, and a fret it covers', () => {
		const voicing = TRIAD_ORDER[0];
		const shapes = voicingOccurrences(parseVoicingKey(voicing));
		const positions = shapes.map(occurrencePosition);
		expect(positions.length).toBeGreaterThan(1);
		let previous: Asked | null = { voicingKey: voicing, position: positions[1] };
		for (let seed = 0; seed < 8; seed += 1) {
			const item = another!({ voicingKey: voicing }, previous, seeded(seed)) as Asked;
			expect(item.voicingKey).toBe(voicing);
			expect(positions).toContain(item.position);
			expect(item.position).not.toBe(previous?.position);
			const shape = shapes.find((s) => occurrencePosition(s) === item.position);
			expect(shape?.notes.some((note) => note.fret === item.fret) ?? false).toBe(
				item.fret !== undefined
			);
			previous = item;
		}
	});

	it('draws any shape without a previous, or one that has no position', () => {
		const voicing = TRIAD_ORDER[0];
		const positions = voicingOccurrences(parseVoicingKey(voicing)).map(occurrencePosition);
		const seen = new Set<unknown>();
		for (let seed = 0; seed < 40; seed += 1) {
			seen.add((another!({ voicingKey: voicing }, null, () => seed / 40) as Asked).position);
			const item = another!(
				{ voicingKey: voicing },
				{ voicingKey: voicing },
				seeded(seed)
			) as Asked;
			expect(positions).toContain(item.position);
		}
		expect(seen.size).toBeGreaterThan(1);
	});

	it('asks the only shape when there is one', () => {
		const single = TRIAD_ORDER.find(
			(voicing) => voicingOccurrences(parseVoicingKey(voicing)).length === 1
		);
		expect(single).toBeDefined();
		const only = occurrencePosition(voicingOccurrences(parseVoicingKey(single!))[0]);
		const item = another!(
			{ voicingKey: single! },
			{ voicingKey: single!, position: only },
			seeded(1)
		) as Asked;
		expect(item.position).toBe(only);
	});
});
