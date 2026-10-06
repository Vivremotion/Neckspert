type Fields = Record<string, unknown>;

/** Version 2 to 3: attempts gain their observations, sessions their latency, both unknown. */
export function fromV2(file: Fields): Fields {
	const attempts = file.attempts as Fields[];
	const sessions = file.sessions as Fields[];
	return {
		...file,
		version: 3,
		attempts: attempts.map((attempt) => ({ ...attempt, observations: null })),
		sessions: sessions.map((session) => ({ ...session, latencyMs: null }))
	};
}
