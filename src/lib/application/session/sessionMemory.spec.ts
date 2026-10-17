import { describe, expect, it } from 'vitest';
import { TraceBuilder } from '$lib/domain/session';
import { SessionMemory, type SessionPlayback } from './sessionMemory';

function playback(sessionId: string): SessionPlayback {
	return { sessionId, trace: new TraceBuilder(0).tree(), takes: new Map(), latencyS: 0 };
}

describe('SessionMemory', () => {
	it('gives back the session it holds', () => {
		const memory = new SessionMemory();
		memory.remember(playback('a'));
		expect(memory.get('a')?.sessionId).toBe('a');
		expect(memory.get('b')).toBeNull();
	});

	it('holds only the latest session', () => {
		const memory = new SessionMemory();
		memory.remember(playback('a'));
		memory.remember(playback('b'));
		expect(memory.get('a')).toBeNull();
		expect(memory.get('b')?.sessionId).toBe('b');
	});
});
