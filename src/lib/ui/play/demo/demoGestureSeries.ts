import { GESTURE_PRESENTERS } from '$lib/application/mechanics/chordGrid';
import type { ChordExpectation } from '$lib/application/ports';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { chordSensor } from '$lib/application/session/sensors';
import { ResponseSeriesController } from '$lib/application/session/series/ResponseSeriesController.svelte';
import { exerciseById } from '$lib/domain/exercise';
import { GESTURE_CLIMB, GESTURE_LINK, gesturePlan } from '$lib/domain/gesture';
import { linkShapes } from '$lib/domain/gesture/passages';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { parseTriadId, triadId, type ChordGridItem } from '$lib/domain/mechanics';
import type { ItemSource } from '$lib/domain/progress';
import { occurrenceId } from '$lib/domain/triads';
import type { Execution, PlannedItem, ResponseVerdict } from '$lib/domain/types';
import type { Locale } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';

/** Which exercise the demo plays: the link on its lane, or a climb on the scrolling grid. */
export type DemoGestureMode = 'link' | 'climb';

const GRID_ID = 'iohefy-a';
const GRID = gridChanges(gridById(GRID_ID));
/** E on G-B-E, linked up the neck and back: one shape per bar. */
const LINK_SHAPES_E = linkShapes(parseTriadId('E|maj'), [3, 2, 1]);
const LINK = LINK_SHAPES_E.map((_, i) => ({ at: i * 4, length: 4, symbol: 'E' }));

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

function changeOf(mode: DemoGestureMode, passage: number, index: number): ChordGridItem {
	const passageId = `demo:${passage}`;
	if (mode === 'link') {
		return {
			rule: 'link',
			element: 'link:E|maj:3,2,1',
			passageId,
			index,
			changes: LINK,
			symbol: 'E',
			chord: 'E|maj',
			sets: [[3, 2, 1]],
			shape: occurrenceId(LINK_SHAPES_E[index]),
			previous: null
		};
	}
	const symbol = GRID[index].symbol;
	return {
		rule: 'climb',
		element: `climb:${GRID_ID}:3,2,1`,
		passageId,
		index,
		changes: GRID,
		symbol,
		chord: triadId(triadOf(symbol)),
		sets: [[3, 2, 1]],
		direction: 'up',
		previous: null
	};
}

/** Serves the demo's passage again and again, each one counted in, aided. */
function passageLoop(mode: DemoGestureMode): ItemSource {
	const exercise = mode === 'link' ? GESTURE_LINK : GESTURE_CLIMB;
	const length = mode === 'link' ? LINK.length : GRID.length;
	let served = 0;
	return {
		next: () => {
			const passage = Math.floor(served / length);
			const index = served % length;
			served++;
			return {
				exerciseId: exercise.id,
				mechanic: 'chord-grid',
				item: changeOf(mode, passage, index),
				phase: 'free',
				temperature: 'hot',
				aid: 'show-position',
				leadBeats: null,
				...(index === 0 && { countIn: true }),
				...(mode === 'climb' && { tempoScope: GRID_ID })
			};
		},
		record: () => null,
		cardChanged: () => {}
	};
}

/**
 * A gesture session for /dev/gesture: the real response series, on a clock moved by the page,
 * with fakes for sound, input and storage, and a scripted player who strums each change.
 */
export function demoGestureSeries(mode: DemoGestureMode, locale: () => Locale) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const chords = new FakeChordVerifier();
	const repositories = {
		attempts: new InMemoryAttemptRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		progressions: new InMemoryProgressionRepository()
	};
	const cards = new InMemoryCardStateRepository();
	const exercise = mode === 'link' ? GESTURE_LINK : GESTURE_CLIMB;
	const executions: Execution[] = [
		{
			exerciseId: exercise.id,
			...(mode === 'climb' && { scope: GRID_ID }),
			tempoBpm: exercise.startTempoBpm ?? 80
		}
	];
	const sources = new Map<string, ItemSource>();
	let ids = 0;
	const controller = new ResponseSeriesController(
		{ id: 'demo-gesture', kind: 'gesture' },
		async (sessionId) => {
			const source = passageLoop(mode);
			sources.set(sessionId, source);
			return { source, executions };
		},
		{
			clock,
			sounds,
			detector: new FakeNoteDetector(),
			sensors: { chord: chordSensor(chords) },
			mechanics: GESTURE_PRESENTERS,
			repositories,
			recorderFor: (sessionId) =>
				new AttemptRecorder({
					attempts: repositories.attempts,
					cards,
					clock,
					now: () => clock.toEpochMs(clock.now()),
					selector: sources.get(sessionId) ?? passageLoop(mode),
					sessionId,
					rules: (mechanic) => GESTURE_PRESENTERS[mechanic].rules
				}),
			plans: (item, meter) => gesturePlan(item.item as ChordGridItem, meter),
			exercise: exerciseById,
			locale,
			newId: () => `demo-gesture-${++ids}`,
			development: true,
			random: Math.random
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
