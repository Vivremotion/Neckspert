import { crc32 } from '../zip';

export interface ZipEntry {
	path: string;
	bytes: Uint8Array;
	/** General purpose flags of the central directory record. */
	flags: number;
	method: number;
}

/**
 * A minimal reader for STORE archives: walks the central directory from the end record, checks
 * each local header against it, and checks every CRC32.
 */
export function readZip(archive: Uint8Array): ZipEntry[] {
	const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
	const end = archive.length - 22;
	if (view.getUint32(end, true) !== 0x06054b50) throw new Error('No end of central directory');
	const count = view.getUint16(end + 10, true);
	if (view.getUint16(end + 8, true) !== count) throw new Error('Entry counts differ');
	const directorySize = view.getUint32(end + 12, true);
	let at = view.getUint32(end + 16, true);
	if (at + directorySize !== end) throw new Error('Central directory misplaced');
	const decoder = new TextDecoder();
	const entries: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Bad central record');
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 20, true);
		if (view.getUint32(at + 24, true) !== size) throw new Error('Sizes differ');
		const nameLength = view.getUint16(at + 28, true);
		const extra = view.getUint16(at + 30, true);
		const comment = view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		const path = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));

		if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`Bad local header: ${path}`);
		if (view.getUint32(local + 14, true) !== crc) throw new Error(`Local CRC differs: ${path}`);
		const localName = view.getUint16(local + 26, true);
		const localExtra = view.getUint16(local + 28, true);
		if (decoder.decode(archive.subarray(local + 30, local + 30 + localName)) !== path) {
			throw new Error(`Local name differs: ${path}`);
		}
		const body = local + 30 + localName + localExtra;
		const bytes = archive.slice(body, body + size);
		if (crc32(bytes) !== crc) throw new Error(`Bad CRC: ${path}`);
		entries.push({ path, bytes, flags, method });
		at += 46 + nameLength + extra + comment;
	}
	return entries;
}
