import { Fraction } from './fraction';
import { barLength, beatPositions, type Meter } from './meter';
import type { TempoMap } from './tempoMap';
import { SOUND_IDS, type Figure, type FigureElement, type SoundId, type Voice } from './figure';

export { SOUND_IDS, type SoundId };

/**
 * What plays under the learner, described as a figure so that a click, a demo and a rhythm
 * to play along are the same kind of thing. `figure` has one voice whose notes carry a
 * `SoundId`; it repeats every `figure.bars` bars. `bars` is a cycle of on/off, one entry
 * per bar, repeated from bar 0: a muted bar is silent whatever the figure holds.
 */
export interface Accompaniment {
	figure: Figure;
	bars: ('on' | 'off')[];
}

export interface ScheduledSound {
	/** Seconds on the tempo map's clock. */
	time: number;
	sound: SoundId;
}

/**
 * A one-bar click: a `click` on each of `beats` (counted from 1, in the meter's grouping),
 * `click-accent` on those also in `accent`; the other beats stay silent.
 */
export function clickAccompaniment(input: {
	meter: Meter;
	beats: number[];
	accent: number[];
	bars: ('on' | 'off')[];
}): Accompaniment {
	const { meter, beats, accent, bars } = input;
	if (bars.length === 0) throw new RangeError('an accompaniment needs at least one bar');
	const starts = beatPositions(meter);
	const beatCount = starts.length;
	const asked = new Set<number>();
	for (const beat of beats) {
		if (!Number.isInteger(beat) || beat < 1 || beat > beatCount) {
			throw new RangeError(`beat ${beat} is not in a bar of ${beatCount} beats`);
		}
		if (asked.has(beat)) throw new RangeError(`beat ${beat} is listed twice`);
		asked.add(beat);
	}
	for (const beat of accent) {
		if (!asked.has(beat)) throw new RangeError(`accent on beat ${beat}, which has no click`);
	}
	const bar = barLength(meter);
	const elements: FigureElement[] = starts.map((start, i) => {
		const end = i + 1 < starts.length ? starts[i + 1] : bar;
		const duration = end.sub(start);
		const beat = i + 1;
		if (!asked.has(beat)) return { kind: 'rest', duration };
		return { kind: 'note', duration, content: accent.includes(beat) ? 'click-accent' : 'click' };
	});
	return {
		figure: { schema: 2, meter, bars: 1, voices: [{ id: 'click', elements }] },
		bars: [...bars]
	};
}

interface Attack {
	/** Bar of the figure, from 0. */
	bar: number;
	/** Position from the start of that bar. */
	offset: Fraction;
	sound: SoundId | null;
}

/** The attacks of one voice (tied notes sound once), in order. */
function attacksOf(figure: Figure, voice: Voice): Attack[] {
	const bar = barLength(figure.meter);
	const attacks: Attack[] = [];
	let at = Fraction.ZERO;
	let tied = false;
	for (const element of voice.elements) {
		if (element.kind === 'note') {
			if (!tied) {
				const index = Math.floor(at.div(bar).toNumber());
				attacks.push({
					bar: index,
					offset: at.sub(Fraction.of(index).mul(bar)),
					sound: element.content
				});
			}
			tied = element.tieToNext === true;
		} else {
			tied = false;
		}
		at = at.add(element.duration);
	}
	return attacks;
}

function checkRange(fromBar: number, toBar: number): void {
	if (!Number.isInteger(fromBar) || !Number.isInteger(toBar) || fromBar < 0 || toBar < fromBar) {
		throw new RangeError(`bars [${fromBar}, ${toBar}) is not a range of bars`);
	}
}

/** The sounds of bars [fromBar, toBar) (bar 0 = position 0), muted bars skipped, at the map's times. */
export function renderSounds(
	accompaniment: Accompaniment,
	map: TempoMap,
	fromBar: number,
	toBar: number
): ScheduledSound[] {
	checkRange(fromBar, toBar);
	const { figure, bars } = accompaniment;
	if (bars.length === 0) throw new RangeError('an accompaniment needs at least one bar');
	if (figure.voices.length !== 1) {
		throw new RangeError(`an accompaniment is one voice, its figure has ${figure.voices.length}`);
	}
	// Every note is checked up front, even in a bar that is muted or not rendered.
	const attacks = attacksOf(figure, figure.voices[0]).map((attack) => {
		if (attack.sound === null) {
			throw new RangeError('an accompaniment note must name the sound it plays');
		}
		return { ...attack, sound: attack.sound };
	});
	const length = barLength(figure.meter);
	const sounds: ScheduledSound[] = [];
	for (let bar = fromBar; bar < toBar; bar++) {
		if (bars[bar % bars.length] === 'off') continue;
		const inFigure = bar % figure.bars;
		for (const attack of attacks) {
			if (attack.bar !== inFigure) continue;
			sounds.push({
				time: map.toSeconds(Fraction.of(bar).mul(length).add(attack.offset)),
				sound: attack.sound
			});
		}
	}
	return sounds;
}

/**
 * A figure played as `sound` (demo, play-along) over bars [fromBar, fromBar + figure.bars),
 * whatever its notes carry: the attacks of every voice, merged and sorted by time.
 */
export function renderFigure(
	figure: Figure,
	sound: SoundId,
	map: TempoMap,
	fromBar: number
): ScheduledSound[] {
	checkRange(fromBar, fromBar + figure.bars);
	const length = barLength(figure.meter);
	return figure.voices
		.flatMap((voice) => attacksOf(figure, voice))
		.map((attack) => ({
			time: map.toSeconds(
				Fraction.of(fromBar + attack.bar)
					.mul(length)
					.add(attack.offset)
			),
			sound
		}))
		.sort((a, b) => a.time - b.time);
}
