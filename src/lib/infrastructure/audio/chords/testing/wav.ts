/** Mono 16-bit PCM WAV, as the triad corpus stores it, to float samples in [-1, 1]. */
export function readWav(bytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
	let offset = 12;
	let sampleRate = 0;
	while (offset + 8 <= bytes.length) {
		const id = tag(offset);
		const size = view.getUint32(offset + 4, true);
		const body = offset + 8;
		if (id === 'fmt ') {
			if (view.getUint16(body, true) !== 1 || view.getUint16(body + 2, true) !== 1) {
				throw new Error('Expected mono PCM');
			}
			sampleRate = view.getUint32(body + 4, true);
		} else if (id === 'data') {
			const samples = new Float32Array(size / 2);
			for (let i = 0; i < samples.length; i++)
				samples[i] = view.getInt16(body + i * 2, true) / 32768;
			return { sampleRate, samples };
		}
		offset = body + size + (size % 2);
	}
	throw new Error('No data chunk');
}
