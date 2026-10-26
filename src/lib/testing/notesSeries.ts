/** The notes' sessions on the app's real wiring (`createAppServices`), the stores in memory and the fakes. */
import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationOutcome, CalibrationPort } from '$lib/application/ports';
import { NECK_PRESENTERS } from '$lib/application/mechanics';
import type { AnswerKeysModel } from '$lib/application/mechanics/identify';
import type { NoteLaneModel } from '$lib/application/mechanics/locate';
import { createAppServices } from '$lib/application/services/createAppServices';
import type { PlaySessionController, PromptView } from '$lib/application/session/contract';
import { noteSensor, tapSensor } from '$lib/application/session/sensors';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { exerciseById, type ExerciseDefinition, type Progression } from '$lib/domain/exercise';
import {
	acceptableMidis,
	formatNote,
	neckCardKey,
	pitchOnString,
	stringLabel,
	type IdentifyItem,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import { CHROMATIC_NOTES, STRING_NUMBERS, type PitchName } from '$lib/domain/music/types';
import { introduceCard, markLearned } from '$lib/domain/progress';
import type { LevelState } from '$lib/domain/time';
import type { CardState } from '$lib/domain/types';
import {
	FakeClock,
	FakeDiagnostics,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from './fakes';

class FakeBackup implements BackupPort {
	async exportAll(): Promise<never> {
		throw new Error('not used');
	}
	async importAll(): Promise<void> {}
}

class FakeCalibration implements CalibrationPort {
	async run(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	async runOnClick(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

/** A learned card of the neck, due at once (a cold review), acquired unless told otherwise. */
export function learnedCard(card: NeckCard, options: { acquired?: boolean } = {}): CardState {
	const learned = markLearned(
		introduceCard({ key: neckCardKey(card), mechanic: card.mechanic, item: card.item }, 0, 's-old'),
		0
	);
	return {
		...learned,
		acquiredAt: options.acquired === false ? null : 0,
		scheduling: { ...learned.scheduling, due: 0 }
	};
}

export const locate = (string: LocateItem['string'], pitch: PitchName): NeckCard => ({
	mechanic: 'locate',
	item: { string, pitch }
});

export const identify = (string: IdentifyItem['string'], fret: number): NeckCard => ({
	mechanic: 'identify',
	item: { string, fret }
});

/** A stored level of a note in its exercise. */
export function levelOf(card: NeckCard, level: number): LevelState {
	const key = neckCardKey(card);
	return {
		exerciseId: card.mechanic === 'locate' ? 'locate-neck' : 'identify-neck',
		scope: '',
		item: key.slice(key.indexOf(':') + 1),
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

/** A deterministic draw in [0, 1) (a linear congruential generator). */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

export interface NotesSetup {
	cards?: CardState[];
	levels?: LevelState[];
	progressions?: Progression[];
	development?: boolean;
	random?: () => number;
	/** Exercises that replace the catalog's of the same id (a test catalog). */
	exercises?: readonly ExerciseDefinition[];
}

/** The app's services on fakes, its stores filled from `setup`, ready to start a session of the notes. */
export async function notesApp(setup: NotesSetup = {}) {
	const clock = new FakeClock();
	const detector = new FakeNoteDetector();
	const sounds = new FakeSoundScheduler(clock);
	let ids = 0;
	const deps = {
		clock,
		metronome: new FakeMetronome(clock),
		detector,
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		progressions: new InMemoryProgressionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: setup.random ?? (() => 0),
		newId: () => `notes-${++ids}`,
		mechanics: { ...NECK_PRESENTERS },
		sensors: { note: noteSensor(detector), tap: tapSensor() },
		sounds,
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory(),
		levels: new InMemoryLevelStateRepository(),
		exercise: (id: string) =>
			setup.exercises?.find((exercise) => exercise.id === id) ?? exerciseById(id)
	};
	await deps.cards.putMany(setup.cards ?? []);
	for (const level of setup.levels ?? []) await deps.levels.put(level);
	for (const progression of setup.progressions ?? []) await deps.progressions.put(progression);
	const services: AppServices = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics(),
		development: setup.development ?? false
	});
	return { services, deps, clock, sounds, detector };
}

export type NotesApp = Awaited<ReturnType<typeof notesApp>>;

/** A session of `kind` started on `app`. */
export async function startNotes(app: NotesApp, kind: 'learn' | 'free') {
	const controller = await app.services.startSession(kind);
	await controller.ready?.();
	await controller.start();
	return controller;
}

/** One step of the clock (10 ms by default), the transport's wake-ups run, a microtask let through. */
export async function step(app: NotesApp, seconds = 0.01): Promise<void> {
	app.clock.advance(seconds);
	app.sounds.flush();
	await Promise.resolve();
}

/** Steps until `done`, at most `maxSteps`. */
export async function runUntil(
	app: NotesApp,
	done: () => boolean,
	options: { stepS?: number; maxSteps?: number } = {}
): Promise<void> {
	const maxSteps = options.maxSteps ?? 5000;
	for (let i = 0; i < maxSteps && !done(); i++) await step(app, options.stepS);
}

/** Lets the writes started settle. */
export async function drain(): Promise<void> {
	for (let i = 0; i < 50; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

const STRING_OF = new Map(STRING_NUMBERS.map((string) => [stringLabel(string, 'fr'), string]));
const PITCH_OF = new Map<string, PitchName>(
	CHROMATIC_NOTES.flatMap((pitch) => [
		[formatNote({ pitch, spelling: 'sharp' }), pitch],
		[formatNote({ pitch, spelling: 'flat' }), pitch]
	])
);

/** What the screen shows of a note: the prompt read back as its item, where it is placed. */
export interface Staged {
	card: NeckCard;
	prompt: PromptView;
	/** The note lane's places; null on the answer pad. */
	anchorBeat: number | null;
	promptBeat: number | null;
	verdict: NoteLaneModel['verdict'];
}

/** The note on stage, read from the prompt as the player reads it (in French). */
export function onStage(controller: PlaySessionController): Staged | null {
	const stage = controller.view.stage;
	if (!stage) return null;
	if (stage.view === 'note-lane') {
		const model = stage.model as NoteLaneModel;
		const string = STRING_OF.get(model.prompt.secondary ?? '');
		const pitch = PITCH_OF.get(model.prompt.primary);
		if (!string || !pitch) throw new Error(`Unreadable prompt: ${JSON.stringify(model.prompt)}`);
		return {
			card: { mechanic: 'locate', item: { string, pitch } },
			prompt: model.prompt,
			anchorBeat: model.anchorBeat,
			promptBeat: model.promptBeat,
			verdict: model.verdict
		};
	}
	if (stage.view === 'answer-keys') {
		const model = stage.model as AnswerKeysModel;
		const string = STRING_OF.get(model.prompt.secondary ?? '');
		const fret = Number(model.prompt.primary.replace(/^\D+/, ''));
		if (!string || !Number.isInteger(fret)) {
			throw new Error(`Unreadable prompt: ${JSON.stringify(model.prompt)}`);
		}
		return {
			card: { mechanic: 'identify', item: { string, fret } },
			prompt: model.prompt,
			anchorBeat: null,
			promptBeat: null,
			verdict: model.verdict
		};
	}
	return null;
}

/** The right answer to a note: the MIDI note to play, or the name to tap. */
export function rightMidi(item: LocateItem): number {
	return acceptableMidis(item)[0];
}

export function rightName(item: IdentifyItem): PitchName {
	return pitchOnString(item.string, item.fret);
}

/** A name other than `pitch`. */
export function wrongName(pitch: PitchName): PitchName {
	return CHROMATIC_NOTES[(CHROMATIC_NOTES.indexOf(pitch) + 1) % CHROMATIC_NOTES.length];
}

/** How a round is answered: right, wrong or not at all; on the beat ± `offsetMs`, or `afterMs` after a tap prompt. */
export interface Answer {
	play: 'right' | 'wrong' | 'none';
	offsetMs?: number;
	afterMs?: number;
}

/** A round as the player met it. */
export interface RoundSeen extends Staged {
	n: number;
	/** Audio seconds the round opened at, and of its target (locate) or its tap (identify). */
	openedAt: number;
	dueAt: number;
	answeredAt: number | null;
}

/** Identify answers this long after its prompt unless told otherwise. */
export const DEFAULT_REACTION_MS = 700;

/**
 * Plays the session's rounds as they open (the status turning to awaiting), each answered as
 * `choose` says, until `rounds` rounds have opened and the last one was answered (or let pass),
 * or the session ends, or `maxSteps` run out.
 */
export async function playRounds(
	app: NotesApp,
	controller: PlaySessionController,
	choose: (round: RoundSeen) => Answer,
	options: { rounds?: number; stepS?: number; maxSteps?: number } = {}
): Promise<RoundSeen[]> {
	const { clock, detector } = app;
	const rounds: RoundSeen[] = [];
	const limit = options.rounds ?? Infinity;
	const maxSteps = options.maxSteps ?? 20_000;
	let status = controller.view.status;
	let due: { round: RoundSeen; answer: Answer } | null = null;
	for (let i = 0; i < maxSteps; i++) {
		if (controller.view.status === 'finished') break;
		if (rounds.length >= limit && due === null) break;
		await step(app, options.stepS);
		const now = clock.now();
		if (controller.view.status === 'awaiting' && status !== 'awaiting') {
			const staged = onStage(controller);
			if (staged && rounds.length < limit) {
				const round: RoundSeen = {
					...staged,
					n: rounds.length,
					openedAt: now,
					dueAt: now,
					answeredAt: null
				};
				const answer = choose(round);
				if (staged.card.mechanic === 'locate' && staged.anchorBeat !== null) {
					const beatS = 60 / controller.view.tempoBpm;
					round.dueAt =
						now +
						(staged.anchorBeat - controller.timeline.nowBeat()) * beatS +
						(answer.offsetMs ?? 0) / 1000;
				} else {
					round.dueAt = now + (answer.afterMs ?? DEFAULT_REACTION_MS) / 1000;
				}
				rounds.push(round);
				due = { round, answer };
			}
		}
		status = controller.view.status;
		if (due && now >= due.round.dueAt) {
			const { round, answer } = due;
			due = null;
			if (answer.play === 'none') continue;
			round.answeredAt = now;
			const { card } = round;
			if (card.mechanic === 'locate') {
				const midi = rightMidi(card.item) + (answer.play === 'right' ? 0 : 1);
				detector.emitNote({ time: round.dueAt, midi, frequencyHz: 220, clarity: 0.9 });
			} else {
				const name = rightName(card.item);
				controller.answer(answer.play === 'right' ? name : wrongName(name));
			}
		}
	}
	return rounds;
}

export const allRight = (): Answer => ({ play: 'right' });
