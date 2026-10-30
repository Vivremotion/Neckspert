import type { AppServices, DiagnosticsService } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { summarizeExercise } from '$lib/application/session/cycle/exerciseSummary';
import { levelAided } from '$lib/application/session/aids';
import { SESSION_MS, summarizeSeries } from '$lib/domain/session';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { GESTURE_EXERCISES, gestureOpen } from '$lib/domain/gesture';
import {
	exerciseById,
	exerciseSessionExercises,
	figureParamsOf,
	writesFigure,
	type ExerciseDefinition,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE
} from '$lib/domain/exercise';
import { locateRules } from '$lib/domain/mechanics';
import { pitchOnString, type LocateItem } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	freeLeadOf,
	freeLevelOf,
	computeHomeStats,
	createGestureSelector,
	createListSource,
	type ItemSource,
	isNeck,
	lastAttemptByCard,
	reviewableCards,
	summarizeSession
} from '$lib/domain/progress';
import { neckSubject } from '$lib/domain/progress/neckSubject';
import {
	createLearningProcedure,
	DEFAULT_SET_LEARNING,
	type DirectRecall
} from '$lib/domain/learning';
import { triadNotesToLearn, triadZoneOpen } from '$lib/domain/triads';
import { triadSubject, type TriadMechanic } from '$lib/domain/triads/triadSubject';
import {
	isTriadsKind,
	type Attempt,
	type ExerciseSummary,
	type MechanicId,
	type SessionKind,
	type SessionRecord
} from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & {
		backup: BackupPort;
		calibration: CalibrationPort;
		diagnostics: DiagnosticsService;
		/** The development tools show (« Joué juste » on the gesture): a development build only. */
		development?: boolean;
	}
): AppServices {
	/** What a series prepares: its source, its length, and its mechanics' direct recall. */
	type PreparedSeries = {
		source: ItemSource;
		durationMs: number;
		recall?: (mechanic: MechanicId) => DirectRecall;
	};

	const exerciseOf = deps.exercise ?? exerciseById;

	/** The presenters of these mechanics: a session opens the sensors of the mechanics it plays. */
	const presentersOf = (mechanics: readonly MechanicId[]) =>
		Object.fromEntries(
			mechanics
				.filter((mechanic) => deps.mechanics[mechanic] !== undefined)
				.map((mechanic) => [mechanic, deps.mechanics[mechanic]])
		);

	/**
	 * The mechanics of the memory and gesture tracks: a session of the notes, the triads or the
	 * gesture opens the sensors of them all, its observations of the others kept on its attempts.
	 */
	const TRACK_MECHANICS: readonly MechanicId[] = [
		LOCATE_NECK,
		IDENTIFY_NECK,
		TRIADS_ANCHOR,
		TRIADS_ZONE,
		...GESTURE_EXERCISES
	].map((definition) => definition.mechanic);

	/**
	 * A session on the session controller: `prepare` reads the stores again for each series, so a
	 * new one starts at the levels the last one reached (the series reads its exercise levels
	 * itself); each item is a round compiled from its exercise's data. It opens the sensors of
	 * `mechanics`.
	 */
	const playSession = async (
		kind: SessionKind,
		mechanics: readonly MechanicId[],
		prepareSeries: (sessionId: string) => Promise<PreparedSeries>
	): Promise<SessionController> => {
		const { locale } = await deps.settings.get();
		/** What each series prepared, by session id: its recorder is told about it. */
		const prepared = new Map<string, PreparedSeries>();
		const prepare = async (sessionId: string) => {
			const series = await prepareSeries(sessionId);
			prepared.set(sessionId, series);
			return { source: series.source, durationMs: series.durationMs };
		};
		return new SessionController({ id: deps.newId(), kind }, prepare, {
			clock: deps.clock,
			sounds: deps.sounds,
			detector: deps.detector,
			sensors: deps.sensors,
			mechanics: presentersOf(mechanics),
			repositories: {
				attempts: deps.attempts,
				sessions: deps.sessions,
				settings: deps.settings
			},
			levels: deps.levels,
			recorderFor: (sessionId) => {
				const series = prepared.get(sessionId);
				if (!series) throw new Error(`No series prepared for session ${sessionId}`);
				return new AttemptRecorder({
					attempts: deps.attempts,
					cards: deps.cards,
					clock: deps.clock,
					now: deps.now,
					selector: series.source,
					sessionId,
					rules: (mechanic) => deps.mechanics[mechanic].rules,
					...(series.recall && { recall: series.recall, levels: deps.levels })
				});
			},
			exercise: exerciseOf,
			locale: () => locale,
			newId: deps.newId,
			development: deps.development ?? false,
			random: deps.random,
			takes: deps.takes,
			memory: deps.memory
		});
	};

	/**
	 * A gesture session, played on the session controller: the gesture selector serves the open
	 * exercises in the order of the ladder, each change a round of its exercise's template.
	 */
	const startGesture = () =>
		playSession('gesture', TRACK_MECHANICS, async (sessionId) => {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			// The open exercises in the order of the ladder; each grid of each (and the link, which
			// plays no grid) at its own exercise level, which the series holds.
			const definitions = GESTURE_EXERCISES.filter((definition) => gestureOpen(definition, cards));
			const source = createGestureSelector({
				definitions,
				cards,
				attempts: attempts.filter((attempt) => attempt.mechanic === 'chord-grid'),
				sessionId
			});
			return { source, durationMs: SESSION_MS };
		});

	/**
	 * A session of the notes, played on the session controller: learn on the learning procedure,
	 * with the levels stored, free play on a fixed list; each note a round of its exercise's template.
	 */
	const startNotes = (kind: 'learn' | 'free') =>
		playSession(kind, TRACK_MECHANICS, async (sessionId) => {
			const [cards, attempts, levels] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.levels.all()
			]);
			// The neck's exercises as the catalog writes them: locate on the click at its tempo,
			// identify answered in free time.
			const locate = exerciseOf(LOCATE_NECK.id);
			const identify = exerciseOf(IDENTIFY_NECK.id);
			// The neck's sessions see the neck's cards only; the triads lead its notes queue.
			const subject = neckSubject({
				definitions: { locate, identify },
				priority: triadNotesToLearn(cards)
			});
			const neckCards = cards.filter(isNeck);
			const source =
				kind === 'free'
					? createListSource(
							// A note is free-played at the lead its level gives on the locate ladder.
							buildFreePlan({
								leadOf: freeLeadOf({ subject, levels }),
								levelOf: freeLevelOf({ subject, levels }),
								random: deps.random
							})
						)
					: createLearningProcedure({
							subject,
							cards: neckCards,
							attempts: attempts.filter(isNeck),
							levels,
							sessionId,
							random: deps.random,
							// The session's settings for the whole set: today's, until written as data.
							set: DEFAULT_SET_LEARNING
						});
			return {
				source,
				durationMs: SESSION_MS,
				recall: (mechanic) => subject.recall(mechanic)
			};
		});

	/**
	 * A triads session, played on the session controller: one exercise, the anchor or the zone, on
	 * the learning procedure with the triad subject, each triad a round of its exercise's template.
	 */
	const startTriads = (mechanic: TriadMechanic) =>
		playSession(
			mechanic === 'triad-zone' ? 'triads-zone' : 'triads',
			TRACK_MECHANICS,
			async (sessionId) => {
				const [cards, attempts, levels] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.levels.all()
				]);
				const definitions = {
					anchor: exerciseOf(TRIADS_ANCHOR.id),
					zone: exerciseOf(TRIADS_ZONE.id)
				};
				// The anchor's queue puts first the triads of the notes already acquired in locate.
				const acquiredPositions = new Set(
					cards
						.filter((card) => card.mechanic === locateRules.id && card.acquiredAt !== null)
						.map((card) => locateRules.itemKey(card.item as LocateItem))
				);
				// The triads' cards and attempts: the zone reads the anchor's, the anchor the zone's last positions.
				const ofTriads = (x: { mechanic: string }) =>
					x.mechanic === 'triad-anchor' || x.mechanic === 'triad-zone';
				const triadAttempts = attempts.filter(ofTriads);
				const subject = triadSubject({
					mechanic,
					definitions,
					acquiredPositions,
					attempts: triadAttempts
				});
				const source = createLearningProcedure({
					subject,
					cards: cards.filter(ofTriads),
					attempts: triadAttempts,
					levels,
					sessionId,
					random: deps.random,
					// The session's settings for the whole set: today's, until written as data.
					set: DEFAULT_SET_LEARNING
				});
				return {
					source,
					durationMs: SESSION_MS,
					recall: (of) => subject.recall(of)
				};
			}
		);

	/** The series of a session still in memory, and the runs whose take is still held. */
	const seriesInMemory = (
		sessionId: string,
		exercise: ExerciseDefinition,
		attempts: readonly Attempt[]
	): Pick<ExerciseSummary, 'series' | 'replayable'> => {
		const playback = deps.memory.get(sessionId);
		const series = playback?.trace.children.find((segment) => segment.role === 'series');
		if (!playback || !series) return {};
		const summary = summarizeSeries({
			series,
			attempts,
			aided: (attempt) =>
				levelAided(
					attempt.aids,
					figureParamsOf(exercise, (attempt.data as { level?: number } | null)?.level ?? 0).cursor
				)
		});
		const replayable = summary.runs
			.map((run) => run.id)
			.filter((id) => {
				const take = playback.takes.get(id);
				return take !== undefined && deps.takes.holds(take.from, take.to);
			});
		return { series: summary, replayable };
	};

	/**
	 * The exercise an exercise session played, when it is still in the catalog with levels and a
	 * round that writes a figure.
	 */
	const sessionExerciseOf = (record: SessionRecord) => {
		if (record.kind !== 'exercise' || record.exerciseId === undefined) return undefined;
		try {
			const played = exerciseOf(record.exerciseId);
			return played.levels && played.levels.length > 0 && writesFigure(played) ? played : undefined;
		} catch {
			return undefined;
		}
	};

	return {
		settings: deps.settings,
		backup: deps.backup,
		detector: deps.detector,
		calibration: deps.calibration,
		diagnostics: deps.diagnostics,

		async homeStats() {
			const [cards, attempts, settings] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.settings.get()
			]);
			// The home number and its reviews are the neck's; the triads count theirs apart.
			return computeHomeStats({
				cards: cards.filter(isNeck),
				attempts: attempts.filter(isNeck),
				settings,
				now: deps.now()
			});
		},

		async triads() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			const last = lastAttemptByCard(attempts);
			const due = (mechanic: TriadMechanic) =>
				reviewableCards(
					cards.filter((card) => card.mechanic === mechanic),
					last,
					deps.now()
				).length;
			return {
				anchorDue: due('triad-anchor'),
				zoneDue: triadZoneOpen(cards) ? due('triad-zone') : null
			};
		},

		async gesture() {
			const cards = await deps.cards.all();
			return { open: GESTURE_EXERCISES.some((definition) => gestureOpen(definition, cards)) };
		},

		async contest(attemptId: number, reason?: string) {
			await deps.attempts.setContested(attemptId, reason);
		},

		async replayRun(sessionId: string, runId: number) {
			const playback = deps.memory.get(sessionId);
			const take = playback?.takes.get(runId);
			if (!playback || !take || !deps.takes.holds(take.from, take.to)) {
				throw new Error(`Run ${runId} of session ${sessionId} cannot be heard again`);
			}
			await deps.takes.play(take.from, take.to, take.sounds, playback.latencyS);
		},

		stopReplay() {
			deps.takes.stop();
		},

		async resting(exerciseIds) {
			const now = deps.now();
			const states = await Promise.all(
				exerciseIds.map((exerciseId) => deps.levels.get({ exerciseId, scope: '', item: '' }))
			);
			return exerciseIds.filter((_, i) => {
				const resumeAfter = states[i]?.resumeAfter;
				return typeof resumeAfter === 'number' && resumeAfter > now;
			});
		},

		async sessionSummary(sessionId: string) {
			const record = await deps.sessions.get(sessionId);
			if (!record) {
				throw new Error(`Unknown session: ${sessionId}`);
			}
			const exercise = sessionExerciseOf(record);
			if (exercise) {
				// An exercise session: its own rounds and the level it ended on, nothing of the neck.
				const [attempts, state] = await Promise.all([
					deps.attempts.listBySession(sessionId),
					deps.levels.get({ exerciseId: exercise.id, scope: '', item: '' })
				]);
				return {
					...summarizeSession({
						record,
						attempts: [],
						allAttempts: [],
						cards: [],
						now: deps.now()
					}),
					exercise: {
						...summarizeExercise({
							exercise,
							attempts,
							levelReached: record.levelReached,
							state
						}),
						...seriesInMemory(sessionId, exercise, attempts)
					}
				};
			}
			const [attempts, allAttempts, cards] = await Promise.all([
				deps.attempts.listBySession(sessionId),
				deps.attempts.all(),
				deps.cards.all()
			]);
			// Next reviews of the session's own track: the neck's, or the triads'.
			const ofTrack = (x: { mechanic: string }) => isNeck(x) === !isTriadsKind(record.kind);
			return summarizeSession({
				record,
				attempts,
				allAttempts: allAttempts.filter(ofTrack),
				cards: cards.filter(ofTrack),
				now: deps.now()
			});
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			return buildNeckMap({ cards, attempts, pitchAt: pitchOnString });
		},

		async startSession(kind: SessionKind) {
			// An exercise session needs its exercise: recorded without it, no backup would import.
			if (kind === 'exercise') throw new Error('An exercise session starts through startExercise');
			if (kind === 'gesture') return startGesture();
			if (kind === 'learn' || kind === 'free') return startNotes(kind);
			return startTriads(kind === 'triads-zone' ? 'triad-zone' : 'triad-anchor');
		},

		async startExercise(exerciseId) {
			// An exercise played on its own, free play: the series plays it at the level it holds.
			if (!exerciseSessionExercises().some((exercise) => exercise.id === exerciseId)) {
				throw new Error(`Exercise ${exerciseId} is not played in an exercise session`);
			}
			const definition = exerciseOf(exerciseId);
			return playSession('exercise', [definition.mechanic], async () => ({
				source: createExerciseItemSource(definition),
				durationMs: SESSION_MS
			}));
		}
	};
}
