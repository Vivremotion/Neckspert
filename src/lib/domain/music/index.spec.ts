import { describe, expect, it } from 'vitest';
import * as music from './index';

const PUBLIC_FUNCTIONS = [
	'midiOnString',
	'pitchOnString',
	'fretsForPitch',
	'acceptableMidis',
	'spellPitch',
	'formatNote',
	'answerChoiceLabel',
	'stringLabel',
	'fretLabel',
	'classifyNoteConfusion',
	'classifyNameConfusion',
	'practiceTargets',
	'locateTargets',
	'pitchOfMidi'
] as const;

describe('music index', () => {
	it('re-exports every public music function and the shared music constants', () => {
		for (const name of PUBLIC_FUNCTIONS) {
			expect(typeof music[name]).toBe('function');
		}
		expect(music.CHROMATIC_NOTES).toHaveLength(12);
		expect(music.MAX_PLAYABLE_FRET).toBe(24);
	});

	it('works end to end through the index', () => {
		const target = music.locateTargets().find((t) => t.string === 2 && t.pitch === 'F');
		if (!target) throw new Error('F on string 2 is missing from the locate targets');
		expect(music.acceptableMidis(target)).toEqual([65, 77]);
		expect(music.classifyNoteConfusion(target, 66)).toEqual({ kind: 'semitone', delta: 1 });
		expect(music.formatNote(music.spellPitch('F#', () => 0.5))).toBe('Gb');
		expect(music.stringLabel(target.string, 'fr')).toBe('corde de B');
		expect(music.fretLabel(music.fretsForPitch(2, 'F', music.MAX_PROMPT_FRET)[0], 'fr')).toBe(
			'case 6'
		);
	});
});
