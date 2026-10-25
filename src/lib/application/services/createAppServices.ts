import type { AppServices, DiagnosticsService } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { ResponseSeriesController } from '$lib/application/session/series/ResponseSeriesController.svelte';
import { summarizeExercise } from '$lib/application/session/plan/exerciseSummary';
import { levelAided } from '$lib/application/session/plan/recordCycle';
import { levelParamsOf } from '$lib/application/session/plan/rhythmExercise';
import { summarizeSeries } from '$lib/domain/session';
import { PlanSessionController } from '$lib/application/session/plan/PlanSessionController.svelte';
import type { PlanSessionDeps } from '$lib/application/session/SessionDeps';
import { GESTURE_EXERCISES, gestureOpen, gesturePlan, openElements } from '$lib/domain/gesture';
import {
	exerciseById,
	type ExerciseDefinition,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	startTempo
} from '$lib/domain/exercise';
import { locateRules, type ChordGridItem } from '$lib/domain/mechanics';
import { pitchOnString, type LocateItem } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	computeHomeStats,
	createGestureSelector,
	createListSource,
	createTriadSelector,
	type ItemSource,
	isNeck,
	triadZoneOpen,
	type TriadMechanic,
	lastAttemptByCard,
	reviewableCards,
	summarizeSession
} from '$lib/domain/progress';
import { neckPlan } from '$lib/domain/progress/neckPlans';
import { neckSubject } from '$lib/domain/progress/neckSubject';
import { createLearningProcedure, type DirectRecall } from '$lib/domain/learning';
import type { PlanSource } from '$lib/application/session/series/planSource';
import { triadNotesToLearn } from '$lib/domain/triads';
import {
	isTriadsKind,
	type Attempt,
	type CardState,
	type ExerciseSummary,
	type MechanicId,
	type Execution,
	type Progression,
	type SessionKind,
	type SessionRecord
} from '$lib/domain/types';

