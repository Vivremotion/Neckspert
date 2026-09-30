const FRAME_SIZE = 512;

declare const currentTime: number;
declare const sampleRate: number;

registerProcessor(
	'note-frame-processor',
	class extends AudioWorkletProcessor {
		private readonly buffer = new Float32Array(FRAME_SIZE);
		private filled = 0;
		private frameStartTime = 0;

		process(inputs: Float32Array[][]): boolean {
			const channels = inputs[0];
			if (!channels?.length || channels[0].length === 0) return true;

			const frameLength = channels[0].length;
			const mixed = new Float32Array(frameLength);
			for (let i = 0; i < frameLength; i++) {
				let sum = 0;
				for (let ch = 0; ch < channels.length; ch++) sum += channels[ch][i];
				mixed[i] = sum / channels.length;
			}

			let offset = 0;
			while (offset < mixed.length) {
				if (this.filled === 0) {
					this.frameStartTime = currentTime + offset / sampleRate;
				}
				const space = FRAME_SIZE - this.filled;
				const take = Math.min(space, mixed.length - offset);
				this.buffer.set(mixed.subarray(offset, offset + take), this.filled);
				this.filled += take;
				offset += take;
				if (this.filled === FRAME_SIZE) {
					this.port.postMessage({
						samples: this.buffer.slice(),
						frameTime: this.frameStartTime
					});
					this.filled = 0;
				}
			}
			return true;
		}
	}
);
