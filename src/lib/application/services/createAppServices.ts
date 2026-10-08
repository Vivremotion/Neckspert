import type { AppServices, DiagnosticsService } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import {
	DEFAULT_TEMPO_BPM,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	startTempo
} from '$lib/domain/exercise';
import { locateRules, mechanicRules } from '$lib/domain/mechanics';
import { pitchOnString, type LocateItem } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	computeHomeStats,
	createLearnSelector,
	createListSelector,
	createTriadSelector,
	isNeck,
	lastAttemptByCard,
	reviewableCards,
	summarizeSession
} from '$lib/domain/progress';
import { triadNotesToLearn } from '$lib/domain/triads';
import type { Attempt, CardState, Execution, Progression, SessionKind } from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & {
		backup: BackupPort;
		calibration: CalibrationPort;
		diagnostics: DiagnosticsService;
	}
): AppServices {
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

		async triadsDue() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			const triads = cards.filter((card) => !isNeck(card));
			return reviewableCards(triads, lastAttemptByCard(attempts), deps.now()).length;
		},

		contestAttempt: (attemptId: number) => deps.attempts.setContested(attemptId),

		async sessionSummary(sessionId: string) {
			const record = await deps.sessions.get(sessionId);
			if (!record) {
				throw new Error(`Unknown session: ${sessionId}`);
			}
			const [attempts, allAttempts, cards] = await Promise.all([
				deps.attempts.listBySession(sessionId),
				deps.attempts.all(),
				deps.cards.all()
			]);
			// Next reviews of the session's own track: the neck's, or the triads'.
			const ofTrack = (x: { mechanic: string }) => isNeck(x) === (record.kind !== 'triads');
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
			/** The two triads exercises, each at its own tempo, on the triad selector. */
			const prepareTriads = (
				sessionId: string,
				cards: CardState[],
				attempts: Attempt[],
				progressions: Progression[]
			) => {
				const executions: Execution[] = [TRIADS_ANCHOR, TRIADS_ZONE].map((e) => ({
					exerciseId: e.id,
					tempoBpm: startTempo(e, progressions)
				}));
				const acquiredPositions = new Set(
					cards
						.filter((card) => card.mechanic === locateRules.id && card.acquiredAt !== null)
						.map((card) => locateRules.itemKey(card.item as LocateItem))
				);
				const selector = createTriadSelector({
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
			// Read again for each series, so a new one starts at the tempo the last one reached.
			const prepare = async (sessionId: string) => {
				const [cards, attempts, progressions] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.progressions.all()
				]);
				if (kind === 'triads') return prepareTriads(sessionId, cards, attempts, progressions);
				const executions: Execution[] = [LOCATE_NECK, IDENTIFY_NECK].map((e) => ({
					exerciseId: e.id,
					tempoBpm: mechanicRules(e.mechanic).timing.usesTempo ? startTempo(e, progressions) : null
				}));
				// The learn selector fits learned leads to the locate tempo.
				const locateTempo =
					executions.find((e) => e.exerciseId === LOCATE_NECK.id)?.tempoBpm ?? DEFAULT_TEMPO_BPM;
				// The neck's sessions see the neck's cards only; the triads lead its notes queue.
				const neckCards = cards.filter(isNeck);
				const selector =
					kind === 'free'
						? createListSelector(buildFreePlan({ cards: neckCards, random: deps.random }))
						: createLearnSelector({
								cards: neckCards,
								attempts: attempts.filter(isNeck),
								sessionId,
								tempoBpm: locateTempo,
								random: deps.random,
								priority: triadNotesToLearn(cards)
							});
				return { selector, executions };
			};
			return new SessionController({ id: deps.newId(), kind }, prepare, deps);
		}
	};
}
