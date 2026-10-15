/** A pitchless attack: something was struck, whatever it was. */
export interface AttackEvent {
	/** Attack time on the audio clock, in seconds, before latency correction. */
	time: number;
	/** Flux of the attack against the strongest of the last seconds, in [0, 1]. */
	strength: number;
	/** The input channel it came from, when the input has several. */
	channel?: number;
}

/** Pitchless attacks from an input. Listening starts with the first listener and stops with the last. */
export interface AttackDetectorPort {
	onAttack(callback: (attack: AttackEvent) => void): () => void;
}
