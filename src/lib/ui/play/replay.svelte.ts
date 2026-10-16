import type { PlaySessionController } from '$lib/application/session/contract';

/** « Réécouter » of one session, shared by the frame (R, the pause menu) and the view (breath). */
export interface ReplayGate {
	/** A replay was asked and has not come back yet. */
	readonly pending: boolean;
	/** Asks the controller to replay, unless one is under way or it offers none. */
	run(): void;
}

class Gate implements ReplayGate {
	pending = $state(false);

	constructor(private readonly controller: PlaySessionController) {}

	run(): void {
		const replay = this.controller.replay;
		if (this.pending || !replay) return;
		this.pending = true;
		replay
			.call(this.controller)
			.catch((error: unknown) => {
				console.warn('The replay of the last run failed', error);
			})
			.finally(() => {
				this.pending = false;
			});
	}
}

const gates = new WeakMap<PlaySessionController, Gate>();

/** The one replay gate of a session: a second ask while one plays starts nothing. */
export function replayOf(controller: PlaySessionController): ReplayGate {
	let gate = gates.get(controller);
	if (!gate) {
		gate = new Gate(controller);
		gates.set(controller, gate);
	}
	return gate;
}
