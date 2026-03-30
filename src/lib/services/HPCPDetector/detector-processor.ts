import Essentia from 'essentia.js/dist/essentia.js-core.es.min.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

declare const currentTime: number;

type AudioData = Array<Array<Array<number>>>;

const BUFFER_SIZE = 4096;
const HOP_SIZE = 1024;
const EMA_COEFF = 0.05;

registerProcessor('detector-processor', class extends AudioWorkletProcessor {
  private essentia;
  private sampleRate: number = 44100;
  private ringBuffer: Float32Array;
  private analysisBuffer: Float32Array;
  private writePos = 0;
  private totalSamplesWritten = 0;
  private samplesSinceLastHop = 0;
  private avgStrength = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.ringBuffer = new Float32Array(BUFFER_SIZE);
    this.analysisBuffer = new Float32Array(BUFFER_SIZE);
    this.essentia = new Essentia(EssentiaWASM);
    if (options?.processorOptions?.sampleRate) {
      this.sampleRate = options.processorOptions.sampleRate;
    }
    this.prewarm();
  }

  /**
   * Force JIT-compile all WASM hot paths before real audio arrives,
   * so the first real detection doesn't pay the compilation cost.
   */
  private prewarm() {
    const dummy = new Float32Array(BUFFER_SIZE);
    for (let i = 0; i < BUFFER_SIZE; i++) {
      // Generate a sine wave at 440 Hz:
      // - 0x7fff is the maximum value for a 16-bit signed integer
      // - Math.sin(2 * Math.PI * 440 * i / this.sampleRate) is a sine wave at 440 Hz
      // - We multiply by 0x7fff to get a value between -0x7fff and 0x7fff
      dummy[i] = Math.sin(2 * Math.PI * 440 * i / this.sampleRate) * 0x7fff;
    }
    const sig = this.essentia.arrayToVector(dummy);
    for (let i = 0; i < 3; i++) {
      const win = this.essentia.Windowing(sig);
      const spec = this.essentia.Spectrum(win.frame);
      const peaks = this.essentia.SpectralPeaks(
        spec.spectrum, 0, 4000, 100, 60, "frequency", this.sampleRate
      );
      this.essentia.HPCP(
        peaks.frequencies, peaks.magnitudes,
        true, 500, 0, 4000, false, 60, true, "unitMax", 440, this.sampleRate, 12
      );
    }
  }

  process(inputs: AudioData) {
    if (!inputs[0]?.length) return true;
    const data = inputs[0][0];

    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      this.ringBuffer[this.writePos] =
        sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.writePos = (this.writePos + 1) % BUFFER_SIZE;
    }
    this.totalSamplesWritten += data.length;
    this.samplesSinceLastHop += data.length;

    if (this.samplesSinceLastHop >= HOP_SIZE && this.totalSamplesWritten >= BUFFER_SIZE) {
      this.samplesSinceLastHop = 0;
      this.detectChord();
    }

    return true;
  }

  private prepareAnalysisBuffer() {
    const tail = BUFFER_SIZE - this.writePos;
    this.analysisBuffer.set(this.ringBuffer.subarray(this.writePos), 0);
    this.analysisBuffer.set(this.ringBuffer.subarray(0, this.writePos), tail);
  }

  private detectChord() {
    this.prepareAnalysisBuffer();
    const bufferSignal = this.essentia.arrayToVector(this.analysisBuffer);

    const windowOut = this.essentia.Windowing(bufferSignal);
    const spectrumOut = this.essentia.Spectrum(windowOut.frame);

    const spectrum = this.essentia.vectorToArray(spectrumOut.spectrum);
    const signalStrength = Math.sqrt(
      spectrum.reduce((sum: number, val: number) => sum + val * val, 0)
      / spectrum.length
    );

    this.avgStrength = EMA_COEFF * signalStrength + (1 - EMA_COEFF) * this.avgStrength;

    if (signalStrength > this.avgStrength) {
      const peaksOut = this.essentia.SpectralPeaks(
        spectrumOut.spectrum, 0, 4000, 100, 60, "frequency", this.sampleRate
      );
      const hpcpOut = this.essentia.HPCP(
        peaksOut.frequencies, peaksOut.magnitudes,
        true, 500, 0, 4000, false, 60, true, "unitMax", 440, this.sampleRate, 12
      );

      this.port.postMessage({
        hpcp: this.essentia.vectorToArray(hpcpOut.hpcp),
        audioTimestamp: currentTime
      });
    }
  }
});
