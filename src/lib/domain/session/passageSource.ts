import { roundMemberContents } from '$lib/domain/exercise/passage/contents';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { indexOpen } from '$lib/domain/exercise/passage/opens';
import {
	compilePassageRound,
	isUnplayable,
	passageRound
} from '$lib/domain/exercise/passage/round';
import type { PassageIndex } from '$lib/domain/exercise/passage/types';
import { MAX_PASSAGE_MEMBERS } from '$lib/domain/exercise/passage/validate';
import { compiledExtra, roundCheckWeight } from '$lib/domain/exercise/checkCost';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { familyNamed, passageDerivation, select, type Family } from '$lib/domain/families';
import { admittedMembers } from '$lib/domain/judges';
import type { ItemSource, RecordOutcome, SelectorContext } from '$lib/domain/progress/selector';
import type { Attempt, AttemptPassage, CardState, PlannedItem } from '$lib/domain/types';

type Values = Readonly<Record<string, unknown>>;

/**
 * What looking for a playable passage of one index may cost in one call of `next()`, in the
 * check cost of the rounds it tries (`roundCheckWeight`, as at load); past it, the index is left
 * out for the session. A round tried costs more here than at load (the members its content
 * admits are found too): measured on an Apple M3 Pro, 15 to 40 µs a unit, so an index costs at
 * most about 40 ms, and a call (`MAX_PASSAGE_SEARCH`) at most about 80 ms. A passage of the most
 * members (256) fits when each of its rounds weighs at most 3.
 */
export const MAX_PASSAGE_TRIES = 1_000;
/**
 * What one call of `next()` may cost in all: an index left out over its tries, then another
 * looked for. Past it, the index under way is left out too and the source answers null.
 */
export const MAX_PASSAGE_SEARCH = 2 * MAX_PASSAGE_TRIES;

/** The cost a call of `next()` spends looking for a passage. */
interface Search {
	spent: number;
}

/** Thrown when an index has cost its tries, or the call its search. */
class TriesSpent extends Error {
	constructor(readonly search: boolean) {
		super(search ? 'the search of this call is spent' : 'the tries of this index are spent');
	}
}

