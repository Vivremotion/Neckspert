import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import type { Figure, FigureElement } from './figure';
import { METER_4_4 } from './meter';
import { compileCyclePlan, type ContentJudges, type Judged, type RoundPlan } from './plan';
import { createTempoMap } from './tempoMap';
import { AIDS, PlanRound, type Aid, type PlanObservation } from './round';
import type { CycleReport } from './judge/measures';
import { ROUND_MODES } from './modes';
import type { PairingMode, PairingResult, RoundModes } from './modes/types';
import { anchorPlan, locatePlan, map as beatMap } from './modes/testing/plans';

const of = Fraction.of;

/** A bar of 4/4 in eighths: the off-beats only (a rest, then a note, four times). */
const offBeats: Figure = {
	schema: 1,
	meter: METER_4_4,
	bars: 1,
	voices: [
		{
			id: 'main',
			elements: [...'01010101'].map((c): FigureElement =>
				c === '1'
					? { kind: 'note', duration: of(1, 8), content: null }
					: { kind: 'rest', duration: of(1, 8) }
			)
		}
	]
};

function cyclePlan(cycleBars = 2): RoundPlan {
	return compileCyclePlan({
		figure: offBeats,
		cycleBars,
		startBar: 0,
		sensor: 'attack',
		window: { ms: 120 },
		accompanimentBars: ['on']
	});
}

// ♩ = 100 bpm: an eighth lasts 0.3 s, a bar 2.4 s; the cycle starts at bar 1 (2.4 s).
const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 100, unit: of(1, 4) }]);
const start = of(1);
const THRESHOLDS = { precision: 40, regularity: 30 };
const SYSTEM = { ms: 20, provenance: 'system' as const };

/** A cycle judges no content: any judge asked for is a wiring error. */
const noJudges: ContentJudges = (kind) => {
	throw new Error(`no content judge in a cycle: ${kind}`);
};

function round(plan = cyclePlan(), aids: Aid[] = []) {
	return new PlanRound({
		plan,
		clock: { map, start },
		judges: noJudges,
		latency: SYSTEM,
		thresholds: THRESHOLDS,
		aids
	});
}

/** Closes a cycle once it is over: a cycle always gives an outcome. */
function closed(r: PlanRound) {
	const outcome = r.close(r.endTime);
	if (outcome === null) throw new Error('a cycle closed without an outcome');
	return outcome;
}

const attack = (time: number): PlanObservation => ({
	time,
	sensor: 'attack',
	readable: true,
	payload: null
});

/** The exact times of the off-beats of the two bars from the start. */
function exactTimes(plan: RoundPlan): number[] {
	return plan.expectations.map((e) => map.toSeconds(start.add(e.at!)));
}

describe('AIDS', () => {
	it('lists every aid once, the drawn fret first', () => {
		const all: readonly Aid[] = AIDS;
		expect(all).toEqual([
			'show-position',
			'string-aid',
			'cursor',
			'listen',
			'play-along',
			'aid-level'
		]);
		expect(new Set(all).size).toBe(all.length);
	});
});

