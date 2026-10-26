import { describe, expect, it } from 'vitest';
import { DEFAULT_BEAT_PACING } from '$lib/domain/exercise/pacing';
import { anchorPlan, beatPlan, freePlan, gridChangePlan } from '$lib/domain/exercise/roundPlans';
import {
	beatTiming,
	createAnchorTiming,
	createGridTiming,
	identifyTiming,
	RESPIRATION_BARS,
	type GridChangeTiming,
	type Round,
	type RoundEvent as LegacyEvent,
	type RoundOutcome as LegacyOutcome
} from '$lib/domain/timing';
import { IDENTIFY_RECALL_THRESHOLD_MS, type LeadBeats } from '$lib/domain/types';
import { Fraction } from './fraction';
import { METER_4_4 } from './meter';
import type { ResponseValue } from './modes/responseVerdict';
import type { ContentJudges, ExpectedContent, RoundPlan } from './plan';
import { PlanRound, type RoundEvent, type RoundOutcome } from './round';
import { createTempoMap } from './tempoMap';
import { EDGE_TOLERANCE_S } from './modes/times';

/**
 * The parity bench: the one-answer relations of `domain/timing` and the round engine judge the
 * same scripts the same way, step by step. A script is a clock (an origin and a tempo), a round
 * and what happens to it: readings heard, beats, an abandon.
 */

type Kind = 'beat' | 'anchor' | 'grid' | 'free';

interface Setup {
	kind: Kind;
	bpm: number;
	/** Audio seconds of beat 0. */
	origin: number;
	/** The beat the old relation opens on (fractional for a chained change). */
	promptBeat: number;
	leadBeats?: LeadBeats;
	lengthBeats?: number;
	chained?: boolean;
	/** Free time: the instant of the prompt. */
	now?: number;
}

interface Reading {
	time: number;
	sensor: string;
	final: boolean;
	correct: boolean;
	answer: string;
	/** Readings of one generated attack share its id. */
	attack?: number;
}

type Step = { observe: Reading } | { beat: number } | { abandon: number };

interface Script {
	setup: Setup;
	steps: Step[];
}

interface Normalized {
	verdict: string;
	correct: boolean;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	answer: unknown;
}

interface Trace {
	/** Per step: the fate of an observation, null for a beat or an abandon. */
	fates: (string | null)[];
	provisional: { step: number; verdict: string } | null;
	/** `outcome` null: dropped by an abandon. */
	settled: { step: number; outcome: Normalized | null } | null;
}

const SCRIPTED: ExpectedContent = { kind: 'scripted', value: null };

/** The judge says what the script says. */
const judges: ContentJudges = (kind) => {
	if (kind !== 'scripted') throw new Error(`no judge for ${kind}`);
	return {
		judge: (_value, payload) => {
			const { correct, answer } = payload as { correct: boolean; answer: string };
			return { correct, answer, confusion: null };
		}
	};
};

const LATENCY = { ms: 0, provenance: 'system' as const };

const anchorTiming = createAnchorTiming(DEFAULT_BEAT_PACING);
const gridTiming = createGridTiming((item) => item as GridChangeTiming);

const secondsPerBeat = (setup: Setup) => 60 / setup.bpm;
const beatTimeOf = (setup: Setup) => (i: number) => setup.origin + i * secondsPerBeat(setup);

/** A beat (possibly a half) as a position, in quarter notes. */
const beatPosition = (beat: number) => Fraction.of(Math.round(beat * 2), 8);

/** The beat of the round's start on the new side: the target, or the change. */
function startBeat(setup: Setup): number {
	if (setup.kind === 'grid') return setup.chained ? setup.promptBeat : setup.promptBeat + 1;
	return setup.promptBeat + (setup.leadBeats as number);
}

