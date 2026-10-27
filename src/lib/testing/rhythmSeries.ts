/** A rhythm exercise played on the response series, with the fakes and a player who reads the screen. */
import { SESSION_MS } from '$lib/domain/session';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { Fraction, attackPositions, barLength, type Figure } from '$lib/domain/time';
import type { Attempt, SensorLatency, Settings } from '$lib/domain/types';
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
import { createFigureSource } from '$lib/application/session/cycle/figureSource';
import { RHYTHM_PRESENTERS } from '$lib/application/session/cycle/presenter';
import type { RhythmStageModel } from '$lib/application/session/cycle/rhythmStage';
import { attackSensor } from '$lib/application/session/sensors';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import type { ResponseSeriesDeps } from '$lib/application/session/SessionDeps';
import { ResponseSeriesController } from '$lib/application/session/series/ResponseSeriesController.svelte';

/** The transport starts its map this long after `now`; the series start at clock time 0. */
export const ORIGIN = 0.1;
/**
 * Steps of simulated time between two flushes of the sound scheduler: a power of two, so the
 * clock moves exactly and never lands on a bar or a beat (they fall `ORIGIN` past a whole second).
 */
const STEPS_PER_S = 64;

/** An attempt of the exercise from an earlier series: the exercise is no longer met for the first time. */
export function earlier(exerciseId: string): Attempt {
	return {
		sessionId: 'old',
		exerciseId,
		mechanic: 'rhythm-figure',
		cardKey: 'rhythm-figure:old@0',
		phase: 'free',
		temperature: 'hot',
		aids: [],
		promptedAt: 0,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: null,
		success: false,
		verdict: { relation: 'cycle', version: 1, value: { passed: false, reasons: ['missed'] } },
		measures: {},
		plan: null,
		data: null,
		observations: null
	};
}

/** The exercise with a counted bar after its listen-in, whatever its catalog start. */
export function counted(exercise: ExerciseDefinition): ExerciseDefinition {
	return { ...exercise, params: { ...exercise.params, countIn: true } };
}

/** Lets the writes started by the controller finish. */
export async function settled(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The rhythm's screen model on show; throws when there is none. */
export function stageOf(controller: ResponseSeriesController): RhythmStageModel {
	const stage = controller.view.stage;
	if (!stage) throw new Error('no stage on show');
	return stage.model as RhythmStageModel;
}

/** The audio times of the attacks of figure bar `played % bars`, the bar starting at `startS`. */
export function barAttacks(figure: Figure, played: number, startS: number, barS: number): number[] {
	const length = barLength(figure.meter);
	const figureBar = played % figure.bars;
	const from = length.mul(Fraction.of(figureBar));
	const to = length.mul(Fraction.of(figureBar + 1));
	return attackPositions(figure)
		.filter((at) => at.compare(from) >= 0 && at.compare(to) < 0)
		.map((at) => startS + at.sub(from).div(length).toNumber() * barS);
}

/**
 * Plays the figure on every bar the stage shows as played, from the bar where play began (the
 * entry starts the figure), each attack `offsetS` off the written time.
 */
export class Player {
	offsetS = 0;
	/** Attack `skip` of each bar is not played (the player misreads the same note). */
	skip: number | null = null;
	/** Each attack alternately this early and this late (the player plays unevenly). */
	jitterS = 0;
	private played = 0;
	private bar = -1;
	private playFrom: number | null = null;
	private queue: number[] = [];

	constructor(
		private readonly controller: ResponseSeriesController,
		private readonly attacks: FakeAttackDetector,
		private readonly clock: FakeClock
	) {}

	step(): void {
		const stage = this.controller.view.stage;
		if (!stage) return;
		const model = stage.model as RhythmStageModel;
		const barS = (60 / model.tempo.bpm) * 4;
		const bar = Math.floor((this.clock.now() - ORIGIN) / barS + 1e-9);
		if (bar !== this.bar) {
			this.bar = bar;
			if (model.phase === 'play') {
				this.playFrom ??= bar;
				this.queue.push(
					...barAttacks(model.figure, bar - this.playFrom, ORIGIN + bar * barS, barS).filter(
						(_, index) => index !== this.skip
					)
				);
			} else {
				this.playFrom = null;
			}
		}
		const due = this.queue.filter((t) => t <= this.clock.now());
		this.queue = this.queue.filter((t) => t > this.clock.now());
		for (const time of due) {
			const jitter = this.jitterS * (this.played++ % 2 === 0 ? -1 : 1);
			this.attacks.emit({ time: time + this.offsetS + jitter, strength: 1 });
		}
	}
}

/**
 * `exercise` on the response series, its items from `createFigureSource`, the rhythm's presenter
 * and the attack sensor: as `startExercise` will build it (plan H6, Task 9).
 */
export async function rhythmSeries(
	exercise: ExerciseDefinition,
	options: {
		/** The exercise was played before. */
		met?: boolean;
		/** The attack sensor's calibrated latency. */
		latency?: SensorLatency;
		/** Latencies of other sensors, beside the attack's. */
		latencies?: Settings['latency'];
		clickBleed?: boolean;
	} = {}
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
	await settings.update({
		latency: { ...options.latencies, ...(options.latency && { attack: options.latency }) },
		clickBleed: options.clickBleed ?? false
	});
	const recorders: AttemptRecorder[] = [];
	const sources = new Map<string, ReturnType<typeof createFigureSource>>();
	let ids = 0;
	const deps: ResponseSeriesDeps = {
		clock,
		sounds,
		detector,
		sensors: { attack: attackSensor(attacks) },
		mechanics: RHYTHM_PRESENTERS,
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
	const controller = new ResponseSeriesController(
		{ id: 'series', kind: 'exercise' },
		async (sessionId) => {
			const source = createFigureSource(exercise);
			sources.set(sessionId, source);
			return { source, durationMs: SESSION_MS };
		},
		deps
	);
	const player = new Player(controller, attacks, clock);

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
		sessions,
		settings,
		detector,
		takes,
		memory,
		controller,
		player,
		advance,
		stored
	};
}
