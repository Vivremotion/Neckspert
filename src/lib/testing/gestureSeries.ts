import { CHANGE_SKILL_IDS, GESTURE_EXERCISE_IDS } from '$lib/testing/catalogIds';
/** A session controller on the gesture's real presenter and exercises, with scripted items and the fakes. */
import { exerciseById, type ExerciseDefinition, type LevelOverrides } from '$lib/domain/exercise';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { voicingKey, type StringNumber } from '$lib/domain/music';
import type { ChangeItem, VoicingFigureItem } from '$lib/domain/sets';
import type { ItemSource, SelectorContext } from '$lib/domain/progress';
import type { Segment } from '$lib/domain/session';
import type { Level, LevelState } from '$lib/domain/time';
import type { Attempt, PlannedItem, PlannedPassage, SessionOrigin } from '$lib/domain/types';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import type { PassageStageModel } from '$lib/application/presentation/passageStage';
import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
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
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { chordSensor } from '$lib/application/session/sensors';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import type { SessionControllerDeps } from '$lib/application/session/SessionDeps';
import { SessionController } from '$lib/application/session/SessionController.svelte';

export const G_B_E: StringNumber[] = [3, 2, 1];
/** The two first changes of a grid, a bar each: a scripted passage lasts two bars. */
const PASSAGE_CHANGES = 2;

export interface ChangeOptions {
	passage?: string;
	exerciseId?: string;
	scope?: string;
}

/** The skill a gesture exercise of the catalog practises; a reading of a grid for another id. */
function skillOfGesture(exerciseId: string): string {
	const index = (GESTURE_EXERCISE_IDS as readonly string[]).indexOf(exerciseId);
	return index < 0 ? CHANGE_SKILL_IDS[3] : CHANGE_SKILL_IDS[index];
}

/** The passage params each exercise of the changes reads: the climb goes up, the zone is the first. */
function eachOf(exerciseId: string): Record<string, unknown> {
	if (exerciseId === 'grid-in-direction') return { direction: 'up' };
	if (exerciseId === 'grid-in-zone') return { zone: [1, 5] };
	return {};
}

/** The values of a passage's index: the grid, on G-B-E for the climb. */
function ofFor(exerciseId: string, grid: string): Record<string, unknown> {
	return exerciseId === 'grid-in-direction' ? { grid, strings: G_B_E } : { grid };
}

/**
 * Change `index` of a passage of the two first changes of the grid `scope` (iohefy-a: Dm7 then
 * G7, a bar each), as the passage source would serve it, nothing heard before.
 */
export function change(index: number, options: ChangeOptions = {}): PlannedItem<ChangeItem> {
	const scope = options.scope ?? 'iohefy-a';
	const exerciseId = options.exerciseId ?? 'grid-reading';
	const of = ofFor(exerciseId, scope);
	const items = Array.from({ length: PASSAGE_CHANGES }, (_, rank) => ({
		grid: scope,
		index: rank
	}));
	const passage: PlannedPassage = {
		id: options.passage ?? 's:0',
		index: Object.entries(of)
			.map(([name, value]) => `${name}=${Array.isArray(value) ? value.join(',') : value}`)
			.join(';'),
		of,
		rank: index,
		length: PASSAGE_CHANGES,
		each: eachOf(exerciseId),
		previous: null,
		items
	};
	return {
		exerciseId,
		skill: skillOfGesture(exerciseId),
		exerciseLevel: 0,
		item: { grid: scope, index },
		phase: 'free',
		temperature: 'hot',
		leadBeats: null,
		passage,
		...(index === 0 && { countIn: true }),
		scope
	};
}

/** A whole passage: its first change counted in. */
export function passage(options: ChangeOptions & { restBars?: number } = {}): PlannedItem[] {
	const [first, second] = [change(0, options), change(1, options)];
	return [{ ...first, ...(options.restBars && { restBars: options.restBars }) }, second];
}

/** The two first shapes of the link's tour of D on G-B-E. */
export const LINK_FRETS = ['2-3-2', '7-7-5'];

/**
 * Shape `index` of a link tour of two shapes, D on G-B-E, as the passage source would serve it
 * (at ♩ = 120 like the jam on the bench); its first counted in.
 */
export function linkChange(index: number, passageId = 's:0'): PlannedItem<VoicingFigureItem> {
	const shapes = chordShapes.members({ chord: triadOf('D'), strings: G_B_E });
	const items = LINK_FRETS.map((frets) => {
		const shape = shapes.find((each) => each.notes.map((n) => n.fret).join('-') === frets)!;
		return {
			voicing: voicingKey(shape.occurrence.voicing),
			frets: shape.notes.map((note) => note.fret)
		};
	});
	return {
		exerciseId: 'inversion-run',
		skill: 'inversion-run',
		exerciseLevel: 0,
		item: items[index],
		phase: 'free',
		temperature: 'hot',
		leadBeats: null,
		passage: {
			id: passageId,
			index: 'chord=D;strings=3,2,1',
			of: { chord: 'D', strings: G_B_E },
			rank: index,
			length: items.length,
			each: {},
			previous: null,
			items
		},
		...(index === 0 && { countIn: true })
	};
}

