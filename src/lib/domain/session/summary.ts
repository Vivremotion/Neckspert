import type { CycleFailure, MeasureId, Measures } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { Segment, SeriesEnd } from './trace';

export interface RunSummary {
	/** The run's segment id: its take is kept under it. */
	id: number;
	level: number;
	ended: 'done' | 'interrupted';
	/** Rounds judged (a round cut short is not). */
	rounds: number;
	successes: number;
	/** Mean of each measure over the run's rounds that have it. */
	measures: Measures;
	failed: { attemptId: number; reasons: CycleFailure[] }[];
}

export interface SeriesSummary {
	exerciseId: string;
	ended: SeriesEnd | 'quit';
	breaking: CycleFailure | null;
	/** Level of each run in order, repeats merged: [0, 1, -1] = up, then to the aid level. */
	levels: number[];
	rounds: number;
	successes: number;
	/** Successes played with an aid the level does not give. */
	aided: number;
	listens: number;
	/** Time in rounds over the series' time, 0..1. */
	playedShare: number;
	runs: RunSummary[];
}

function descendants(segment: Segment): Segment[] {
	return segment.children.flatMap((child) => [child, ...descendants(child)]);
}

function reasonsOf(attempt: Attempt | undefined): CycleFailure[] {
	const value = attempt?.verdict?.value as { passed?: boolean; reasons?: CycleFailure[] } | null;
	return value && value.passed === false && Array.isArray(value.reasons) ? value.reasons : [];
}

function meanMeasures(attempts: readonly Attempt[]): Measures {
	const sums = new Map<MeasureId, { total: number; count: number; unit: string }>();
	for (const attempt of attempts) {
		for (const [id, measure] of Object.entries(attempt.measures) as [
			MeasureId,
			{ value: number; unit: string }
		][]) {
			const sum = sums.get(id) ?? { total: 0, count: 0, unit: measure.unit };
			sum.total += measure.value;
			sum.count += 1;
			sums.set(id, sum);
		}
	}
	return Object.fromEntries(
		[...sums].map(([id, { total, count, unit }]) => [id, { value: total / count, unit }])
	) as Measures;
}

/** A series as its trace and its attempts tell it: by run, with what changed and what broke. */
export function summarizeSeries(input: {
	series: Segment;
	attempts: readonly Attempt[];
	aided(attempt: Attempt): boolean;
}): SeriesSummary {
	const { series } = input;
	const byId = new Map(input.attempts.map((attempt) => [attempt.id, attempt]));
	const all = descendants(series);
	const rounds = all.filter((segment) => segment.role === 'round');
	const attemptOf = (round: Segment) =>
		round.attemptId === undefined ? undefined : byId.get(round.attemptId);
	const played = rounds.map(attemptOf).filter((a): a is Attempt => a !== undefined);

	const runs: RunSummary[] = all
		.filter((segment) => segment.role === 'run')
		.map((run) => {
			const own = descendants(run).filter((segment) => segment.role === 'round');
			const attempts = own.map(attemptOf).filter((a): a is Attempt => a !== undefined);
			return {
				id: run.id,
				level: run.level ?? 0,
				ended: run.ended,
				// Judged rounds only: a round cut by a pause or a quit has no attempt.
				rounds: attempts.length,
				successes: attempts.filter((attempt) => attempt.success).length,
				measures: meanMeasures(attempts),
				failed: attempts
					.filter((attempt) => !attempt.success && attempt.id !== undefined)
					.map((attempt) => ({ attemptId: attempt.id as number, reasons: reasonsOf(attempt) }))
			};
		});

	const levels: number[] = [];
	for (const run of runs) if (levels.at(-1) !== run.level) levels.push(run.level);
	const length = series.endS - series.startS;
	const inRounds = rounds.reduce((sum, round) => sum + (round.endS - round.startS), 0);

	return {
		exerciseId: series.exerciseId ?? '',
		ended: series.reason ?? 'quit',
		breaking: series.breaking ?? null,
		levels,
		rounds: played.length,
		successes: played.filter((attempt) => attempt.success).length,
		aided: played.filter((attempt) => attempt.success && input.aided(attempt)).length,
		listens: all.filter((segment) => segment.role === 'listen').length,
		playedShare: length > 0 ? inRounds / length : 0,
		runs
	};
}
