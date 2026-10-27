import { exerciseLevelsOf, pacingAt } from '$lib/domain/exercise/levels';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import {
	askListen,
	next,
	settle,
	startRun,
	startSeries,
	type Coming,
	type Next,
	type SeriesRules,
	type SeriesState,
	type SettledRound
} from '$lib/domain/session';
import { levelRange, type CycleFailure, type LevelState } from '$lib/domain/time';
import type { LevelStateRepositoryPort } from '$lib/application/ports';
import type { Announcement } from '../contract';
import { canSound, listenOf } from './compilePlan';

/** The key of an exercise level: its exercise and its scope (empty for none). */
function keyOf(exerciseId: ExerciseId, scope: string | undefined): string {
	return JSON.stringify([exerciseId, scope ?? '']);
}

/** Where one (exercise, scope) stands in a series. */
interface Held {
	/** The state the policy moves: its level, stored at each settle, and its run. */
	series: SeriesState;
	/** The level its rounds play at: the state's, once applied. */
	played: number;
}

/**
 * The level of each (exercise, scope) during a series (plan H6, D3): read from the store once the
 * series is prepared, moved by every round settled at the level played (`settle` of the policy,
 * with the anti-blocking when the exercise asks it) and stored at once, so a change reached as
 * time runs out is kept; a change waits for `apply`, which the series calls at a round that does
 * not chain (a breath), never in the middle of a run. An exercise that writes no levels has one,
 * implicit, that never moves: nothing is stored for it. At each boundary between rounds, the
 * policy's `next` decides on the state of the coming round's (exercise, scope): another round of
 * its run, a breath, or the end (plan H6, D7).
 */
export class ExerciseLevels {
	/** The exercise levels stored when the series was prepared, by key; raw, clamped when met. */
	private stored = new Map<string, LevelState>();
	private readonly held = new Map<string, Held>();
	/** The writes, one after the other: a failed one does not stop the later ones. */
	private writes: Promise<void> = Promise.resolve();

	constructor(
		private readonly deps: {
			levels: LevelStateRepositoryPort;
			exercise: (id: ExerciseId) => ExerciseDefinition;
			/** Epoch ms, for the rest the anti-blocking may give an exercise. */
			now: () => number;
		}
	) {}

	/**
	 * Reads every exercise level stored (item ''), forgetting what an earlier series held. Once,
	 * before the series' first round: the series meets its (exercise, scope) as it takes its items,
	 * at a handover too, where nothing can wait for the store.
	 */
	async load(): Promise<void> {
		const states = await this.deps.levels.all();
		this.stored = new Map(
			states
				.filter((state) => state.item === '')
				.map((state) => [keyOf(state.exerciseId, state.scope), state])
		);
		this.held.clear();
	}

	/** The level the next run of (exercise, scope) plays: the pending change applied. */
	played(exerciseId: ExerciseId, scope?: string): number {
		return this.heldOf(exerciseId, scope).played;
	}

	/** The level (exercise, scope) has reached, applied or not: the one a session ends on. */
	reached(exerciseId: ExerciseId, scope?: string): number {
		return this.heldOf(exerciseId, scope).series.levelState.level;
	}

	/**
	 * A settled round moves the state (`settle` of the policy, with what the anti-blocking reads of
	 * it: its item, and a cycle's report, verdict and spot) and stores it; a change waits for `apply`.
	 */
	async settle(
		round: {
			exerciseId: ExerciseId;
			scope?: string;
		} & Pick<SettledRound, 'level' | 'success' | 'aided'> &
			Partial<Pick<SettledRound, 'item' | 'report' | 'verdict' | 'spotMs'>>
	): Promise<'up' | 'down' | null> {
		const definition = this.deps.exercise(round.exerciseId);
		const held = this.heldOf(round.exerciseId, round.scope);
		const { state, changed } = settle(
			held.series,
			rulesOf(definition, Number.POSITIVE_INFINITY),
			{
				level: round.level,
				item: round.item ?? '',
				success: round.success,
				aided: round.aided,
				...(round.report && { report: round.report }),
				...(round.verdict && { verdict: round.verdict }),
				// Without a spot, rounds are never compared spot by spot.
				spotMs: round.spotMs ?? 0
			},
			this.deps.now()
		);
		held.series = state;
		if (writesLevels(definition)) {
			const written = state.levelState;
			this.writes = this.writes.catch(() => undefined).then(() => this.deps.levels.put(written));
			await this.writes;
		}
		return changed;
	}

