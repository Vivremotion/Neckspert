import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import type { ChordExpectation } from '$lib/application/ports';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { chordSensor } from '$lib/application/session/sensors';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { allExercises, exerciseById, findExercise } from '$lib/domain/exercise';
import { allGrids } from '$lib/domain/grid';
import { routines } from '$lib/domain/routine/registry';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { passageRound } from '$lib/domain/exercise/passage/round';
import { passageDerivation } from '$lib/domain/families';
import type { ItemSource } from '$lib/domain/progress';
import type { ResponseVerdict } from '$lib/domain/types';
import type { Locale } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';

/** Which exercise the demo plays: the link on its lane, or a climb on the scrolling grid. */
export type DemoGestureMode = 'link' | 'climb';

/** The view each demo draws its exercise on. */
const DEMO_VIEWS: Record<DemoGestureMode, string> = { link: 'link-lane', climb: 'grid-scroll' };

/**
 * The index of the passage the demo plays, when its exercise has it: E linked on G-B-E, or the
 * first registered grid on G-B-E; else the exercise's first index.
 */
function demoIndexKey(mode: DemoGestureMode): string {
	return mode === 'link' ? 'chord=E;strings=3,2,1' : `grid=${allGrids()[0]?.id};strings=3,2,1`;
}

/** The verdict the scripted player aims at on each change, in turn. */
const AIMS: readonly ResponseVerdict[] = [
	'perfect',
	'early',
	'perfect',
	'late',
	'wrong',
	'perfect'
];
/** Where the player strums against the target, in beats, for each aim. */
const STRUM_BEATS: Partial<Record<ResponseVerdict, number>> = {
	perfect: 0.02,
	early: -0.2,
	late: 0.2,
	wrong: 0.02
};

/** The exercise the demo plays: the first registered one playing passages on its view. */
export function gestureDemoExercise(mode: DemoGestureMode) {
	return allExercises().find(
		(candidate) => candidate.passages !== undefined && candidate.view === DEMO_VIEWS[mode]
	);
}

/**
 * The demo's exercise, read from the registry by what it is: the first that plays passages on the
 * demo's view (the link on its lane, the climb on the scrolling grid); the index of its passage,
 * and each passage param at its first value (the climb going up).
 */
function demoPassage(mode: DemoGestureMode) {
	const exercise = gestureDemoExercise(mode);
	if (!exercise) {
		throw new Error(`No exercise plays passages on the ${DEMO_VIEWS[mode]} view: nothing to show`);
	}
	const indices = passageIndices(exercise);
	const index = indices.find((found) => found.key === demoIndexKey(mode)) ?? indices[0];
	const each = Object.fromEntries(
		Object.entries(exercise.passages?.each ?? {}).map(([name, values]) => [name, values[0]])
	);
	const scope = exercise.passages?.scope;
	return { exercise, index, each, scope: scope === undefined ? '' : String(index.of[scope]) };
}

/** Serves the demo's passage again and again, each one counted in. */
function passageLoop(mode: DemoGestureMode): ItemSource {
	const { exercise, index, each, scope } = demoPassage(mode);
	const derivation = passageDerivation(exercise.passages!.members.family)!;
	const items = passageMembers(exercise, index, each).map((member) => derivation.itemOf(member));
	let served = 0;
	return {
		next: () => {
			const passage = Math.floor(served / items.length);
			const rank = served % items.length;
			served++;
			const round = passageRound(exercise, index, each, items[rank], rank, items.length);
			return {
				...round,
				passage: { ...round.passage, id: `demo:${passage}`, items },
				...(rank === 0 && { countIn: true }),
				...(scope !== '' && { scope })
			};
		},
		record: () => null,
		cardChanged: () => {}
	};
}

/**
 * A gesture session for /dev/gesture: the real session controller, on a clock moved by the page,
 * with fakes for sound, input and storage, and a scripted player who strums each change.
 */
export function demoGestureSeries(mode: DemoGestureMode, locale: () => Locale) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const chords = new FakeChordVerifier();
	const repositories = {
		attempts: new InMemoryAttemptRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository()
	};
	const cards = new InMemoryCardStateRepository();
	// The demo starts at its exercise's level 1, the shapes drawn; the scripted player moves it up.
	const { exercise, scope } = demoPassage(mode);
	const levels = new InMemoryLevelStateRepository([
		{
			exerciseId: exercise.id,
			scope,
			item: '',
			level: 0,
			successes: 0,
			failures: 0,
			resumeAfter: null
		}
	]);
	const sources = new Map<string, ItemSource>();
	let ids = 0;
	// Named as the first routine of the registry that plays passages (the changes), so its start
	// screen tells what that routine tells; the exercise alone when there is none.
	const passages = routines().find(
		(routine) =>
			routine.exercises.length > 0 &&
			routine.exercises.every((id) => findExercise(id)?.passages !== undefined)
	);
	const controller = new SessionController(
		{
			id: 'demo-gesture',
			origin: passages ? { routine: passages.id } : { exercise: exercise.id }
		},
		async (sessionId) => {
			const source = passageLoop(mode);
			sources.set(sessionId, source);
			return { source };
		},
		{
			clock,
			sounds,
			detector: new FakeNoteDetector(),
			sensors: { chord: chordSensor(chords) },
			presenters: SET_PRESENTERS,
			views: VIEW_PRESENTERS,
			plays: allExercises()
				.filter((exercise) => exercise.passages !== undefined)
				.map((exercise) => exercise.id),
			repositories,
			// Where its levels stand, in memory: the scripted player moves them up as it plays.
			levels,
			recorderFor: (sessionId) =>
				new AttemptRecorder({
					attempts: repositories.attempts,
					cards,
					clock,
					now: () => clock.toEpochMs(clock.now()),
					selector: sources.get(sessionId) ?? passageLoop(mode),
					sessionId
				}),
			exercise: exerciseById,
			locale,
			newId: () => `demo-gesture-${++ids}`,
			development: true,
			random: Math.random,
			// A demonstration hears nothing: no input to keep, no session to remember.
			takes: new FakeTakeBuffer(),
			memory: new SessionMemory()
		}
	);

	/** The expectation the player answers next, and how many it has answered. */
	let answered = 0;
	const strum = () => {
		const asked = chords.expectations.filter((e): e is ChordExpectation => e !== null);
		const expectation = asked[answered];
		if (!expectation) return;
		const anchorBeat = (controller.view.stage?.model as { anchorBeat?: number | null } | undefined)
			?.anchorBeat;
		if (anchorBeat === null || anchorBeat === undefined) return;
		const aim = AIMS[answered % AIMS.length];
		if (controller.timeline.nowBeat() < anchorBeat + (STRUM_BEATS[aim] ?? 0)) return;
		const wrong = expectation.candidates.find((c) => !expectation.expected.includes(c.id));
		const decided = aim === 'wrong' ? (wrong?.id ?? null) : (expectation.expected[0] ?? null);
		answered = asked.length;
		chords.emit({ time: clock.now(), windowMs: 300, decided, final: true, variants: [] });
	};

	return {
		controller,
		/** Moves the clock by `seconds`; the series wakes, the player strums when due. */
		advance(seconds: number): void {
			clock.advance(seconds);
			sounds.flush();
			const { status } = controller.view;
			if (status === 'awaiting' || status === 'verdict') strum();
		}
	};
}
