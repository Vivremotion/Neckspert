import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { placementTargets, pitchOnString } from '$lib/domain/music';
import {
	buildFreePlan,
	buildNeckMap,
	buildPlacementPlan,
	computeHomeStats,
	createLearnSelector,
	createListSelector,
	summarizeSession,
	type SessionSelector
} from '$lib/domain/progress';
import type { SessionKind } from '$lib/domain/types';

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
			const [cards, attempts, sessions] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.sessions.list()
			]);
			return buildNeckMap({
				cards,
				attempts,
				sessions,
				pitchAt: pitchOnString
			});
		},

		async startSession(kind: SessionKind) {
			const makeSelector = async (sessionId: string): Promise<SessionSelector> => {
				const [settings, cards] = await Promise.all([deps.settings.get(), deps.cards.all()]);
				if (kind === 'placement') {
					return createListSelector(
						buildPlacementPlan({
							targets: placementTargets(),
							tempoBpm: settings.tempoBpm,
							random: deps.random
						})
					);
				}
				if (kind === 'free') {
					return createListSelector(buildFreePlan({ cards, random: deps.random }));
				}
				return createLearnSelector({
					cards,
					attempts: await deps.attempts.all(),
					sessionId,
					tempoBpm: settings.tempoBpm
				});
			};
			return new SessionController({ id: deps.newId(), kind }, makeSelector, deps);
		}
	};
}
