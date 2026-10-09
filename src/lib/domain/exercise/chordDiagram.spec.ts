import { describe, expect, it } from 'vitest';
import { chordDiagramFor } from './chordDiagram';
import { TRIADS_ANCHOR } from './catalog';

describe('chordDiagramFor', () => {
	it('draws chords as the player chose', () => {
		expect(chordDiagramFor(TRIADS_ANCHOR, { chordDiagram: 'grid' })).toBe('grid');
		expect(chordDiagramFor(TRIADS_ANCHOR, { chordDiagram: 'strings' })).toBe('strings');
	});

	it('draws them as the exercise says, when it says', () => {
		const forced = { ...TRIADS_ANCHOR, chordDiagram: 'grid' as const };
		expect(chordDiagramFor(forced, { chordDiagram: 'strings' })).toBe('grid');
	});
});