function openLegacy(setup: Setup): Round {
	const beatTime = beatTimeOf(setup);
	const input = {
		promptBeat: setup.promptBeat,
		now: setup.now ?? beatTime(setup.promptBeat),
		beatTime,
		secondsPerBeat: secondsPerBeat(setup)
	};
	switch (setup.kind) {
		case 'beat':
			return beatTiming.open({ ...input, planned: { leadBeats: setup.leadBeats ?? null } });
		case 'anchor':
			return anchorTiming.open({ ...input, planned: { leadBeats: setup.leadBeats ?? null } });
		case 'grid':
			return gridTiming.open({
				...input,
				planned: { leadBeats: null, item: { lengthBeats: setup.lengthBeats } },
				chained: setup.chained ?? false
			});
		case 'free':
			return identifyTiming.open({ ...input, planned: { leadBeats: null } });
	}
}

function planOf(setup: Setup): RoundPlan {
	const meter = METER_4_4;
	switch (setup.kind) {
		case 'beat':
			return beatPlan({
				content: SCRIPTED,
				leadBeats: setup.leadBeats as LeadBeats,
				meter,
				respirationBars: RESPIRATION_BARS
			});
		case 'anchor':
			return anchorPlan({
				root: SCRIPTED,
				chord: SCRIPTED,
				leadBeats: setup.leadBeats as LeadBeats,
				meter,
				respirationBars: RESPIRATION_BARS
			});
		case 'grid':
			return gridChangePlan({ content: SCRIPTED, lengthBeats: setup.lengthBeats as number, meter });
		case 'free':
			return freePlan({ content: SCRIPTED, recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS });
	}
}

function openEngine(setup: Setup): PlanRound {
	const map = createTempoMap(setup.origin, [
		{ at: Fraction.ZERO, bpm: setup.bpm, unit: Fraction.of(1, 4) }
	]);
	const clock =
		setup.kind === 'free'
			? { promptS: setup.now as number }
			: { map, start: beatPosition(startBeat(setup)) };
	return new PlanRound({
		plan: planOf(setup),
		clock,
		chained: setup.chained ?? false,
		judges,
		latency: LATENCY,
		thresholds: null,
		aids: []
	});
}

function normalizeLegacy(kind: Kind, outcome: LegacyOutcome): Normalized {
	const answer =
		kind === 'anchor'
			? (outcome.answer ?? { root: null, chord: null, correction: null })
			: outcome.answer;
	return {
		verdict: outcome.verdict,
		correct: outcome.correct,
		timingOffsetMs: outcome.timingOffsetMs,
		reactionMs: outcome.reactionMs,
		answer
	};
}

function normalizeEngine(kind: Kind, outcome: RoundOutcome): Normalized {
	const value = outcome.verdict.value as ResponseValue;
	const [first, second] = value.expectations;
	const answer =
		kind === 'anchor'
			? { root: first.answer, chord: second.answer, correction: second.correction }
			: first.answer;
	return {
		verdict: value.verdict,
		correct: outcome.correct as boolean,
		timingOffsetMs: value.timingOffsetMs,
		reactionMs: value.reactionMs,
		answer
	};
}

/** Records the first provisional miss and the settlement told by an event. */
function recorder<O>(normalize: (outcome: O) => Normalized) {
	const trace: Trace = { fates: [], provisional: null, settled: null };
	return {
		trace,
		event(step: number, event: { kind: string; outcome?: O }) {
			if (event.kind === 'provisional' && !trace.provisional && !trace.settled) {
				trace.provisional = { step, verdict: normalize(event.outcome as O).verdict };
			}
			if (event.kind === 'settled' && !trace.settled) {
				trace.settled = { step, outcome: normalize(event.outcome as O) };
			}
		},
		closed(step: number, outcome: O | null) {
			if (!trace.settled) trace.settled = { step, outcome: outcome && normalize(outcome) };
		}
	};
}

function playLegacy({ setup, steps }: Script): Trace {
	const round = openLegacy(setup);
	const beatTime = beatTimeOf(setup);
	const record = recorder<LegacyOutcome>((o) => normalizeLegacy(setup.kind, o));
	steps.forEach((step, index) => {
		if ('observe' in step) {
			const { attack: _attack, ...observation } = step.observe;
			const event: LegacyEvent = round.observe(observation);
			record.trace.fates.push(event.kind === 'ignored' ? event.reason : 'answer');
			record.event(index, event);
			return;
		}
		record.trace.fates.push(null);
		if ('beat' in step) {
			record.event(index, round.onBeat({ index: step.beat, time: beatTime(step.beat) }));
		} else if (!record.trace.settled) {
			record.closed(index, round.abandon(step.abandon));
		}
	});
	return record.trace;
}

