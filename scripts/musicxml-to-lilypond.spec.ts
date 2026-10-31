import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Fraction } from '../src/lib/domain/time/fraction';
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
			'bar 1: voice 2 is ignored (only voice 1 is read)',
			'bar 1: a grace note is ignored',
			'bar 1: a chord in a melody part, only its first note is kept'
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

	it('accepts the standard tuning in both octave conventions, and warns on another', () => {
		// P1 writes it an octave above the sound (E3 to E5), P2 as the sound (E2 to E4)
		expect(FIXTURE).toContain('<tuning-octave>5</tuning-octave>');
		expect(FIXTURE).toContain('<tuning-octave>2</tuning-octave>');
		expect(convertMelody(FIXTURE, 'P1').warnings).toEqual([]);
		const shapes: string[] = [];
		listShapes(FIXTURE, 'P2', shapes);
		expect(shapes).toEqual([]);
		const dropped = FIXTURE.replace(
			'<tuning-step>D</tuning-step>\n\t\t\t\t\t\t<tuning-octave>4</tuning-octave>',
			'<tuning-step>C</tuning-step>\n\t\t\t\t\t\t<tuning-octave>4</tuning-octave>'
		);
		expect(convertMelody(dropped, 'P1').warnings).toEqual([
			'tuning is E3 A3 C4 G4 B4 E5, not the standard tuning: pitches are read in standard tuning'
		]);
	});

	it('says each warning once', () => {
		const bare =
			'<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>';
		const { warnings, lilypond } = convertMelody(withInBar1(bare + bare), 'P1');
		const missing =
			'bar 1: a note has no string and fret, its written pitch is taken an octave down';
		expect(warnings.filter((w) => w === missing)).toHaveLength(1);
		expect(lilypond.split('\n')[1]).toMatch(/^c'4 c'4 /);
	});

	it('refuses a part that is not there', () => {
		expect(() => convertMelody(FIXTURE, 'P99')).toThrow('no part "P99" (found: P1, P2, P3');
	});

	it('reads the string and the fret from a Guitar Pro processing instruction', () => {
		const { lilypond, warnings } = convertMelody(FIXTURE, 'P5');
		expect(lilypond).toBe('c4\\5 d4\\4 e2\\4~ |\ne1\\4 |');
		expect(warnings).toEqual([]);
	});

	it('reads a forward as a rest, with a warning', () => {
		const { lilypond, warnings } = convertMelody(FIXTURE, 'P7');
		expect(lilypond).toBe('c4\\5 r4 d2\\4 |');
		expect(warnings).toEqual(['bar 1: <forward> is read as a rest']);
	});

	it('warns on a tuplet that no stop mark closes', () => {
		const { warnings } = convertMelody(FIXTURE, 'P8');
		expect(warnings).toContain('bar 1: a tuplet is not closed by a stop mark, it will not parse');
	});

	it('writes a whole-bar rest with no written value as several rests, with a warning', () => {
		const { lilypond, warnings } = convertMelody(FIXTURE, 'P9');
		expect(lilypond).toBe('r1 r4 |');
		expect(warnings).toEqual(['bar 1: a rest of 5/4 is written as r1 r4']);
		expect(
			parseLilyPond(lilypond, { meter: { count: 5, unit: Fraction.of(1, 4), grouping: [5] } }).bars
		).toBe(1);
	});

	it('spells the pitches with flats in a flat key and sharps in a sharp key', () => {
		const flat = convertMelody(FIXTURE, 'P3');
		const sharp = convertMelody(FIXTURE, 'P4');
		expect(flat.lilypond).toBe("bes4\\3 ees4\\4 d'4\\2 bes,4\\5 |");
		expect(sharp.lilypond).toBe('fis4\\4 dis4\\5 gis4\\3 d4\\4 |');
		const midi = (text: string) =>
			parseLilyPond(text)
				.voices[0].elements.filter((e) => e.kind === 'note')
				.map((n) => n.pitch);
		expect(midi(flat.lilypond)).toEqual([58, 51, 62, 46]);
		expect(midi(sharp.lilypond)).toEqual([54, 51, 56, 50]);
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
	it('reads shapes whose strings sit in a processing instruction, and keeps a forward as time', () => {
		const warnings: string[] = [];
		expect(listShapes(FIXTURE, 'P6', warnings)).toEqual([
			{ bar: 1, beat: 1, frets: [null, null, 0, 2, 3, null] },
			{ bar: 2, beat: 3, frets: [null, null, 2, 2, 0, null] }
		]);
		// the second voice would have shifted the beat; it is left out and said so
		expect(warnings).toEqual(['bar 2: voice 2 is ignored (only voice 1 is read)']);
	});

	it('lists the shapes of the chord part', () => {
		expect(listShapes(FIXTURE, 'P2')).toEqual([
			{ bar: 1, beat: 1, frets: [null, null, 0, 2, 3, null] },
			{ bar: 2, beat: 1, frets: [null, null, null, 0, 2, 3] },
			{ bar: 2, beat: 3, frets: [null, null, 2, 2, 0, null] },
			{ bar: 3, beat: 2, frets: [null, null, 0, 2, 3, null] }
		]);
	});
});
