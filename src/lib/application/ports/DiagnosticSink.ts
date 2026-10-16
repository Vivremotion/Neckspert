/** A block of the input's sound, as kept by the diagnostic journal. */
export interface DiagnosticAudioChunk {
	/** Audio time (s) of the first sample. */
	audioTime: number;
	sampleRate: number;
	samples: Int16Array;
}

/**
 * The diagnostic journal, written by adapters only (input, sensors): neither the core nor the
 * mechanics know it exists. Event kinds are free strings prefixed by their producer
 * (`input.opened`, `chord.report`…); the journal does not read them.
 */
export interface DiagnosticSink {
	/** False: nothing is recorded, and producers prepare nothing. */
	readonly enabled: boolean;
	/**
	 * Development option, read when the input opens: record the sound at the input's own rate
	 * instead of 16 kHz. Absent or false: 16 kHz.
	 */
	readonly nativeRate?: boolean;
	event(kind: string, audioTime: number, data: unknown): void;
	audio(chunk: DiagnosticAudioChunk): void;
}

/** What the input says about itself when a take opens. */
export interface DiagnosticInputInfo {
	label: string;
	sampleRate: number;
	channelCount: number;
	/** Gain applied to the built-in mic; 1 for any other input. */
	builtInGain: number;
}

export interface DiagnosticTakeOpening {
	/** Wall-clock time (ms) of the opening. */
	startedAt: number;
	/** Audio time (s) at the same instant. */
	startedAudioTime: number;
	input: DiagnosticInputInfo;
}

/**
 * A take spans one opening of the input. Known to the input and the composition only, not to
 * the producers.
 */
export interface DiagnosticTakes {
	openTake(take: DiagnosticTakeOpening): Promise<void>;
	closeTake(endedAt: number): Promise<void>;
}

/** Tells when a take starts being recorded or stops, for adapters that follow the journal. */
export interface DiagnosticTakeNotices {
	/**
	 * Called with true once a take's opening has settled with the journal recording it, with false
	 * when it settles with the journal off and when a take closes or is cleared.
	 */
	onTake(listener: (enabled: boolean) => void): () => void;
}