	/**
	 * At the boundary before a round of (exercise, scope) — `coming`, how it would come; null when
	 * the source has nothing more — what the policy decides (`next`), over the run under way, or
	 * one started there. After a breath, a new run starts with the coming round, which comes after
	 * a counted bar: `next` is that round's place in it. `look`: what it would decide, the state
	 * left as it is (decided ahead of a breath, or of an instruction that stops play first).
	 */
	boundary(
		at: { exerciseId: ExerciseId; scope?: string },
		elapsedMs: number,
		budgetMs: number,
		coming: Coming | null,
		options: { look?: boolean } = {}
	): { breath: boolean; next: Next } {
		const held = this.heldOf(at.exerciseId, at.scope);
		const rules = rulesOf(this.deps.exercise(at.exerciseId), budgetMs);
		const running = (state: SeriesState) => (state.run ? state : startRun(state));
		let step = next(running(held.series), rules, elapsedMs, coming);
		const breath = step.next.role === 'breath';
		if (breath) {
			step = next(startRun(step.state), rules, elapsedMs, { chains: false, countIn: true });
		}
		if (!options.look) held.series = step.state;
		return { breath, next: step.next };
	}

	/** The player asked to hear the content of (exercise, scope): its next round is heard, if its level allows. */
	askListen(exerciseId: ExerciseId, scope?: string): void {
		const held = this.heldOf(exerciseId, scope);
		held.series = askListen(held.series, rulesOf(this.deps.exercise(exerciseId), 0));
	}

	/**
	 * Play stops (a pause): every run under way ends, and a listen asked is forgotten; the remedies
	 * queued stay. Play goes on with a new run, after a counted bar.
	 */
	interrupt(): void {
		for (const held of this.held.values()) {
			held.series = { ...held.series, run: null, listenAsked: false };
		}
	}

	/** The measure that breaks, once the anti-blocking changed the air of an exercise; null otherwise. */
	breaking(): CycleFailure | null {
		for (const held of this.held.values()) if (held.series.breaking) return held.series.breaking;
		return null;
	}

	/**
	 * The run of (exercise, scope) started again, at the level now held: its boundary was decided
	 * before the last round of the run before settled (a cycle), which may have moved the level.
	 */
	restartRun(exerciseId: ExerciseId, scope?: string): void {
		const held = this.heldOf(exerciseId, scope);
		held.series = startRun({ ...held.series, run: null });
	}

	/** At a round that does not chain: the change waiting for (exercise, scope) becomes the level played. */
	apply(exerciseId: ExerciseId, scope?: string): Announcement | null {
		const held = this.heldOf(exerciseId, scope);
		const played = held.played;
		const reached = held.series.levelState.level;
		if (reached === played) return null;
		held.played = reached;
		// An aid level is announced as one, never by a number below 1.
		if (reached < 0) return 'aid-level';
		return reached > played ? 'level-up' : 'level-down';
	}

	/** Once every level settled so far is written. */
	settled(): Promise<void> {
		return this.writes.catch(() => undefined);
	}

	private heldOf(exerciseId: ExerciseId, scope: string | undefined): Held {
		const key = keyOf(exerciseId, scope);
		let held = this.held.get(key);
		if (!held) {
			const levelState = this.startOf(exerciseId, scope, this.stored.get(key));
			held = { series: startSeries(levelState), played: levelState.level };
			this.held.set(key, held);
		}
		return held;
	}

	/** The stored state clamped into the exercise's levels; level 0 without one. */
	private startOf(
		exerciseId: ExerciseId,
		scope: string | undefined,
		stored: LevelState | undefined
	): LevelState {
		const { lowest, highest } = levelRange(exerciseLevelsOf(this.deps.exercise(exerciseId)));
		const state: LevelState = stored ?? {
			exerciseId,
			scope: scope ?? '',
			item: '',
			level: 0,
			successes: 0,
			failures: 0,
			resumeAfter: null
		};
		return { ...state, level: Math.min(highest, Math.max(lowest, state.level)) };
	}
}

/** Whether the exercise writes levels of its own: only then is its level worth storing. */
function writesLevels(definition: ExerciseDefinition): boolean {
	return (definition.levels?.length ?? 0) > 0;
}

/**
 * What the policy reads of an exercise: its levels, the runs of each (`pacing.roundsPerBreath`,
 * none when absent), what listening its levels give, whether it can make its content sound (then
 * listening and playing along are remedies) and whether it asks the anti-blocking, with the
 * series' length.
 */
function rulesOf(definition: ExerciseDefinition, budgetMs: number): SeriesRules {
	return {
		levels: exerciseLevelsOf(definition),
		roundsPerBreath: (level) => pacingAt(definition, level).roundsPerBreath ?? null,
		listen: (level) => listenOf(definition, level),
		canSound: canSound(definition),
		budgetMs,
		antiBlocking: definition.flow?.antiBlocking ?? false
	};
}
