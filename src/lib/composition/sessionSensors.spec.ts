import { describe, expect, it } from 'vitest';
import { SESSION_SENSORS } from '$lib/application/definitions/checks';
import source from './createApp.ts?raw';

describe('the sensors a session has', () => {
	it('are the ones the composition root wires, as the definition checks list them', () => {
		// A tripwire: `SESSION_SENSORS` is a hand copy of the keys of `sensors` in `createApp`; an
		// exercise checked against a sensor the session lacks would load, then fail every session.
		const block = /\bsensors: \{([^}]*)\}/.exec(source)?.[1] ?? '';
		const wired = [...block.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
		expect(wired.length).toBeGreaterThan(0);
		expect([...wired].sort()).toEqual([...SESSION_SENSORS].sort());
	});
});
