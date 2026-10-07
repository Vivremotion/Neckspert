import { describe, expect, it } from 'vitest';
import { readZip } from './testing/readZip';
import { crc32, crc32Update, ZipWriter, zipStore } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
	it('matches the standard check value', () => {
		expect(crc32(text('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array(0))).toBe(0);
	});

	it('gives the same value computed part by part', () => {
		const whole = text('123456789');
		let crc = crc32Update(0, whole.subarray(0, 4));
		crc = crc32Update(crc, whole.subarray(4));
		expect(crc).toBe(0xcbf43926);
	});
});

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('zipStore', () => {
	it('writes files a reader finds back, names in UTF-8, stored without compression', async () => {
		const files = [
			{ path: 'apprentissage.json', bytes: text('{"a":1}') },
			{ path: 'prises/é/evenements.jsonl', bytes: new Uint8Array([0, 1, 2, 255]) }
		];
		const archive = zipStore(files, new Date(2026, 9, 7, 12, 30, 10));
		expect(archive).toBeInstanceOf(Blob);
		expect(archive.type).toBe('application/zip');
		const entries = readZip(await bytesOf(archive));
		expect(entries.map((e) => e.path)).toEqual(files.map((f) => f.path));
		expect(entries.map((e) => Array.from(e.bytes))).toEqual(files.map((f) => Array.from(f.bytes)));
		expect(entries.every((e) => e.method === 0 && (e.flags & 0x0800) !== 0)).toBe(true);
	});

	it('writes an empty archive', async () => {
		expect(readZip(await bytesOf(zipStore([])))).toEqual([]);
	});
});

describe('ZipWriter', () => {
	it('writes a file given in parts, without joining them first', async () => {
		const zip = new ZipWriter(new Date(2026, 9, 7));
		zip.add('a.bin', [new Uint8Array([1, 2]), new Uint8Array(0), new Uint8Array([3])]);
		zip.add('b.txt', [text('hé')]);
		const entries = readZip(await bytesOf(zip.finish()));
		expect(entries.map((e) => [e.path, Array.from(e.bytes)])).toEqual([
			['a.bin', [1, 2, 3]],
			['b.txt', Array.from(text('hé'))]
		]);
	});
});
