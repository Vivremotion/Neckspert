import type { AppServices, DiagnosticsService } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import type { DefinitionsService } from '$lib/application/definitions/service';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { summarizeExercise } from '$lib/application/session/series/exerciseSummary';
import { levelAided } from '$lib/application/session/aids';
import { SESSION_MS, summarizeSeries } from '$lib/domain/session';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { gestureOpen } from '$lib/domain/gesture';
import {
	exerciseById,
	exerciseSessionExercises,
	figureParamsOf,
	findExercise,
	writesFigure,
	type ExerciseDefinition,
	type ExerciseId,
	CHANGE_SKILL_IDS,
	CHORD_ANCHOR_SKILL_ID,
	CHORD_ZONE_SKILL_ID,
	GESTURE_EXERCISE_IDS,
	IDENTIFY_NECK_ID,
	LOCATE_NECK_ID,
	LOCATE_SKILL_ID,
	TRIADS_ANCHOR_ID,
	TRIADS_ZONE_ID
} from '$lib/domain/exercise';
import { noteOnStringSet } from '$lib/domain/sets';
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
import { triadSubject, type TriadSkill } from '$lib/domain/triads/triadSubject';
import {
	isTriadsKind,
	sessionKindOf,
	type Attempt,
	type ExerciseSummary,
	type SessionKind,
	type SkillId,
	type SessionRecord
} from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & {
		backup: BackupPort;
		definitions: DefinitionsService;
		calibration: CalibrationPort;
		diagnostics: DiagnosticsService;
		/** The development tools show (« Joué juste » on the gesture): a development build only. */
		development?: boolean;
	}
): AppServices {
	/** What a series prepares: its source, its length, and its skills' direct recall. */
	type PreparedSeries = {
		source: ItemSource;
		durationMs: number;
		recall?: (skill: SkillId) => DirectRecall;
	};

	const exerciseOf = deps.exercise ?? exerciseById;
	/**
	 * The exercise of `id` when a file defines it: a removed file takes its exercises out of the
	 * registry and leaves their progress stored.
	 */
	const exerciseFound = (id: ExerciseId): ExerciseDefinition | undefined => {
		if (!deps.exercise) return findExercise(id);
		try {
			return deps.exercise(id);
		} catch {
			return undefined;
		}
	};
	/** The exercises a session cannot play without, read at its start: an error names the first missing. */
	const requireExercises = (ids: readonly ExerciseId[]): void => {
		const missing = ids.find((id) => exerciseFound(id) === undefined);
		if (missing !== undefined) {
			throw new Error(`Unknown exercise: ${missing} (no definition file defines it)`);
		}
	};

	/**
	 * The exercises of the memory and gesture tracks: a session of the notes, the triads or the
	 * gesture opens the sensors of those a file defines, its observations of the others kept on
	 * its attempts. Read at each start: the files may have changed since the last.
	 */
	const TRACK_EXERCISES: readonly ExerciseId[] = [
		LOCATE_NECK_ID,
		IDENTIFY_NECK_ID,
		TRIADS_ANCHOR_ID,
		TRIADS_ZONE_ID,
		...GESTURE_EXERCISE_IDS
	];
	const trackExercises = () => TRACK_EXERCISES.filter((id) => exerciseFound(id) !== undefined);
	/** The gesture's exercises a file defines, in the order of the ladder. */
	const gestureExercises = () => GESTURE_EXERCISE_IDS.flatMap((id) => exerciseFound(id) ?? []);

	/**
	 * A session on the session controller: `prepare` reads the stores again for each series, so a
	 * new one starts at the levels the last one reached (the series reads its exercise levels
	 * itself); each item is a round compiled from its exercise's data. It opens the sensors of the
	 * presenters of the exercises it `plays`.
	 */
	const playSession = async (
		kind: SessionKind,
		plays: readonly ExerciseId[],
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
			presenters: deps.presenters,
			views: deps.views,
			plays,
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
		playSession('gesture', trackExercises(), async (sessionId) => {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			// The open exercises in the order of the ladder; each grid of each (and the link, which
			// plays no grid) at its own exercise level, which the series holds.
			const definitions = gestureExercises().filter((definition) => gestureOpen(definition, cards));
			const source = createGestureSelector({
				definitions,
				cards,
				attempts: attempts.filter((attempt) =>
					(CHANGE_SKILL_IDS as readonly string[]).includes(attempt.skill)
				),
				sessionId
			});
			return { source, durationMs: SESSION_MS };
		});

	/**
	 * A session of the notes, played on the session controller: learn on the learning procedure,
	 * with the levels stored, free play on a fixed list; each note a round of its exercise's template.
	 */
	const startNotes = (kind: 'learn' | 'free') =>
		playSession(kind, trackExercises(), async (sessionId) => {
			const [cards, attempts, levels] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.levels.all()
			]);
			// The neck's exercises as the catalog's files write them: locate on the click at its
			// tempo, identify answered in free time.
			const locate = exerciseOf(LOCATE_NECK_ID);
			const identify = exerciseOf(IDENTIFY_NECK_ID);
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
				recall: (skill) => subject.recall(skill)
			};
		});

	/**
	 * A triads session, played on the session controller: one exercise, the anchor or the zone, on
	 * the learning procedure with the triad subject, each triad a round of its exercise's template.
	 */
	const startTriads = (skill: TriadSkill) =>
		playSession(
			skill === CHORD_ZONE_SKILL_ID ? 'triads-zone' : 'triads',
			trackExercises(),
			async (sessionId) => {
				const [cards, attempts, levels] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.levels.all()
				]);
				const definitions = {
					anchor: exerciseOf(TRIADS_ANCHOR_ID),
					zone: exerciseOf(TRIADS_ZONE_ID)
				};
				// The anchor's queue puts first the triads of the notes already acquired in locate.
				const acquiredPositions = new Set(
					cards
						.filter((card) => card.skill === LOCATE_SKILL_ID && card.acquiredAt !== null)
						.map((card) => noteOnStringSet.itemKey(card.item as LocateItem))
				);
				// The triads' cards and attempts: the zone reads the anchor's, the anchor the zone's last positions.
				const ofTriads = (x: { skill: string }) =>
					x.skill === CHORD_ANCHOR_SKILL_ID || x.skill === CHORD_ZONE_SKILL_ID;
				const triadAttempts = attempts.filter(ofTriads);
				const subject = triadSubject({
					skill,
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
	 * The exercise an exercise session played, when the registry still holds it with levels and a
	 * round that writes a figure.
	 */
	const sessionExerciseOf = (record: SessionRecord) => {
		if (sessionKindOf(record) !== 'exercise' || record.exercise === undefined) return undefined;
		const played = exerciseFound(record.exercise);
		return played?.levels && played.levels.length > 0 && writesFigure(played) ? played : undefined;
	};

	return {
		settings: deps.settings,
		// The data a backup replaces includes the imported files: the registries follow it.
		backup: {
			exportAll: () => deps.backup.exportAll(),
			importAll: async (file) => {
				await deps.backup.importAll(file);
				await deps.definitions.reload();
			}
		},
		definitions: deps.definitions,
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
			const due = (skill: TriadSkill) =>
				reviewableCards(
					cards.filter((card) => card.skill === skill),
					last,
					deps.now()
				).length;
			return {
				anchorDue: due(CHORD_ANCHOR_SKILL_ID),
				zoneDue: triadZoneOpen(cards) ? due(CHORD_ZONE_SKILL_ID) : null
			};
		},

		async gesture() {
			const cards = await deps.cards.all();
			return { open: gestureExercises().some((definition) => gestureOpen(definition, cards)) };
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
			const ofTrack = (x: { skill: string }) => isNeck(x) === !isTriadsKind(sessionKindOf(record));
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
			if (kind === 'learn' || kind === 'free') {
				// The neck's subject reads both of its exercises.
				requireExercises([LOCATE_NECK_ID, IDENTIFY_NECK_ID]);
				return startNotes(kind);
			}
			// The triad subject reads the anchor and the zone.
			requireExercises([TRIADS_ANCHOR_ID, TRIADS_ZONE_ID]);
			return startTriads(kind === 'triads-zone' ? CHORD_ZONE_SKILL_ID : CHORD_ANCHOR_SKILL_ID);
		},

		async startExercise(exerciseId) {
			// An exercise played on its own, free play: the series plays it at the level it holds.
			if (!exerciseSessionExercises().some((exercise) => exercise.id === exerciseId)) {
				throw new Error(`Exercise ${exerciseId} is not played in an exercise session`);
			}
			const definition = exerciseOf(exerciseId);
			// Alone in its session: only the sensors its round names open.
			return playSession('exercise', [definition.id], async () => ({
				source: createExerciseItemSource(definition),
				durationMs: SESSION_MS
			}));
		}
	};
}