function playEngine({ setup, steps }: Script): Trace {
	const round = openEngine(setup);
	const beatTime = beatTimeOf(setup);
	const record = recorder<RoundOutcome>((o) => normalizeEngine(setup.kind, o));
	steps.forEach((step, index) => {
		if ('observe' in step) {
			const { time, sensor, final, correct, answer } = step.observe;
			const observed = round.observe({
				time,
				sensor,
				readable: true,
				final,
				payload: { correct, answer }
			});
			record.trace.fates.push(observed.fate);
			record.event(index, observed.event);
			return;
		}
		record.trace.fates.push(null);
		if ('beat' in step) {
			const event: RoundEvent = round.advance(beatTime(step.beat));
			record.event(index, event);
		} else if (!record.trace.settled) {
			record.closed(index, round.close(step.abandon));
		}
	});
	return record.trace;
}

/** Plays the script on both sides, asserts they agree, and gives the old side's trace. */
function parity(script: Script): Trace {
	const legacy = playLegacy(script);
	expect(playEngine(script), JSON.stringify(script)).toEqual(legacy);
	return legacy;
}

/** The verdict a trace settled on; 'dropped' when abandoned with nothing; null while open. */
const settledVerdict = (trace: Trace) =>
	trace.settled ? (trace.settled.outcome?.verdict ?? 'dropped') : null;

// ── Steps ─────────────────────────────────────────────────────────────────────

const answerOf = (correct: boolean) => (correct ? 'right' : 'wrong');

function heard(sensor: string) {
	return (time: number, correct = true, final = true, answer = answerOf(correct)): Step => ({
		observe: { time, sensor, final, correct, answer }
	});
}
const note = heard('note');
const chord = heard('chord');
const tap = heard('tap');
const beat = (index: number): Step => ({ beat: index });
const beats = (from: number, to: number): Step[] =>
	Array.from({ length: to - from + 1 }, (_, i) => beat(from + i));
const abandon = (now: number): Step => ({ abandon: now });

type Scenario = [name: string, setup: Setup, steps: Step[], verdict: string | null];

function runScenarios(scenarios: Scenario[]) {
	it.each(scenarios)('%s', (_name, setup, steps, verdict) => {
		expect(settledVerdict(parity({ setup, steps }))).toBe(verdict);
	});
}

// ── Hand-written scenarios, from the specs of the old relations ─────────────────

// 80 bpm from 0.1 s: prompt on beat 4 (3.1 s), lead 4, target on beat 8 (6.1 s).
const bt = (i: number) => 0.1 + i * 0.75;
const located: Setup = { kind: 'beat', bpm: 80, origin: 0.1, promptBeat: 4, leadBeats: 4 };

