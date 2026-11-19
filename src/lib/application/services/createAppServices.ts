import type { AppServices, DiagnosticsService, RoutineEntry } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import type { DefinitionsService } from '$lib/application/definitions/service';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { summarizeExercise } from '$lib/application/session/series/exerciseSummary';
import { levelAided } from '$lib/application/session/aids';
import { SESSION_MS, summarizeSeries } from '$lib/domain/session';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { passagesOpen } from '$lib/domain/exercise/passage/opens';
import { createPassageSource } from '$lib/domain/session/passageSource';
import {
	exerciseById,
	exerciseSessionExercises,
	figureParamsOf,
	findExercise,
	UNKNOWN_EXERCISE,
	writesFigure,
	type ExerciseDefinition,
	type ExerciseId,
	CHANGE_SKILL_IDS,
	CHORD_ANCHOR_SKILL_ID,
	CHORD_ZONE_SKILL_ID,
	GESTURE_EXERCISE_IDS,
	IDENTIFY_NECK_ID,
	LOCATE_NECK_ID,
	TRIADS_ANCHOR_ID,
	TRIADS_ZONE_ID
} from '$lib/domain/exercise';
import { pitchOnString } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	freeLeadOf,
	freeLevelOf,
	computeHomeStats,
	createListSource,
	type ItemSource,
	isNeck,
	lastAttemptByCard,
	nextReviewAt,
	reviewableCards,
	summarizeSession
} from '$lib/domain/progress';
import {
	createLearningProcedure,
	DEFAULT_SET_LEARNING,
	exerciseSubject,
	type DirectRecall,
	type LearningSubject
} from '$lib/domain/learning';
import { hasCards } from '$lib/domain/skill/registry';
import { opened, routines as registeredRoutines, type Known } from '$lib/domain/routine';
import type { TriadSkill } from '$lib/domain/triads';
import {
	isTriadsKind,
	sessionKindOf,
	type Attempt,
	type CardKey,
	type CardState,
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
		// An injected lookup says « unknown » only by throwing, as `exerciseById` does: that throw
		// alone is read as an exercise no file defines. What remains: a lookup telling an unknown
		// exercise in other words would be taken for a failure, and its error would go up.
		try {
			return deps.exercise(id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith(UNKNOWN_EXERCISE)) return undefined;
			throw error;
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
	/**
	 * The cards a session can serve. A card of a skill whose exercise a file defines is served only
	 * when that exercise lists it (`exerciseSubject(...).owns`); one it does not list, or whose key
	 * its set cannot read, stays stored and is ignored. A skill no file practises is left as it is.
	 */
	const servedCards = <T extends { skill: SkillId; key: CardKey }>(cards: readonly T[]): T[] => {
		const owners = new Map<string, LearningSubject['owns']>();
		for (const id of [LOCATE_NECK_ID, IDENTIFY_NECK_ID, TRIADS_ANCHOR_ID, TRIADS_ZONE_ID]) {
			const found = exerciseFound(id);
			if (found && hasCards(found.practices)) {
				owners.set(found.practices, exerciseSubject({ exercises: [found], attempts: [] }).owns);
			}
		}
		return cards.filter((card) => owners.get(card.skill)?.(card) ?? true);
	};
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
	 * A gesture session, played on the session controller: the passages its exercises write, in
	 * the order of the ladder, each change a round of its exercise's template.
	 */
	const startGesture = () =>
		playSession('gesture', trackExercises(), async (sessionId) => {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			// Each grid of each exercise (and the link, which plays no grid) at its own exercise
			// level, which the series holds.
			const source = createPassageSource({
				exercises: gestureExercises(),
				cards,
				attempts: attempts.filter((attempt) =>
					(CHANGE_SKILL_IDS as readonly string[]).includes(attempt.skill)
				),
				sessionId,
				durationMs: SESSION_MS
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
			// The subject the two exercises write: naming a note already located comes before a new
			// note. The neck's sessions see the neck's cards only: identify enters on locate's.
			const neckAttempts = attempts.filter(isNeck);
			const subject = exerciseSubject({ exercises: [identify, locate], attempts: neckAttempts });
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
							attempts: neckAttempts,
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
	 * the learning procedure with the subject its exercise writes, each triad a round of its
	 * exercise's template.
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
				const exercise = exerciseOf(
					skill === CHORD_ZONE_SKILL_ID ? TRIADS_ZONE_ID : TRIADS_ANCHOR_ID
				);
				// The triads' cards and attempts, both skills': the zone enters on the anchor's.
				const ofTriads = (x: { skill: string }) =>
					x.skill === CHORD_ANCHOR_SKILL_ID || x.skill === CHORD_ZONE_SKILL_ID;
				const triadAttempts = attempts.filter(ofTriads);
				const subject = exerciseSubject({ exercises: [exercise], attempts: triadAttempts });
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
	 * The exercise and scope that rest when the session's series, still in memory, ended by
	 * « On change d’air »: those of its last attempt, the round that blocked.
	 */
	const changeOfAirOf = (sessionId: string, attempts: readonly Attempt[]) => {
		const series = deps.memory.get(sessionId)?.trace.children.find((s) => s.role === 'series');
		const last = attempts.at(-1);
		if (series?.reason !== 'change-of-air' || !last) return undefined;
		return {
			exerciseId: last.exerciseId,
			...(last.scope !== undefined && last.scope !== '' && { scope: last.scope })
		};
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

	/** What the home is told of the routines, read once from the stores. */
	const routineEntries = async (): Promise<RoutineEntry[]> => {
		const [cards, attempts, levels] = await Promise.all([
			deps.cards.all(),
			deps.attempts.all(),
			deps.levels.all()
		]);
		const now = deps.now();
		const last = lastAttemptByCard(attempts);
		const history = new Map<CardKey, Attempt[]>();
		for (const attempt of [...attempts].sort((a, b) => a.promptedAt - b.promptedAt)) {
			const list = history.get(attempt.cardKey);
			if (list) list.push(attempt);
			else history.set(attempt.cardKey, [attempt]);
		}
		// Acquired as the passages' openings read it: any card marked acquired.
		const acquiredKeys = new Set(
			cards.filter((card) => card.acquiredAt !== null).map((card) => card.key)
		);
		// An opening counts the cards a session can serve: a card no list names opens nothing.
		const served = servedCards(cards);
		const known: Known = {
			acquired: (skill) =>
				served.filter((card) => card.skill === skill && card.acquiredAt !== null).length,
			level: (exercise, scope) => {
				const state = levels.find(
					(level) =>
						level.exerciseId === exercise && level.scope === (scope ?? '') && level.item === ''
				);
				// Index 0 is level 1.
				return state ? state.level + 1 : null;
			}
		};

		const entryOf = (routine: ReturnType<typeof registeredRoutines>[number]): RoutineEntry => {
			const found = routine.exercises.map((id) => exerciseFound(id));
			const exercises = found.filter((exercise) => exercise !== undefined);
			const resting = levels.some(
				(level) =>
					routine.exercises.includes(level.exerciseId) &&
					typeof level.resumeAfter === 'number' &&
					level.resumeAfter > now
			);
			const memory =
				exercises.length > 0 && exercises.every((exercise) => hasCards(exercise.practices));
			let playable: boolean;
			// A routine of memory exercises stays offered once one of its skills has a served card.
			let holdsCard = false;
			let due: number | null = null;
			let next: number | null = null;
			if (memory) {
				// Its reviews are the served cards of the skills its exercises practise.
				const subject = exerciseSubject({ exercises, attempts });
				const skills = new Set(exercises.map((exercise) => exercise.practices));
				const own: CardState[] = cards.filter(
					(card) => skills.has(card.skill) && subject.owns(card)
				);
				due = reviewableCards(own, last, now).length;
				next = nextReviewAt(own, last);
				holdsCard = own.length > 0;
				playable = holdsCard || subject.nextNew(cards, history, () => false) !== null;
			} else {
				playable = exercises.some(
					(exercise) => exercise.passages !== undefined && passagesOpen(exercise, acquiredKeys)
				);
			}
			return {
				id: routine.id,
				title: routine.title,
				// A routine one of whose exercises no file defines any more cannot be started.
				open:
					exercises.length === found.length &&
					(holdsCard || (playable && opened(routine.opens, known))),
				due,
				nextReviewAt: next,
				resting
			};
		};
		return registeredRoutines().map(entryOf);
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
			const attempts = await deps.attempts.all();
			// The gap to the beat and its trend are the neck's.
			return computeHomeStats({ attempts: attempts.filter(isNeck), now: deps.now() });
		},

		routines: routineEntries,

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
			const summary = summarizeSession({
				record,
				attempts,
				allAttempts: allAttempts.filter(ofTrack),
				cards: servedCards(cards.filter(ofTrack)),
				now: deps.now()
			});
			const rested = summary.gesture && changeOfAirOf(sessionId, attempts);
			return rested
				? { ...summary, gesture: { ...summary.gesture!, changeOfAir: rested } }
				: summary;
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			return buildNeckMap({ cards: servedCards(cards), attempts, pitchAt: pitchOnString });
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
			// A triads session plays one exercise: its subject reads that exercise's list, and the
			// zone's entry condition reads the anchor's cards, not its exercise.
			const zone = kind === 'triads-zone';
			requireExercises([zone ? TRIADS_ZONE_ID : TRIADS_ANCHOR_ID]);
			return startTriads(zone ? CHORD_ZONE_SKILL_ID : CHORD_ANCHOR_SKILL_ID);
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
