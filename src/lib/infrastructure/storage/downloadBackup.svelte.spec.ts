import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBackup } from './backupFile';
import { makeBackup } from './testing/fixtures';

const OBJECT_URL = 'blob:neckspert-backup';
const createObjectURL = vi.fn<(blob: Blob) => string>(() => OBJECT_URL);
const revokeObjectURL = vi.fn<(url: string) => void>();

describe('downloadBackup', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
			writable: true
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			value: revokeObjectURL,
			configurable: true,
			writable: true
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
	});

	it('clicks a temporary link to a dated JSON file', async () => {
		const clicks: { href: string; download: string }[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
			const link = document.querySelector('a');
			if (link) clicks.push({ href: link.href, download: link.download });
		});
		const file = makeBackup({ exportedAt: new Date(2026, 8, 30, 12).getTime() });

		downloadBackup(file);

		expect(clicks).toEqual([{ href: OBJECT_URL, download: 'neckspert-play-2026-09-30.json' }]);
		expect(document.querySelector('a')).toBeNull();
		const blob = createObjectURL.mock.calls[0][0];
		expect(blob.type).toBe('application/json');
		expect(JSON.parse(await blob.text())).toEqual(file);
	});

	it('revokes the object URL once the download has started', () => {
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		downloadBackup(makeBackup());

		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
	});
});