describe('beat', () => {
	runScenarios([
		['the first note in the window, the next ignored', located, [note(6.13), note(6.2)], 'perfect'],
		['early past the perfect window', located, [note(6.0)], 'early'],
		['late past the perfect window', located, [note(6.2)], 'late'],
		['exactly the perfect window late', located, [note(6.18)], 'perfect'],
		['exactly the perfect window early', located, [note(6.02)], 'perfect'],
		['a millisecond beyond, late', located, [note(6.181)], 'late'],
		['a millisecond beyond, early', located, [note(6.019)], 'early'],
		['the rounded offset, perfect', located, [note(6.1804)], 'perfect'],
		['the rounded offset, late', located, [note(6.1806)], 'late'],
		['a right note soon after the prompt', located, [note(3.455)], 'early'],
		['the last instant of the window', located, [note(6.5)], 'late'],
		[
			'the closing edge after latency correction',
			{ kind: 'beat', bpm: 240, origin: 0.028 - 1, promptBeat: 4, leadBeats: 4 },
			[note(1.453 - 25 / 1000)],
			'late'
		],
		['a wrong note on the target', located, [note(6.1, false)], 'wrong'],
		['a wrong note with its offset', located, [note(6.13, false)], 'wrong'],
		[
			'before the prompt or in its first 300 ms',
			located,
			[note(3.2), note(2), beats(4, 7)].flat(),
			null
		],
		['the late capture once the window closed', located, [beat(8), beat(9), note(7.0)], 'offbeat'],
		['a right note past the window, before its beat', located, [note(6.6)], 'offbeat'],
		['a note in the window heard after the closing beat', located, [beat(9), note(6.45)], 'late'],
		['a wrong note in the capture', located, [beat(9), note(7.0, false)], 'wrong'],
		[
			'the capture ends at the next prompt’s string preview',
			located,
			[beat(9), note(8.4), beat(10), beat(11), note(8.0)],
			'wrong'
		],
		[
			'the capture ends before the next prompt at 160 bpm',
			{ kind: 'beat', bpm: 160, origin: 0.1, promptBeat: 4, leadBeats: 4 },
			[beat(9), note(0.1 + 11 * 0.375 + 0.05), note(0.1 + 11 * 0.375 - 0.05)],
			'offbeat'
		],
		['abandoned while listening', located, [beat(8), abandon(bt(8))], 'dropped'],
		['abandoned in the capture', located, [beat(9), abandon(bt(9))], 'wrong'],
		[
			'a wrong reading waiting, then the final one of the same attack',
			located,
			[note(6.13, false, false, 'x'), note(6.13, true, true, 'd')],
			'perfect'
		],
		['a right reading not final', located, [note(6.13, true, false, 'd')], 'perfect'],
		[
			'a reading waiting past the window, judged at the capture end',
			located,
			[
				note(6.13, false, false, 'x'),
				note(6.13, false, false, 'y'),
				beat(9),
				note(6.13, false, false, 'z'),
				beat(10),
				beat(11)
			],
			'wrong'
		],
		[
			'another attack while a reading waits',
			located,
			[note(6.13, false, false, 'x'), note(6.4, true, true, 'd')],
			null
		],
		[
			'a waiting reading abandoned',
			located,
			[note(6.13, false, false, 'x'), abandon(6.2)],
			'wrong'
		],
		[
			'a reading after the window that refines to right',
			located,
			[beat(9), note(7.0, false, false, 'x'), note(7.0, true, true, 'd')],
			'offbeat'
		]
	]);
});

const anchored: Setup = { kind: 'anchor', bpm: 80, origin: 0.1, promptBeat: 4, leadBeats: 4 };

describe('anchor', () => {
	runScenarios([
		[
			'the root on the target, the chord in the bar',
			anchored,
			[note(6.13), chord(bt(10))],
			'perfect'
		],
		['the verdict in time is the root’s', anchored, [note(6.3), chord(bt(9) + 0.2)], 'late'],
		['a right root without a chord', anchored, [note(6.13), ...beats(9, 15)], 'wrong'],
		[
			'no chord on the first beat nor after the bar',
			anchored,
			[note(6.1), chord(6.1), chord(bt(12) + 0.01), beat(15)],
			'wrong'
		],
		[
			'a chord attacked late in the bar, read after it',
			anchored,
			[note(6.13), beat(12), chord(8.85)],
			'perfect'
		],
		[
			'the final reading of the chord after the bar',
			anchored,
			[note(6.13), chord(bt(11), false, false), beat(12), chord(bt(11), true, true)],
			'perfect'
		],
		['a wrong root under a right chord', anchored, [note(6.13, false), chord(bt(10))], 'wrong'],
		[
			'a wrong chord after a right root, never put right',
			anchored,
			[note(6.13), chord(bt(10), false), ...beats(11, 15)],
			'wrong'
		],
		[
			'a right chord after a wrong one: corrected',
			anchored,
			[note(6.13), chord(bt(10), false), chord(bt(11))],
			'corrected'
		],
		[
			'no correction after the band, nor a wrong one',
			anchored,
			[
				note(6.13),
				chord(bt(10), false),
				chord(bt(10) + 0.4, false),
				chord(bt(12) + 0.01),
				beat(15)
			],
			'wrong'
		],
		[
			'never a correction of a wrong root',
			anchored,
			[note(6.13, false), chord(bt(10), false)],
			'wrong'
		],
		[
			'a provisional miss abandoned',
			anchored,
			[note(6.13), chord(bt(10), false), abandon(bt(10) + 0.1), chord(bt(11))],
			'wrong'
		],
		[
			'the first chord attack refined until final, judged at the end of the wait',
			anchored,
			[note(6.13), chord(bt(10), false, false), chord(bt(11), true, true), beat(12), beat(15)],
			'wrong'
		],
		[
			'a missed root shown at once, an off-beat root before beat 2',
			anchored,
			[beat(9), note(6.7), chord(bt(10))],
			'offbeat'
		],
		['abandoned before any answer', anchored, [abandon(6.0)], 'dropped'],
		['abandoned after a right root', anchored, [note(6.13), abandon(6.5)], 'wrong']
	]);
});

