import { describe, expect, it } from 'vitest';
import type { CycleReport } from '$lib/domain/time';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { ARPEGGIO_EXERCISE, ARPEGGIO_ITEMS, ARPEGGIO_PATTERN } from '$lib/testing/arpeggioExercise';
import { ORIGIN, sequenceSeries, shapePitches, stageOf } from '$lib/testing/sequenceSeries';
import { validateExercise } from '$lib/domain/exercise/validate';
import {
	presentationProblem,
	previewProblem,
	screenProblem
} from '$lib/application/presentation/validate';
import { FIGURE_PRESENTERS } from '$lib/application/mechanics/figurePresenters';
import type { FigureAttemptData } from './recordResponse';

/**
 * Several chord shapes chained (plan S, Task 9): a `voicing-figure` exercise lists its shapes, each
 * one round of four beats arpeggiated over its level's figure, the rounds handing over without a
 * gap, each judged on its notes' pitch and time.
 */

const BAR_S = 4; // ♩ = 60 bpm
const EPOCH = Date.UTC(2026, 0, 1);

/** Epoch ms of bar `bar` of a series that began at clock time 0. */
const epochOfBar = (bar: number) => EPOCH + (ORIGIN + bar * BAR_S) * 1000;

const series = () => sequenceSeries(ARPEGGIO_EXERCISE, { pattern: ARPEGGIO_PATTERN, met: true });

