/** A response series on the gesture's real presenter and plans, with scripted items and the fakes. */
import { exerciseById } from '$lib/domain/exercise';
import { gesturePlan } from '$lib/domain/gesture';
import type { GridChange } from '$lib/domain/grid';
import { triadShapes, type ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import type { ItemSource, SelectorContext } from '$lib/domain/progress';
import type { Segment } from '$lib/domain/session';
import { occurrenceId } from '$lib/domain/triads';
import type { Attempt, Execution, PlannedItem } from '$lib/domain/types';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { GESTURE_PRESENTERS, type GridStageModel } from '$lib/application/mechanics/chordGrid';
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
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { chordSensor } from '$lib/application/session/sensors';
import type { ResponseSeriesDeps } from '$lib/application/session/SessionDeps';
import { ResponseSeriesController } from '$lib/application/session/series/ResponseSeriesController.svelte';

export const G_B_E: StringNumber[] = [3, 2, 1];
/** Two changes of one bar each: a passage lasts two bars. */
export const CHANGES: GridChange[] = [
	{ at: 0, length: 4, symbol: 'Dm7' },
	{ at: 4, length: 4, symbol: 'G7' }
];
export const CHORDS = ['D|min', 'G|maj'];

export interface ChangeOptions {
	passage?: string;
	exerciseId?: string;
	scope?: string;
}

/** Change `index` of a passage, as the gesture selector would serve it. */
export function change(index: number, options: ChangeOptions = {}): PlannedItem<ChordGridItem> {
	const scope = options.scope ?? 'iohefy-a';
	return {
		exerciseId: options.exerciseId ?? 'gesture-jam',
		mechanic: 'chord-grid',
		item: {
			rule: 'jam',
			element: `jam:${scope}`,
			passageId: options.passage ?? 's:0',
			index,
			changes: CHANGES,
			symbol: CHANGES[index].symbol,
			chord: CHORDS[index],
			sets: [G_B_E],
			previous: null
		},
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		...(index === 0 && { countIn: true }),
		tempoScope: scope
	};
}

/** A whole passage: its first change counted in. */
export function passage(options: ChangeOptions & { restBars?: number } = {}): PlannedItem[] {
	const [first, second] = [change(0, options), change(1, options)];
	return [{ ...first, ...(options.restBars && { restBars: options.restBars }) }, second];
}

/** The shape a jam takes as right: any shape of its chord. */
export function rightShape(item: PlannedItem): string {
	return occurrenceId(triadShapes(item.item as ChordGridItem)[0]);
}

/** A verifier that may report at once when its expectation is withdrawn (a window cut short). */
export class CutShortVerifier extends FakeChordVerifier {
	onWithdraw: (() => void) | null = null;

	override expect(expectation: ChordExpectation | null): void {
		super.expect(expectation);
		if (expectation === null && this.onWithdraw) {
			const report = this.onWithdraw;
			this.onWithdraw = null;
			report();
		}
	}
}

/** Serves its items in order, then nothing; keeps what it was asked and told. */
export class ScriptedSource implements ItemSource {
	readonly asked: SelectorContext[] = [];
	readonly recorded: Attempt[] = [];
	constructor(private readonly items: PlannedItem[]) {}
	next(context: SelectorContext): PlannedItem | null {
		this.asked.push(context);
		return this.items.shift() ?? null;
	}
	record(attempt: Attempt): null {
		this.recorded.push(attempt);
		return null;
	}
	cardChanged(): void {}
}

export const EXECUTIONS: Execution[] = [
	{ exerciseId: 'gesture-jam', scope: 'iohefy-a', tempoBpm: 120 },
	{ exerciseId: 'gesture-jam', scope: 'blues-f', tempoBpm: 60 },
	{ exerciseId: 'gesture-zone', scope: 'iohefy-a', tempoBpm: 60 }
];

/**
 * ♩ = 120 bpm from 0.1 s: a beat lasts 0.5 s, a bar 2 s. The counted bar is bar 0, the first
 * change falls on bar 1 (2.1 s), its prompt a beat before; a change hands over 200 ms before the
 * next one.
 */
export function gestureSeries(
	items: PlannedItem[],
	options: {
		development?: boolean;
		plans?: ResponseSeriesDeps['plans'];
		exercise?: ResponseSeriesDeps['exercise'];
		/** The source of each series in turn; the first defaults to `items`. */
		sources?: ItemSource[];
		executions?: Execution[];
		/** The presenters, by mechanic: the gesture's by default. */
		mechanics?: ResponseSeriesDeps['mechanics'];
		/** Sensors beside the chord sensor. */
		sensors?: ResponseSeriesDeps['sensors'];
		random?: () => number;
		/** The series' length its preparation gives; absent: none given. */
		durationMs?: number;
	} = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const verifier = new CutShortVerifier();
	const detector = new FakeNoteDetector();
	const source = new ScriptedSource([...items]);
	const sources: ItemSource[] = options.sources ?? [source];
	const executions = options.executions ?? EXECUTIONS;
	const repositories = {
		attempts: new InMemoryAttemptRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		progressions: new InMemoryProgressionRepository()
	};
	let ids = 1;
	/** The source prepared for each session: its recorder tells it each attempt. */
	const sourceOf = new Map<string, ItemSource>();
	/** Every recorder handed out, so `stored` reads once their writes have settled. */
	const recorders: AttemptRecorder[] = [];
	const deps: ResponseSeriesDeps = {
		clock,
		sounds,
		detector,
		sensors: { chord: chordSensor(verifier), ...options.sensors },
		mechanics: options.mechanics ?? GESTURE_PRESENTERS,
		repositories,
		recorderFor: (sessionId) => {
			const recorder = new AttemptRecorder({
				attempts: repositories.attempts,
				cards: new InMemoryCardStateRepository(),
				clock,
				now: () => clock.toEpochMs(clock.now()),
				selector: sourceOf.get(sessionId) ?? source,
				sessionId,
				rules: (mechanic) => deps.mechanics[mechanic].rules
			});
			recorders.push(recorder);
			return recorder;
		},
		plans:
			options.plans ??
			((item, meter, definition) => gesturePlan(item.item as ChordGridItem, meter, definition)),
		exercise: options.exercise ?? exerciseById,
		locale: () => 'fr',
		newId: () => `series-${++ids}`,
		development: options.development ?? false,
		random: options.random ?? (() => 0)
	};
	const prepared: string[] = [];
	const controller = new ResponseSeriesController(
		{ id: 'series-1', kind: 'gesture' },
		async (sessionId) => {
			prepared.push(sessionId);
			const next = sources.shift();
			if (!next) throw new Error('no source left');
			sourceOf.set(sessionId, next);
			return {
				source: next,
				executions,
				...(options.durationMs !== undefined && { durationMs: options.durationMs })
			};
		},
		deps
	);
	/**
	 * Moves the clock just past `time` by 10 ms steps, the scheduler waking at each: a wake-up
	 * due at `time` has run, whatever the float error of its conversion.
	 */
	const runTo = (time: number) => {
		const until = time + 1e-6;
		while (clock.now() < until - 1e-12) {
			clock.time = Math.min(clock.now() + 0.01, until);
			sounds.flush();
		}
	};
	const report = (time: number, decided: string | null): ChordReport => ({
		time,
		windowMs: 300,
		decided,
		final: true,
		variants: []
	});
	const play = (time: number, decided: string | null) => verifier.emit(report(time, decided));
	/** Bar `bar` (fractions allowed) in audio seconds at ♩ = 120 from 0.1 s. */
	const bar = (n: number) => 0.1 + 2 * n;
	const stored = async (sessionId = 'series-1') => {
		await Promise.all(recorders.map((recorder) => recorder.settled()));
		return repositories.attempts.listBySession(sessionId);
	};
	return {
		clock,
		detector,
		sounds,
		verifier,
		source,
		repositories,
		controller,
		prepared,
		runTo,
		play,
		report,
		bar,
		stored
	};
}

export type Ctx = ReturnType<typeof gestureSeries>;

export async function drain() {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** The clicks scheduled from `from` to `to` seconds, as their times. */
export function clicksBetween(ctx: Ctx, from: number, to: number): number[] {
	return ctx.sounds
		.emitted()
		.filter((s) => s.time >= from - 1e-9 && s.time < to - 1e-9)
		.map((s) => Math.round(s.time * 1000) / 1000);
}

/** The chords told to the verifier (withdrawals left out), with the clock when told. */
export function expectationsAsked(ctx: Ctx): ChordExpectation[] {
	return ctx.verifier.expectations.filter((e): e is ChordExpectation => e !== null);
}

export function model(ctx: Ctx): GridStageModel {
	return ctx.controller.view.stage?.model as GridStageModel;
}

/** Roles of the trace's segments inside the series, in order. */
export function roles(trace: Segment | null): string[] {
	const series = trace?.children.find((s) => s.role === 'series');
	return series?.children.map((s) => s.role) ?? [];
}
