import { describe, expect, it } from 'vitest';
import { cyclePlan } from '$lib/domain/time/testing/cyclePlan';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS } from '$lib/domain/exercise';
import { contentJudges } from '$lib/domain/judges';
import {
	PlanRound,
	attackPositions,
	createTempoMap,
	figureFromJson,
	Fraction,
	type CycleReport
} from '$lib/domain/time';
import { cycleAids, cyclePlanRecord, levelAided, recordCycle } from './recordCycle';
import { rhythmParamsOf, tempoSegmentOf } from './rhythmExercise';

const [offbeats] = RHYTHM_OFFBEATS.figures ?? [];

/** A cycle of the one-bar offbeats at level 1, played exactly when `exact`, else empty. */
function settledCycle(exact: boolean) {
	const params = rhythmParamsOf(RHYTHM_OFFBEATS, 0);
	const plan = cyclePlan({
		figure: offbeats.figure,
		cycleBars: params.cycleBars,
		startBar: 0,
		sensor: 'attack',
		window: params.window,
		accompanimentBars: params.accompaniment.bars
	});
	const map = createTempoMap(10, [tempoSegmentOf(params)]);
	const round = new PlanRound({
		plan,
		clock: { map, start: Fraction.ZERO },
		judges: contentJudges,
		latency: null,
		thresholds: params.thresholds,
		aids: ['cursor']
	});
	if (exact) {
		for (const at of attackPositions(offbeats.figure)) {
			round.observe({ time: map.toSeconds(at), sensor: 'attack', readable: true, payload: {} });
		}
	}
	const outcome = round.close(round.endTime);
	if (outcome === null) throw new Error('a cycle closed without an outcome');
	return { params, outcome, startTime: round.startTime };
}

describe('recordCycle', () => {
	it('writes a cycle as a hot free attempt of the rhythm-figure mechanic, keyed by figure and level', () => {
		const { params, outcome } = settledCycle(true);
		const observations = [
			{ atMs: 0, sensor: 'attack', fate: 'answer' as const, correct: null, payload: {} }
		];
		const attempt = recordCycle({
			sessionId: 's1',
			exerciseId: RHYTHM_OFFBEATS.id,
			setup: { figureId: offbeats.id, figure: offbeats.figure, level: 0, params, startBar: 0 },
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
		const { params, outcome } = settledCycle(false);
		const attempt = recordCycle({
			sessionId: 's1',
			exerciseId: RHYTHM_OFFBEATS.id,
			setup: { figureId: offbeats.id, figure: offbeats.figure, level: 0, params, startBar: 0 },
			outcome,
			promptedAt: 0,
			startAudioS: 0,
			observations: []
		});
		expect(attempt.success).toBe(false);
		expect(attempt.timingOffsetMs).toBeNull();
	});

	it('keeps the resolved plan as plain JSON the figure can be read back from', () => {
		const params = rhythmParamsOf(RHYTHM_SILENT_BARS, 2);
		const [eighths] = RHYTHM_SILENT_BARS.figures ?? [];
		const record = cyclePlanRecord({
			figureId: eighths.id,
			figure: eighths.figure,
			level: 2,
			params,
			startBar: 1
		});
		const json = JSON.parse(JSON.stringify(record));
		expect(json).toEqual(record);
		expect(record).toMatchObject({
			cycleBars: 4,
			startBar: 1,
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: params.thresholds
		});
		expect(record.accompaniment.bars).toEqual(['on', 'off', 'off', 'off']);
		expect(figureFromJson(record.figure)).toEqual(eighths.figure);
		expect(figureFromJson(record.accompaniment.figure)).toEqual(params.accompaniment.figure);
	});
});

describe('cycleAids', () => {
	it('names the cursor the level gives, a listen worth an aid, and an aid level', () => {
		const params = rhythmParamsOf(RHYTHM_OFFBEATS, 0);
		expect(cycleAids({ params, aidLevel: false, listened: false, playAlong: false })).toEqual([
			'cursor'
		]);
		expect(
			cycleAids({
				params: { ...params, cursor: false, listen: 'aid' },
				aidLevel: true,
				listened: true,
				playAlong: false
			})
		).toEqual(['listen', 'aid-level']);
		// Listening is free at this level: it is no aid.
		expect(cycleAids({ params, aidLevel: false, listened: true, playAlong: false })).toEqual([
			'cursor'
		]);
	});

	it('names playing along, which the level never gives', () => {
		const params = rhythmParamsOf(RHYTHM_OFFBEATS, 0);
		const aids = cycleAids({ params, aidLevel: false, listened: false, playAlong: true });
		expect(aids).toContain('play-along');
		expect(levelAided(aids, params)).toBe(true);
	});
});

describe('levelAided', () => {
	it('counts only the aids beyond the level’s own cursor and aid level', () => {
		const params = rhythmParamsOf(RHYTHM_OFFBEATS, 0);
		expect(levelAided(['cursor', 'aid-level'], params)).toBe(false);
		expect(levelAided(['cursor', 'listen'], params)).toBe(true);
		expect(levelAided(['cursor'], { ...params, cursor: false })).toBe(true);
	});
});