// 80 bpm from 1 s: a change on beat 4 (4 s) lasting 2 beats, opened on beat 3.
const change: Setup = { kind: 'grid', bpm: 80, origin: 1, promptBeat: 3, lengthBeats: 2 };
const gt = (i: number, bpm = 80) => 1 + (i * 60) / bpm;
const fast: Setup = { ...change, bpm: 160 };
const chainedChange: Setup = { ...change, promptBeat: 6.5, chained: true };

describe('gridChange', () => {
	runScenarios([
		['early', change, [chord(gt(4) - 0.1)], 'early'],
		['perfect', change, [chord(gt(4) - 0.06)], 'perfect'],
		['late', change, [chord(gt(4) + 0.3)], 'late'],
		['offbeat', change, [chord(gt(4) + 0.6)], 'offbeat'],
		['the next attack ignored', change, [chord(gt(4) - 0.1), chord(gt(4) + 0.01)], 'early'],
		['a wrong chord after the window', change, [chord(gt(4) + 0.6, false)], 'wrong'],
		['before the window', change, [chord(gt(4) - 0.3)], null],
		['at the handover', change, [chord(gt(4) + 1.3)], null],
		['140 ms early at 160 bpm', fast, [chord(gt(4, 160) - 0.14)], 'early'],
		['160 ms early at 160 bpm', fast, [chord(gt(4, 160) - 0.16)], null],
		[
			'a provisional miss, settled wrong at the handover',
			change,
			[beat(4), beat(5), abandon(gt(6) - 0.2)],
			'wrong'
		],
		[
			'unanswered at a handover before any beat closed the window',
			{ ...fast, lengthBeats: 1 },
			[abandon(gt(5, 160) - 0.15)],
			'wrong'
		],
		['paused before its window closed', change, [beat(4), abandon(gt(4))], 'dropped'],
		[
			'a better reading of the first attack',
			change,
			[chord(gt(4) - 0.1, false, false), chord(gt(4) + 0.05), chord(gt(4) - 0.1, true, true)],
			'early'
		],
		[
			'a reading still waiting at the handover',
			change,
			[chord(gt(4) + 0.1, false, false), abandon(gt(6) - 0.2)],
			'wrong'
		],
		['chained, early', chainedChange, [chord(gt(6.5) - 0.1)], 'early'],
		[
			'chained, a provisional miss settled at the handover',
			chainedChange,
			[beat(7), beat(8), abandon(gt(8.5) - 0.2)],
			'wrong'
		],
		[
			'chained, paused before its window closed',
			chainedChange,
			[beat(7), abandon(gt(7))],
			'dropped'
		]
	]);
});

// Prompted at 10 s, no tempo for the verdict.
const named: Setup = { kind: 'free', bpm: 80, origin: 0.1, promptBeat: 5, now: 10 };

describe('free', () => {
	runScenarios([
		[
			'a right answer by its reaction time, the next ignored',
			named,
			[tap(11.2), tap(12)],
			'perfect'
		],
		['a slow right answer', named, [tap(14)], 'late'],
		['a wrong answer', named, [tap(11, false)], 'wrong'],
		['exactly the threshold', named, [tap(13)], 'perfect'],
		['a millisecond more', named, [tap(13.001)], 'late'],
		['the rounded reaction, perfect', named, [tap(13.0004)], 'perfect'],
		['the rounded reaction, late', named, [tap(13.0006)], 'late'],
		['a fast wrong answer', named, [tap(10.3, false)], 'wrong'],
		['at the very prompt time', named, [tap(10)], 'perfect'],
		['before the prompt', named, [tap(9.9), beat(14)], null],
		['nothing to abandon', named, [beat(14), abandon(bt(14))], 'dropped']
	]);
});

