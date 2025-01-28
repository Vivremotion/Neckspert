import Essentia from 'essentia.js/dist/essentia.js-core.es.min.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
const BUFFER_SIZE = 4096;
const INITIAL_THRESHOLD = 0.85;
registerProcessor('detector-processor', class extends AudioWorkletProcessor {
    essentia;
    sampleRate = 44100;
    buffer;
    offset;
    signalStrengthHistory = [];
    avgStrength = 0;
    constructor(options) {
        super();
        this.buffer = new Float32Array(BUFFER_SIZE);
        this.offset = 0;
        this.essentia = new Essentia(EssentiaWASM);
        if (options?.processorOptions?.sampleRate) {
            this.sampleRate = options?.processorOptions?.sampleRate;
        }
    }
    process(inputs) {
        if (!inputs[0]?.length)
            return false;
        this.storeToBuffer(inputs[0][0]);
        if (this.offset >= this.buffer.length - 1) {
            this.detectChord();
            this.offset = 0;
        }
        return true;
    }
    storeToBuffer(data) {
        for (let i = 0; i < data.length; i++) {
            const sample = Math.max(-1, Math.min(1, data[i]));
            this.buffer[i + this.offset] =
                sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        this.offset += data.length;
    }
    computeAvgStrength(signalStrength) {
        this.signalStrengthHistory.push(signalStrength);
        if (this.signalStrengthHistory.length > BUFFER_SIZE) {
            this.signalStrengthHistory.shift();
        }
        // Calculate moving average
        this.avgStrength = this.signalStrengthHistory.reduce((a, b) => a + b) / this.signalStrengthHistory.length;
    }
    detectChord() {
        let bufferSignal = this.essentia.arrayToVector(this.buffer);
        // Audio Frame -> Windowing
        let windowOut = this.essentia.Windowing(bufferSignal);
        let spectrumOut = this.essentia.Spectrum(windowOut.frame);
        const spectrum = this.essentia.vectorToArray(spectrumOut.spectrum);
        const signalStrength = Math.sqrt(spectrum.reduce((sum, val) => sum + val * val, 0)
            / spectrum.length);
        this.computeAvgStrength(signalStrength);
        // Only proceed with HPCP detection if signal is above noise floor
        console.log(signalStrength, this.avgStrength);
        if (signalStrength > this.avgStrength) {
            let peaksOut = this.essentia.SpectralPeaks(spectrumOut.spectrum, 0, 4000, 100, 60, "frequency", this.sampleRate);
            let whiteningOut = this.essentia.SpectralWhitening(spectrumOut.spectrum, peaksOut.frequencies, peaksOut.magnitudes, 4000, this.sampleRate);
            let hpcpOut = this.essentia.HPCP(peaksOut.frequencies, whiteningOut.magnitudes, true, 500, 0, 4000, false, 60, true, "unitMax", 440, this.sampleRate, 12);
            this.port.postMessage({
                hpcp: this.essentia.vectorToArray(hpcpOut.hpcp)
            });
        }
    }
});
