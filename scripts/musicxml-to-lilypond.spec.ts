import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLilyPond } from '../src/lib/domain/time/notation/lilypond';
import { convertMelody, listShapes } from './musicxml-to-lilypond.mjs';

const FIXTURE = readFileSync(new URL('./fixtures/scale.musicxml', import.meta.url), 'utf8');

const TRIPLETS = "\\tuplet 3/2 { c'8\\2 e'8\\1 g'8\\1 }";

/** The fixture with `extra` notes inserted at the start of bar 1 of the melody part. */
function withInBar1(extra: string): string {
	const marker = '<measure number="1">';
	expect(FIXTURE).toContain(marker);
	return FIXTURE.replace(marker, `${marker}\n${extra}`);
}

const note = (body: string) =>
	`<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration>${body}<type>quarter</type><staff>1</staff><notations><technical><string>2</string><fret>1</fret></technical></notations></note>`;

describe('convertMelody', () => {
	it('converts the melody with strings and triplets', () => {
		const { lilypond, warnings } = convertMelody(FIXTURE, 'P1');
		expect(lilypond).toBe(
			[
				'r2 r4 g,4\\6 |',
				'c4\\5 d4\\4 e4\\4 f4\\4 |',
				"g4\\3 a4\\3 b4\\2 c'4\\2 |",
				`${[TRIPLETS, TRIPLETS, TRIPLETS, TRIPLETS].join(' ')} |`,
				"r2 e'2\\1~ |",
				"e'4.\\1 r8 r2 |"
			].join('\n')
		);
		expect(warnings).toEqual([]);
	});

	it('fills a pickup bar with rests', () => {
		const { lilypond } = convertMelody(FIXTURE, 'P1');
		expect(lilypond.split('\n')[0]).toBe('r2 r4 g,4\\6 |');
	});

	it('ignores the tab staff duplicate (voice 5)', () => {
		const { lilypond, warnings } = convertMelody(FIXTURE, 'P1');
		// the 23 notes of the staff, once each: the tab staff would double the string marks
		expect(lilypond.match(/\\\d/g)).toHaveLength(23);
		expect(warnings).toEqual([]);
	});

	it('warns on a chord in a melody part and on a second voice', () => {
		const xml = withInBar1(
			`${note('<chord/><voice>1</voice>')}${note('<voice>2</voice>')}${note('<grace/><voice>1</voice>')}`
		);
		const { lilypond, warnings } = convertMelody(xml, 'P1');
		expect(warnings).toEqual([
			'bar 1: a chord in a melody part, only its first note is kept',
			'bar 1: voice 2 is ignored (only voice 1 is read)',
			'bar 1: a grace note is ignored'
		]);
		expect(lilypond.split('\n')[1]).toBe('c4\\5 d4\\4 e4\\4 f4\\4 |');
	});

	it('warns on techniques it does not convert', () => {
		const xml = FIXTURE.replace(
			'<string>5</string>',
			'<hammer-on type="start"/><string>5</string>'
		);
		const { warnings } = convertMelody(xml, 'P1');
		expect(warnings).toEqual(['technique "hammer-on" is not converted']);
	});

	it('reads attributes in any order and any spacing', () => {
		const xml = FIXTURE.replace(
			'<measure number="0" implicit="yes">',
			"<measure   implicit = 'yes'  number='0' >"
		);
		expect(convertMelody(xml, 'P1').lilypond.split('\n')[0]).toBe('r2 r4 g,4\\6 |');
	});

	it('refuses a part that is not there', () => {
		expect(() => convertMelody(FIXTURE, 'P9')).toThrow('no part "P9" (found: P1, P2)');
	});

	it('the output parses with parseLilyPond', () => {
		const { lilypond } = convertMelody(FIXTURE, 'P1');
		const figure = parseLilyPond(lilypond);
		const notes = figure.voices[0].elements.filter((e) => e.kind === 'note');
		expect(figure.bars).toBe(6);
		expect(notes.map((n) => n.pitch).slice(0, 4)).toEqual([43, 48, 50, 52]);
		expect(notes[0].string).toBe(6);
		expect(figure.voices[0].tuplets).toHaveLength(4);
	});
});

describe('listShapes', () => {
	it('lists the shapes of the chord part', () => {
		expect(listShapes(FIXTURE, 'P2')).toEqual([
			{ bar: 1, beat: 1, frets: [null, null, 0, 2, 3, null] },
			{ bar: 2, beat: 1, frets: [null, null, null, 0, 2, 3] },
			{ bar: 2, beat: 3, frets: [null, null, 2, 2, 0, null] },
			{ bar: 3, beat: 2, frets: [null, null, 0, 2, 3, null] }
		]);
	});
});
