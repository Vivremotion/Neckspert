import type { BackupFile } from '$lib/domain/types';

/** Revoking the object URL right after the click can cancel the download in some browsers. */
const REVOKE_DELAY_MS = 1000;

export function backupFileName(exportedAt: number): string {
	const date = new Date(exportedAt);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `neckspert-play-${date.getFullYear()}-${month}-${day}.json`;
}

export function parseBackupJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error('Backup file is not valid JSON');
	}
}

export async function readBackupFile(file: File): Promise<unknown> {
	return parseBackupJson(await file.text());
}

export function downloadBackup(file: BackupFile): void {
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = backupFileName(file.exportedAt);
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
