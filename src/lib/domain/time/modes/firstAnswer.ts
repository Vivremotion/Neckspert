import type { Judged } from '../plan';
import type {
	Attack,
	IgnoreReason,
	Pairing,
	PairingContext,
	PairingMode,
	PairedAnswer,
	PairingResult
} from './types';
import { EDGE_TOLERANCE_S, type ResponseZone } from './zones';

interface Answer {
	time: number;
	judged: Judged | null;
	/** A wrong reading not yet final: a better reading of the same attack may replace it. */
	pending: boolean;
}

interface ExpectationState {
	answer: Answer | null;
	correction: { time: number; judged: Judged } | null;
	/** Listening is over: no correction can come any more. */
	closed: boolean;
}

/** An expectation without content is answered right by any attack. */
const isRight = (judged: Judged | null): boolean => judged === null || judged.correct;

/**
 * The first attack in an expectation's zone is its answer; later ones are ignored, except a
 * reading of the same attack replacing a wrong one not yet final, and the correction of a wrong
 * first answer of a span, when the policy allows it and every expectation before was right.
 */
class FirstAnswerPairing implements Pairing {
	private readonly zones: ResponseZone[];
	private readonly states: ExpectationState[];
	private readonly toEnd: boolean;

	constructor(private readonly context: PairingContext) {
		this.zones = context.times.zones;
		this.states = this.zones.map(() => ({ answer: null, correction: null, closed: false }));
		const pairing = context.plan.policy.pairing;
		this.toEnd = pairing.mode === 'first-answer' && pairing.lateCapture === 'to-end';
	}

	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: Judged | null } {
		const { time } = attack;
		const candidates = this.zones.filter((z) => z.sensor === attack.sensor);
		if (candidates.length === 0) {
			throw new Error(`No expectation of this round listens to: ${attack.sensor}`);
		}
		const unanswered = candidates.filter((z) => !this.isAnswered(z.index));
		const chosen = unanswered.find((z) => this.contains(z, time));
		if (chosen) {
			const judged = this.context.judge(chosen.index, attack.payload);
			const state = this.states[chosen.index];
			// The first attack is the answer: while one of its readings waits, another is not.
			if (state.answer?.pending && state.answer.time !== time) {
				return { fate: 'settled', judged };
			}
			const pending = !attack.final && !isRight(judged);
			state.answer = { time, judged, pending };
			return { fate: 'answer', judged };
		}
		const answered = candidates.find((z) => this.isAnswered(z.index) && this.contains(z, time));
		if (answered) {
			const judged = this.context.judge(answered.index, attack.payload);
			const state = this.states[answered.index];
			const corrects =
				this.correctable(answered.index) &&
				state.answer?.time !== time &&
				attack.final &&
				judged !== null &&
				judged.correct;
			if (corrects) {
				state.correction = { time, judged };
				return { fate: 'answer', judged };
			}
			return { fate: 'settled', judged };
		}
		if (unanswered.length === 0) return { fate: 'settled', judged: null };
		const fate = time < unanswered[0].opensS - EDGE_TOLERANCE_S ? 'before-window' : 'after-capture';
		return { fate, judged: null };
	}

	advance(now: number): void {
		const listened = this.listened(now);
		for (const [index, state] of this.states.entries()) {
			if (listened || this.zonePassed(index, now)) {
				// Decided: the reading still waiting is the answer, as it stands.
				if (state.answer) state.answer.pending = false;
			}
			if (listened) state.closed = true;
		}
	}

	done(now: number): boolean {
		return this.states.every((_, index) => this.decided(index, now));
	}

	zonesOver(now: number): boolean {
		return this.zones.every((z) => now >= z.captureEndS - EDGE_TOLERANCE_S);
	}

	awaiting(): boolean {
		return this.states.some(
			(state, index) => state.answer?.pending === true || this.correctable(index)
		);
	}

	droppable(now: number): boolean {
		if (this.states.some((state) => state.answer !== null)) return false;
		const first = this.zones[0];
		return !first || now < first.inTimeEndS - EDGE_TOLERANCE_S;
	}

	shownMisses(now: number): number[] {
		return this.zones
			.filter((z) =>
				z.span === 'point'
					? this.states[z.index].answer === null && now >= z.inTimeEndS - EDGE_TOLERANCE_S
					: this.mayBeCorrected(z.index) && this.states[z.index].correction === null
			)
			.map((z) => z.index);
	}

	result(): PairingResult {
		const pairs: PairedAnswer[] = [];
		const missed: number[] = [];
		for (const [index, state] of this.states.entries()) {
			const answer = state.answer;
			if (!answer) {
				missed.push(index);
				continue;
			}
			const zone = this.zones[index];
			pairs.push({
				expectation: index,
				time: answer.time,
				judged: answer.judged,
				late: zone.span === 'point' && answer.time > zone.inTimeEndS + EDGE_TOLERANCE_S,
				pending: answer.pending,
				correction: state.correction,
				timing: null,
				offsetMs: null
			});
		}
		return {
			pairs,
			missed,
			dropped: [],
			extra: [],
			shift: null,
			clampedWindows: 0,
			attacks: pairs.map((p) => p.time).sort((a, b) => a - b)
		};
	}

	/** A final answer: a reading still waiting leaves the expectation open to it. */
	private isAnswered(index: number): boolean {
		const answer = this.states[index].answer;
		return answer !== null && !answer.pending;
	}

	/** A span excludes its end; so does a point captured up to the handover. */
	private contains(zone: ResponseZone, time: number): boolean {
		if (time < zone.opensS - EDGE_TOLERANCE_S) return false;
		const endExcluded = zone.span === 'span' || this.toEnd;
		return endExcluded
			? time < zone.captureEndS - EDGE_TOLERANCE_S
			: time <= zone.captureEndS + EDGE_TOLERANCE_S;
	}

	/**
	 * A span whose first answer is final and wrong, every expectation before it right, under a
	 * policy that corrects: a later right attack in it may put it right.
	 */
	private mayBeCorrected(index: number): boolean {
		const zone = this.zones[index];
		if (zone.span !== 'span' || !this.context.plan.policy.correction) return false;
		const answer = this.states[index].answer;
		if (!answer || answer.pending || isRight(answer.judged)) return false;
		return this.states.slice(0, index).every((state) => {
			const before = state.answer;
			return before !== null && !before.pending && isRight(before.judged);
		});
	}

	/** A correction may still come. */
	private correctable(index: number): boolean {
		const state = this.states[index];
		return this.mayBeCorrected(index) && state.correction === null && !state.closed;
	}

	private decided(index: number, now: number): boolean {
		if (this.listened(now) || this.zonePassed(index, now)) return true;
		const state = this.states[index];
		if (!this.isAnswered(index)) return false;
		return !this.mayBeCorrected(index) || state.correction !== null;
	}

	/** Not the last expectation, and its zone is over. */
	private zonePassed(index: number, now: number): boolean {
		const last = index === this.zones.length - 1;
		return !last && now >= this.zones[index].captureEndS - EDGE_TOLERANCE_S;
	}

	private listened(now: number): boolean {
		return now >= this.context.times.listenUntilS - EDGE_TOLERANCE_S;
	}
}

/** « La première est la réponse »: the pairing of the one-answer rounds. */
export const firstAnswerPairing: PairingMode = {
	id: 'first-answer',
	create: (context) => new FirstAnswerPairing(context)
};
