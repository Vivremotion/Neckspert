import { describe, expect, it } from 'vitest';
import { cyclePlan } from '$lib/domain/time/testing/cyclePlan';
import {
	figureParamsOf,
	resolvedParamsOf,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	tempoOf,
	type ExerciseDefinition
} from '$lib/domain/exercise';
import { contentJudges } from '$lib/domain/judges';
import {
	PlanRound,
	attackPositions,
	createTempoMap,
	figureFromJson,
	Fraction,
	type Accompaniment,
	type CycleReport,
	type ExpectationWindow,
	type Figure
} from '$lib/domain/time';
import {
	cycleAids,
	cyclePlanRecord,
	levelAided,
	recordCycle,
	type CycleSetup
} from './recordCycle';

const [offbeats] = RHYTHM_OFFBEATS.figures ?? [];

/** What a cycle of `exercise` at `level` plays, from its resolved params. */
function setupOf(
	exercise: ExerciseDefinition,
	level: number,
	{ id, figure }: { id: string; figure: Figure },
	startBar: number
): CycleSetup {
	const resolved = resolvedParamsOf(exercise, { exerciseLevel: level, itemLevel: null });
	return {
		figureId: id,
		figure,
		level,
		cycleBars: resolved.cycleBars as number,
		accompaniment: resolved.accompaniment as Accompaniment,
		tempo: { at: Fraction.ZERO, bpm: tempoOf(exercise, level), unit: Fraction.of(1, 4) },
		window: resolved.window as ExpectationWindow,
		thresholds: figureParamsOf(exercise, level).thresholds,
		startBar
	};
}

/** A cycle of the one-bar offbeats at level 1, played exactly when `exact`, else empty. */
function settledCycle(exact: boolean) {
	const setup = setupOf(RHYTHM_OFFBEATS, 0, offbeats, 0);
	const plan = cyclePlan({
		figure: offbeats.figure,
		cycleBars: setup.cycleBars,
		startBar: 0,
		sensor: 'attack',
		window: setup.window,
		accompanimentBars: setup.accompaniment.bars
	});
	const map = createTempoMap(10, [setup.tempo]);
	const round = new PlanRound({
		plan,
		clock: { map, start: Fraction.ZERO },
		judges: contentJudges,
		latency: null,
		thresholds: setup.thresholds,
		aids: ['cursor']
	});
	if (exact) {
		for (const at of attackPositions(offbeats.figure)) {
			round.observe({ time: map.toSeconds(at), sensor: 'attack', readable: true, payload: {} });
		}
	}
	const outcome = round.close(round.endTime);
	if (outcome === null) throw new Error('a cycle closed without an outcome');
	return { setup, outcome, startTime: round.startTime };
}

describe('recordCycle', () => {
	it('writes a cycle as a hot free attempt of the rhythm-figure mechanic, keyed by figure and level', () => {
		const { setup, outcome } = settledCycle(true);
		const observations = [
			{ atMs: 0, sensor: 'attack', fate: 'answer' as const, correct: null, payload: {} }
		];
		const attempt = recordCycle({
			sessionId: 's1',
			exerciseId: RHYTHM_OFFBEATS.id,
			setup,
			outcome,
			promptedAt: 1234,
			startAudioS: 12.5,
			observations
		});
		// The audio time of the cycle's start, on the clock the diagnostic journal also uses.
		expect((attempt.plan as { startAudioS?: number }).startAudioS).toBe(12.5);
		expect(attempt).toMatchObject({
			sessionId: 's1',
			exerciseId: 'rhythm-offbeats',
			mechanic: 'rhythm-figure',
			cardKey: 'rhythm-figure:offbeats-1@0',
			phase: 'free',
			temperature: 'hot',
			promptedAt: 1234,
			tempoBpm: 80,
			leadBeats: null,
			reactionMs: null,
			correct: null,
			success: true,
			aids: ['cursor'],
			observations
		});
		expect(attempt.verdict).toEqual({ relation: 'cycle', version: 1, value: { passed: true } });
		expect(attempt.measures).toBe(outcome.measures);
		expect(attempt.data.item).toEqual({ figureId: 'offbeats-1', level: 0 });
		expect(attempt.data.level).toBe(0);
		expect((attempt.data.report as CycleReport).extra).toBe(0);
		// Placement needs offsets: an exact cycle has one, at 0 ms.
		expect(attempt.timingOffsetMs).toBeCloseTo(0, 6);
	});

	it('leaves the offset null when no attack gave a placement', () => {
		const { setup, outcome } = settledCycle(false);
		const attempt = recordCycle({
			sessionId: 's1',
			exerciseId: RHYTHM_OFFBEATS.id,
			setup,
			outcome,
			promptedAt: 0,
			startAudioS: 0,
			observations: []
		});
		expect(attempt.success).toBe(false);
		expect(attempt.timingOffsetMs).toBeNull();
	});

	it('keeps the resolved plan as plain JSON the figure can be read back from', () => {
		const [eighths] = RHYTHM_SILENT_BARS.figures ?? [];
		const setup = setupOf(RHYTHM_SILENT_BARS, 2, eighths, 1);
		const record = cyclePlanRecord(setup);
		const json = JSON.parse(JSON.stringify(record));
		expect(json).toEqual(record);
		expect(record).toMatchObject({
			cycleBars: 4,
			startBar: 1,
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: setup.thresholds
		});
		expect(record.accompaniment.bars).toEqual(['on', 'off', 'off', 'off']);
		expect(figureFromJson(record.figure)).toEqual(eighths.figure);
		expect(figureFromJson(record.accompaniment.figure)).toEqual(setup.accompaniment.figure);
	});
});

describe('cycleAids', () => {
	const plain = { cursor: true, listen: 'free' as const, aidLevel: false, playAlong: false };
	it('names the cursor the level gives, a listen worth an aid, and an aid level', () => {
		expect(cycleAids({ ...plain, listened: false })).toEqual(['cursor']);
		expect(
			cycleAids({ cursor: false, listen: 'aid', aidLevel: true, listened: true, playAlong: false })
		).toEqual(['listen', 'aid-level']);
		// Listening is free at this level: it is no aid.
		expect(cycleAids({ ...plain, listened: true })).toEqual(['cursor']);
	});

	it('names playing along, which the level never gives', () => {
		const aids = cycleAids({ ...plain, listened: false, playAlong: true });
		expect(aids).toContain('play-along');
		expect(levelAided(aids, true)).toBe(true);
	});
});

describe('levelAided', () => {
	it('counts only the aids beyond the level’s own cursor and aid level', () => {
		expect(levelAided(['cursor', 'aid-level'], true)).toBe(false);
		expect(levelAided(['cursor', 'listen'], true)).toBe(true);
		// A cursor the level does not give is an aid.
		expect(levelAided(['cursor'], false)).toBe(true);
	});
});