/** The shape a jam takes as right: the lowest of its chord on G-B-E. */
export function rightShape(item: PlannedItem): string {
	const { grid, index } = item.item as ChangeItem;
	const chord = triadOf(gridChanges(gridById(grid))[index].symbol);
	return chordShapes.members({ chord, strings: G_B_E })[0].id;
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

/** A count no session reaches: the bench's levels never move on their own. */
const NEVER = 1_000_000;

/**
 * The bench's levels of every exercise of the changes: level 0 at ♩ = 120, level 1 at ♩ = 60, held
 * whatever is played. The tempo a scope plays at is its stored level's.
 */
export const BENCH_LEVELS: Level<LevelOverrides>[] = [120, 60].map((tempo) => ({
	params: { tempo },
	pass: { successes: NEVER },
	drop: { failures: NEVER }
}));

/** Where the bench's scopes stand: the jam's iohefy-a (and the link) at 120, the rest at 60. */
export const BENCH_LEVEL_STATES: LevelState[] = [
	{ exerciseId: 'grid-reading', scope: 'blues-f', level: 1 },
	{ exerciseId: 'grid-in-zone', scope: 'iohefy-a', level: 1 }
].map((key) => ({ ...key, item: '', successes: 0, failures: 0 }));

/**
 * An exercise of the changes (it writes passages), or one a spec draws from it, on the bench's
 * levels; any other as it is.
 */
function onBenchLevels(definition: ExerciseDefinition): ExerciseDefinition {
	if (definition.passages === undefined) return definition;
	return {
		...definition,
		levels: BENCH_LEVELS
	};
}

/**
 * ♩ = 120 bpm from 0.1 s: a beat lasts 0.5 s, a bar 2 s. The counted bar is bar 0, the first
 * change falls on bar 1 (2.1 s), its prompt a beat before; a change hands over 200 ms before the
 * next one.
 */
export function gestureSeries(
	items: PlannedItem[],
	options: {
		development?: boolean;
		exercise?: SessionControllerDeps['exercise'];
		/** The source of each series in turn; the first defaults to `items`. */
		sources?: ItemSource[];
		/**
		 * The exercise levels stored before the series; `BENCH_LEVEL_STATES` by default, read on
		 * the bench's levels. With `catalogLevels`, the catalog's own levels, none stored by default.
		 */
		levelStates?: LevelState[];
		catalogLevels?: boolean;
		/** The presenters by set and by view: the application's by default. */
		presenters?: SessionControllerDeps['presenters'];
		views?: SessionControllerDeps['views'];
		/** The exercises whose sensors the series opens: the gesture's by default. */
		plays?: SessionControllerDeps['plays'];
		/** Sensors beside the chord sensor. */
		sensors?: SessionControllerDeps['sensors'];
		random?: () => number;
		/** The series' length its preparation gives; absent: none given. */
		durationMs?: number;
		/** What the session records it plays; the changes' routine by default. */
		origin?: SessionOrigin;
	} = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const verifier = new CutShortVerifier();
	const detector = new FakeNoteDetector();
	const source = new ScriptedSource([...items]);
	const takes = new FakeTakeBuffer();
	const memory = new SessionMemory();
	const sources: ItemSource[] = options.sources ?? [source];
	const repositories = {
		attempts: new InMemoryAttemptRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository()
	};
	const levels = new InMemoryLevelStateRepository();
	for (const state of options.levelStates ?? (options.catalogLevels ? [] : BENCH_LEVEL_STATES)) {
		void levels.put(state);
	}
	const lookUp = options.exercise ?? exerciseById;
	/** The cards the recorders write, shared by every series of this bench. */
	const cards = new InMemoryCardStateRepository();
	let ids = 1;
	/** The source prepared for each session: its recorder tells it each attempt. */
	const sourceOf = new Map<string, ItemSource>();
	/** Every recorder handed out, so `stored` reads once their writes have settled. */
	const recorders: AttemptRecorder[] = [];
	const deps: SessionControllerDeps = {
		clock,
		sounds,
		detector,
		sensors: { chord: chordSensor(verifier), ...options.sensors },
		presenters: options.presenters ?? SET_PRESENTERS,
		views: options.views ?? VIEW_PRESENTERS,
		plays: options.plays ?? GESTURE_EXERCISE_IDS,
		repositories,
		levels,
		takes,
		memory,
		recorderFor: (sessionId) => {
			const recorder = new AttemptRecorder({
				attempts: repositories.attempts,
				cards,
				clock,
				now: () => clock.toEpochMs(clock.now()),
				selector: sourceOf.get(sessionId) ?? source,
				sessionId
			});
			recorders.push(recorder);
			return recorder;
		},
		exercise: options.catalogLevels ? lookUp : (id) => onBenchLevels(lookUp(id)),
		locale: () => 'fr',
		newId: () => `series-${++ids}`,
		development: options.development ?? false,
		random: options.random ?? (() => 0)
	};
	const prepared: string[] = [];
	const controller = new SessionController(
		{ id: 'series-1', origin: options.origin ?? { routine: 'changes' } },
		async (sessionId) => {
			prepared.push(sessionId);
			const next = sources.shift();
			if (!next) throw new Error('no source left');
			sourceOf.set(sessionId, next);
			return {
				source: next,
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
			// The input arrives as the clock runs: the take buffer keeps what it is asked to.
			takes.hear(clock.now());
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
		levels,
		takes,
		memory,
		cards,
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

/** The screen model on stage: a change's is the screen model of its passage. */
export function model(ctx: Ctx): PassageStageModel {
	return ctx.controller.view.stage?.model as PassageStageModel;
}

/** Roles of the trace's segments inside the series, in order, a run's own in its place. */
export function roles(trace: Segment | null): string[] {
	const series = trace?.children.find((s) => s.role === 'series');
	return (
		series?.children.flatMap((s) =>
			s.role === 'run' ? s.children.map((c) => c.role) : [s.role]
		) ?? []
	);
}
