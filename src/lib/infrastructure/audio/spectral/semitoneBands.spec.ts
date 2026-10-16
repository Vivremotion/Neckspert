import { describe, expect, it } from 'vitest';
import { magnitudeSpectrum } from './fft';
import { createSemitoneFilterbank } from './semitoneBands';

function sine(hz: number, rate: number, n: number): Float64Array {
	return Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
}

describe('createSemitoneFilterbank', () => {
	it('has one band per quarter tone between 30 Hz and 16 kHz at 48 kHz', () => {
		const bank = createSemitoneFilterbank({ sampleRate: 48000, fftSize: 2048 });
		expect(bank.bands).toBeGreaterThan(200);
		expect(bank.centersHz[0]).toBeGreaterThanOrEqual(30);
		expect(bank.centersHz[bank.bands - 1]).toBeLessThanOrEqual(16000);
	});

	it('puts a 440 Hz sine in the band centred nearest 440 Hz, at 48 and 44.1 kHz', () => {
		for (const rate of [48000, 44100]) {
			const bank = createSemitoneFilterbank({ sampleRate: rate, fftSize: 2048 });
			const out = new Float64Array(bank.bands);
			bank.apply(magnitudeSpectrum(sine(440, rate, 2048)), out);
			const loudest = out.indexOf(Math.max(...out));
			expect(Math.abs(bank.centersHz[loudest] - 440)).toBeLessThan(440 * 0.03);
		}
	});

	it('stops at the Nyquist frequency at 16 kHz', () => {
		const bank = createSemitoneFilterbank({ sampleRate: 16000, fftSize: 512 });
		expect(bank.centersHz[bank.bands - 1]).toBeLessThanOrEqual(8000);
	});
});