// ── Intended differences ───────────────────────────────────────────────────────

/**
 * D1 (approved by the author): the engine closes the anchor's root at the exact end of its zone
 * (beat 2), on the advance that reaches it; the old `BeatRound` settles it only on a later beat
 * than the one that closed its window, so it decides a beat or two later.
 */
describe('intended differences', () => {
	const both = (steps: Step[]) => {
		const script = { setup: anchored, steps };
		return { legacy: playLegacy(script), engine: playEngine(script) };
	};

	it('settles a late root attack after the root’s zone (D1), old: after the capture', () => {
		// The strum of the chord, from beat 2 on, is never a late root, on either side.
		const { legacy, engine } = both([beat(9), note(bt(10))]);
		expect(legacy.fates).toEqual([null, 'after-capture']);
		expect(engine.fates).toEqual([null, 'settled']);
		expect(settledVerdict(engine)).toBe(settledVerdict(legacy));
	});

	it('settles a missed root with a wrong chord at once (D1), old: on the next beat', () => {
		const { legacy, engine } = both([beat(9), chord(bt(10), false), beat(10)]);
		expect(legacy.settled?.step).toBe(2);
		expect(engine.settled?.step).toBe(1);
		expect(engine.settled?.outcome).toEqual(legacy.settled?.outcome);
	});

	it('freezes a root reading still waiting at the root’s zone end (D1), old: takes a later one', () => {
		const { legacy, engine } = both([
			note(6.13, false, false, 'x'),
			beat(9),
			note(6.13, true, true, 'd'),
			chord(bt(10))
		]);
		expect(legacy.fates).toEqual(['answer', null, 'answer', 'answer']);
		expect(engine.fates).toEqual(['answer', null, 'settled', 'answer']);
		expect(legacy.settled?.outcome).toMatchObject({ verdict: 'perfect', answer: { root: 'd' } });
		expect(engine.settled?.outcome).toMatchObject({ verdict: 'wrong', answer: { root: 'x' } });
	});
});

/** What D1 explains in an anchor script: where the root's zone ends, and how the root stood there. */
interface RootClosing {
	/** Audio seconds of the root's capture end (beat 2 of the target bar). */
	endS: number;
	/** The step of the beat that reaches it; Infinity when the script has none. */
	endStep: number;
	/** No root answer before that beat. */
	unanswered: boolean;
	/** The attack of a root reading still waiting at that beat, if any. */
	pendingAttack: number | null;
	/**
	 * The step from which the old side says `settled` to every root attack: its inner root (or
	 * the whole anchor) settled. Infinity when it never does.
	 */
	oldRootSettledStep: number;
}

function rootClosing({ setup, steps }: Script, legacy: Trace): RootClosing {
	const beatTime = beatTimeOf(setup);
	const endS = beatTime(setup.promptBeat + (setup.leadBeats as number) + 1);
	const found = steps.findIndex((s) => 'beat' in s && beatTime(s.beat) >= endS - EDGE_TOLERANCE_S);
	const endStep = found < 0 ? Infinity : found;
	let answer: Reading | null = null;
	steps.forEach((step, index) => {
		if (index >= endStep || !('observe' in step) || step.observe.sensor !== 'note') return;
		if (legacy.fates[index] === 'answer') answer = step.observe;
	});
	const last = answer as Reading | null;
	const pending = last !== null && !last.final && !last.correct;
	return {
		endS,
		endStep,
		unanswered: last === null,
		pendingAttack: pending ? (last.attack ?? null) : null,
		oldRootSettledStep: Math.min(
			oldRootSettledStep({ setup, steps }),
			legacy.settled?.step ?? Infinity
		)
	};
}

/**
 * Replays the old side and gives the step after which its inner root round (a `BeatRound`, read
 * through its public `after()`, non-null once settled) is settled.
 */
