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
	'practiceCards',
	'locateItems',
	'isMirrorPair',
	'mirrorItems',
	'neckCardKey',
	'asNeckCard',
	'pitchOfMidi',
	'parseSpelledNote',
	'formatSpelledNote',
	'pitchOfSpelled',
	'spelledFromPitch',
	'chordTones',
	'chordLabel',
	'createVoicing',
	'voicingKey',
	'parseVoicingKey',
	'voicingOccurrences',
	'occurrencePositions',
	'closeTriadVoicings',
	'voicingCandidates'
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
		const target = music.locateItems().find((t) => t.string === 2 && t.pitch === 'F');
		if (!target) throw new Error('F on string 2 is missing from the locate items');
		expect(music.acceptableMidis(target)).toEqual([65, 77]);
		expect(music.classifyNoteConfusion(target, 66)).toEqual({ kind: 'semitone', delta: 1 });
		expect(music.formatNote(music.spellPitch('F#', () => 0.5))).toBe('Gb');
		expect(music.stringLabel(target.string, 'fr')).toBe('corde de B');
		expect(music.fretLabel(music.fretsForPitch(2, 'F', music.MAX_PROMPT_FRET)[0], 'fr')).toBe(
			'case 6'
		);
		const d = { root: music.parseSpelledNote('D'), quality: music.qualityById('maj') };
		expect(music.voicingKey(music.closeTriadVoicings(d, [3, 2, 1])[2])).toBe('D|maj|3:5,2:1,1:3');
	});
});
