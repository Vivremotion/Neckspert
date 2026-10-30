/**
 * A sequence of chord shapes played on the session controller, with the fakes and a player who
 * reads the screen: each round, the shape its prompt names, arpeggiated over the figure on show.
 */
import { CONTENT_DERIVATIONS } from '$lib/domain/derivations';
import { isFigureEntry } from '$lib/domain/exercise/round';
import { SESSION_MS } from '$lib/domain/session';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { mechanicRules, type VoicingFigureItem } from '$lib/domain/mechanics';
import { parseVoicingKey } from '$lib/domain/music';
import { voicingNotes } from '$lib/domain/music/voicingNotes';
import { attackPositions, barLength } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import {
	FakeAttackDetector,
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
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { FIGURE_PRESENTERS } from '$lib/application/mechanics/figurePresenters';
import type { FigureStageModel } from '$lib/application/session/series/figureStage';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { attackSensor, noteSensor } from '$lib/application/session/sensors';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import type { SessionControllerDeps } from '$lib/application/session/SessionDeps';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { ORIGIN, earlier, settled } from './rhythmSeries';

export { ORIGIN, settled };

/** Steps of simulated time between two flushes of the sound scheduler (see `rhythmSeries`). */
const STEPS_PER_S = 64;

/** The pitches of a shape's notes, lowest string first. */
export function shapePitches(itemKey: string): number[] {
	const { voicing, occurrence } = mechanicRules('voicing-figure').parseItem(
		itemKey
	) as VoicingFigureItem;
	return voicingNotes(parseVoicingKey(voicing), occurrence).map(({ midi }) => midi);
}

/** The pitches a round of `exercise` derives from an item: what its figure entry spreads. */
function derivedPitches(exercise: ExerciseDefinition, itemKey: string): number[] {
	const content = exercise.round?.expectations.find(isFigureEntry)?.content;
	if (!content) throw new Error(`${exercise.id} derives no note`);
	const item = mechanicRules(exercise.mechanic).parseItem(itemKey);
	const notes = CONTENT_DERIVATIONS[content.from].derive(item, exercise) as { midi: number }[];
	return notes.map(({ midi }) => midi);
}

/** The sequence's screen model on show; throws when there is none. */
export function stageOf(controller: SessionController): FigureStageModel {
	const stage = controller.view.stage;
	if (!stage) throw new Error('no stage on show');
	return stage.model as FigureStageModel;
}

/**
 * Plays, on every bar the stage shows as played, the figure on show on the notes of the shape its
 * prompt names, note `k` the shape's note `pattern[k mod pattern.length]` (from 1), right on time.
 */
export class ArpeggioPlayer {
	/**
	 * The pitch played for note `note` (from 0) of round `round` (from 0, every played bar of the
	 * series) where `midi` is written; null: not played. Absent: every note as written.
	 */
	pitch: ((round: number, note: number, midi: number) => number | null) | null = null;
	/** Every note this far off its written time (negative: early). */
	offsetS = 0;
	/** The rounds played so far: the prompt each played bar showed, in order. */
	readonly prompts: string[] = [];
	private bar = -1;
	private queue: { time: number; midi: number }[] = [];

	constructor(
		private readonly controller: SessionController,
		private readonly detector: FakeNoteDetector,
		private readonly clock: FakeClock,
		/** Each shape's notes, by the chord its prompt names. */
		private readonly shapes: ReadonlyMap<string, number[]>,
		private readonly pattern: readonly number[]
	) {}

	step(): void {
		const stage = this.controller.view.stage;
		if (stage) {
			const model = stage.model as FigureStageModel;
			const barS = (60 / model.tempo.bpm) * 4;
			const bar = Math.floor((this.clock.now() - ORIGIN) / barS + 1e-9);
			if (bar !== this.bar) {
				this.bar = bar;
				if (model.phase === 'play') this.playBar(model, ORIGIN + bar * barS, barS);
			}
		}
		const due = this.queue.filter((note) => note.time <= this.clock.now());
		this.queue = this.queue.filter((note) => note.time > this.clock.now());
		for (const { time, midi } of due) {
			this.detector.emitNote({ time, midi, frequencyHz: 440, clarity: 1 });
		}
	}

	private playBar(model: FigureStageModel, startS: number, barS: number): void {
		const chord = model.prompt?.primary;
		const notes = chord === undefined ? undefined : this.shapes.get(chord);
		if (!chord || !notes) throw new Error(`no shape for the prompt ${String(chord)}`);
		const round = this.prompts.push(chord) - 1;
		const length = barLength(model.figure.meter);
		attackPositions(model.figure).forEach((at, k) => {
			const written = notes[this.pattern[k % this.pattern.length] - 1];
			const midi = this.pitch ? this.pitch(round, k, written) : written;
			if (midi === null) return;
			this.queue.push({ time: startS + at.div(length).toNumber() * barS + this.offsetS, midi });
		});
	}
}

/**
 * `exercise`, whose items each derive their notes, on the session controller as `startExercise`
 * builds it: its items from `createExerciseItemSource`, its own mechanic's presenter alone, and both the
 * note and the attack sensors offered, so the spec sees which the series opens.
 */
export async function sequenceSeries(
	exercise: ExerciseDefinition,
	options: {
		pattern: readonly number[];
		/** The exercise was played before: no demonstration of a first encounter. */
		met?: boolean;
	}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const attacks = new FakeAttackDetector();
	const attempts = new InMemoryAttemptRepository();
	const levels = new InMemoryLevelStateRepository();
	const settings = new InMemorySettingsRepository();
	const sessions = new InMemorySessionRepository();
	const detector = new FakeNoteDetector();
	const takes = new FakeTakeBuffer();
	const memory = new SessionMemory();
	if (options.met) await attempts.add(earlier(exercise.id));
	await settings.update({ latency: {}, clickBleed: false });
	const recorders: AttemptRecorder[] = [];
	const sources = new Map<string, ReturnType<typeof createExerciseItemSource>>();
	let ids = 0;
	const presenter = FIGURE_PRESENTERS[exercise.mechanic];
	const deps: SessionControllerDeps = {
		clock,
		sounds,
		detector,
		sensors: { note: noteSensor(detector), attack: attackSensor(attacks) },
		mechanics: { [presenter.rules.id]: presenter },
		repositories: { attempts, sessions, settings },
		levels,
		recorderFor: (sessionId) => {
			const source = sources.get(sessionId);
			if (!source) throw new Error(`No series prepared for session ${sessionId}`);
			const recorder = new AttemptRecorder({
				attempts,
				cards: new InMemoryCardStateRepository(),
				clock,
				now: () => clock.toEpochMs(clock.now()),
				selector: source,
				sessionId,
				rules: (mechanic) => deps.mechanics[mechanic].rules
			});
			recorders.push(recorder);
			return recorder;
		},
		exercise: () => exercise,
		locale: () => 'fr',
		newId: () => `s${++ids}`,
		development: false,
		random: () => 0,
		takes,
		memory
	};
	const controller = new SessionController(
		{ id: 'series', kind: 'exercise' },
		async (sessionId) => {
			const source = createExerciseItemSource(exercise);
			sources.set(sessionId, source);
			return { source, durationMs: SESSION_MS };
		},
		deps
	);
	const rules = mechanicRules(exercise.mechanic);
	const shapes = new Map(
		(exercise.items ?? []).map((key) => {
			const item = rules.parseItem(key);
			const { chord } = ITEM_FIELDS[exercise.mechanic].fields(item, 'fr', () => 0, exercise);
			return [String(chord), derivedPitches(exercise, key)] as const;
		})
	);
	const player = new ArpeggioPlayer(controller, detector, clock, shapes, options.pattern);

	/** Moves the clock to `to` seconds by small steps, the player playing along when it plays. */
	async function advance(to: number, playing = true): Promise<void> {
		while (clock.time < to - 1e-9) {
			clock.time = Math.min(to, (Math.floor(clock.time * STEPS_PER_S + 1e-6) + 1) / STEPS_PER_S);
			sounds.flush();
			takes.hear(clock.time);
			if (playing) player.step();
		}
		await settled();
	}

	/** The attempts of a series, once every recorder has written them. */
	async function stored(sessionId = 'series'): Promise<Attempt[]> {
		await Promise.all(recorders.map((recorder) => recorder.settled()));
		return attempts.listBySession(sessionId);
	}

	return {
		clock,
		sounds,
		attacks,
		attempts,
		levels,
		detector,
		controller,
		player,
		advance,
		stored
	};
}