function oldRootSettledStep(script: Script): number {
	const round = openLegacy(script.setup);
	const root = (round as unknown as { root: { after(): unknown } }).root;
	const beatTime = beatTimeOf(script.setup);
	for (const [index, step] of script.steps.entries()) {
		if ('observe' in step) {
			const { attack: _attack, ...observation } = step.observe;
			round.observe(observation);
		} else if ('beat' in step) round.onBeat({ index: step.beat, time: beatTime(step.beat) });
		else round.abandon(step.abandon);
		if (root.after() !== null) return index;
	}
	return Infinity;
}

/** A note observation reaching the round after the engine closed the root, before the old side did. */
const isBetweenRootClosings = (
	step: Step,
	index: number,
	d1: RootClosing
): step is { observe: Reading } =>
	'observe' in step &&
	step.observe.sensor === 'note' &&
	index > d1.endStep &&
	index <= d1.oldRootSettledStep;

/** A later reading of the root's attack still waiting at its zone end. */
const isRootReRead = (step: Step, index: number, d1: RootClosing): boolean =>
	d1.pendingAttack !== null &&
	isBetweenRootClosings(step, index, d1) &&
	step.observe.attack === d1.pendingAttack;

/** Between the two closings: an attack after the root's zone, or a re-reading of its waiting one. */
const isLateRootObservation = (step: Step, index: number, d1: RootClosing): boolean =>
	isRootReRead(step, index, d1) ||
	(isBetweenRootClosings(step, index, d1) && step.observe.time > d1.endS + EDGE_TOLERANCE_S);

/** The root's miss is decided at a different step: unanswered or still waiting at its zone end. */
const rootDecidedApart = (d1: RootClosing): boolean => d1.unanswered || d1.pendingAttack !== null;

/** A later reading of the root's waiting attack came: the old side may judge the root on it. */
const rootReadAgain = (script: Script, d1: RootClosing): boolean =>
	script.steps.some((step, index) => isRootReRead(step, index, d1));

/** The trace with what D1 explains blanked out; everything else is kept for comparison. */
function withoutRootClosing(script: Script, trace: Trace, d1: RootClosing): Trace {
	const fates = trace.fates.map((fate, index) =>
		isLateRootObservation(script.steps[index], index, d1) ? 'D1' : fate
	);
	const decidedApart = rootDecidedApart(d1);
	// A root miss is shown when the root is decided: its step, and whether it shows, are D1's.
	const provisional = d1.unanswered ? null : trace.provisional;
	let settled = trace.settled;
	if (settled && decidedApart) settled = { ...settled, step: -1 };
	if (settled?.outcome && d1.pendingAttack !== null) {
		const answer = { ...(settled.outcome.answer as object), root: 'D1' };
		const outcome = rootReadAgain(script, d1)
			? { ...settled.outcome, verdict: 'D1', correct: false, answer }
			: { ...settled.outcome, answer };
		settled = { ...settled, outcome };
	}
	return { fates, provisional, settled };
}

// ── Random scripts ─────────────────────────────────────────────────────────────

/** A small seeded generator (mulberry32). */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const SENSORS: Record<Kind, string[]> = {
	beat: ['note'],
	anchor: ['note', 'chord'],
	grid: ['chord'],
	free: ['tap']
};

/** Steps sorted by the instant they reach the round; at one instant, readings before the clock. */
interface Timed {
	at: number;
	order: number;
	step: Step;
}

