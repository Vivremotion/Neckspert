import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
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
import type { Attempt, CardState, PlannedItem } from '$lib/domain/types';
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
	aided: boolean;
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
			this.passage = null;
			if (context.elapsedMs >= GESTURE_SESSION_MS || context.fatigued) return null;
			this.passage = this.startPassage(context.now);
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
			previous: this.previous
		};
		return {
			exerciseId: element.exerciseId,
			mechanic: MECHANIC,
			item,
			phase: 'free',
			temperature: 'hot',
			aid: passage.aided ? 'show-position' : 'none',
			leadBeats: null,
			...(index === 0 && { countIn: true })
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
			state = { lastPlayedAt: -Infinity, lastPassage: null, direction: null, zone: null };
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

	/** The next exercise of the ladder with something open, on its least recently played element. */
	private startPassage(now: number): Passage | null {
		if (this.exercises.length === 0) return null;
		const { elements } = this.exercises[this.turn % this.exercises.length];
		this.turn++;
		const element = elements.reduce((oldest, candidate) =>
			this.state(candidate.key).lastPlayedAt < this.state(oldest.key).lastPlayedAt
				? candidate
				: oldest
		);
		const state = this.state(element.key);
		const last = state.lastPassage;
		const passage: Passage = {
			element,
			id: `${this.sessionId}:${this.passages++}`,
			changes: [],
			shapes: null,
			aided: !last || !passageSucceeded(last.attempts),
			next: 0
		};
		if (element.rule === 'link') {
			const [set] = element.sets;
			const shapes = linkShapes(parseTriadId(element.chord ?? ''), set);
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
		this.previous = null;
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
