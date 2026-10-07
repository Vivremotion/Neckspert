/** Revoking the object URL right after the click can cancel the download in some browsers. */
const REVOKE_DELAY_MS = 1000;

export function diagnosticArchiveName(at: number): string {
	const date = new Date(at);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `neckspert-diagnostic-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

export function downloadDiagnosticArchive(archive: Blob, at: number = Date.now()): void {
	const url = URL.createObjectURL(archive);
	const link = document.createElement('a');
	link.href = url;
	link.download = diagnosticArchiveName(at);
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
