const WAV_HEADER = 44;

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** The 44-byte header of a mono 16-bit PCM WAV of `sampleCount` samples. */
export function wavHeader(sampleRate: number, sampleCount: number): Uint8Array {
	const dataSize = sampleCount * 2;
	const out = new Uint8Array(WAV_HEADER);
	const view = new DataView(out.buffer);
	const tag = (at: number, text: string) => {
		for (let i = 0; i < 4; i++) out[at + i] = text.charCodeAt(i);
	};
	tag(0, 'RIFF');
	view.setUint32(4, WAV_HEADER - 8 + dataSize, true);
	tag(8, 'WAVE');
	tag(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	tag(36, 'data');
	view.setUint32(40, dataSize, true);
	return out;
}

/** The samples as WAV bytes: a view on them where the platform is little-endian, as browsers are. */
export function pcmBytes(samples: Int16Array): Uint8Array {
	if (LITTLE_ENDIAN) return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
	const out = new Uint8Array(samples.byteLength);
	const view = new DataView(out.buffer);
	for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
	return out;
}

/** Mono 16-bit PCM WAV, in one array. */
export function encodeWav(sampleRate: number, samples: Int16Array): Uint8Array {
	const out = new Uint8Array(WAV_HEADER + samples.byteLength);
	out.set(wavHeader(sampleRate, samples.length));
	out.set(pcmBytes(samples), WAV_HEADER);
	return out;
}