describe('PlanRound', () => {
	it('spans the plan from its start to its start plus its length, in audio seconds', () => {
		const r = round();
		expect(r.startTime).toBeCloseTo(2.4, 9);
		expect(r.endTime).toBeCloseTo(2.4 + 4.8, 9);
	});

	it('passes a cycle of exact off-beats, with no judge verdict of its own', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) expect(r.observe(attack(time)).fate).toBe('answer');
		const outcome = closed(r);
		expect(outcome.success).toBe(true);
		expect(outcome.correct).toBeNull();
		expect(outcome.verdict).toEqual({ relation: 'cycle', version: 1, value: { passed: true } });
		expect(outcome.measures.fidelity?.value).toBe(1);
		expect(outcome.measures).toEqual((outcome.detail as { measures: unknown }).measures);
	});

	it('reports the cycle report as the detail, with the latency it was given', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		const detail = closed(r).detail as { latency: unknown; expectations: unknown[] };
		expect(detail.latency).toEqual(SYSTEM);
		expect(detail.expectations).toHaveLength(plan.expectations.length);
	});

	it('fails a cycle where nothing was played, and says it missed', () => {
		const outcome = closed(round());
		expect(outcome.success).toBe(false);
		expect(outcome.correct).toBeNull();
		expect(outcome.verdict.value).toEqual({ passed: false, reasons: ['missed'] });
	});

	it('ignores an observation of another sensor', () => {
		const plan = cyclePlan();
		const r = round(plan);
		const note: PlanObservation = { time: 3.0, sensor: 'note', readable: true, payload: 'E' };
		expect(r.observe(note).fate).toBe('other-sensor');
		for (const time of exactTimes(plan)) r.observe(attack(time));
		const outcome = closed(r);
		expect(outcome.success).toBe(true);
		expect((outcome.detail as { extra: number }).extra).toBe(0);
	});

	it('ignores an unreadable observation', () => {
		const plan = cyclePlan();
		const r = round(plan);
		expect(r.observe({ time: 3.0, sensor: 'attack', readable: false, payload: null }).fate).toBe(
			'unreadable'
		);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(closed(r).success).toBe(true);
	});

	it('hands back what falls outside the cycle to the neighbouring round', () => {
		const plan = cyclePlan();
		const r = round(plan);
		expect(r.observe(attack(r.startTime - 0.2)).fate).toBe('after-capture');
		expect(r.observe(attack(r.endTime)).fate).toBe('after-capture');
		expect(r.observe(attack(r.endTime + 1)).fate).toBe('after-capture');
		expect(r.observe(attack(r.startTime)).fate).toBe('answer');
		expect(r.observe(attack(r.endTime - 0.2)).fate).toBe('answer');
	});

	it('does not count an attack handed back as an added one', () => {
		const plan = cyclePlan();
		const r = round(plan);
		r.observe(attack(r.endTime + 0.3));
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(closed(r).success).toBe(true);
	});

	it('counts an extra attack of the cycle against it', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		r.observe(attack(exactTimes(plan)[0] + 0.15));
		const outcome = closed(r);
		expect(outcome.success).toBe(false);
		expect(outcome.verdict.value).toEqual({ passed: false, reasons: ['extra'] });
		const at = (exactTimes(plan)[0] + 0.15 - r.startTime) * 1000;
		expect((outcome.detail as CycleReport).extraAtMs?.[0]).toBeCloseTo(at, 6);
	});

	it('closes once settled: later observations are settled, the modes no longer asked', () => {
		const r = round();
		closed(r);
		expect(r.observe(attack(3))).toEqual({
			fate: 'settled',
			judged: null,
			event: { kind: 'none' }
		});
	});

	it('hands the aids over as given', () => {
		const aids: Aid[] = ['cursor', 'listen'];
		const outcome = closed(round(cyclePlan(), aids));
		expect(outcome.aids).toEqual(['cursor', 'listen']);
	});

	it('settles once: closing again gives nothing', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(closed(r).success).toBe(true);
		expect(r.close(r.endTime)).toBeNull();
	});

	it('settles a cycle as it advances past its capture window, once', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(r.advance(r.startTime + 1)).toEqual({ kind: 'none' });
		const event = r.advance(r.endTime);
		expect(event.kind).toBe('settled');
		expect(event.kind === 'settled' && event.outcome.success).toBe(true);
		expect(r.advance(r.endTime + 1)).toEqual({ kind: 'none' });
		expect(r.close(r.endTime + 1)).toBeNull();
	});

	it('falls back to the attack sensor for a plan without expectations', () => {
		const empty: RoundPlan = { ...cyclePlan(), expectations: [] };
		const r = round(empty);
		expect(r.observe(attack(3)).fate).toBe('answer');
		expect(r.observe({ time: 3, sensor: 'note', readable: true, payload: null }).fate).toBe(
			'other-sensor'
		);
	});
});

