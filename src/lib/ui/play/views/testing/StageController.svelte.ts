import type {
	PlayOrigin,
	PlaySessionController,
	PlayView
} from '$lib/application/session/contract';
import { playOriginOf } from '$lib/application/session/playOrigin';
import type { SessionOrigin } from '$lib/domain/types';
import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';

/** A session whose view a test sets by hand; it counts what the frame asks of it. */
export class StageController implements PlaySessionController {
	readonly sessionId = 'stage-test';
	/** What it plays, named as a session controller names it; none when not given. */
	readonly origin?: PlayOrigin;
	readonly view: PlayView = $state({
		status: 'idle',
		tempoBpm: DEFAULT_TEMPO_BPM,
		fatigueDetected: false,
		countdown: null,
		contest: null,
		audioError: null,
		stage: null,
		briefing: null,
		announcement: null,
		leaving: null
	});
	nowBeat = 0;
	readonly timeline = { nowBeat: () => this.nowBeat };
	readonly calls: string[] = [];

	constructor(origin?: SessionOrigin) {
		if (origin) this.origin = playOriginOf(origin);
	}

	async start(): Promise<void> {
		this.calls.push('start');
		this.view.status = 'count-in';
	}

	pause(): void {
		this.calls.push('pause');
		this.view.status = 'paused';
	}

	resume(): void {
		this.calls.push('resume');
		this.view.status = 'count-in';
	}

	answer(value: string): void {
		this.calls.push(`answer ${value}`);
	}

	contest(): void {
		this.calls.push('contest');
		this.view.contest = 'done';
	}

	quit(): void {
		this.calls.push('quit');
		this.view.status = 'finished';
	}
}
