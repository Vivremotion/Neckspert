import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { buildCurriculum, placementTargets, pitchOnString } from '$lib/domain/music';
import {
	buildDailyPlan,
	buildFreePlan,
	buildNeckMap,
	buildPlacementPlan,
	computeHomeStats,
	summarizeSession
} from '$lib/domain/progress';
import type { SessionKind } from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & { backup: BackupPort; calibration: CalibrationPort }
): AppServices {
	const curriculum = deps.curriculum.length > 0 ? deps.curriculum : buildCurriculum();

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
				curriculum,
				now: deps.now()
			});
		},

		async sessionSummary(sessionId: string) {
			const record = await deps.sessions.get(sessionId);
			if (!record) {
				throw new Error(`Unknown session: ${sessionId}`);
			}
			const [attempts, cards] = await Promise.all([
				deps.attempts.listBySession(sessionId),
				deps.cards.all()
			]);
			return summarizeSession({
				record,
				attempts,
				cards,
				now: deps.now()
			});
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([deps.cards.all(), deps.attempts.all()]);
			return buildNeckMap({
				cards,
				attempts,
				pitchAt: pitchOnString
			});
		},

		async startSession(kind: SessionKind) {
			const settings = await deps.settings.get();
			const sessionId = deps.newId();
			const now = deps.now();
			const cards = await deps.cards.all();

			const plan =
				kind === 'placement'
					? buildPlacementPlan({
							targets: placementTargets(),
							now,
							sessionId,
							tempoBpm: settings.tempoBpm,
							random: deps.random
						})
					: kind === 'daily'
						? buildDailyPlan({
								cards,
								curriculum,
								now,
								sessionId
							})
						: buildFreePlan({
								cards,
								curriculum,
								now,
								sessionId,
								random: deps.random
							});

			return new SessionController(plan, { ...deps, curriculum });
		}
	};
}
