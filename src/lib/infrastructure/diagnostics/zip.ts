const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 (IEEE 802.3), as zip stores it. */
export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
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

/**
 * A zip archive with every file stored as is (method STORE): local headers, central directory,
 * end record, UTF-8 names. Audio does not compress well enough to need more.
 */
export function zipStore(
	files: readonly { path: string; bytes: Uint8Array }[],
	modified: Date = new Date()
): Uint8Array {
	const encoder = new TextEncoder();
	const stamp = dosTime(modified);
	const entries = files.map((file) => ({
		name: encoder.encode(file.path),
		bytes: file.bytes,
		crc: crc32(file.bytes),
		offset: 0
	}));
	const localSize = entries.reduce((n, e) => n + LOCAL_HEADER + e.name.length + e.bytes.length, 0);
	const centralSize = entries.reduce((n, e) => n + CENTRAL_HEADER + e.name.length, 0);
	const total = localSize + centralSize + END_RECORD;
	if (total > MAX_ZIP_BYTES) throw new RangeError('Archive too large for zip without zip64');

	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	let at = 0;
	for (const entry of entries) {
		entry.offset = at;
		view.setUint32(at, 0x04034b50, true);
		view.setUint16(at + 4, ZIP_VERSION, true);
		view.setUint16(at + 6, UTF8_NAMES, true);
		view.setUint16(at + 8, STORE, true);
		view.setUint16(at + 10, stamp.time, true);
		view.setUint16(at + 12, stamp.date, true);
		view.setUint32(at + 14, entry.crc, true);
		view.setUint32(at + 18, entry.bytes.length, true);
		view.setUint32(at + 22, entry.bytes.length, true);
		view.setUint16(at + 26, entry.name.length, true);
		view.setUint16(at + 28, 0, true);
		out.set(entry.name, at + LOCAL_HEADER);
		out.set(entry.bytes, at + LOCAL_HEADER + entry.name.length);
		at += LOCAL_HEADER + entry.name.length + entry.bytes.length;
	}
	const centralStart = at;
	for (const entry of entries) {
		view.setUint32(at, 0x02014b50, true);
		view.setUint16(at + 4, ZIP_VERSION, true);
		view.setUint16(at + 6, ZIP_VERSION, true);
		view.setUint16(at + 8, UTF8_NAMES, true);
		view.setUint16(at + 10, STORE, true);
		view.setUint16(at + 12, stamp.time, true);
		view.setUint16(at + 14, stamp.date, true);
		view.setUint32(at + 16, entry.crc, true);
		view.setUint32(at + 20, entry.bytes.length, true);
		view.setUint32(at + 24, entry.bytes.length, true);
		view.setUint16(at + 28, entry.name.length, true);
		// Extra, comment, disk, internal and external attributes: all zero.
		view.setUint32(at + 42, entry.offset, true);
		out.set(entry.name, at + CENTRAL_HEADER);
		at += CENTRAL_HEADER + entry.name.length;
	}
	view.setUint32(at, 0x06054b50, true);
	view.setUint16(at + 8, entries.length, true);
	view.setUint16(at + 10, entries.length, true);
	view.setUint32(at + 12, at - centralStart, true);
	view.setUint32(at + 16, centralStart, true);
	return out;
}