describe('PlanRound capture window on chained cycles', () => {
	/** A bar of 4/4 from a pattern of steps of `step`: a note where it says 1, a rest at 0. */
	function figureOf(pattern: string, step: Fraction): Figure {
		return {
			schema: 1,
			meter: METER_4_4,
			bars: 1,
			voices: [
				{
					id: 'main',
					elements: [...pattern].map((c): FigureElement =>
						c === '1'
							? { kind: 'note', duration: step, content: null }
							: { kind: 'rest', duration: step }
					)
				}
			]
		};
	}

	function oneBar(figure: Figure): RoundPlan {
		return compileCyclePlan({
			figure,
			cycleBars: 1,
			startBar: 0,
			sensor: 'attack',
			window: { ms: 120 },
			accompanimentBars: ['on']
		});
	}

	function at(plan: RoundPlan, bar: number): PlanRound {
		return new PlanRound({
			plan,
			clock: { map, start: of(bar) },
			judges: noJudges,
			latency: SYSTEM,
			thresholds: THRESHOLDS,
			aids: []
		});
	}

	const times = (plan: RoundPlan, bar: number) =>
		plan.expectations.map((e) => map.toSeconds(of(bar).add(e.at!)));

	/** Feeds every observation to the round that owns it, the way the controller does. */
	function feed(rounds: PlanRound[], played: number[]): void {
		for (const time of played) {
			for (const r of rounds) if (r.observe(attack(time)).fate === 'answer') break;
		}
	}

	it('gives a downbeat played early to the cycle it opens, not to the previous one', () => {
		const plan = oneBar(figureOf('10101010', of(1, 8)));
		const first = at(plan, 1);
		const second = at(plan, 2);
		const played = [...times(plan, 1), ...times(plan, 2)];
		played[4] -= 0.02; // the second cycle's downbeat, 20 ms early
		feed([first, second], played);
		const one = closed(first);
		const two = closed(second);
		expect((one.detail as { extra: number }).extra).toBe(0);
		expect(one.success).toBe(true);
		expect(two.measures.fidelity?.value).toBe(1);
		const downbeat = (two.detail as { expectations: { verdict: string }[] }).expectations[0];
		expect(['on-time', 'early']).toContain(downbeat.verdict);
		expect(two.success).toBe(true);
	});

	it('keeps a last note played late in its own cycle', () => {
		const plan = oneBar(figureOf('1000000000000001', of(1, 16)));
		const first = at(plan, 1);
		const second = at(plan, 2);
		const played = [...times(plan, 1), ...times(plan, 2)];
		played[1] += 0.02; // the last note of the first cycle, 20 ms late
		feed([first, second], played);
		const one = closed(first);
		const two = closed(second);
		expect((one.detail as { extra: number }).extra).toBe(0);
		expect(one.measures.fidelity?.value).toBe(1);
		expect(two.measures.fidelity?.value).toBe(1);
		expect((two.detail as { extra: number }).extra).toBe(0);
	});

	it.each([0, 0.02])(
		'keeps a last note close to the cycle end in its cycle, played %d s late',
		(late) => {
			// First note a sixteenth in, last one a sixteenth before the end: ♩ = 100, step 0.15 s.
			const plan = oneBar(figureOf('0100000000000001', of(1, 16)));
			const first = at(plan, 1);
			const second = at(plan, 2);
			const played = [...times(plan, 1), ...times(plan, 2)];
			played[1] += late;
			feed([first, second], played);
			const one = closed(first);
			const two = closed(second);
			expect((one.detail as { extra: number }).extra).toBe(0);
			expect(one.measures.fidelity?.value).toBe(1);
			expect(one.success).toBe(true);
			expect(two.measures.fidelity?.value).toBe(1);
			expect((two.detail as { extra: number }).extra).toBe(0);
		}
	);

	it('takes an attack at the very edge of its window without settling inside observe', () => {
		const plan = oneBar(figureOf('10101010', of(1, 8)));
		const first = at(plan, 1);
		const closesS = 4.8 - 0.15; // half a zone before the next downbeat
		const edge = first.observe(attack(closesS - 5e-7)); // inside the edge tolerance
		expect(edge.fate).toBe('answer');
		expect(edge.event.kind).not.toBe('settled');
		expect(first.close(closesS)).not.toBeNull();
	});

	it('tiles time: consecutive cycles leave no gap and no overlap', () => {
		const plan = oneBar(figureOf('10101010', of(1, 8)));
		const first = at(plan, 1);
		const second = at(plan, 2);
		const edge = 4.8 - 0.15; // half a zone before the second downbeat
		expect(first.observe(attack(edge - 1e-6)).fate).toBe('answer');
		expect(first.observe(attack(edge + 1e-6)).fate).toBe('after-capture');
		expect(second.observe(attack(edge - 1e-6)).fate).toBe('after-capture');
		expect(second.observe(attack(edge + 1e-6)).fate).toBe('answer');
	});
});