describe('a sequence of chord shapes on the series', () => {
	it('is an exercise the engine runs, its unread aid path included', () => {
		expect(validateExercise(ARPEGGIO_EXERCISE, { sensors: ['note'] })).toBeNull();
		expect(presentationProblem(ARPEGGIO_EXERCISE)).toBeNull();
		expect(screenProblem(ARPEGGIO_EXERCISE, FIGURE_PRESENTERS)).toBeNull();
		expect(previewProblem(ARPEGGIO_EXERCISE, FIGURE_PRESENTERS)).toBeNull();
	});

	it('chains the three chords without a gap, one attempt each', async () => {
		const { controller, stored, advance, player } = await series();
		await controller.ready();
		await controller.start();
		// counted bar 0, the three shapes on bars 1, 2 and 3
		await advance(ORIGIN + 4.5 * BAR_S);
		const attempts = await stored();
		expect(attempts.map((a) => a.cardKey)).toEqual(
			ARPEGGIO_ITEMS.map((key) => `voicing-figure:${key}`)
		);
		expect(attempts.map((a) => a.promptedAt)).toEqual([1, 2, 3].map(epochOfBar));
		expect(player.prompts).toHaveLength(3);
		for (const attempt of attempts) {
			expect(attempt.mechanic).toBe('voicing-figure');
			expect(attempt.success).toBe(true);
			expect(attempt.correct).toBe(true);
			expect(attempt.observations?.filter((o) => o.fate === 'answer')).toHaveLength(4);
		}
		expect(stageOf(controller).phase).toBe('breath');
		controller.quit();
	});

	it('gives a chord its downbeat played a little early, across the handover', async () => {
		const { controller, stored, advance, player } = await series();
		player.offsetS = -0.04;
		await controller.start();
		await advance(ORIGIN + 4.5 * BAR_S);
		const attempts = await stored();
		expect(attempts).toHaveLength(3);
		for (const attempt of attempts) {
			const { report } = attempt.data as FigureAttemptData;
			for (const expectation of report.expectations) {
				expect(expectation.verdict).not.toBe('missed');
				expect(expectation.offsetMs).toBeCloseTo(-40, 0);
			}
			expect(report.extra).toBe(0);
			expect(attempt.success).toBe(true);
		}
		controller.quit();
	});

	it('passes a chord played right and fails one with a wrong note', async () => {
		const { controller, stored, advance, player } = await series();
		const [, f] = ARPEGGIO_ITEMS;
		const fifth = shapePitches(f)[2];
		// The F's third note (its fifth) a tone low.
		player.pitch = (round, note, midi) => (round === 1 && note === 2 ? fifth - 2 : midi);
		await controller.start();
		await advance(ORIGIN + 4.5 * BAR_S);
		const [c, wrong, g] = await stored();
		expect([c.success, c.correct]).toEqual([true, true]);
		expect([g.success, g.correct]).toEqual([true, true]);
		expect(wrong.success).toBe(false);
		expect(wrong.correct).toBe(false);
		const report = (wrong.data as FigureAttemptData).report as CycleReport;
		expect(report.expectations.map((e) => e.verdict)).toEqual([
			'on-time',
			'on-time',
			'wrong-pitch',
			'on-time'
		]);
		controller.quit();
	});

	it('fails every chord when nothing is played, the anti-blocking left off', async () => {
		const { controller, stored, advance, levels } = await series();
		await controller.start();
		// Two runs of three, a breath between them: no remedy, no aid level, no change of air.
		const seen = new Set<string>();
		for (let to = ORIGIN; to < ORIGIN + 10.5 * BAR_S; to += 0.25) {
			await advance(to, false);
			const kind = controller.view.announcement?.kind;
			if (kind) seen.add(kind);
		}
		const attempts = await stored();
		expect(attempts.length).toBeGreaterThanOrEqual(6);
		for (const attempt of attempts) {
			expect(attempt.success).toBe(false);
			expect(attempt.correct).toBe(false);
			expect(attempt.aids).not.toContain('play-along');
			expect((attempt.data as FigureAttemptData).level).toBe(0);
		}
		expect(seen).toEqual(new Set());
		expect(controller.view.status).not.toBe('ended');
		const state = await levels.get({ exerciseId: ARPEGGIO_EXERCISE.id, scope: '', item: '' });
		expect(state?.level ?? 0).toBe(0);
		expect(state?.resumeAfter ?? null).toBeNull();
		controller.quit();
	});

	it('levels up from quarters to eighths at a breath', async () => {
		const { controller, stored, advance } = await series();
		await controller.start();
		await advance(ORIGIN + 4.5 * BAR_S);
		// Three chords right unaided: level 2, told at the breath, played from the next run.
		expect(controller.view.announcement?.kind).toBe('level-up');
		expect(stageOf(controller).next?.voices[0].elements).toHaveLength(8);
		await advance(ORIGIN + 12 * BAR_S);
		const attempts = await stored();
		const [first, second] = [attempts.slice(0, 3), attempts.slice(3, 6)];
		expect(second).toHaveLength(3);
		expect(first.map((a) => (a.data as FigureAttemptData).level)).toEqual([0, 0, 0]);
		expect(second.map((a) => (a.data as FigureAttemptData).level)).toEqual([1, 1, 1]);
		expect(second.map((a) => a.cardKey)).toEqual(
			ARPEGGIO_ITEMS.map((key) => `voicing-figure:${key}`)
		);
		for (const attempt of second) {
			// The figure param changes, the tempo stays.
			expect(attempt.tempoBpm).toBe(60);
			expect((attempt.data as FigureAttemptData).report.expectations).toHaveLength(8);
			expect(attempt.success).toBe(true);
		}
		// The breath: the second run does not chain to the first.
		expect(second[0].promptedAt).toBeGreaterThan(epochOfBar(4));
		controller.quit();
	});

	it('chains changes of 4, 2 and 6 beats, the second starting on beat 1 of a bar and the third on beat 3', async () => {
		// A grid's changes last any number of beats: the quarters fill each, the last loop cut.
		const changes = [
			{ key: 'C|maj|3:1,2:3,1:5@0@4', beats: 4 },
			{ key: 'F|maj|3:1,2:3,1:5@0@2', beats: 2 },
			{ key: 'G|maj|3:1,2:3,1:5@0@6', beats: 6 }
		];
		const exercise: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			id: 'test-arpeggio-changes',
			items: changes.map((change) => change.key)
		};
		expect(validateExercise(exercise, { sensors: ['note'] })).toBeNull();
		const { controller, stored, advance, detector } = await sequenceSeries(exercise, {
			pattern: ARPEGGIO_PATTERN,
			met: true
		});
		await controller.start();
		// Each change's quarters on its beats, from bar 1 after the counted bar (a beat is 1 s).
		const beatS = BAR_S / 4;
		const notes: { time: number; midi: number }[] = [];
		let beat = 0;
		for (const { key, beats } of changes) {
			const pitches = shapePitches(key);
			for (let k = 0; k < beats; k++) {
				const midi = pitches[ARPEGGIO_PATTERN[k % ARPEGGIO_PATTERN.length] - 1];
				notes.push({ time: ORIGIN + BAR_S + (beat + k) * beatS, midi });
			}
			beat += beats;
		}
		for (const { time, midi } of notes) {
			await advance(time, false);
			detector.emitNote({ time, midi, frequencyHz: 440, clarity: 1 });
		}
		await advance(ORIGIN + 4.5 * BAR_S, false);
		const attempts = await stored();
		expect(attempts.map((a) => a.cardKey)).toEqual(
			changes.map((change) => `voicing-figure:${change.key}`)
		);
		// Each round opens at the handover of the one before: bar 1, bar 2, bar 2 beat 3.
		expect(attempts.map((a) => a.promptedAt)).toEqual([1, 2, 2.5].map(epochOfBar));
		expect(attempts.map((a) => (a.data as FigureAttemptData).report.expectations.length)).toEqual([
			4, 2, 6
		]);
		for (const attempt of attempts) {
			const { report } = attempt.data as FigureAttemptData;
			expect(report.expectations.every((e) => e.verdict === 'on-time')).toBe(true);
			expect(report.extra).toBe(0);
			expect([attempt.success, attempt.correct]).toEqual([true, true]);
		}
		controller.quit();
	});

	it('shows each change of 4, 2 and 6 beats as it plays, cut in its bars and counted in whole bars', async () => {
		const changes = ['C|maj|3:1,2:3,1:5@0@4', 'F|maj|3:1,2:3,1:5@0@2', 'G|maj|3:1,2:3,1:5@0@6'];
		const exercise: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			id: 'test-arpeggio-changes-shown',
			items: changes
		};
		const { controller, advance } = await sequenceSeries(exercise, {
			pattern: ARPEGGIO_PATTERN,
			met: true
		});
		await controller.start();
		const beatS = BAR_S / 4;
		/** The stage on beat `beat` (from 0) of bar `bar` of the transport. */
		const at = async (bar: number, beat: number) => {
			await advance(ORIGIN + bar * BAR_S + beat * beatS + 0.01, false);
			const model = stageOf(controller);
			return {
				phase: model.phase,
				chord: model.prompt?.primary,
				notes: model.figure.voices[0].elements.map((e) => e.kind),
				bar: [model.barInCycle, model.cycleBars],
				cursor: model.cursor?.toString()
			};
		};
		const quarters = (notes: number, rests: number) => [
			...Array(notes).fill('note'),
			...Array(rests).fill('rest')
		];
		// The F change, two beats on bar 2: its two notes, then rests, in one whole bar.
		expect(await at(2, 1)).toEqual({
			phase: 'play',
			chord: 'F',
			notes: quarters(2, 2),
			bar: [0, 1],
			cursor: '1/4'
		});
		// The G change opens on beat 3 of bar 2: its first beat is the round's.
		expect(await at(2, 2)).toEqual({
			phase: 'play',
			chord: 'G',
			notes: quarters(6, 2),
			bar: [0, 2],
			cursor: '0'
		});
		// Its fifth beat, beat 3 of bar 3: the round's second bar.
		expect(await at(3, 2)).toEqual({
			phase: 'play',
			chord: 'G',
			notes: quarters(6, 2),
			bar: [1, 2],
			cursor: '1'
		});
		controller.quit();
	});

	it('listens with the note sensor only', async () => {
		const { controller, stored, advance, attacks, detector } = await series();
		await controller.start();
		await advance(ORIGIN + 1.5 * BAR_S);
		expect(detector.running).toBe(true);
		expect(attacks.listeners).toBe(0);
		await advance(ORIGIN + 4.5 * BAR_S);
		const observations = (await stored()).flatMap((a) => a.observations ?? []);
		expect(observations.length).toBeGreaterThan(0);
		expect(new Set(observations.map((o) => o.sensor))).toEqual(new Set(['note']));
		controller.quit();
	});
});
