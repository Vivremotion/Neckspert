import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
	LINK_AID_AFTER_MISSES,
	linkShapes,
	nextZone,
	openElements,
	passageSucceeded,
	type GestureElement
} from '$lib/domain/gesture';
import { gridById, gridChanges, triadOf, type GridChange } from '$lib/domain/grid';
import {
	climbDirection,
	parseTriadId,
	triadId,
	type ChordGridItem,
	type ChordReading
} from '$lib/domain/mechanics';
import { formatSpelledNote } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { isSuccess, type Attempt, type CardState, type PlannedItem } from '$lib/domain/types';
import type { RecordOutcome, SelectorContext, SessionSelector } from './selector';

/** No passage starts after this long in a gesture session; one begun always ends. To calibrate. */
export const GESTURE_SESSION_MS = 300_000;

const MECHANIC = 'chord-grid';

/** Beats of a bar of a link passage: one shape per bar. */
const LINK_BAR_BEATS = 4;

/** What the session remembers of an element, from its history and this session. */
interface ElementState {
	/** Epoch ms of its last change played; -Infinity when never. */
	lastPlayedAt: number;
	/** Its last passage and its attempts, in order. */
	lastPassage: { id: string; attempts: Attempt[] } | null;
	direction: 'up' | 'down' | null;
	zone: { from: number; to: number } | null;
	/** Link: its shapes are drawn, from a tour with LINK_AID_AFTER_MISSES misses until one succeeds. This session only. */
	aidOn: boolean;
}

/** A passage under way: its changes, and what each needs. */
interface Passage {
	element: GestureElement;
	id: string;
	changes: GridChange[];
	/** Link: the shape of each change. */
	shapes: string[] | null;
	direction?: 'up' | 'down';
	zone?: { from: number; to: number };
	/** Grids: the whole passage is aided. A link decides change by change. */
	aided: boolean;
	/** Link: chained to the tour before, on the same element. */
	continued: boolean;
	next: number;
}

function itemOf(attempt: Attempt): ChordGridItem | null {
	if (attempt.mechanic !== MECHANIC) return null;
	return ((attempt.data as { item?: ChordGridItem } | null)?.item ?? null) as ChordGridItem | null;
}

/** The chord a link passage plays, as a chord chart writes it: "D", "Ebm". */
function chordSymbol(chord: string): string {
	const { root, quality } = parseTriadId(chord);
	return formatSpelledNote(root) + quality.suffix;
}

/**
 * The gesture session (spec 2026-10-10, section 5): rounds in the order of the ladder, one
 * passage per open exercise each round, each on its element played least recently (content order
 * on a tie). A passage is a change per item, the first counted in; none starts after
 * GESTURE_SESSION_MS or once fatigued.
 */
class GestureSelector implements SessionSelector {
	private readonly exercises: { definition: ExerciseDefinition; elements: GestureElement[] }[];
	private readonly states = new Map<string, ElementState>();
	private passage: Passage | null = null;
	/** Index in `exercises` of the next exercise of the ladder. */
	private turn = 0;
	private passages = 0;
	/** The last shape heard in the passage: it still rings. */
	private previous: string | null = null;

	constructor(
		definitions: readonly ExerciseDefinition[],
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string
	) {
		this.exercises = definitions
			.map((definition) => ({ definition, elements: openElements(definition, cards) }))
			.filter((exercise) => exercise.elements.length > 0);
		for (const attempt of [...attempts].sort((a, b) => a.promptedAt - b.promptedAt)) {
			this.remember(attempt);
		}
	}

	next(context: SelectorContext): PlannedItem | null {
		if (!this.passage || this.passage.next >= this.passage.changes.length) {
			const finished = this.passage;
			this.passage = null;
			if (context.elapsedMs >= GESTURE_SESSION_MS || context.fatigued) return null;
			this.passage = this.startPassage(context.now, finished);
			if (!this.passage) return null;
		}
		const passage = this.passage;
		const index = passage.next++;
		const change = passage.changes[index];
		const { element } = passage;
		const chord = element.chord ?? triadId(triadOf(change.symbol));
		if (passage.direction) {
			// Where the neck runs out, the climb turns, for this change and the rest of the passage.
			passage.direction = climbDirection({
				chord,
				sets: element.sets,
				direction: passage.direction,
				previous: this.previous
			});
		}
		const item: ChordGridItem = {
			rule: element.rule,
			element: element.key,
			passageId: passage.id,
			index,
			changes: passage.changes,
			symbol: change.symbol,
			chord,
			sets: element.sets,
			...(passage.shapes && { shape: passage.shapes[index] }),
			...(passage.direction && { direction: passage.direction }),
			...(passage.zone && { zone: passage.zone }),
			...(passage.continued && { continued: true as const }),
			previous: this.previous
		};
		return {
			exerciseId: element.exerciseId,
			mechanic: MECHANIC,
			item,
			phase: 'free',
			temperature: 'hot',
			aid: this.aided(passage) ? 'show-position' : 'none',
			leadBeats: null,
			// A chained tour carries on without a counted bar.
			...(index === 0 && !passage.continued && { countIn: true }),
			// A grid progresses at its own tempo: a ballad and a blues apart.
			...(element.gridId !== undefined && { tempoScope: element.gridId })
		};
	}