describe('PlanRound routing', () => {
	const RIGHT: Judged = { correct: true, answer: 'F', confusion: null };
	const WRONG: Judged = { correct: false, answer: 'G', confusion: 'neighbour' };

	/** A content judge that hands back the judgement carried by the payload. */
	const carried: ContentJudges = () => ({ judge: (_, payload) => payload as Judged });

	/** Gives the first expectation of a plan a content of kind `kind`. */
	function withContent(plan: RoundPlan, kind = 'note', index = 0): RoundPlan {
		const expectations = plan.expectations.map((e, i) =>
			i === index ? { ...e, content: { kind, value: `value-${i}` } } : e
		);
		return { ...plan, expectations };
	}

	function responseRound(plan: RoundPlan, judges: ContentJudges = carried, modes?: RoundModes) {
		return new PlanRound({
			plan,
			clock: { map: beatMap, start: of(2) },
			judges,
			latency: null,
			thresholds: null,
			aids: [],
			...(modes ? { modes } : {})
		});
	}

	const played = (time: number, judged: Judged, sensor = 'note', final = true) => ({
		time,
		sensor,
		readable: true,
		payload: judged,
		final
	});

	it('reads the instants of the round from its plan', () => {
		const r = responseRound(locatePlan());
		expect(r.promptTime).toBeCloseTo(3.1, 9);
		expect(r.startTime).toBeCloseTo(6.1, 9);
		expect(r.endTime).toBeCloseTo(9.1, 9);
		expect(r.listenUntilTime).toBeCloseTo(8.35, 9);
		expect(r.handoverTime).toBeNull();
	});

	it('plugs a pairing mode it does not know of without changing', () => {
		const everyAttack: PairingMode = {
			id: 'every-attack',
			validate: (plan) => (plan.policy.pairing.patience === 'none' ? null : 'needs no patience'),
			times: (_plan, _clock, _chained, base) => ({ ...base, promptS: base.startS }),
			create: () => {
				let heard: number | null = null;
				return {
					offer: (a) => {
						heard ??= a.time;
						return { fate: 'answer', judged: null };
					},
					advance: () => {},
					done: () => heard !== null,
					droppable: () => heard === null,
					shownMisses: () => [],
					result: () => ({
						pairs:
							heard === null
								? []
								: [
										{
											expectation: 0,
											time: heard,
											judged: null,
											late: false,
											pending: false,
											correction: null,
											timing: null,
											offsetMs: null
										}
									],
						missed: heard === null ? [0] : [],
						dropped: [],
						extra: [],
						shift: null,
						clampedWindows: 0,
						attacks: heard === null ? [] : [heard]
					})
				};
			}
		};
		expect(Object.keys(ROUND_MODES.pairings)).not.toContain('every-attack');
		const modes: RoundModes = {
			pairings: { ...ROUND_MODES.pairings, 'every-attack': everyAttack },
			verdicts: ROUND_MODES.verdicts
		};
		const base = locatePlan();
		const plan: RoundPlan = {
			...base,
			policy: { ...base.policy, pairing: { mode: 'every-attack', patience: 'none' } }
		};
		const r = responseRound(plan, carried, modes);
		expect(r.promptTime).toBe(r.startTime);
		const seen = r.observe(played(1.0, RIGHT));
		expect(seen.fate).toBe('answer');
		expect(seen.event.kind).toBe('settled');
		expect(r.observe(played(1.1, RIGHT)).fate).toBe('settled');
		const impatient: RoundPlan = {
			...base,
			policy: { ...base.policy, pairing: { mode: 'every-attack' } }
		};
		expect(() => responseRound(impatient, carried, modes)).toThrow(
			'plan unfit for pairing mode every-attack: needs no patience'
		);
	});

	it('refuses a plan its verdict mode cannot judge, before anything is heard', () => {
		const base = locatePlan();
		const stretched: RoundPlan = {
			...base,
			expectations: base.expectations.map((e) => ({ ...e, span: { until: Fraction.of(1, 2) } }))
		};
		expect(() => responseRound(stretched)).toThrow(
			'plan unfit for verdict mode response: a response verdict needs a point expectation'
		);
	});

	it('refuses a plan whose mode is not registered', () => {
		const base = locatePlan();
		const kazoo: RoundPlan = {
			...base,
			policy: { ...base.policy, pairing: { mode: 'kazoo' } }
		};
		expect(() => responseRound(kazoo)).toThrow('unknown pairing mode: kazoo');
		const silent: RoundPlan = { ...base, policy: { ...base.policy, verdict: 'silence' } };
		expect(() => responseRound(silent)).toThrow('unknown verdict mode: silence');
	});

	it('settles a located note at once, shows a provisional miss at the window’s close, then settles off the beat', () => {
		const plan = withContent(locatePlan());
		const atOnce = responseRound(plan).observe(played(6.13, RIGHT));
		expect(atOnce.fate).toBe('answer');
		expect(atOnce.judged).toEqual(RIGHT);
		expect(atOnce.event.kind === 'settled' && atOnce.event.outcome.verdict.value).toMatchObject({
			verdict: 'perfect'
		});

		const r = responseRound(plan);
		expect(r.advance(6.3)).toEqual({ kind: 'none' });
		const shown = r.advance(6.5);
		expect(shown.kind).toBe('provisional');
		expect(shown.kind === 'provisional' && shown.outcome.verdict.value).toMatchObject({
			verdict: 'wrong'
		});
		expect(r.advance(6.6)).toEqual({ kind: 'none' });
		const late = r.observe(played(7.0, RIGHT));
		expect(late.fate).toBe('answer');
		expect(late.event.kind).toBe('settled');
		if (late.event.kind !== 'settled') return;
		expect(late.event.outcome.verdict.value).toMatchObject({ verdict: 'offbeat' });
		expect(late.event.outcome.success).toBe(false);
		expect(late.event.outcome.correct).toBe(true);
	});

	it('waits on an attack taken but not deciding the round', () => {
		const r = responseRound(withContent(anchorPlan()));
		const root = r.observe(played(6.1, RIGHT));
		expect(root.fate).toBe('answer');
		expect(root.event).toEqual({ kind: 'pending' });
		expect(r.observe(played(4, RIGHT, 'attack')).fate).toBe('other-sensor');
		expect(r.observe({ time: 7, sensor: 'note', readable: false, payload: null }).fate).toBe(
			'unreadable'
		);
	});

	it('settles a lost anchor once its zones are over, without waiting for readings', () => {
		const r = responseRound(withContent(anchorPlan()));
		const root = r.observe(played(6.1, WRONG));
		expect(root.fate).toBe('answer');
		expect(root.event.kind).toBe('pending');
		expect(r.advance(9.0)).toEqual({ kind: 'none' });
		const lost = r.advance(9.1);
		expect(lost.kind).toBe('settled');
		if (lost.kind !== 'settled') return;
		expect(lost.outcome.success).toBe(false);
		expect(lost.outcome.verdict.value).toMatchObject({ verdict: 'wrong' });
	});

	it('drops a round closed early with nothing heard', () => {
		const r = responseRound(locatePlan());
		expect(r.close(6.0)).toBeNull();
		expect(r.observe(played(6.1, RIGHT))).toEqual({
			fate: 'settled',
			judged: null,
			event: { kind: 'none' }
		});
		expect(r.advance(9.1)).toEqual({ kind: 'none' });
	});

	it('closes a round heard as it stands', () => {
		const r = responseRound(withContent(anchorPlan()));
		r.observe(played(6.1, RIGHT));
		const outcome = r.close(7.0);
		expect(outcome?.success).toBe(false);
		expect(outcome?.verdict.value).toMatchObject({ verdict: 'wrong' });
	});

	it('lets time pass before closing: a reading still waiting is final as it stands', () => {
		const r = responseRound(withContent(locatePlan()));
		expect(r.observe(played(6.13, WRONG, 'note', false)).event).toEqual({ kind: 'pending' });
		const outcome = r.close(8.35);
		expect(outcome?.verdict.value).toMatchObject({ verdict: 'wrong' });
		expect((outcome?.detail as PairingResult).pairs).toMatchObject([
			{ expectation: 0, time: 6.13, pending: false }
		]);
	});

	it('judges content with the judge of its kind', () => {
		const calls: [string, unknown, unknown][] = [];
		const judges: ContentJudges = (kind) => ({
			judge: (value, payload) => {
				calls.push([kind, value, payload]);
				return RIGHT;
			}
		});
		const r = responseRound(withContent(locatePlan(), 'note-kind'), judges);
		const seen = r.observe({ time: 6.1, sensor: 'note', readable: true, payload: { midi: 65 } });
		expect(seen.judged).toEqual(RIGHT);
		expect(calls).toEqual([['note-kind', 'value-0', { midi: 65 }]]);
	});

	it('judges an expectation without content as nothing', () => {
		const calls: string[] = [];
		const judges: ContentJudges = (kind) => {
			calls.push(kind);
			return { judge: () => RIGHT };
		};
		const seen = responseRound(locatePlan(), judges).observe(played(6.1, RIGHT));
		expect(seen.judged).toBeNull();
		expect(calls).toEqual([]);
	});
});
