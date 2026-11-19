import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import type { ChordExpectation } from '$lib/application/ports';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { chordSensor } from '$lib/application/session/sensors';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { DEMO_GRID_ID, exerciseById, GESTURE_EXERCISE_IDS } from '$lib/domain/exercise';
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

/** The passage the demo plays: E linked on G-B-E, or a climb of its grid on G-B-E, going up. */
const DEMO_PASSAGES = {
	link: { index: 'chord=E;strings=3,2,1', each: {} },
	climb: { index: `grid=${DEMO_GRID_ID};strings=3,2,1`, each: { direction: 'up' } }
} as const;

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

/** Serves the demo's passage again and again, each one counted in, aided. */
function passageLoop(mode: DemoGestureMode): ItemSource {
	const exercise = exerciseById(
		mode === 'link' ? GESTURE_EXERCISE_IDS[0] : GESTURE_EXERCISE_IDS[1]
	);
	const { index: key, each } = DEMO_PASSAGES[mode];
	const index = passageIndices(exercise).find((found) => found.key === key)!;
	const derivation = passageDerivation(exercise.passages!.members.family)!;
	const items = passageMembers(exercise, index, each).map((member) => derivation.itemOf(member));
	let served = 0;
	return {
		next: () => {
			const passage = Math.floor(served / items.length);
			const rank = served % items.length;
			served++;
			const round = passageRound(exercise, index, each, items[rank], rank, items.length);
			const scope = exercise.passages?.scope;
			return {
				...round,
				passage: { ...round.passage, id: `demo:${passage}`, items },
				aid: 'show-position',
				...(rank === 0 && { countIn: true }),
				...(scope !== undefined && { scope: String(index.of[scope]) })
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
	const sources = new Map<string, ItemSource>();
	let ids = 0;
	const controller = new SessionController(
		{ id: 'demo-gesture', kind: 'gesture' },
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
			plays: GESTURE_EXERCISE_IDS,
			repositories,
			// Where its levels stand, in memory: the scripted player moves them up as it plays.
			levels: new InMemoryLevelStateRepository(),
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
