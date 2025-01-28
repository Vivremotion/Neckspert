// src/lib/services/HPCPDetector.ts
import detectorProcessorWorkletURL from './detector-processor.ts?worker&url';
export class HPCPDetector {
    audioContext = null;
    stream = null;
    onHPCPUpdateCallbacks = [];
    async start() {
        try {
            if (this.audioContext && this.stream)
                return console.error('[HPCPDetector]', 'Detection should already be running');
            this.audioContext = new AudioContext();
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(this.stream);
            await this.audioContext.audioWorklet.addModule(new URL(detectorProcessorWorkletURL, import.meta.url));
            const detectorNode = new AudioWorkletNode(this.audioContext, "detector-processor", { processorOptions: { sampleRate: this.audioContext.sampleRate } });
            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0, this.audioContext.currentTime);
            source.connect(detectorNode);
            detectorNode.connect(gain);
            gain.connect(this.audioContext.destination);
            detectorNode.port.onmessage = (e) => {
                this.onHPCPUpdateCallbacks.forEach(fn => fn(e.data.hpcp));
            };
            // todo: send message to properly stop essentia, maybe we can start it again if we don't stop it completely
        }
        catch (error) {
            console.error('Error detecting chords:', error);
            throw error;
        }
    }
    pause() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.audioContext?.suspend();
        // this.onHPCPUpdateCallbacks = [];
    }
    subscribe(callback) {
        this.onHPCPUpdateCallbacks.push(callback);
    }
}
export const hpcpDetector = new HPCPDetector();