	record(attempt: Attempt): RecordOutcome {
		const item = itemOf(attempt);
		if (!item) return null;
		this.remember(attempt);
		const decided = (attempt.data as { answer?: ChordReading | null }).answer?.decided ?? null;
		if (item.passageId === this.passage?.id && decided !== null) this.previous = decided;
		return null;
	}

	cardChanged(): void {}

	private state(key: string): ElementState {
		let state = this.states.get(key);
		if (!state) {
			state = {
				lastPlayedAt: -Infinity,
				lastPassage: null,
				direction: null,
				zone: null,
				aidOn: false
			};
			this.states.set(key, state);
		}
		return state;
	}

	private remember(attempt: Attempt): void {
		const item = itemOf(attempt);
		if (!item) return;
		const state = this.state(item.element);
		state.lastPlayedAt = Math.max(state.lastPlayedAt, attempt.promptedAt);
		if (state.lastPassage?.id !== item.passageId) {
			state.lastPassage = { id: item.passageId, attempts: [] };
		}
		state.lastPassage.attempts.push(attempt);
		// The direction a passage started in: a turn on the way does not count.
		if (item.direction && item.index === 0) state.direction = item.direction;
		if (item.zone) state.zone = item.zone;
	}

	/** The attempts recorded so far in a passage. */
	private attemptsOf(passage: Passage): Attempt[] {
		const last = this.state(passage.element.key).lastPassage;
		return last?.id === passage.id ? last.attempts : [];
	}

	/**
	 * A grid passage is aided as a whole; a link change is aided once its tour has missed
	 * LINK_AID_AFTER_MISSES changes, and until a tour succeeds.
	 */
	private aided(passage: Passage): boolean {
		if (passage.element.rule !== 'link') return passage.aided;
		const state = this.state(passage.element.key);
		const misses = this.attemptsOf(passage).filter((attempt) => !isSuccess(attempt)).length;
		if (misses >= LINK_AID_AFTER_MISSES) state.aidOn = true;
		return state.aidOn;
	}

	/**
	 * A link tour not yet succeeded goes on, chained, on its element; otherwise the next exercise
	 * of the ladder with something open, on its least recently played element. A tour is judged on
	 * the attempts recorded so far.
	 */
	private startPassage(now: number, finished: Passage | null): Passage | null {
		if (this.exercises.length === 0) return null;
		let element: GestureElement;
		let continued = false;
		if (finished?.element.rule === 'link' && !passageSucceeded(this.attemptsOf(finished))) {
			element = finished.element;
			continued = true;
			// Nothing heard at the end of the tour: the lowest shape asked is taken as ringing,
			// never the shape before it, which the chained tour asks first.
			const last = this.attemptsOf(finished).at(-1);
			const decided = (last?.data as { answer?: ChordReading | null } | undefined)?.answer?.decided;
			const lastIndex = finished.changes.length - 1;
			if (!last || itemOf(last)?.index !== lastIndex || !decided) {
				this.previous = finished.shapes?.[lastIndex] ?? this.previous;
			}
		} else {
			if (finished?.element.rule === 'link') this.state(finished.element.key).aidOn = false;
			const { elements } = this.exercises[this.turn % this.exercises.length];
			this.turn++;
			element = elements.reduce((oldest, candidate) =>
				this.state(candidate.key).lastPlayedAt < this.state(oldest.key).lastPlayedAt
					? candidate
					: oldest
			);
		}
		const state = this.state(element.key);
		const last = state.lastPassage;
		const passage: Passage = {
			element,
			id: `${this.sessionId}:${this.passages++}`,
			changes: [],
			shapes: null,
			aided: !last || !passageSucceeded(last.attempts),
			continued,
			next: 0
		};
		if (element.rule === 'link') {
			const [set] = element.sets;
			const shapes = linkShapes(parseTriadId(element.chord ?? ''), set, continued);
			const symbol = chordSymbol(element.chord ?? '');
			passage.changes = shapes.map((_, i) => ({
				at: i * LINK_BAR_BEATS,
				length: LINK_BAR_BEATS,
				symbol
			}));
			passage.shapes = shapes.map(occurrenceId);
		} else {
			const grid = gridById(element.gridId ?? '');
			passage.changes = gridChanges(grid);
			if (element.rule === 'climb') {
				// The first passage climbs; then the direction turns at each repeat.
				passage.direction = state.direction === 'up' ? 'down' : 'up';
				state.direction = passage.direction;
			}
			if (element.rule === 'zone') {
				passage.zone = nextZone(grid, element.sets, state.zone);
				state.zone = passage.zone;
			}
		}
		// Played from now: a passage left without an attempt still takes its turn.
		state.lastPlayedAt = Math.max(state.lastPlayedAt, now);
		// The lowest shape still rings into a chained tour.
		if (!continued) this.previous = null;
		return passage;
	}
}

export function createGestureSelector(input: {
	/** The gesture exercises, in the order of the ladder. */
	definitions: readonly ExerciseDefinition[];
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
}): SessionSelector {
	return new GestureSelector(input.definitions, input.cards, input.attempts, input.sessionId);
}
