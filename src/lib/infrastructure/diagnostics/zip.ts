const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** Carries a CRC-32 over one more part; start from 0. */
export function crc32Update(crc: number, bytes: Uint8Array): number {
	let c = (crc ^ 0xffffffff) >>> 0;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** CRC-32 (IEEE 802.3), as zip stores it. */
export function crc32(bytes: Uint8Array): number {
	return crc32Update(0, bytes);
}

/** Version 2.0: needed for the UTF-8 name flag. */
const ZIP_VERSION = 20;
const UTF8_NAMES = 0x0800;
const STORE = 0;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** Without zip64, sizes and offsets are 32-bit. */
const MAX_ZIP_BYTES = 0xffffffff;

function dosTime(date: Date): { time: number; date: number } {
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		date:
			((Math.max(1980, date.getFullYear()) - 1980) << 9) |
			((date.getMonth() + 1) << 5) |
			date.getDate()
	};
}

interface CentralEntry {
	name: Uint8Array;
	crc: number;
	size: number;
	offset: number;
}

/**
 * A zip archive with every file stored as is (method STORE): local headers, central directory,
 * end record, UTF-8 names. Each file goes into a Blob as soon as it is added, from its parts, so
 * the archive is never one contiguous copy in memory: the browser may keep large blobs on disk.
 */
export class ZipWriter {
	private readonly encoder = new TextEncoder();
	private readonly stamp: { time: number; date: number };
	private readonly blobs: Blob[] = [];
	private readonly entries: CentralEntry[] = [];
	private offset = 0;

	constructor(modified: Date = new Date()) {
		this.stamp = dosTime(modified);
	}

	add(path: string, parts: readonly Uint8Array[]): void {
		const name = this.encoder.encode(path);
		let crc = 0;
		let size = 0;
		for (const part of parts) {
			crc = crc32Update(crc, part);
			size += part.length;
		}
		if (this.offset + LOCAL_HEADER + name.length + size > MAX_ZIP_BYTES) {
			throw new RangeError('Archive too large for zip without zip64');
		}
		const header = new Uint8Array(LOCAL_HEADER + name.length);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true);
		view.setUint16(4, ZIP_VERSION, true);
		view.setUint16(6, UTF8_NAMES, true);
		view.setUint16(8, STORE, true);
		view.setUint16(10, this.stamp.time, true);
		view.setUint16(12, this.stamp.date, true);
		view.setUint32(14, crc, true);
		view.setUint32(18, size, true);
		view.setUint32(22, size, true);
		view.setUint16(26, name.length, true);
		header.set(name, LOCAL_HEADER);
		this.blobs.push(new Blob([header, ...parts] as BlobPart[]));
		this.entries.push({ name, crc, size, offset: this.offset });
		this.offset += header.length + size;
	}

	/** The central directory and end record after the files. */
	finish(): Blob {
		const centralSize = this.entries.reduce((n, e) => n + CENTRAL_HEADER + e.name.length, 0);
		const tail = new Uint8Array(centralSize + END_RECORD);
		const view = new DataView(tail.buffer);
		let at = 0;
		for (const entry of this.entries) {
			view.setUint32(at, 0x02014b50, true);
			view.setUint16(at + 4, ZIP_VERSION, true);
			view.setUint16(at + 6, ZIP_VERSION, true);
			view.setUint16(at + 8, UTF8_NAMES, true);
			view.setUint16(at + 10, STORE, true);
			view.setUint16(at + 12, this.stamp.time, true);
			view.setUint16(at + 14, this.stamp.date, true);
			view.setUint32(at + 16, entry.crc, true);
			view.setUint32(at + 20, entry.size, true);
			view.setUint32(at + 24, entry.size, true);
			view.setUint16(at + 28, entry.name.length, true);
			// Extra, comment, disk, internal and external attributes: all zero.
			view.setUint32(at + 42, entry.offset, true);
			tail.set(entry.name, at + CENTRAL_HEADER);
			at += CENTRAL_HEADER + entry.name.length;
		}
		if (this.offset + tail.length > MAX_ZIP_BYTES) {
			throw new RangeError('Archive too large for zip without zip64');
		}
		view.setUint32(at, 0x06054b50, true);
		view.setUint16(at + 8, this.entries.length, true);
		view.setUint16(at + 10, this.entries.length, true);
		view.setUint32(at + 12, centralSize, true);
		view.setUint32(at + 16, this.offset, true);
		return new Blob([...this.blobs, tail], { type: 'application/zip' });
	}
}

/** A whole archive from files already in memory. */
export function zipStore(
	files: readonly { path: string; bytes: Uint8Array }[],
	modified: Date = new Date()
): Blob {
	const zip = new ZipWriter(modified);
	for (const file of files) zip.add(file.path, [file.bytes]);
	return zip.finish();
}
