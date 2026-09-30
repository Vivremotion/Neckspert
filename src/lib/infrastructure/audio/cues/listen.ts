import type { Verdict } from '$lib/domain/types';
import { WebAudioClock, WebAudioMetronome } from '$lib/infrastructure/audio/clock';
import { WebAudioCues } from './WebAudioCues';

const VERDICTS: readonly Verdict[] = ['perfect', 'early', 'late', 'wrong'];
const BEATS_PER_BAR = 4;

/**
 * Manual listening check; the app never imports this module.
 * With `npm run dev`, click once on the page, then in the browser console:
 *   const { listen } = await import('/src/lib/infrastructure/audio/cues/listen.ts');
 *   const stop = await listen({ shuffle: true });
 * Bars 1, 3, 5… click alone; bars 2, 4, 6… add the four cues on the off-beats,
 * in the order logged to the console.
 */
export async function listen(
	options: { tempoBpm?: number; shuffle?: boolean } = {}
): Promise<() => void> {
	const clock = new WebAudioClock();
	await clock.resume();
	const metronome = new WebAudioMetronome(() => clock.context());
	const cues = new WebAudioCues(() => clock.context());
	metronome.setTempo(options.tempoBpm ?? 80);
	let order = [...VERDICTS];
	const unsubscribe = metronome.onBeat((beat) => {
		const bar = Math.floor(beat.index / BEATS_PER_BAR);
		const beatInBar = beat.index % BEATS_PER_BAR;
		if (bar % 2 === 0) return;
		if (beatInBar === 0) {
			order = options.shuffle ? shuffled(VERDICTS) : [...VERDICTS];
			console.info(`Bar ${bar + 1}: ${order.join(', ')}`);
		}
		cues.play(order[beatInBar], beat.time + metronome.secondsPerBeat() / 2);
	});
	metronome.start(clock.now() + 0.2);
	return () => {
		unsubscribe();
		metronome.stop();
		void clock.context().close();
	};
}

function shuffled<T>(items: readonly T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}
