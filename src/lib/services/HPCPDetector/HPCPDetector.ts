import detectorProcessorWorkletURL from './detector-processor.ts?worker&url';

export type HPCPCallback = (hpcp: number[], audioTimestampMs: number) => void;

export class HPCPDetector {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private onHPCPUpdateCallbacks: HPCPCallback[] = [];

  async start() {
    try {
      if (this.audioContext && this.stream) return console.error('[HPCPDetector]', 'Detection should already be running');
      this.audioContext = new AudioContext();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      await this.audioContext.audioWorklet.addModule(new URL(detectorProcessorWorkletURL, import.meta.url));
      const detectorNode = new AudioWorkletNode(this.audioContext, "detector-processor",
        { processorOptions: {sampleRate: this.audioContext.sampleRate }}
      );
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0, this.audioContext.currentTime);
      source.connect(detectorNode);
      detectorNode.connect(gain);
      gain.connect(this.audioContext.destination);

      detectorNode.port.onmessage = (e) => {
        const wallMs = this.contextTimeToWallMs(e.data.audioTimestamp);
        this.onHPCPUpdateCallbacks.forEach(fn => fn(e.data.hpcp, wallMs));
      };
    } catch (error) {
      console.error('Error detecting chords:', error);
      throw error;
    }
  }

  private contextTimeToWallMs(contextTimeSec: number): number {
    if (!this.audioContext) return performance.now();
    const ts = this.audioContext.getOutputTimestamp();
    return (ts.performanceTime ?? performance.now()) +
      (contextTimeSec - (ts.contextTime ?? 0)) * 1000;
  }

  pause() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.audioContext?.suspend();
  }

  subscribe(callback: HPCPCallback) {
    this.onHPCPUpdateCallbacks.push(callback);
  }
}

export const hpcpDetector = new HPCPDetector();