export function createAppServices(
	deps: PlanSessionDeps & {
		backup: BackupPort;
		calibration: CalibrationPort;
		diagnostics: DiagnosticsService;
		/** The development tools show (« Joué juste » on the gesture): a development build only. */
		development?: boolean;
	}
): AppServices {
	/** What a series prepares: its source, its executions, and its mechanics' direct recall. */
	type PreparedSeries = {
		source: ItemSource;
		executions: Execution[];
		recall?: (mechanic: MechanicId) => DirectRecall;
	};

	/**
	 * A session on the response series: `prepare` reads the stores again for each series, so a
	 * new one starts at the tempo and the levels the last one reached; each change or note is a
	 * round of `plans`.
	 */
	const responseSeries = async (
		kind: SessionKind,
		prepareSeries: (sessionId: string) => Promise<PreparedSeries>,
		plans: PlanSource
	): Promise<ResponseSeriesController> => {
		const { locale } = await deps.settings.get();
		/** What each series prepared, by session id: its recorder is told about it. */
		const prepared = new Map<string, PreparedSeries>();
		const prepare = async (sessionId: string) => {
			const series = await prepareSeries(sessionId);
			prepared.set(sessionId, series);
			return { source: series.source, executions: series.executions };
		};
		return new ResponseSeriesController({ id: deps.newId(), kind }, prepare, {
			clock: deps.clock,
			sounds: deps.sounds,
			detector: deps.detector,
			sensors: deps.sensors,
			mechanics: deps.mechanics,
			repositories: {
				attempts: deps.attempts,
				sessions: deps.sessions,
				settings: deps.settings,
				progressions: deps.progressions
			},
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
			plans,
			exercise: deps.exercise ?? exerciseById,
			locale: () => locale,
			newId: deps.newId,
			development: deps.development ?? false,
			random: deps.random
		});
	};

	/**
	 * A gesture session, played on the response series: the gesture selector serves the open
	 * exercises in the order of the ladder, each change a round of `gesturePlan`.
	 */
	const startGesture = () =>
		responseSeries(
			'gesture',
			async (sessionId) => {
				const [cards, attempts, progressions] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.progressions.all()
				]);
				// The open exercises in the order of the ladder: one tempo per grid open in each,
				// one for the link, which plays no grid.
				const definitions = GESTURE_EXERCISES.filter((definition) =>
					gestureOpen(definition, cards)
				);
				const executions: Execution[] = definitions.flatMap((definition) => {
					const grids = [
						...new Set(openElements(definition, cards).map((element) => element.gridId))
					];
					return grids.map((scope) => ({
						exerciseId: definition.id,
						...(scope !== undefined && { scope }),
						tempoBpm: startTempo(definition, progressions, scope)
					}));
				});
				const source = createGestureSelector({
					definitions,
					cards,
					attempts: attempts.filter((attempt) => attempt.mechanic === 'chord-grid'),
					sessionId
				});
				return { source, executions };
			},
			(item, meter) => gesturePlan(item.item as ChordGridItem, meter)
		);

	/**
	 * A session of the notes, played on the response series: learn on the learning procedure,
	 * with the levels stored, free play on a fixed list; each note a round of `neckPlan`.
	 */
	const startNotes = (kind: 'learn' | 'free') =>
		responseSeries(
			kind,
			async (sessionId) => {
				const [cards, attempts, progressions, levels] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.progressions.all(),
					deps.levels.all()
				]);
				// Locate plays on the click at its own tempo; identify is answered in free time.
				const executions: Execution[] = [
					{ exerciseId: LOCATE_NECK.id, tempoBpm: startTempo(LOCATE_NECK, progressions) },
					{ exerciseId: IDENTIFY_NECK.id, tempoBpm: null }
				];
				// The neck's sessions see the neck's cards only; the triads lead its notes queue.
				const subject = neckSubject({
					definitions: { locate: LOCATE_NECK, identify: IDENTIFY_NECK },
					priority: triadNotesToLearn(cards)
				});
				const neckCards = cards.filter(isNeck);
				const source =
					kind === 'free'
						? createListSource(buildFreePlan({ cards: neckCards, random: deps.random }))
						: createLearningProcedure({
								subject,
								cards: neckCards,
								attempts: attempts.filter(isNeck),
								levels,
								sessionId,
								// The ladders fit the leads to a tempo: identify plays without one.
								tempos: Object.fromEntries(
									executions.flatMap(({ exerciseId, tempoBpm }) =>
										tempoBpm === null ? [] : [[exerciseId, tempoBpm]]
									)
								),
								random: deps.random
							});
				return { source, executions, recall: (mechanic) => subject.recall(mechanic) };
			},
			neckPlan
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
					levelParamsOf(exercise, (attempt.data as { level?: number } | null)?.level ?? 0)
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

	/** The rhythm exercise a session played, when its exercise is still in the catalog with levels. */
	const rhythmExerciseOf = (record: SessionRecord) => {
		if (record.kind !== 'exercise' || record.exerciseId === undefined) return undefined;
		try {
			const exercise = (deps.exercise ?? exerciseById)(record.exerciseId);
			return exercise.levels && exercise.levels.length > 0 && exercise.base ? exercise : undefined;
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
			const exercise = rhythmExerciseOf(record);
			if (exercise) {
				// A rhythm exercise: its own cycles and the level it ended on, nothing of the neck.
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
			/** One triads exercise, at its own tempo, on the triad selector. */
			const prepareTriads = (
				mechanic: TriadMechanic,
				sessionId: string,
				cards: CardState[],
				attempts: Attempt[],
				progressions: Progression[]
			) => {
				const exercise = mechanic === 'triad-zone' ? TRIADS_ZONE : TRIADS_ANCHOR;
				const executions: Execution[] = [
					{ exerciseId: exercise.id, tempoBpm: startTempo(exercise, progressions) }
				];
				const acquiredPositions = new Set(
					cards
						.filter((card) => card.mechanic === locateRules.id && card.acquiredAt !== null)
						.map((card) => locateRules.itemKey(card.item as LocateItem))
				);
				const selector = createTriadSelector({
					mechanic,
					cards,
					attempts,
					sessionId,
					definitions: { anchor: TRIADS_ANCHOR, zone: TRIADS_ZONE },
					acquiredPositions,
					tempos: Object.fromEntries(executions.map((e) => [e.exerciseId, e.tempoBpm])),
					random: deps.random
				});
				return { selector, executions };
			};
			const mechanic: TriadMechanic = kind === 'triads-zone' ? 'triad-zone' : 'triad-anchor';
			// Read again for each series, so a new one starts at the tempo the last one reached.
			const prepare = async (sessionId: string) => {
				const [cards, attempts, progressions] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.progressions.all()
				]);
				return prepareTriads(mechanic, sessionId, cards, attempts, progressions);
			};
			return new SessionController({ id: deps.newId(), kind }, prepare, deps);
		},

		async startExercise(exerciseId) {
			return new PlanSessionController({ id: deps.newId(), exerciseId }, deps);
		}
	};
}
