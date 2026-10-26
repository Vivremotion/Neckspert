import type { PlaySessionController, PlayView } from '$lib/application/session/contract';
import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';

/** A session whose view a test sets by hand; it counts what the frame asks of it. */
export class StageController implements PlaySessionController {
	readonly sessionId = 'stage-test';
	readonly view: PlayView = $state({
		status: 'idle',
		prompt: null,
		lastVerdict: null,
		tempoBpm: DEFAULT_TEMPO_BPM,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		followUp: null,
		chordDiagram: 'strings',
		leadBeats: null,
		history: [],
		answerChoices: null,
		fatigueDetected: false,
		scene: 'guitar',
		countdown: null,
		preview: null,
		contest: null,
		audioError: null,
		stage: null
	});
	nowBeat = 0;
	readonly timeline = { nowBeat: () => this.nowBeat };
	readonly calls: string[] = [];

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
