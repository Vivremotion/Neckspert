import { alignAttacks, alignContext, captureLeadIn, timeExpectations } from '../judge/align';
import type {
	Attack,
	IgnoreReason,
	Pairing,
	PairingContext,
	PairingMode,
	PairingResult
} from './types';

/**
 * The attacks of a round's capture window, paired once by the optimal alignment (`alignAttacks`)
 * when the result is asked. Content is not judged. The window is `[startS - lead, endS - lead)`
 * (`captureLeadIn`), so cycles of one plan chained end to end tile time with no gap and no overlap;
 * an attack outside it belongs to a neighbour (`after-capture`).
 */
class AlignmentPairing implements Pairing {
	private readonly lead: number;
	private readonly map;
	private readonly start;
	private kept: number[] = [];

	constructor(private readonly context: PairingContext) {
		const { clock, plan } = context;
		if (!('map' in clock)) throw new RangeError('an alignment needs a tempo map');
		this.map = clock.map;
		this.start = clock.start;
		this.lead = captureLeadIn(plan, clock.map, clock.start);
	}

	private get closesS(): number {
		return this.context.times.endS - this.lead;
	}

	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: null } {
		const { startS } = this.context.times;
		if (attack.time < startS - this.lead || attack.time >= this.closesS) {
			return { fate: 'after-capture', judged: null };
		}
		this.kept.push(attack.time);
		return { fate: 'answer', judged: null };
	}

	advance(): void {}

	/** Over exactly where `offer` stops taking attacks: one it can still take never finds it done. */
	done(now: number): boolean {
		return now >= this.closesS;
	}

	droppable(): boolean {
		return false;
	}

	shownMisses(): number[] {
		return [];
	}

	result(): PairingResult {
		const { plan } = this.context;
		const attacks = [...this.kept].sort((a, b) => a - b);
		const alignment = alignAttacks(
			timeExpectations(plan, this.map, this.start),
			attacks,
			alignContext(plan, this.map, this.start)
		);
		return {
			pairs: alignment.pairs.map((p) => ({
				expectation: p.expectation,
				time: attacks[p.attack],
				judged: null,
				late: false,
				pending: false,
				correction: null,
				timing: p.verdict,
				offsetMs: p.offsetMs
			})),
			missed: alignment.missed,
			dropped: alignment.dropped,
			extra: alignment.extra.map((i) => attacks[i]),
			shift: alignment.shift,
			clampedWindows: alignment.clampedWindows,
			attacks
		};
	}
}

export const alignmentPairing: PairingMode = {
	id: 'alignment',
	create: (context) => new AlignmentPairing(context)
};
