import { describe, expect, it } from 'vitest';
import { readZip } from './testing/readZip';
import { crc32, zipStore } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
	it('matches the standard check value', () => {
		expect(crc32(text('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array(0))).toBe(0);
	});
});

describe('zipStore', () => {
	it('writes files a reader finds back, names in UTF-8, stored without compression', () => {
		const files = [
			{ path: 'apprentissage.json', bytes: text('{"a":1}') },
			{ path: 'prises/é/evenements.jsonl', bytes: new Uint8Array([0, 1, 2, 255]) }
		];
		const entries = readZip(zipStore(files, new Date(2026, 9, 7, 12, 30, 10)));
		expect(entries.map((e) => e.path)).toEqual(files.map((f) => f.path));
		expect(entries.map((e) => Array.from(e.bytes))).toEqual(files.map((f) => Array.from(f.bytes)));
		expect(entries.every((e) => e.method === 0 && (e.flags & 0x0800) !== 0)).toBe(true);
	});

	it('writes an empty archive', () => {
		expect(readZip(zipStore([]))).toEqual([]);
	});
});
