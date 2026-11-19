import {
	roundMemberContents,
	type RoundMemberContent
} from '$lib/domain/exercise/passage/contents';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { indexOpen, passageRound } from '$lib/domain/exercise/passage/opens';
import type { PassageIndex } from '$lib/domain/exercise/passage/types';
import { MAX_PASSAGE_MEMBERS } from '$lib/domain/exercise/passage/validate';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { familyNamed, passageDerivation, select } from '$lib/domain/families';
import { admittedMembers } from '$lib/domain/judges';
import type { ItemSource, RecordOutcome, SelectorContext } from '$lib/domain/progress/selector';
import type { Attempt, AttemptPassage, CardState, PlannedItem } from '$lib/domain/types';

type Values = Readonly<Record<string, unknown>>;

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
	/** A break of silence before its counted bar: the index changed after a passage of the session. */
	rests: boolean;
	next: number;
	/** Whether each round passed, as `record` learned it. */
	passed: (boolean | undefined)[];
	/** The member contents each round served judges, by rank. */
	contents: Map<number, RoundMemberContent[]>;
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
	/** The exercise and index of the session's last passage; null before the first. */
	private lastServed: string | null = null;

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
			.filter((attempt) => ids.has(attempt.exerciseId) && passageOf(attempt) !== null)
			.sort((a, b) => a.promptedAt - b.promptedAt);
		for (const attempt of history) {
			const passage = passageOf(attempt)!;
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
		this.lastServed = stateKey(passage.exercise.definition.id, passage.index.key);
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
		for (const { content } of passage.contents.get(recorded.rank) ?? []) {
			const heard = familyNamed(content.family)?.heard(content.index, answer) ?? null;
			if (heard !== null) {
				this.previous = heard.id;
				break;
			}
		}
		return null;
	}

	cardChanged(): void {}

	private state(exerciseId: string, index: string): IndexState {
		const key = stateKey(exerciseId, index);
		let state = this.states.get(key);
		if (!state) {
			state = { lastPlayedAt: -Infinity, started: null, unplayable: false };
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
		return this.passageOf(finished.exercise, finished.index, finished.items, finished.started);
	}

	/** The next exercise in turn with a playable index, on its index played least recently. */
	private start(now: number): Passage | null {
		for (let tried = 0; tried < this.exercises.length; tried++) {
			const exercise = this.exercises[this.turn % this.exercises.length];
			this.turn++;
			const passage = this.pick(exercise, now);
			if (passage) return passage;
		}
		return null;
	}

	private pick(exercise: Exercise, now: number): Passage | null {
		const { definition } = exercise;
		const candidates = exercise.indices
			.filter((index) => !this.state(definition.id, index.key).unplayable)
			.sort(
				(a, b) =>
					this.state(definition.id, a.key).lastPlayedAt -
					this.state(definition.id, b.key).lastPlayedAt
			);
		const lists = Object.values(definition.passages?.each ?? {});
		const tries = Math.max(1, ...lists.map((values) => values.length));
		for (const index of candidates) {
			const state = this.state(definition.id, index.key);
			for (let tried = 0; tried < tries; tried++) {
				const each = this.eachAfter(definition, state.started, tried);
				const items = playableItems(definition, index, each);
				if (!items) continue;
				state.started = each;
				// Played from now: a passage left without an attempt still takes its turn.
				state.lastPlayedAt = Math.max(state.lastPlayedAt, now);
				return this.passageOf(exercise, index, items, each);
			}
			state.unplayable = true;
		}
		return null;
	}

	/**
	 * The passage params `skipped + 1` values after those the index's last passage started with,
	 * each in its own list, wrapping; the first values for an index never played.
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
		each: Values
	): Passage {
		const key = stateKey(exercise.definition.id, index.key);
		return {
			exercise,
			index,
			id: `${this.sessionId}:${this.passages++}`,
			items,
			started: each,
			each,
			rests: this.lastServed !== null && this.lastServed !== key,
			next: 0,
			passed: [],
			contents: new Map()
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
		return { ...round, passage: { ...round.passage!, id: passage.id, previous: this.previous } };
	}

	/**
	 * Where a `position` filter of the round found nothing beyond the member heard before and
	 * turned, the passage param its `toward` reads turns, for this round and the rest of the passage.
	 */
	private followTurn(passage: Passage, rank: number): void {
		if (this.previous === null) return;
		let contents: RoundMemberContent[];
		try {
			contents = roundMemberContents(passage.exercise.definition, this.round(passage, rank));
		} catch {
			return;
		}
		for (const { content, template } of contents) {
			const family = familyNamed(content.family);
			const previous = family?.member(this.previous) ?? null;
			if (!family || !previous) continue;
			if (!select(family, content.index, content.selection, { previous }).turned) continue;
			for (const filter of template.where ?? []) {
				if (!('position' in filter) || typeof filter.position.toward === 'string') continue;
				const name = filter.position.toward.param;
				const value = passage.each[name];
				if (typeof value === 'string' && Object.hasOwn(TURNED, value)) {
					passage.each = { ...passage.each, [name]: TURNED[value] };
				}
			}
		}
	}

	private serve(passage: Passage): PlannedItem {
		const rank = passage.next++;
		this.followTurn(passage, rank);
		const round = this.round(passage, rank);
		try {
			passage.contents.set(rank, roundMemberContents(passage.exercise.definition, round));
		} catch {
			passage.contents.set(rank, []);
		}
		const { passages } = passage.exercise.definition;
		const restBars = passages?.restBars ?? 0;
		const scope = passages?.scope;
		return {
			...round,
			...(rank === 0 && { countIn: true }),
			...(rank === 0 && passage.rests && restBars > 0 && { restBars }),
			...(scope !== undefined && { scope: String(passage.index.of[scope]) })
		};
	}
}

/** The indices of an exercise that are open, in the order written; none when they cannot be read. */
function openIndices(definition: ExerciseDefinition, acquired: ReadonlySet<string>) {
	try {
		return passageIndices(definition).filter((index) => indexOpen(definition, index, acquired));
	} catch {
		return [];
	}
}

/**
 * The items of a passage of `index` with the passage params `each`; null when it cannot be
 * played: no member, more than `MAX_PASSAGE_MEMBERS`, a round whose content admits no member
 * with none heard before, or anything that fails to be read.
 */
function playableItems(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Values
): unknown[] | null {
	try {
		const members = passageMembers(definition, index, each);
		if (members.length === 0 || members.length > MAX_PASSAGE_MEMBERS) return null;
		const derivation = passageDerivation(definition.passages!.members.family)!;
		const items = members.map((member) => derivation.itemOf(member));
		const playable = items.every((item, rank) =>
			roundMemberContents(
				definition,
				passageRound(definition, index, each, item, rank, items.length)
			).every(({ content }) => admittedMembers(content).length > 0)
		);
		return playable ? items : null;
	} catch {
		return null;
	}
}

/**
 * Serves the passages of exercises that write `passages`: the exercises in turn, each on its open
 * index played least recently (the order written on a tie), a round per member of the passage.
 * A passage's params take, at each passage of an index, the values after those its last passage
 * started with; a passage that cannot be played is skipped to the next values, an index with none
 * left out for the session. The first round counts in, after `passages.restBars` of silence when
 * the index changed after a passage of the session; a passage under `passages.passes` comes back
 * whole with `again: 'until-passed'`. No passage starts after `durationMs` or once fatigued.
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
