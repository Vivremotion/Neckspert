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
            // Request stereo so that both inputs of a multi-input audio interface
            // are captured as channels 0 and 1 rather than getting only channel 0.
            // Disable browser processing that degrades instrument signals.
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: { ideal: 2 },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                }
            });
            const source = this.audioContext.createMediaStreamSource(this.stream);
            await this.audioContext.audioWorklet.addModule(new URL(detectorProcessorWorkletURL, import.meta.url));
            // channelCountMode:'explicit' / channelCount:2 ensures the worklet node
            // receives up to two channels from the source rather than defaulting to mono.
            const detectorNode = new AudioWorkletNode(this.audioContext, "detector-processor", {
                processorOptions: { sampleRate: this.audioContext.sampleRate },
                channelCount: 2,
                channelCountMode: 'explicit',
                channelInterpretation: 'discrete',
            });
            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0, this.audioContext.currentTime);
            source.connect(detectorNode);
            detectorNode.connect(gain);
            gain.connect(this.audioContext.destination);
            detectorNode.port.onmessage = (e) => {
                const wallMs = this.contextTimeToWallMs(e.data.audioTimestamp);
                this.onHPCPUpdateCallbacks.forEach(fn => fn(e.data.hpcp, wallMs));
            };
        }
        catch (error) {
            console.error('Error detecting chords:', error);
            throw error;
        }
    }
    contextTimeToWallMs(contextTimeSec) {
        if (!this.audioContext)
            return performance.now();
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
    subscribe(callback) {
        this.onHPCPUpdateCallbacks.push(callback);
    }
}
export const hpcpDetector = new HPCPDetector();
