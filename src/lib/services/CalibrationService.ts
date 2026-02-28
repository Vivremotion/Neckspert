import detectorProcessorWorkletURL from './HPCPDetector/detector-processor.ts?worker&url';
import { Metronome } from './Metronome.js';

export interface CalibrationConfig {
	bpm: number;
	hitsNeeded: number;
	/** Min time between two detected peaks (ms). */
	peakCooldownMs: number;
	/** If mean |offset| exceeds this, ask user to retry (ms). */
	maxMeanAbsOffsetMs: number;
	/** If no sound detected within this time, report error (ms). */
	noSoundTimeoutMs: number;
	/** RMS threshold for amplitude peak detection. */
	rmsThreshold: number;
	/**
	 * Max time (ms) after an amplitude peak during which an HPCP message
	 * is accepted as a confirmed detection. Gates out ambient noise.
	 */
	hpcpConfirmationWindowMs: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
	bpm: 80,
	hitsNeeded: 10,
	peakCooldownMs: 400,
	maxMeanAbsOffsetMs: 200,
	noSoundTimeoutMs: 15000,
	rmsThreshold: 0.12,
	hpcpConfirmationWindowMs: 500
};

export interface CalibrationResult {
	offsetMs: number;
}

export type CalibrationStatus = 'idle' | 'listening' | 'calibrated' | 'inconsistent' | 'no_sound';

export interface CalibrationCallbacks {
	onStatusChange: (status: CalibrationStatus) => void;
	onPeakDetected: (count: number) => void;
	onBeat: () => void;
}

/**
 * Runs a timing-calibration session: plays a metronome, captures audio,
 * detects amplitude peaks (for UI) and HPCP arrivals (for offset measurement),
 * then computes the average pipeline delay between beats and HPCP detections.
 */
export class CalibrationService {
	private readonly config: CalibrationConfig;
	private readonly callbacks: CalibrationCallbacks;

	private metronome: Metronome | null = null;
	private audioContext: AudioContext | null = null;
	private stream: MediaStream | null = null;
	private analyser: AnalyserNode | null = null;

	private firstBeatTimeMs = 0;
	private beatCount = 0;
	private confirmedDetectionTimesMs: number[] = [];
	private amplitudePeakCount = 0;
	private lastAmplitudePeakMs = 0;
	private lastConfirmedMs = 0;
	private pendingAmplitudePeakMs: number | null = null;

	private rafId = 0;
	private noSoundTimer: ReturnType<typeof setTimeout> | null = null;
	private status: CalibrationStatus = 'idle';
	private destroyed = false;

	constructor(config: Partial<CalibrationConfig>, callbacks: CalibrationCallbacks) {
		this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
		this.callbacks = callbacks;
	}

	async start(): Promise<void> {
		this.reset();
		this.setStatus('listening');

		this.metronome = new Metronome();
		this.metronome.setTempo(this.config.bpm);
		this.metronome.onBeat(this.handleBeat.bind(this));

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			this.setStatus('no_sound');
			return;
		}

		this.audioContext = new AudioContext();
		const source = this.audioContext.createMediaStreamSource(this.stream);

		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = 2048;
		source.connect(this.analyser);

		await this.setupHPCPWorklet(source);
		await this.metronome.start();

		this.rafId = requestAnimationFrame(this.processAmplitude.bind(this));

