import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GESTURE_LINK } from '$lib/domain/gesture/exercises';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import {
	Fraction,
	METER_4_4,
	clickAccompaniment,
	type CycleReport,
	type ResponseValue,
	type RoundPlan
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { gridExpectation } from '$lib/application/mechanics/chordGrid';
import { FakeChordVerifier, FakeClock, FakeSoundScheduler } from '$lib/testing/fakes';
import { identifyPlan, changePlan } from '$lib/testing/plans';
import { shapeId } from '$lib/testing/shapes';
import { logDetection } from '$lib/debug/detectionLog';
import { chordSensor, type Observation, type ObservationSource } from '../sensors';
import { Transport } from '../transport';
import { RoundRunner, type RunnerEvent } from './roundRunner';

vi.mock('$lib/debug/detectionLog', () => ({ logDetection: vi.fn() }));

const G_B_E: StringNumber[] = [3, 2, 1];
const IOHEFY = gridChanges(gridById('iohefy-a'));
const RIGHT = shapeId('D', 'min', G_B_E, '7-6-5');
const WRONG = shapeId('D', 'maj', G_B_E, '7-7-5');

/** The second change of the grid, Dm7 for 4 beats: one bar in 4/4. */
const item: ChordGridItem = {
	rule: 'jam',
	element: 'jam:iohefy-a',
	passageId: 's:0',
	index: 1,
	changes: IOHEFY,
	symbol: IOHEFY[1].symbol,
	chord: 'D|min',
	sets: [G_B_E],
	previous: null
};

const planned: PlannedItem = {
	exerciseId: 'gesture-jam',
	mechanic: 'chord-grid',
	exerciseLevel: 0,
	item,
	phase: 'free',
	temperature: 'hot',
	aid: 'none',
	leadBeats: null
};

/** A verifier that may report at once when its expectation is withdrawn (a window cut short). */
class CutShortVerifier extends FakeChordVerifier {
	onWithdraw: (() => void) | null = null;

	override expect(expectation: ChordExpectation | null): void {
		super.expect(expectation);
		if (expectation === null && this.onWithdraw) {
			const report = this.onWithdraw;
			this.onWithdraw = null;
			report();
		}
	}
}

/**
 * ♩ = 120 bpm from 0.1 s: a beat lasts 0.5 s, a bar 2 s. The round starts on the downbeat of the
 * first bar after the listen-in and the counted bar; its prompt shows a beat before, its change
 * opens 200 ms early, it hands over 200 ms before its end.
 */
async function setup(
	options: {
		plan?: RoundPlan;
		chained?: boolean;
		/** Seconds after the first change's target the controller opens the round at. */
		openedAfter?: number;
		latencyOf?: (sensor: string) => CycleReport['latency'];
		debug?: { lines(payload: unknown): string[] };
	} = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const transport = new Transport({ clock, sounds });
	const { map, playFrom } = await transport.begin({
		meter: METER_4_4,
		tempo: { at: Fraction.ZERO, bpm: 120, unit: Fraction.of(1, 4) },
		accompaniment: clickAccompaniment({
			meter: METER_4_4,
			beats: [1, 2, 3, 4],
			accent: [1],
			bars: ['on']
		})
	});
	const t0 = map.toSeconds(Fraction.of(playFrom));
	const verifier = new CutShortVerifier();
	const chord = chordSensor(verifier)({ latencyMs: 0, clock });
	const noteExpectations: unknown[] = [];
	let noteListener: ((observation: Observation) => void) | null = null;
	const note: ObservationSource = {
		onObservation: (callback) => {
			noteListener = callback;
			return () => (noteListener = null);
		},
		expect: (value) => noteExpectations.push(value)
	};
	const events: { at: number; event: RunnerEvent }[] = [];
	const runner = new RoundRunner({
		plan: options.plan ?? changePlan(item, METER_4_4, GESTURE_LINK),
		item: planned,
		at: Fraction.of(playFrom),
		chained: options.chained ?? false,
		openedAt: t0 + (options.openedAfter ?? -0.5),
		transport,
		map,
		latencyOf: options.latencyOf ?? (() => ({ ms: 0, provenance: 'system' })),
		sources: new Map([
			['chord', chord],
			['note', note]
		]),
		expectation: { chord: gridExpectation(item, t0 - 0.5) },
		debug: options.debug,
		onEvent: (event) => events.push({ at: clock.now(), event })
	});
	// The controller routes each source's observations to the open round.
	chord.onObservation((observation) => runner.observe('chord', observation));
	note.onObservation((observation) => runner.observe('note', observation));
	/** Moves the clock to `time` by 10 ms steps, the scheduler waking at each. */
	const runTo = (time: number) => {
		while (clock.now() < time) {
			clock.time = Math.min(clock.now() + 0.01, time);
			sounds.flush();
		}
	};
	const report = (time: number, decided: string | null): ChordReport => ({
		time,
		windowMs: 300,
		decided,
		final: true,
		variants: []
	});
	const hearNote = (time: number) =>
		noteListener?.({ time, payload: { midi: 62 }, readable: true });
	return { runner, verifier, noteExpectations, events, runTo, t0, report, hearNote };
}

const valueOf = (event: RunnerEvent) => event.outcome.verdict.value as ResponseValue;

describe('RoundRunner', () => {
	beforeEach(() => vi.mocked(logDetection).mockClear());

	it('tells each sensor what to listen for, and the others nothing', async () => {
		const ctx = await setup();
		expect(ctx.verifier.expectations).toEqual([gridExpectation(item, ctx.t0 - 0.5)]);
		expect(ctx.noteExpectations).toEqual([null]);
		expect(ctx.runner.span.planned).toBe(planned);
		expect(ctx.runner.span.snapshot()).toEqual([]);
		expect(ctx.runner.handoverTime).toBeCloseTo(ctx.t0 + 1.8, 9);
	});

	it('settles a change answered in time and files the observation as its answer', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0 + 0.03);
		ctx.verifier.emit(ctx.report(ctx.t0 + 0.02, RIGHT));
		expect(ctx.events).toHaveLength(1);
		const [{ event }] = ctx.events;
		expect(event.kind).toBe('settled');
		expect(event.outcome).toMatchObject({ success: true, correct: true });
		expect(valueOf(event).verdict).toBe('perfect');
		const [filed] = ctx.runner.span.snapshot();
		expect(filed).toMatchObject({ sensor: 'chord', fate: 'answer', correct: true });
		// Timed from the prompt, a beat before the change.
		expect(filed.atMs).toBeCloseTo(520, 6);
		// Settled once: the beats that follow say nothing more.
		ctx.runTo(ctx.t0 + 1.79);
		expect(ctx.events).toHaveLength(1);
	});

	it('files every observation with its fate and the judge’s word, as the old controller did', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0 - 0.4);
		ctx.hearNote(ctx.t0 - 0.45);
		ctx.runner.observe('chord', {
			time: ctx.t0 - 0.44,
			payload: { reason: 'no-pitch' },
			readable: false
		});
		// Before the change's window opens, 200 ms early: ignored, but judged.
		ctx.verifier.emit(ctx.report(ctx.t0 - 0.43, RIGHT));
		expect(
			ctx.runner.span.snapshot().map(({ sensor, fate, correct }) => [sensor, fate, correct])
		).toEqual([
			['note', 'other-sensor', null],
			['chord', 'unreadable', null],
			['chord', 'before-window', true]
		]);
		expect(ctx.events).toEqual([]);
	});

	it('shows a provisional miss when the window closes unanswered, on the beat that closes it', async () => {
		const ctx = await setup();
		// The in-time window ends 400 ms after the change; the next beat is 500 ms after it.
		ctx.runTo(ctx.t0 + 0.49);
		expect(ctx.events).toEqual([]);
		ctx.runTo(ctx.t0 + 0.5);
		expect(ctx.events).toHaveLength(1);
		const [{ at, event }] = ctx.events;
		expect(event.kind).toBe('provisional');
		expect(at).toBeCloseTo(ctx.t0 + 0.5, 6);
		expect(valueOf(event).verdict).toBe('wrong');
		// The capture runs to the end: no settlement before the handover.
		ctx.runTo(ctx.t0 + 1.79);
		expect(ctx.events).toHaveLength(1);
		const outcome = ctx.runner.close(ctx.t0 + 1.8);
		expect(outcome).toMatchObject({ success: false, correct: false });
	});

	it('withdraws the expectation before settling: a window cut short reports into the round that ends', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0 + 1.75);
		const handover = ctx.runner.handoverTime as number;
		// The sensor's window, attacked 2.5 beats into the change, is cut by the handover: it reports then.
		ctx.verifier.onWithdraw = () => ctx.verifier.emit(ctx.report(ctx.t0 + 1.25, RIGHT));
		ctx.runTo(handover);
		// The runner does not close at its handover: the controller does.
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional']);
		const outcome = ctx.runner.close(handover);
		expect(ctx.verifier.expectations.at(-1)).toBeNull();
		expect(ctx.noteExpectations).toEqual([null, null]);
		expect(outcome).toMatchObject({ success: false, correct: true });
		expect((outcome?.verdict.value as ResponseValue).verdict).toBe('offbeat');
		expect(ctx.runner.span.snapshot()).toMatchObject([
			{ sensor: 'chord', fate: 'answer', correct: true }
		]);
		// Settled by the withdrawal, the round is returned by close, not told.
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional']);
	});

	it('settles a round without a handover at its end of listening, between beats', async () => {
		// Listening ends at 3.5 beats.
		const plan: RoundPlan = {
			...changePlan(item, METER_4_4, GESTURE_LINK),
			listenUntil: Fraction.of(7, 8)
		};
		delete plan.handover;
		const ctx = await setup({ plan });
		expect(ctx.runner.handoverTime).toBeNull();
		ctx.runTo(ctx.t0 + 1.74);
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional']);
		ctx.runTo(ctx.t0 + 1.75);
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional', 'settled']);
		expect(ctx.events[1].at).toBeCloseTo(ctx.t0 + 1.75, 6);
	});

	it('drops a round closed before anything was heard', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0 - 0.1);
		expect(ctx.runner.close(ctx.t0 - 0.1)).toBeNull();
		expect(ctx.verifier.expectations.at(-1)).toBeNull();
		ctx.runTo(ctx.t0 + 1);
		expect(ctx.events).toEqual([]);
	});

	it('stops waking once cancelled', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0);
		ctx.runner.cancel();
		ctx.runTo(ctx.t0 + 1.79);
		expect(ctx.events).toEqual([]);
		expect(ctx.verifier.expectations).toHaveLength(1);
	});

	it('wakes a round in free time never, and settles it on its answer', async () => {
		const plan = identifyPlan({ string: 3, fret: 5 });
		const ctx = await setup({ plan });
		expect(ctx.runner.handoverTime).toBeNull();
		// Seconds of silence pass: no beat, no end of listening wakes the round.
		ctx.runTo(ctx.t0 + 30);
		expect(ctx.events).toEqual([]);
		ctx.runner.observe('tap', { time: ctx.t0 + 30.5, payload: 'C', readable: true });
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['settled']);
		expect(ctx.events[0].event.outcome).toMatchObject({ success: true, correct: true });
		expect(ctx.runner.span.snapshot()).toMatchObject([
			{ sensor: 'tap', fate: 'answer', correct: true }
		]);
	});

	it('counts a round in free time from the instant the controller opens it', async () => {
		const plan = identifyPlan({ string: 3, fret: 5 });
		// Opened a little after the downbeat its bar starts on, at the wake-up.
		const ctx = await setup({ plan, openedAfter: 0.3 });
		ctx.runTo(ctx.t0 + 1.4);
		ctx.runner.observe('tap', { time: ctx.t0 + 1.3, payload: 'C', readable: true });
		expect(ctx.runner.span.snapshot()[0].atMs).toBeCloseTo(1000, 6);
		expect(ctx.events[0].event.outcome.verdict.value).toMatchObject({ reactionMs: 1000 });
	});

	it('gives the round the latency of its own sensor', async () => {
		const latencyOf = vi.fn(() => ({ ms: 12, provenance: 'player' as const }));
		await setup({ latencyOf });
		// The plan listens to the chord sensor only: the note sensor's latency is not asked.
		expect(latencyOf.mock.calls).toEqual([['chord']]);
	});

	it('files an observation after the settlement as settled, with the judge’s word', async () => {
		const ctx = await setup();
		ctx.runTo(ctx.t0 + 0.03);
		ctx.verifier.emit(ctx.report(ctx.t0 + 0.02, RIGHT));
		ctx.runTo(ctx.t0 + 0.6);
		ctx.verifier.emit(ctx.report(ctx.t0 + 0.5, WRONG));
		expect(ctx.events).toHaveLength(1);
		expect(
			ctx.runner.span.snapshot().map(({ sensor, fate, correct }) => [sensor, fate, correct])
		).toEqual([
			['chord', 'answer', true],
			['chord', 'settled', false]
		]);
	});

	it('opens a chained round without a handover at its first opening, and wakes it to its end of listening', async () => {
		const plan: RoundPlan = { ...changePlan(item, METER_4_4, GESTURE_LINK) };
		delete plan.handover;
		const ctx = await setup({ plan, chained: true });
		expect(ctx.runner.handoverTime).toBeNull();
		// The prompt shows when the change opens, 200 ms before it, not a beat before.
		ctx.verifier.emit(ctx.report(ctx.t0 - 0.1, RIGHT));
		expect(ctx.runner.span.snapshot()[0].atMs).toBeCloseTo(100, 6);
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['settled']);
	});

	it('wakes a chained round without a handover to the end of its bar', async () => {
		const plan: RoundPlan = { ...changePlan(item, METER_4_4, GESTURE_LINK) };
		delete plan.handover;
		const ctx = await setup({ plan, chained: true });
		ctx.runTo(ctx.t0 + 1.99);
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional']);
		ctx.runTo(ctx.t0 + 2);
		expect(ctx.events.map((e) => e.event.kind)).toEqual(['provisional', 'settled']);
	});

	it('writes each observation and its fate to the detection log, with the presenter’s lines', async () => {
		const lines = vi.fn(() => ['position : 7-6-5']);
		const ctx = await setup({ debug: { lines } });
		ctx.runTo(ctx.t0 - 0.4);
		ctx.verifier.emit(ctx.report(ctx.t0 - 0.43, RIGHT));
		ctx.runTo(ctx.t0 + 0.03);
		ctx.verifier.emit(ctx.report(ctx.t0 + 0.02, RIGHT));
		const logged = vi.mocked(logDetection).mock.calls;
		expect(logged.map(([title]) => title)).toEqual(['observation ignorée', 'observation prise']);
		expect(logged[0][1][0]).toContain('raison : arrivée avant la consigne');
		expect(logged[0][1]).toContain('position : 7-6-5');
		expect(logged[1][1][0]).toBe('juste : oui');
		expect(lines).toHaveBeenCalledTimes(2);
	});
});
