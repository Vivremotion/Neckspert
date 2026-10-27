import { exerciseLevelsOf } from '$lib/domain/exercise/levels';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { settle, startSeries, type SeriesRules, type SeriesState } from '$lib/domain/session';
import { levelRange, type LevelState } from '$lib/domain/time';
import type { LevelStateRepositoryPort } from '$lib/application/ports';
import type { Announcement } from '../contract';

/** The key of an exercise level: its exercise and its scope (empty for none). */
function keyOf(exerciseId: ExerciseId, scope: string | undefined): string {
	return JSON.stringify([exerciseId, scope ?? '']);
}

/** Where one (exercise, scope) stands in a series. */
interface Held {
	/** The state the policy moves, stored at each settle. */
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
 * implicit, that never moves: nothing is stored for it.
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

	/** A settled round moves the state (`settle` of the policy) and stores it; a change waits for `apply`. */
	async settle(round: {
		exerciseId: ExerciseId;
		scope?: string;
		level: number;
		success: boolean;
		aided: boolean;
	}): Promise<'up' | 'down' | null> {
		const definition = this.deps.exercise(round.exerciseId);
		const held = this.heldOf(round.exerciseId, round.scope);
		const { state, changed } = settle(
			held.series,
			rulesOf(definition),
			// A response round has no cycle report: rounds are never compared spot by spot.
			{ level: round.level, item: '', success: round.success, aided: round.aided, spotMs: 0 },
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

	/** At a round that does not chain: the change waiting for (exercise, scope) becomes the level played. */
	apply(exerciseId: ExerciseId, scope?: string): Announcement | null {
		const held = this.heldOf(exerciseId, scope);
		const played = held.played;
		const reached = held.series.levelState.level;
		if (reached === played) return null;
		held.played = reached;
		if (reached < 0 && played >= 0) return 'aid-level';
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
 * What the policy's `settle` reads of an exercise: its levels and whether it asks the
 * anti-blocking. A response series has no figure to sound, and its runs and length are not the
 * policy's yet (Task 5 of plan H6): `params` and `budgetMs` are never read by `settle`.
 */
function rulesOf(definition: ExerciseDefinition): SeriesRules {
	return {
		levels: exerciseLevelsOf(definition),
		params: () => ({ cyclesPerBreath: Number.POSITIVE_INFINITY, listen: 'none' }),
		canSound: false,
		budgetMs: Number.POSITIVE_INFINITY,
		antiBlocking: definition.flow?.antiBlocking ?? false
	};
}
