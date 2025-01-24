import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';

const sampleRate = 48100;
const windowSize = 1;
const bufferSize = 4096;

registerProcessor('detector-processor', class extends AudioWorkletProcessor {
  private essentia;
  private buffer: Float32Array;
  private offset: number;

  constructor() {
    super();
    this.buffer = new Float32Array(bufferSize);
    this.offset = 0;
    this.essentia = new Essentia(EssentiaWASM);
  }
  process(inputs: Array<Array<Array<number>>>) {
    if (!inputs[0]?.length) return false;
    this.storeToBuffer(inputs[0][0]);

    if (this.offset >= this.buffer.length - 1) {
      this.detectChord();
      this.offset = 0;
    }

    return true;
  }

  storeToBuffer(data: Array<number>) {
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      this.buffer[i + this.offset] =
        sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    this.offset += data.length;
  }

  detectChord() {
    let bufferSignal = this.essentia.arrayToVector(this.buffer);
    let hpcpPool = new this.essentia.module.VectorVectorFloat();

    // Audio Frame -> Windowing
    // todo: look for the best windowing algorithm in my case
    let windowOut = this.essentia.Windowing(bufferSignal);

    // Here we run the window into the spectrum
    // Windowing -> Spectrum
    let spectrumOut = this.essentia.Spectrum(windowOut.frame);

    let peaksOut = this.essentia.SpectralPeaks(spectrumOut.spectrum, 0, 4000, 100, 60, "frequency", sampleRate);

    let whiteningOut = this.essentia.SpectralWhitening(spectrumOut.spectrum, peaksOut.frequencies, peaksOut.magnitudes, 4000, sampleRate);

    let hpcpOut = this.essentia.HPCP(peaksOut.frequencies, whiteningOut.magnitudes, true, 500, 0, 4000, false, 60, true, "unitMax", 440, sampleRate, 12);
    
    hpcpPool.push_back(hpcpOut.hpcp);

    // let chordDetect = this.essentia.ChordsDetection(hpcpPool, bufferSize, sampleRate, windowSize);

    // let detectedChord = chordDetect.chords.get(0);

    // let chordsStrength = chordDetect.strength.get(0);

    this.port.postMessage(this.essentia.vectorToArray(hpcpOut.hpcp));
  }
});