function randomScript(kind: Kind, seed: number): Script {
	const random = mulberry32(seed);
	const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
	const pick = <T>(list: readonly T[]): T => list[int(0, list.length - 1)];
	const ms = (seconds: number) => Math.round(seconds * 1000);

	// 150 bpm left out: a beat then falls exactly on target + LATE_LIMIT_MS, and the old
	// `BeatRound.onBeat` compares `beat.time >= closesAt` with no edge tolerance (D2).
	const bpm = pick(Array.from({ length: 81 }, (_, i) => 80 + i).filter((b) => b !== 150));
	const origin = int(0, 2000) / 1000;
	const spb = 60 / bpm;
	const beatTime = (i: number) => origin + i * spb;

	let setup: Setup;
	let promptS: number;
	let listenUntilS: number;
	let handoverS: number | null = null;
	if (kind === 'beat' || kind === 'anchor') {
		const leadBeats = pick([2, 4, 8] as const);
		const target = 4 * int(2, 5);
		setup = { kind, bpm, origin, promptBeat: target - leadBeats, leadBeats };
		promptS = beatTime(target - leadBeats);
		listenUntilS = beatTime(target + (kind === 'anchor' ? 7 : 3));
	} else if (kind === 'grid') {
		const lengthBeats = pick([1, 2, 3, 4]);
		const chained = random() < 0.5;
		const promptBeat = chained ? int(8, 20) / 2 : int(3, 10);
		setup = { kind, bpm, origin, promptBeat, lengthBeats, chained };
		const changeBeat = chained ? promptBeat : promptBeat + 1;
		const early = Math.min(0.2, 0.4 * spb);
		promptS = chained ? beatTime(changeBeat) - early : beatTime(promptBeat);
		handoverS = beatTime(changeBeat + lengthBeats) - early;
		listenUntilS = handoverS;
	} else {
		const promptBeat = int(0, 8);
		const now = (ms(beatTime(promptBeat)) + int(0, ms(spb))) / 1000;
		setup = { kind, bpm, origin, promptBeat, now };
		promptS = now;
		listenUntilS = now + 5;
	}

	const timed: Timed[] = [];
	let label = 0;
	for (const sensor of SENSORS[kind]) {
		for (let n = int(0, 4); n > 0; n--) {
			const time = int(ms(promptS - 0.5), ms(listenUntilS + 0.5)) / 1000;
			// A tap is read once, final: the old free relation never knew another reading.
			const twice = kind !== 'free' && random() < 0.3;
			const attack = label;
			const reading = (final: boolean): Step => {
				const correct = random() < 0.5;
				const answer = `${sensor}-${label++}`;
				return { observe: { time, sensor, final, correct, answer, attack } };
			};
			const firstAt = time + (random() < 0.7 ? 0 : int(1, 150) / 1000);
			timed.push({
				at: firstAt,
				order: 0,
				step: reading(twice ? false : kind === 'free' || random() < 0.6)
			});
			if (twice) {
				timed.push({ at: firstAt + int(1, 300) / 1000, order: 0, step: reading(random() < 0.6) });
			}
		}
	}
	const firstBeat = Math.max(0, Math.ceil(setup.promptBeat));
	const lastBeat = Math.ceil((listenUntilS + 1 - origin) / spb);
	for (let i = firstBeat; i <= lastBeat; i++)
		timed.push({ at: beatTime(i), order: 1, step: beat(i) });
	// The session settles a change at its handover, before any later beat.
	if (handoverS !== null) timed.push({ at: handoverS, order: 2, step: abandon(handoverS) });

	timed.sort((a, b) => a.at - b.at || a.order - b.order);
	let steps = timed.map((t) => t.step);
	const end = steps.findIndex((s) => 'abandon' in s);
	if (end >= 0) steps = steps.slice(0, end + 1);
	if (random() < 0.1) {
		const beatSteps = steps.flatMap((s, i) => ('beat' in s ? [i] : []));
		if (beatSteps.length > 0) {
			const at = pick(beatSteps);
			const { beat: index } = steps[at] as { beat: number };
			steps = [...steps.slice(0, at + 1), abandon(beatTime(index))];
		}
	}
	return { setup, steps };
}

const RANDOM_SCRIPTS = 500;

describe('random scripts', () => {
	it.each(['beat', 'anchor', 'grid', 'free'] as const)('judges %s alike', (kind) => {
		const failures: { seed: number; script: Script; legacy: Trace; engine: Trace }[] = [];
		for (let seed = 1; seed <= RANDOM_SCRIPTS; seed++) {
			const script = randomScript(kind, seed);
			let legacy = playLegacy(script);
			let engine = playEngine(script);
			if (kind === 'anchor') {
				const d1 = rootClosing(script, legacy);
				legacy = withoutRootClosing(script, legacy, d1);
				engine = withoutRootClosing(script, engine, d1);
			}
			if (JSON.stringify(legacy) !== JSON.stringify(engine)) {
				failures.push({ seed, script, legacy, engine });
			}
		}
		expect(failures.slice(0, 1), `${failures.length} scripts differ`).toEqual([]);
	});
});
