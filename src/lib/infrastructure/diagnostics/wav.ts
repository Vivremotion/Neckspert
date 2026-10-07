const WAV_HEADER = 44;

/** Mono 16-bit PCM WAV. */
export function encodeWav(sampleRate: number, samples: Int16Array): Uint8Array {
	const dataSize = samples.length * 2;
	const out = new Uint8Array(WAV_HEADER + dataSize);
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
	for (let i = 0; i < samples.length; i++) view.setInt16(WAV_HEADER + i * 2, samples[i], true);
	return out;
}
