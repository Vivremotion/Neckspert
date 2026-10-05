import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { DEFAULT_TEMPO_BPM, IDENTIFY_NECK, LOCATE_NECK, startTempo } from '$lib/domain/exercise';
import { mechanicRules } from '$lib/domain/mechanics';
import { pitchOnString } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	computeHomeStats,
	createLearnSelector,
	createListSelector,
	summarizeSession
} from '$lib/domain/progress';
import type { Execution, SessionKind } from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & { backup: BackupPort; calibration: CalibrationPort }
): AppServices {
	return {
		settings: deps.settings,
		backup: deps.backup,
		detector: deps.detector,
		calibration: deps.calibration,

		async homeStats() {
			const [cards, attempts, settings] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.settings.get()
			]);
			return computeHomeStats({
				cards,
				attempts,
				settings,
				now: deps.now()
			});
		},

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
			return summarizeSession({
				record,
				attempts,
				allAttempts,
				cards,
				now: deps.now()
			});
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			return buildNeckMap({ cards, attempts, pitchAt: pitchOnString });
		},

		async startSession(kind: SessionKind) {
			// Read again for each series, so a new one starts at the tempo the last one reached.
			const prepare = async (sessionId: string) => {
				const [cards, attempts, progressions] = await Promise.all([
					deps.cards.all(),
					deps.attempts.all(),
					deps.progressions.all()
				]);
				const executions: Execution[] = [LOCATE_NECK, IDENTIFY_NECK].map((e) => ({
					exerciseId: e.id,
					tempoBpm: mechanicRules(e.mechanic).timing.usesTempo ? startTempo(e, progressions) : null
				}));
				// The learn selector fits learned leads to the locate tempo.
				const locateTempo =
					executions.find((e) => e.exerciseId === LOCATE_NECK.id)?.tempoBpm ?? DEFAULT_TEMPO_BPM;
				const selector =
					kind === 'free'
						? createListSelector(buildFreePlan({ cards, random: deps.random }))
						: createLearnSelector({
								cards,
								attempts,
								sessionId,
								tempoBpm: locateTempo,
								random: deps.random
							});
				return { selector, executions };
			};
			return new SessionController({ id: deps.newId(), kind }, prepare, deps);
		}
	};
}
