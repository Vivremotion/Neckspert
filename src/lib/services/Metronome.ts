export type BeatCallback = (absoluteBeat: number) => void;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

export class Metronome {
	private audioContext: AudioContext | null = null;
	private tempo = 80;
	private beatsPerMeasure = 4;
	private nextBeatTime = 0;
	private absoluteBeat = 0;
	private schedulerTimerId: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	private beatCallbacks: BeatCallback[] = [];

	setTempo(tempo: number) {
		this.tempo = Math.max(20, Math.min(300, tempo));
	}

	getTempo() {
		return this.tempo;
	}

	getSecondsPerBeat() {
		return 60.0 / this.tempo;
	}

	onBeat(callback: BeatCallback) {
		this.beatCallbacks.push(callback);
	}

	clearCallbacks() {
		this.beatCallbacks = [];
	}

	async start() {
		if (this.running) return;

		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}

		this.running = true;
		this.absoluteBeat = 0;
		this.nextBeatTime = this.audioContext.currentTime;
		this.schedule();
	}

	stop() {
		this.running = false;
		if (this.schedulerTimerId !== null) {
			clearTimeout(this.schedulerTimerId);
			this.schedulerTimerId = null;
		}
		this.absoluteBeat = 0;
	}

	isRunning() {
		return this.running;
	}

	private schedule() {
		if (!this.running || !this.audioContext) return;

		while (this.nextBeatTime < this.audioContext.currentTime + SCHEDULE_AHEAD_S) {
			this.scheduleClick(this.nextBeatTime);
			this.fireBeatCallbacks(this.absoluteBeat, this.nextBeatTime);
			this.nextBeatTime += 60.0 / this.tempo;
			this.absoluteBeat++;
		}

		this.schedulerTimerId = setTimeout(() => this.schedule(), LOOKAHEAD_MS);
	}

	private scheduleClick(time: number) {
		if (!this.audioContext) return;

		const osc = this.audioContext.createOscillator();
		const gain = this.audioContext.createGain();
		osc.connect(gain);
		gain.connect(this.audioContext.destination);

		const isDownbeat = this.absoluteBeat % this.beatsPerMeasure === 0;
		osc.frequency.value = isDownbeat ? 1000 : 800;
		osc.type = 'sine';

		gain.gain.setValueAtTime(isDownbeat ? 0.4 : 0.25, time);
		gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

		osc.start(time);
		osc.stop(time + 0.03);
	}

	private fireBeatCallbacks(beat: number, scheduledTime: number) {
		if (!this.audioContext) return;

		const delayMs = Math.max(0, (scheduledTime - this.audioContext.currentTime) * 1000);
		setTimeout(() => {
			this.beatCallbacks.forEach((cb) => cb(beat));
		}, delayMs);
	}

	destroy() {
		this.stop();
		this.audioContext?.close();
		this.audioContext = null;
		this.beatCallbacks = [];
	}
}
