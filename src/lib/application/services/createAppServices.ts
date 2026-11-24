import type {
	AppServices,
	DiagnosticsService,
	LibraryEntry,
	RoutineEntry
} from '$lib/application/app';
import { exerciseTitle } from '$lib/application/session/playOrigin';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import type { DefinitionsService } from '$lib/application/definitions/service';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { summarizeExercise } from '$lib/application/session/series/exerciseSummary';
import { SESSION_MS, summarizeSeries } from '$lib/domain/session';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { passagesOpen } from '$lib/domain/exercise/passage/opens';
import { createPassageSource } from '$lib/domain/session/passageSource';
import {
	allExercises,
	aloneSourceOf,
	exerciseById,
	findExercise,
	UNKNOWN_EXERCISE,
	writesFigure,
	type ExerciseDefinition,
	type ExerciseId
} from '$lib/domain/exercise';
import { pitchOnString } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	createListSource,
	type ItemSource,
	lastAttemptByCard,
	nextReviewAt,
	reviewableCards,
	sessionPlayed,
	summarizeSession
} from '$lib/domain/progress';
import {
	asksDirectRecall,
	createLearningProcedure,
	DEFAULT_SET_LEARNING,
	exerciseLearningOf,
	exerciseSubject,
	type DirectRecall,
	type LearningSubject
} from '$lib/domain/learning';
import { hasCards } from '$lib/domain/skill/registry';
import {
	findRoutine,
	opened,
	routines as registeredRoutines,
	type Known
} from '$lib/domain/routine';
import {
	type Attempt,
	type LevelState,
	type CardKey,
	type CardState,
	type PlannedItem,
	type SessionSummary,
	type SessionOrigin,
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
	/**
	 * What a series prepares: its source, its length, its skills' direct recall, and whether an
	 * item's level asks one (only there may its attempt count cold).
	 */
	type PreparedSeries = {
		source: ItemSource;
		durationMs: number;
		recall?: (skill: SkillId) => DirectRecall;
		countsCold?: (item: PlannedItem) => boolean;
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
	 * The exercises of every registered routine a file defines: a routine's session opens their
	 * sensors (D9), its observations of the others kept on its attempts. Read at each start: the
	 * files may have changed since the last.
	 */
	const routinePlays = (): ExerciseId[] =>
		[...new Set(registeredRoutines().flatMap((routine) => routine.exercises))].filter(
			(id) => exerciseFound(id) !== undefined
		);
	/**
	 * The cards a session can serve. A card of a skill with cards that a registered exercise
	 * practises is served only when one of those exercises lists it (`exerciseSubject(...).owns`);
	 * one none lists, or whose key its set cannot read, stays stored and is ignored. A skill no
	 * registered exercise practises is left as it is.
	 */
	const servedCards = <T extends { skill: SkillId; key: CardKey }>(cards: readonly T[]): T[] => {
		const owners = new Map<string, LearningSubject['owns'][]>();
		for (const { id } of allExercises()) {
			const found = exerciseFound(id);
			if (!found || !hasCards(found.practices)) continue;
			const owns = exerciseSubject({ exercises: [found], attempts: [] }).owns;
			owners.set(found.practices, [...(owners.get(found.practices) ?? []), owns]);
		}
		return cards.filter((card) => {
			const own = owners.get(card.skill);
			return own === undefined || own.some((owns) => owns(card));
		});
	};

	/**
	 * A session on the session controller: `prepare` reads the stores again for each series, so a
	 * new one starts at the levels the last one reached (the series reads its exercise levels
	 * itself); each item is a round compiled from its exercise's data. It opens the sensors of the
	 * presenters of the exercises it `plays`.
	 */
	const playSession = async (
		origin: SessionOrigin,
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
		return new SessionController({ id: deps.newId(), origin }, prepare, {
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
					...(series.recall && { recall: series.recall, levels: deps.levels }),
					...(series.countsCold && { countsCold: series.countsCold })
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
	 * A session of memory exercises (`ids`, in the order they introduce), played on the session
	 * controller: the learning procedure on the subject they write, with the levels stored, or,
	 * `free`, a fixed list drawn among the items they list. It reads the cards and attempts of the
	 * skills they practise and of those their entry reads (`params.learning.enter`): an item may
	 * enter on another skill's card. Each item a round of its exercise's template.
	 */
	const playMemory = (
		origin: SessionOrigin,
		plays: readonly ExerciseId[],
		ids: readonly ExerciseId[],
		free: boolean
	) =>
		playSession(origin, plays, async (sessionId) => {
			const [cards, attempts, levels] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.levels.all()
			]);
			const exercises = ids.map((id) => exerciseOf(id));
			const skills = new Set<SkillId>();
			for (const exercise of exercises) {
				skills.add(exercise.practices);
				const enter = exerciseLearningOf(exercise).enter;
				if (enter) skills.add(enter.acquired.skill);
			}
			const read = (x: { skill: SkillId }) => skills.has(x.skill);
			const ownAttempts = attempts.filter(read);
			const subject = exerciseSubject({ exercises, attempts: ownAttempts });
			const source = free
				? createListSource(
						buildFreePlan({
							exercises,
							subject,
							levels,
							random: deps.random
						})
					)
				: createLearningProcedure({
						subject,
						cards: cards.filter(read),
						attempts: ownAttempts,
						levels,
						sessionId,
						random: deps.random,
						// The session's settings for the whole set: today's, until written as data.
						set: DEFAULT_SET_LEARNING
					});
			return {
				source,
				durationMs: SESSION_MS,
				recall: (skill) => subject.recall(skill),
				countsCold: (item) =>
					item.level !== undefined && asksDirectRecall(subject.ladder(item.skill), item.level)
			};
		});

	/**
	 * A session of exercises that write passages (`ids`, in order), played on the session
	 * controller: each in turn, a passage each, at its own exercise level, which the series holds;
	 * each change a round of its exercise's template.
	 */
	const playPassages = (
		origin: SessionOrigin,
		plays: readonly ExerciseId[],
		ids: readonly ExerciseId[]
	) =>
		playSession(origin, plays, async (sessionId) => {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			const exercises = ids.map((id) => exerciseOf(id));
			const skills = new Set(exercises.map((exercise) => exercise.practices));
			const source = createPassageSource({
				exercises,
				cards,
				attempts: attempts.filter((attempt) => skills.has(attempt.skill)),
				sessionId,
				durationMs: SESSION_MS
			});
			return { source, durationMs: SESSION_MS };
		});

	/** What a routine's session plays, deduced from its exercises: no routine is named. */
	const startRoutine = async (
		routineId: string,
		options: { free?: boolean } = {}
	): Promise<SessionController> => {
		const routine = findRoutine(routineId);
		if (!routine) throw new Error(`Unknown routine: ${routineId}`);
		// Its exercises are what it plays: an error names the first no file defines.
		requireExercises(routine.exercises);
		const exercises = routine.exercises.map((id) => exerciseFound(id)!);
		const plays = routinePlays();
		if (exercises.every((exercise) => hasCards(exercise.practices))) {
			const origin: SessionOrigin = options.free
				? { routine: routine.id, free: true }
				: { routine: routine.id };
			return playMemory(origin, plays, routine.exercises, options.free === true);
		}
		if (options.free) {
			throw new Error(`Routine ${routine.id} is not played freely: its exercises have no memory`);
		}
		if (exercises.every((exercise) => exercise.passages !== undefined)) {
			return playPassages({ routine: routine.id }, plays, routine.exercises);
		}
		throw new Error(`Routine ${routine.id} mixes memory exercises and others`);
	};

	/** The series of a session still in memory, and the runs whose take is still held. */
	const seriesInMemory = (
		sessionId: string,
		attempts: readonly Attempt[]
	): Pick<SessionSummary, 'series' | 'replayable'> => {
		const playback = deps.memory.get(sessionId);
		const series = playback?.trace.children.find((segment) => segment.role === 'series');
		if (!playback || !series) return {};
		const summary = summarizeSeries({ series, attempts });
		const replayable = summary.runs
			.map((run) => run.id)
			.filter((id) => {
				const take = playback.takes.get(id);
				return take !== undefined && deps.takes.holds(take.from, take.to);
			});
		return { series: summary, replayable };
	};

	/**
	 * The cards `exercises` list (`exerciseSubject(...).owns`), of the skills with cards they
	 * practise: what the home counts for a routine and the summary for a session. A card of a skill
	 * no exercise of theirs practises, or none of them lists, is not counted.
	 */
	const cardsListedBy = <T extends CardState>(
		exercises: readonly ExerciseDefinition[],
		cards: readonly T[]
	): T[] => {
		const owners = exercises
			.filter((exercise) => hasCards(exercise.practices))
			.map((exercise) => ({
				skill: exercise.practices,
				owns: exerciseSubject({ exercises: [exercise], attempts: [] }).owns
			}));
		return cards.filter((card) =>
			owners.some(({ skill, owns }) => skill === card.skill && owns(card))
		);
	};

	/**
	 * The exercise a session played alone, when the registry still holds it with levels and a
	 * round that writes a figure.
	 */
	const sessionExerciseOf = (record: SessionRecord) => {
		if (record.exercise === undefined) return undefined;
		const played = exerciseFound(record.exercise);
		return played?.levels && played.levels.length > 0 && writesFigure(played) ? played : undefined;
	};

	/** The keys of the cards marked acquired, as the passages' openings read them. */
	const acquiredKeysOf = (cards: readonly CardState[]): Set<CardKey> =>
		new Set(cards.filter((card) => card.acquiredAt !== null).map((card) => card.key));

	/**
	 * Whether `startExercise` plays the exercise alone with something to play now: what it would
	 * refuse (`aloneSourceOf` null) never is, and a passages exercise needs an open index.
	 * Playable implies it starts; the converse does not hold on purpose: a passages exercise with
	 * no open index starts and ends at once on the summary, and the Library shows no link for it.
	 */
	const playableAlone = (exercise: ExerciseDefinition, acquired: ReadonlySet<CardKey>): boolean => {
		const source = aloneSourceOf(exercise);
		return source !== null && (source !== 'passages' || passagesOpen(exercise, acquired));
	};

	/** What the home is told of the routines, read once from the stores; one entry per routine. */
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
		const acquiredKeys = acquiredKeysOf(cards);
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
			const memory =
				exercises.length > 0 && exercises.every((exercise) => hasCards(exercise.practices));
			let playable: boolean;
			// A routine of memory exercises stays offered once one of its skills has a served card.
			let holdsCard = false;
			let due: number | null = null;
			let next: number | null = null;
			if (memory) {
				// Its reviews are those of the cards its exercises list.
				const subject = exerciseSubject({ exercises, attempts });
				const own: CardState[] = cardsListedBy(exercises, cards);
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
				nextReviewAt: next
			};
		};
		/** Its entry; a throw computing it (a damaged imported file) closes it, the others told. */
		const guardedEntryOf = (
			routine: ReturnType<typeof registeredRoutines>[number]
		): RoutineEntry => {
			try {
				return entryOf(routine);
			} catch (error) {
				console.error(`[home] ${routine.id}: cannot tell whether it opens`, error);
				return {
					id: routine.id,
					title: routine.title,
					open: false,
					due: null,
					nextReviewAt: null
				};
			}
		};
		return registeredRoutines().map(guardedEntryOf);
	};

	/**
	 * The Library's order of presentation, not a ranking: the exercises of the routines in the
	 * order registered, each routine's as it writes them, an exercise once at its first routine;
	 * then those no routine lists, in the order registered.
	 */
	const libraryOrder = (): ExerciseId[] => {
		const registered = allExercises().map((exercise) => exercise.id);
		const listed = registeredRoutines().flatMap((routine) => routine.exercises);
		return [...new Set([...listed.filter((id) => registered.includes(id)), ...registered])];
	};

	/** What the Library is told of every exercise of the registry, read once from the stores. */
	const libraryEntries = async (): Promise<LibraryEntry[]> => {
		const [cards, levels] = await Promise.all([deps.cards.all(), deps.levels.all()]);
		const now = deps.now();
		const acquired = acquiredKeysOf(cards);
		const routines = registeredRoutines();
		/** Whether it is playable; a throw telling it leaves it unplayable, the others told. */
		const playableOf = (exercise: ExerciseDefinition): boolean => {
			try {
				return playableAlone(exercise, acquired);
			} catch (error) {
				console.error(`[library] ${exercise.id}: cannot tell whether it plays`, error);
				return false;
			}
		};
		return libraryOrder().flatMap((id) => {
			const exercise = exerciseFound(id);
			if (!exercise) return [];
			return [
				{
					exerciseId: id,
					title: exerciseTitle(id, exerciseFound),
					routines: routines
						.filter((routine) => routine.exercises.includes(id))
						.map((routine) => routine.title),
					playable: playableOf(exercise)
				}
			];
		});
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

		routines: routineEntries,

		library: libraryEntries,

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

		async sessionSummary(sessionId: string) {
			const record = await deps.sessions.get(sessionId);
			if (!record) {
				throw new Error(`Unknown session: ${sessionId}`);
			}
			const attempts = await deps.attempts.listBySession(sessionId);
			const played = sessionPlayed(record, attempts);
			// The memory block's reviews read every stored attempt and card: only for a session of
			// memory, of the skills it played, the cards its exercises list (D2: an exercise no file
			// defines lists none).
			const [allAttempts, cards] = played.memory
				? await Promise.all([deps.attempts.all(), deps.cards.all()])
				: [[], []];
			const exercise = sessionExerciseOf(record);
			const told = exercise
				? summarizeExercise({
						exercise,
						attempts,
						levelReached: record.levelReached,
						state: await deps.levels.get({ exerciseId: exercise.id, scope: '', item: '' })
					})
				: undefined;
			const summary = summarizeSession({
				record,
				attempts,
				allAttempts: allAttempts.filter((attempt) => played.skills.has(attempt.skill)),
				cards: cardsListedBy(played.exercises, cards),
				now: deps.now(),
				// The level is told for the exercise played alone whose round writes a figure.
				level: ({ exerciseId, scope }) =>
					told && exerciseId === exercise?.id && scope === undefined ? told.level : null
			});
			return {
				...summary,
				...(!played.memory && seriesInMemory(sessionId, attempts)),
				...(told?.lastCycle && { lastCycle: told.lastCycle })
			};
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			return buildNeckMap({ cards: servedCards(cards), attempts, pitchAt: pitchOnString });
		},

		startRoutine,

		async startExercise(exerciseId) {
			requireExercises([exerciseId]);
			const definition = exerciseFound(exerciseId)!;
			// Alone in its session: only the sensors its round names open. What it plays is the
			// predicate the Library reads (`playableAlone`).
			const source = aloneSourceOf(definition);
			if (source === 'memory') {
				// A memory exercise freely, among its own items, each at the level it holds.
				return playMemory(
					{ exercise: definition.id, free: true },
					[definition.id],
					[definition.id],
					true
				);
			}
			if (source === 'passages') {
				return playPassages({ exercise: definition.id }, [definition.id], [definition.id]);
			}
			if (source === null) {
				throw new Error(`Exercise ${exerciseId} is not played in an exercise session`);
			}
			// Any other cycle after cycle, free play: the series plays it at the level it holds.
			const played = exerciseOf(exerciseId);
			return playSession({ exercise: played.id }, [played.id], async () => ({
				source: createExerciseItemSource(played),
				durationMs: SESSION_MS
			}));
		}
	};
}