		this.noSoundTimer = setTimeout(() => {
			if (this.amplitudePeakCount === 0 && this.status === 'listening') {
				this.setStatus('no_sound');
			}
		}, this.config.noSoundTimeoutMs);
	}

	destroy(): void {
		this.destroyed = true;
		this.stopInternals();
	}

	getConfig(): CalibrationConfig {
		return this.config;
	}

	private async setupHPCPWorklet(source: MediaStreamAudioSourceNode): Promise<void> {
		if (!this.audioContext) return;

		await this.audioContext.audioWorklet.addModule(
			new URL(detectorProcessorWorkletURL, import.meta.url)
		);
		const detectorNode = new AudioWorkletNode(this.audioContext, 'detector-processor', {
			processorOptions: { sampleRate: this.audioContext.sampleRate }
		});
		const gain = this.audioContext.createGain();
		gain.gain.setValueAtTime(0, this.audioContext.currentTime);
		source.connect(detectorNode);
		detectorNode.connect(gain);
		gain.connect(this.audioContext.destination);

		detectorNode.port.onmessage = () => {
			this.handleHPCPDetection();
		};
	}

	private handleBeat(): void {
		if (this.destroyed || this.status !== 'listening') return;

		const now = performance.now();
		if (this.beatCount === 0) {
			this.firstBeatTimeMs = now;
		}
		this.beatCount++;
		this.callbacks.onBeat();
	}

	private processAmplitude(): void {
		if (this.destroyed || this.status !== 'listening' || !this.analyser) return;

		const data = new Uint8Array(this.analyser.fftSize);
		this.analyser.getByteTimeDomainData(data);

		let sum = 0;
		data.forEach((sample) => {
			const v = (sample - 128) / 128;
			sum += v * v;
		});
		const rms = Math.sqrt(sum / data.length);

		const now = performance.now();
		const cooledDown = now - this.lastAmplitudePeakMs > this.config.peakCooldownMs;
		if (rms > this.config.rmsThreshold && cooledDown) {
			this.lastAmplitudePeakMs = now;
			this.pendingAmplitudePeakMs = now;
			this.amplitudePeakCount++;
			this.callbacks.onPeakDetected(this.amplitudePeakCount);

			if (this.noSoundTimer) {
				clearTimeout(this.noSoundTimer);
				this.noSoundTimer = null;
			}
		}

		this.rafId = requestAnimationFrame(this.processAmplitude.bind(this));
	}

	/**
	 * Only accepts an HPCP message if an amplitude peak was recently detected
	 * (within `hpcpConfirmationWindowMs`). This gates out ambient noise that
	 * the worklet's adaptive threshold lets through.
	 */
	private handleHPCPDetection(): void {
		if (this.destroyed || this.status !== 'listening') return;
		if (this.firstBeatTimeMs === 0) return;
		if (this.pendingAmplitudePeakMs === null) return;

		const now = performance.now();
		const withinWindow =
			now - this.pendingAmplitudePeakMs <= this.config.hpcpConfirmationWindowMs;
		if (!withinWindow) return;

		if (now - this.lastConfirmedMs < this.config.peakCooldownMs) return;
		this.lastConfirmedMs = now;
		this.pendingAmplitudePeakMs = null;

		this.confirmedDetectionTimesMs.push(now);
		if (this.confirmedDetectionTimesMs.length >= this.config.hitsNeeded) {
			this.finish();
		}
	}

	private finish(): void {
		this.stopInternals();

		const beatIntervalMs = 60_000 / this.config.bpm;
		const offsets = this.confirmedDetectionTimesMs.map((detectionTime) => {
			return this.offsetToNearestBeat(detectionTime, beatIntervalMs);
		});

		const meanAbsMs = offsets.reduce((sum, o) => sum + Math.abs(o), 0) / offsets.length;
		console.log('meanAbsMs', meanAbsMs);
		if (meanAbsMs > this.config.maxMeanAbsOffsetMs) {
			this.setStatus('inconsistent');
			return;
		}

		const avgOffsetMs = offsets.reduce((sum, o) => sum + o, 0) / offsets.length;
		this.result = { offsetMs: Math.round(avgOffsetMs) };
		this.setStatus('calibrated');
	}

	/**
	 * Computes the signed offset from `timeMs` to the nearest beat on the
	 * regular grid starting at `firstBeatTimeMs`. Positive = after the beat.
	 */
	private offsetToNearestBeat(timeMs: number, beatIntervalMs: number): number {
		const elapsed = timeMs - this.firstBeatTimeMs;
		const distAfterPrev = ((elapsed % beatIntervalMs) + beatIntervalMs) % beatIntervalMs;
		const distBeforeNext = beatIntervalMs - distAfterPrev;
		return distAfterPrev <= distBeforeNext ? distAfterPrev : -distBeforeNext;
	}

	private result: CalibrationResult | null = null;

	getResult(): CalibrationResult | null {
		return this.result;
	}

	private setStatus(s: CalibrationStatus): void {
		this.status = s;
		this.callbacks.onStatusChange(s);
	}

	private reset(): void {
		this.stopInternals();
		this.firstBeatTimeMs = 0;
		this.beatCount = 0;
		this.confirmedDetectionTimesMs = [];
		this.amplitudePeakCount = 0;
		this.lastAmplitudePeakMs = 0;
		this.lastConfirmedMs = 0;
		this.pendingAmplitudePeakMs = null;
		this.result = null;
		this.destroyed = false;
	}

	private stopInternals(): void {
		if (this.noSoundTimer) {
			clearTimeout(this.noSoundTimer);
			this.noSoundTimer = null;
		}
		cancelAnimationFrame(this.rafId);
		this.metronome?.destroy();
		this.metronome = null;
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.audioContext?.close();
		this.audioContext = null;
		this.analyser = null;
	}
}
