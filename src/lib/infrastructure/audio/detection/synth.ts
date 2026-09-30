/**
 * Synthetic plucked string: sharp attack, decaying harmonics.
 * Silence before `attackSample`, then a ~1 ms rise and exponential decay.
 */
export function synthesizePluck(input: {
	frequencyHz: number;
	sampleRate: number;
	durationS: number;
	attackSample: number;
	amplitude?: number;
}): Float32Array {
	const { frequencyHz, sampleRate, durationS, attackSample } = input;
	const amplitude = input.amplitude ?? 0.35;
	const n = Math.floor(durationS * sampleRate);
	const out = new Float32Array(n);
	const harmonics = [1, 0.55, 0.3, 0.18, 0.1];
	const attackLen = Math.max(1, Math.floor(0.001 * sampleRate));
	for (let i = attackSample; i < n; i++) {
		const age = i - attackSample;
		const t = age / sampleRate;
		const attackEnv = Math.min(1, age / attackLen);
		const decay = Math.exp(-2.8 * t);
		let sample = 0;
		for (let h = 0; h < harmonics.length; h++) {
			sample += harmonics[h] * Math.sin(2 * Math.PI * frequencyHz * (h + 1) * t);
		}
		out[i] = sample * attackEnv * decay * amplitude;
	}
	return out;
}

export function pushAll(
	tracker: { push(frame: Float32Array, frameTime: number): unknown },
	signal: Float32Array,
	sampleRate: number,
	frameSize = 512,
	startTime = 0
): unknown[] {
	const emitted: unknown[] = [];
	for (let offset = 0; offset + frameSize <= signal.length; offset += frameSize) {
		const frame = signal.subarray(offset, offset + frameSize);
		const frameTime = startTime + offset / sampleRate;
		const result = tracker.push(frame, frameTime);
		if (result != null) emitted.push(result);
	}
	return emitted;
}
