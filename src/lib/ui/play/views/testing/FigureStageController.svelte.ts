import { StageController } from './StageController.svelte';

/** A stage session that plays figures: it offers « Écouter la figure » and « Réécouter ». */
export class FigureStageController extends StageController {
	private ended: (() => void) | null = null;

	listen(): void {
		this.calls.push('listen');
	}

	/** Pending until `finishReplay`, as a replay lasts the run it plays. */
	replay(): Promise<void> {
		this.calls.push('replay');
		return new Promise((resolve) => {
			this.ended = resolve;
		});
	}

	finishReplay(): void {
		this.ended?.();
		this.ended = null;
	}
}