/** The two ways a `position` filter looks, each the other's turn. */
const TURNED: Readonly<Record<string, string>> = { up: 'down', down: 'up' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What an attempt keeps of the passage its round belonged to (`Attempt.data.passage`); null for
 * an attempt without one, as those of before the passages.
 */
export function passageOf(attempt: Pick<Attempt, 'data'>): AttemptPassage | null {
	const passage = isRecord(attempt.data) ? attempt.data.passage : undefined;
	if (
		!isRecord(passage) ||
		typeof passage.id !== 'string' ||
		typeof passage.index !== 'string' ||
		!Number.isInteger(passage.rank) ||
		!isRecord(passage.each)
	) {
		return null;
	}
	return passage as unknown as AttemptPassage;
}

/** An exercise that writes passages, with its open indices in the order written. */
interface Exercise {
	definition: ExerciseDefinition;
	indices: PassageIndex[];
}

/** What the source remembers of an index, from the history and this session. */
interface IndexState {
	/** Epoch ms of its last round played; -Infinity when never. */
	lastPlayedAt: number;
	/** The passage params its last passage started with; null when never played. */
	started: Values | null;
	/** Nothing of it can be played: left out for this session. */
	unplayable: boolean;
	/** Its exercise changed air on its scope (`leave`): left out for this session. */
	left: boolean;
}

/** A passage under way. */
interface Passage {
	exercise: Exercise;
	index: PassageIndex;
	id: string;
	/** The item of each round, in order. */
	items: unknown[];
	/** The passage params it started with, and as its next round reads them. */
	started: Values;
	each: Values;
	/** A break of silence before its counted bar: it follows a passage of the session, and is not one played again. */
	rests: boolean;
	next: number;
	/** Whether each round passed, as `record` learned it. */
	passed: (boolean | undefined)[];
	/** The families of the member contents each round served judges, by rank. */
	families: Map<number, Family[]>;
}

const stateKey = (exerciseId: string, index: string) => JSON.stringify([exerciseId, index]);

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Serves the passages of exercises that write `passages`: the exercises in turn, each on its open
 * index played least recently (the order written on a tie), a round per member of the passage.
 */
class PassageSource implements ItemSource {
	private readonly exercises: Exercise[];
	private readonly states = new Map<string, IndexState>();
	private passage: Passage | null = null;
	/** Index in `exercises` of the next exercise in turn. */
	private turn = 0;
	private passages = 0;
	/** The identity of the last member heard in the passage under way. */
	private previous: string | null = null;
	/** The passages served so far in the session. */
	private served = 0;

	constructor(
		definitions: readonly ExerciseDefinition[],
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string,
		private readonly durationMs: number
	) {
		const acquired = new Set(
			cards.filter((card) => card.acquiredAt !== null).map((card) => card.key)
		);
		this.exercises = definitions
			.filter((definition) => definition.passages !== undefined)
			.map((definition) => ({ definition, indices: openIndices(definition, acquired) }))
			.filter((exercise) => exercise.indices.length > 0);
		const ids = new Set(this.exercises.map((exercise) => exercise.definition.id));
		const history = attempts
			.flatMap((attempt) => {
				const passage = ids.has(attempt.exerciseId) ? passageOf(attempt) : null;
				return passage ? [{ attempt, passage }] : [];
			})
			.sort((a, b) => a.attempt.promptedAt - b.attempt.promptedAt);
		for (const { attempt, passage } of history) {
			const state = this.state(attempt.exerciseId, passage.index);
			state.lastPlayedAt = Math.max(state.lastPlayedAt, attempt.promptedAt);
			// The values a passage started with: a turn on the way does not count.
			if (passage.rank === 0) state.started = passage.each;
		}
	}

	next(context: SelectorContext): PlannedItem | null {
		if (this.passage && this.passage.next < this.passage.items.length) {
			return this.serve(this.passage);
		}
		const finished = this.passage;
		this.passage = null;
		if (context.elapsedMs >= this.durationMs || context.fatigued) return null;
		const passage =
			(finished && !this.passedWhole(finished) && this.again(finished)) || this.start(context.now);
		if (!passage) return null;
		this.passage = passage;
		this.previous = null;
		return this.serve(passage);
	}

	record(attempt: Attempt): RecordOutcome {
		const recorded = passageOf(attempt);
		const passage = this.passage;
		if (!recorded || !passage || recorded.id !== passage.id) return null;
		passage.passed[recorded.rank] = attempt.success;
		const state = this.state(attempt.exerciseId, recorded.index);
		state.lastPlayedAt = Math.max(state.lastPlayedAt, attempt.promptedAt);
		const answer = isRecord(attempt.data) ? attempt.data.answer : undefined;
		if (answer === undefined || answer === null) return null;
		// Whatever member was heard, of the round's index or not: it still rings.
		for (const family of passage.families.get(recorded.rank) ?? []) {
			const heard = family.named(answer);
			if (heard !== null) {
				this.previous = heard.id;
				break;
			}
		}
		return null;
	}

	cardChanged(): void {}

	/**
	 * Leaves out the indices of `exerciseId` whose scope value is `scope` (every index of an exercise
	 * without a scope, or when no scope is named), its passage under way dropped; whether an index
	 * of any exercise is still left to serve. Optimistic: an index left that is unplayable but not
	 * yet found so counts, and then `next` gives null and the series ends.
	 */
	leave(exerciseId: ExerciseId, scope?: string): boolean {
		for (const exercise of this.exercises) {
			if (exercise.definition.id !== exerciseId) continue;
			for (const index of exercise.indices) {
				if (inScope(exercise.definition, index, scope)) {
					this.state(exerciseId, index.key).left = true;
				}
			}
		}
		const under = this.passage;
		if (under && this.state(under.exercise.definition.id, under.index.key).left) {
			this.passage = null;
		}
		return this.exercises.some(({ definition, indices }) =>
			indices.some((index) => {
				const state = this.state(definition.id, index.key);
				return !state.left && !state.unplayable;
			})
		);
	}

	private state(exerciseId: string, index: string): IndexState {
		const key = stateKey(exerciseId, index);
		let state = this.states.get(key);
		if (!state) {
			state = { lastPlayedAt: -Infinity, started: null, unplayable: false, left: false };
			this.states.set(key, state);
		}
		return state;
	}

	/** Every round served and recorded passed in a share of at least `passes`; else not passed. */
	private passedWhole(passage: Passage): boolean {
		const passes = passage.exercise.definition.passages?.passes ?? 1;
		const count = passage.passed.filter((passed) => passed === true).length;
		return count / passage.items.length >= passes;
	}

	/** A failed passage again, whole, on its index with the values it started with; null when its exercise does not ask it. */
	private again(finished: Passage): Passage | null {
		if (finished.exercise.definition.passages?.again !== 'until-passed') return null;
		// Played again at once, the index unchanged: no break of silence.
		return this.passageOf(finished.exercise, finished.index, finished.items, finished.started, {
			rests: false
		});
	}

	/**
	 * The next exercise in turn with a playable index, on its index played least recently; null
	 * when none has one, or once the call has spent its search (`MAX_PASSAGE_SEARCH`).
	 */
	private start(now: number): Passage | null {
		const search: Search = { spent: 0 };
		for (let tried = 0; tried < this.exercises.length; tried++) {
			const exercise = this.exercises[this.turn % this.exercises.length];
			this.turn++;
			try {
				const passage = this.pick(exercise, now, search);
				if (passage) return passage;
			} catch (error) {
				if (error instanceof TriesSpent) return null;
				throw error;
			}
		}
		return null;
	}

	private pick(exercise: Exercise, now: number, search: Search): Passage | null {
		const { definition } = exercise;
		const candidates = exercise.indices
			.filter((index) => {
				const state = this.state(definition.id, index.key);
				return !state.unplayable && !state.left;
			})
			.sort(
				(a, b) =>
					this.state(definition.id, a.key).lastPlayedAt -
					this.state(definition.id, b.key).lastPlayedAt
			);
		const lists = Object.values(definition.passages?.each ?? {});
		const tries = Math.max(1, ...lists.map((values) => values.length));
		for (const index of candidates) {
			const state = this.state(definition.id, index.key);
			const cost = { index: 0, search };
			for (let tried = 0; tried < tries; tried++) {
				const each = this.eachAfter(definition, state.started, tried);
				let items: unknown[] | null;
				try {
					items = playableItems(definition, index, each, cost);
				} catch (error) {
					if (!(error instanceof TriesSpent)) throw error;
					state.unplayable = true;
					if (error.search) throw error;
					break;
				}
				if (!items) continue;
				state.started = each;
				// Played from now: a passage left without an attempt still takes its turn.
				state.lastPlayedAt = Math.max(state.lastPlayedAt, now);
				return this.passageOf(exercise, index, items, each, { rests: this.served > 0 });
			}
			state.unplayable = true;
		}
		return null;
	}

	/**
	 * The passage params `skipped + 1` values after those the index's last passage started with,
	 * each in its own list, wrapping; the first values for an index never played. Several lists
	 * step together: when passages are skipped, the params move side by side, so some of their
	 * combinations are never tried before the index is left out.
	 */
	private eachAfter(definition: ExerciseDefinition, started: Values | null, skipped: number) {
		const each: Record<string, unknown> = {};
		for (const [name, values] of Object.entries(definition.passages?.each ?? {})) {
			const last = started ? values.findIndex((value) => sameValue(value, started[name])) : -1;
			each[name] = values[(last + 1 + skipped) % values.length];
		}
		return each;
	}

	private passageOf(
		exercise: Exercise,
		index: PassageIndex,
		items: unknown[],
		each: Values,
		{ rests }: { rests: boolean }
	): Passage {
		return {
			exercise,
			index,
			id: `${this.sessionId}:${this.passages++}`,
			items,
			started: each,
			each,
			rests,
			next: 0,
			passed: [],
			families: new Map()
		};
	}

	private round(passage: Passage, rank: number): PlannedItem {
		const { definition } = passage.exercise;
		const round = passageRound(
			definition,
			passage.index,
			passage.each,
			passage.items[rank],
			rank,
			passage.items.length
		);
		return {
			...round,
			passage: {
				...round.passage,
				id: passage.id,
				previous: this.previous,
				items: passage.items
			}
		};
	}

	/**
	 * Where a `position` filter of the round found nothing beyond the member heard before and
	 * turned, the passage param its `toward` reads turns, for this round and the rest of the passage.
	 */
	private followTurn(passage: Passage, rank: number): void {
		if (this.previous === null) return;
		const contents = roundMemberContents(passage.exercise.definition, this.round(passage, rank));
		// Each param turns once, however many contents read it and turn.
		const turning = new Set<string>();
		for (const { content, template } of contents) {
			const family = familyNamed(content.family);
			const previous = family?.member(this.previous) ?? null;
			if (!family || !previous) continue;
			if (!select(family, content.index, content.selection, { previous }).turned) continue;
			for (const filter of template.where ?? []) {
				if ('position' in filter && typeof filter.position.toward !== 'string') {
					turning.add(filter.position.toward.param);
				}
			}
		}
		for (const name of turning) {
			const value = passage.each[name];
			if (typeof value === 'string' && Object.hasOwn(TURNED, value)) {
				passage.each = { ...passage.each, [name]: TURNED[value] };
			}
		}
	}

	private serve(passage: Passage): PlannedItem {
		const rank = passage.next++;
		this.followTurn(passage, rank);
		const round = this.round(passage, rank);
		// Compiled once already, with no member heard, when the passage was found playable.
		const families = roundMemberContents(passage.exercise.definition, round).flatMap(
			({ content }) => familyNamed(content.family) ?? []
		);
		passage.families.set(rank, families);
		if (rank === 0) this.served++;
		const { passages } = passage.exercise.definition;
		const restBars = passages?.restBars ?? 0;
		const scope = passages?.scope === undefined ? undefined : passage.index.of[passages.scope];
		return {
			...round,
			...(rank === 0 && { countIn: true }),
			...(rank === 0 && passage.rests && restBars > 0 && { restBars }),
			...(scope !== undefined && { scope: String(scope) })
		};
	}
}

/** Whether `index` is of `scope`: always for an exercise without a scope, or no scope named. */
function inScope(definition: ExerciseDefinition, index: PassageIndex, scope: string | undefined) {
	const key = definition.passages?.scope;
	if (key === undefined || scope === undefined) return true;
	return String(index.of[key]) === scope;
}

/** The indices of an exercise that are open, in the order written. */
function openIndices(definition: ExerciseDefinition, acquired: ReadonlySet<string>) {
	return passageIndices(definition).filter((index) => indexOpen(definition, index, acquired));
}

/**
 * Charges `weight` to the index's tries and the call's search, before the work it costs; throws
 * `TriesSpent` when either would pass its bound.
 */
function charge(cost: { index: number; search: Search }, weight: number): void {
	if (cost.search.spent + weight > MAX_PASSAGE_SEARCH) throw new TriesSpent(true);
	if (cost.index + weight > MAX_PASSAGE_TRIES) throw new TriesSpent(false);
	cost.index += weight;
	cost.search.spent += weight;
}

/**
 * The items of a passage of `index` with the passage params `each`; null when it cannot be
 * played: no member, more than `MAX_PASSAGE_MEMBERS`, a round that does not compile whole
 * (`compilePassageRound`), a round whose content admits no member with none heard before, or what
 * cannot be read or compiled from its data (`isUnplayable`). Each round is charged to `cost`
 * before it is compiled (`TriesSpent` past its bounds).
 * Any other error goes through.
 */
function playableItems(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Values,
	cost: { index: number; search: Search }
): unknown[] | null {
	const family = definition.passages?.members.family;
	const derivation = family === undefined ? null : passageDerivation(family);
	if (!derivation) return null;
	try {
		const members = passageMembers(definition, index, each);
		if (members.length === 0 || members.length > MAX_PASSAGE_MEMBERS) return null;
		const items = members.map((member) => derivation.itemOf(member));
		const weight = roundCheckWeight(definition.round);
		const playable = items.every((item, rank) => {
			const round = passageRound(definition, index, each, item, rank, items.length);
			charge(cost, weight);
			// The whole round compiles, so that none throws at play.
			const plan = compilePassageRound(definition, round);
			charge(cost, compiledExtra(definition.round, plan.expectations.length));
			return roundMemberContents(definition, round).every(
				({ content }) => admittedMembers(content).length > 0
			);
		});
		return playable ? items : null;
	} catch (error) {
		if (isUnplayable(error)) return null;
		throw error;
	}
}

/**
 * Serves the passages of exercises that write `passages`: the exercises in turn, each on its open
 * index played least recently (the order written on a tie), a round per member of the passage.
 * A passage's params take, at each passage of an index, the values after those its last passage
 * started with; a passage that cannot be played is skipped to the next values, an index with none
 * left out for the session; looking for one is bounded (`MAX_PASSAGE_TRIES` an index,
 * `MAX_PASSAGE_SEARCH` a call), an index over it left out too. The first round counts in, after `passages.restBars` of silence when
 * it follows a passage of the session; a passage under `passages.passes` comes back whole with
 * `again: 'until-passed'`, without that silence. No passage starts after `durationMs` or once fatigued.
 * An exercise that changed air leaves on its scope (`leave`): its indices are served no more.
 */
export function createPassageSource(input: {
	exercises: readonly ExerciseDefinition[];
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
	durationMs: number;
}): ItemSource {
	return new PassageSource(
		input.exercises,
		input.cards,
		input.attempts,
		input.sessionId,
		input.durationMs
	);
}
