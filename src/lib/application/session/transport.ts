import type { AudioClockPort, SoundSchedulerPort } from '$lib/application/ports';
import {
	Fraction,
	barLength,
	beatPositions,
	clickAccompaniment,
	createTempoMap,
	renderFigure,
	renderSounds,
	type Accompaniment,
	type Figure,
	type Meter,
	type TempoMap,
	type TempoSegment
} from '$lib/domain/time';

/** Bars of accompaniment alone (listen, do not play) before a counted bar. */
export const LISTEN_IN_BARS = 2;
/** The shortest breath, rounded up to whole bars. */
export const BREATH_MIN_MS = 4000;
/** The map starts this long after `now`, so the first sound is never already past. */
const START_DELAY_S = 0.1;
/** Absorbs the float error of a bar lasting exactly the minimum. */
const BAR_ROUNDING_EPSILON = 1e-9;

/**
 * Drives the listen-in bars, counted bars, breaths and tempo changes of a session from one
 * tempo map, rendering accompaniments and figures to sounds through the sound scheduler.
 * Bar 0 is position 0 of the map. It knows nothing of rounds or judging: the caller says
 * which bars to fill and wakes itself with `at`.
 */
export class Transport {
	private tempoMap: TempoMap | null = null;
	private meter: Meter | null = null;
	/** The bars clicked as a count, whose beats read 4..1. */
	private counted = new Set<number>();

	constructor(private readonly deps: { clock: AudioClockPort; sounds: SoundSchedulerPort }) {}

	get map(): TempoMap {
		if (!this.tempoMap) throw new Error('the transport has not begun');
		return this.tempoMap;
	}

	/** Waits for `clock.settle()`, then plays `LISTEN_IN_BARS` bars of `accompaniment` and a counted bar. */
	async begin(input: {
		meter: Meter;
		tempo: TempoSegment;
		accompaniment: Accompaniment;
	}): Promise<{ map: TempoMap; playFrom: number }> {
		const { clock } = this.deps;
		await clock.settle();
		this.meter = input.meter;
		this.counted = new Set();
		const origin = clock.now() + START_DELAY_S;
		this.tempoMap = createTempoMap(origin, [{ ...input.tempo, at: Fraction.ZERO }]);
		return { map: this.tempoMap, playFrom: this.listenInAndCount(0, input.accompaniment) };
	}

	/** Schedules the accompaniment of bars [from, to) on the current map. */
	accompany(from: number, to: number, accompaniment: Accompaniment): void {
		this.schedule(renderSounds(accompaniment, this.map, from, to));
	}

	/**
	 * A breath of at least `BREATH_MIN_MS`, in whole bars, clicking every beat with the last
	 * bar counted. Returns its bars; play resumes at `to`.
	 */
	breath(atBar: number): { from: number; to: number } {
		const map = this.map;
		const length = barLength(this.meterOf());
		const barMs = (bar: number) =>
			(map.toSeconds(Fraction.of(bar + 1).mul(length)) -
				map.toSeconds(Fraction.of(bar).mul(length))) *
			1000;
		let to = atBar;
		let ms = 0;
		do {
			ms += barMs(to);
			to++;
		} while (ms < BREATH_MIN_MS - BAR_ROUNDING_EPSILON);
		this.schedule(renderSounds(this.countClicks(), map, atBar, to));
		this.counted.add(to - 1);
		return { from: atBar, to };
	}

	/**
	 * A new tempo from `atBar` (after a breath): the listen-in and the counted bar are placed
	 * at the new tempo. Anything already scheduled from `atBar` on at the old tempo is the
	 * caller's to withhold. Play resumes at the returned bar.
	 */
	changeTempo(
		atBar: number,
		tempo: TempoSegment,
		accompaniment: Accompaniment
	): { playFrom: number } {
		const at = Fraction.of(atBar).mul(barLength(this.meterOf()));
		this.tempoMap = this.map.withSegment({ ...tempo, at });
		return { playFrom: this.listenInAndCount(atBar, accompaniment) };
	}

	/** Plays `figure` as `sound` from `fromBar`. */
	playFigure(figure: Figure, sound: 'demo' | 'play-along', fromBar: number): void {
		this.schedule(renderFigure(figure, sound, this.map, fromBar));
	}

	/** Calls `callback` once the audio clock reaches `bar` (a bar number, fractions inside a bar allowed). */
	at(bar: Fraction, callback: () => void): () => void {
		const position = bar.mul(barLength(this.meterOf()));
		return this.deps.sounds.at(this.map.toSeconds(position), callback);
	}

	/**
	 * The count shown at beat `beat` (from 0, the first by default) of `bar`: 4..1 for a
	 * four-beat bar during a counted bar, null elsewhere.
	 */
	countdownAt(bar: number, beat = 0): number | null {
		if (!this.counted.has(bar)) return null;
		const beats = beatPositions(this.meterOf()).length;
		if (!Number.isInteger(beat) || beat < 0 || beat >= beats) return null;
		return beats - beat;
	}

	stop(): void {
		this.deps.sounds.cancelAll();
	}

	private meterOf(): Meter {
		if (!this.meter) throw new Error('the transport has not begun');
		return this.meter;
	}

	/** One bar of every beat clicked, accent on 1. */
	private countClicks(): Accompaniment {
		const meter = this.meterOf();
		const beats = beatPositions(meter).map((_, i) => i + 1);
		return clickAccompaniment({ meter, beats, accent: [1], bars: ['on'] });
	}

	/** Listen-in bars from `fromBar`, then the counted bar. Returns the first bar to play. */
	private listenInAndCount(fromBar: number, accompaniment: Accompaniment): number {
		const map = this.map;
		const counted = fromBar + LISTEN_IN_BARS;
		this.schedule(renderSounds(accompaniment, map, fromBar, counted));
		this.schedule(renderSounds(this.countClicks(), map, counted, counted + 1));
		this.counted.add(counted);
		return counted + 1;
	}

	private schedule(sounds: { time: number; sound: Parameters<SoundSchedulerPort['play']>[1] }[]) {
		for (const { time, sound } of sounds) this.deps.sounds.play(time, sound);
	}
}
