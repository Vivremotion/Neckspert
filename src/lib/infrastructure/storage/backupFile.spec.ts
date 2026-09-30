import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackupJson, readBackupFile } from './backupFile';

describe('backupFileName', () => {
	it('names the file after the local export date', () => {
		expect(backupFileName(new Date(2026, 0, 5, 12).getTime())).toBe(
			'neckspert-play-2026-01-05.json'
		);
		expect(backupFileName(new Date(2026, 11, 31, 23, 30).getTime())).toBe(
			'neckspert-play-2026-12-31.json'
		);
	});
});

describe('parseBackupJson', () => {
	it('parses JSON text', () => {
		expect(parseBackupJson('{"app":"neckspert-play"}')).toEqual({ app: 'neckspert-play' });
	});

	it('rejects text that is not JSON', () => {
		expect(() => parseBackupJson('not json')).toThrow('Backup file is not valid JSON');
	});
});

describe('readBackupFile', () => {
	it('reads and parses a file', async () => {
		const file = new File(['{"version":1}'], 'backup.json', { type: 'application/json' });
		expect(await readBackupFile(file)).toEqual({ version: 1 });
	});

	it('rejects a file that is not JSON', async () => {
		await expect(readBackupFile(new File(['oops'], 'backup.json'))).rejects.toThrow(
			'Backup file is not valid JSON'
		);
	});
});
