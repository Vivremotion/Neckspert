import type {
	DiagnosticAudioChunk,
	OracleReport,
	OracleSuite,
	SensorComparison
} from '$lib/application/ports';
import type { CyclePlanRecord } from '$lib/application/session/plan/recordCycle';

export type { OracleReport, OracleSuite, SensorComparison };
import {
	Fraction,
	PlanRound,
	RHYTHM_SENSOR,
	barLength,
	compileCyclePlan,
	createTempoMap,
	figureFromJson,
	type CycleReport,
	type CycleVerdict
} from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { DexieDiagnosticSink } from './DexieDiagnosticSink';
import type { DiagnosticTakeRow } from './diagnosticsDb';
import { encodeWav } from './wav';
import { ZipWriter } from './zip';

/**
 * The oracle of the attack sensor (spec 2026-10-14, section 11): runs of real practice cut out
 * of the diagnostic journal, their attacks labelled by hand in Audacity, then compared with what
 * the sensor heard.
 */

/** Runs exported for the oracle. */
export const ORACLE_TAKES = 10;
/** Sound kept before and after a run, so its first and last attacks are whole. */
export const ORACLE_MARGIN_S = 1;
/** The event of the attack sensor in the journal. */
const ATTACK_EVENT = 'attack.detected';

/** Consecutive cycle attempts of a session with no gap above one bar: one run of the oracle. */
export interface OracleRun {
	sessionId: string;
	attemptIds: number[];
	/** Epoch ms of the run's first cycle, and of the end of its last. */
	fromMs: number;
	toMs: number;
	contested: boolean;
}

/** The plan of a cycle attempt, and its length and bar in ms; null for any other attempt. */
function cycleOf(
	attempt: Attempt
): { plan: CyclePlanRecord; cycleMs: number; barMs: number } | null {
	const plan = attempt.plan as Partial<CyclePlanRecord> | null;
	if (!plan || typeof plan.cycleBars !== 'number' || !plan.tempo || !plan.figure) return null;
	try {
		const bar = barLength(figureFromJson(plan.figure).meter).toNumber();
		const wholeMs = 60_000 / plan.tempo.bpm / Fraction.parse(plan.tempo.unit).toNumber();
		return {
			plan: plan as CyclePlanRecord,
			cycleMs: bar * plan.cycleBars * wholeMs,
			barMs: bar * wholeMs
		};
	} catch {
		return null;
	}
}

export function oracleRuns(attempts: readonly Attempt[]): OracleRun[] {
	const cycles = attempts
		.map((attempt) => ({ attempt, cycle: cycleOf(attempt) }))
		.filter(
			(
				entry
			): entry is {
				attempt: Attempt & { id: number };
				cycle: NonNullable<ReturnType<typeof cycleOf>>;
			} => entry.cycle !== null && entry.attempt.id !== undefined
		)
		.sort(
			(a, b) =>
				a.attempt.sessionId.localeCompare(b.attempt.sessionId) ||
				a.attempt.promptedAt - b.attempt.promptedAt
		);
	const runs: OracleRun[] = [];
	let last: (typeof cycles)[number] | null = null;
	for (const entry of cycles) {
		const { attempt, cycle } = entry;
		const end = attempt.promptedAt + cycle.cycleMs;
		const run = runs.at(-1);
		const chained =
			last !== null &&
			run !== undefined &&
			last.attempt.sessionId === attempt.sessionId &&
			attempt.promptedAt - run.toMs <= last.cycle.barMs;
		if (chained && run) {
			run.attemptIds.push(attempt.id);
			run.toMs = end;
			run.contested ||= attempt.contested === true;
		} else {
			runs.push({
				sessionId: attempt.sessionId,
				attemptIds: [attempt.id],
				fromMs: attempt.promptedAt,
				toMs: end,
				contested: attempt.contested === true
			});
		}
		last = entry;
	}
	return runs;
}

function covering(
	run: OracleRun,
	takes: readonly DiagnosticTakeRow[]
): DiagnosticTakeRow | undefined {
	return takes.find(
		(take) => take.startedAt <= run.fromMs && (take.endedAt ?? Infinity) >= run.toMs
	);
}

export function pickOracleRuns(
	runs: readonly OracleRun[],
	takes: readonly DiagnosticTakeRow[],
	random: () => number
): OracleRun[] {
	const recorded = runs.filter((run) => covering(run, takes) !== undefined);
	const contested = recorded.filter((run) => run.contested);
	const rest = recorded.filter((run) => !run.contested);
	for (let i = rest.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[rest[i], rest[j]] = [rest[j], rest[i]];
	}
	return [...contested, ...rest].slice(0, ORACLE_TAKES);
}

/** Audacity labels: one line per attack, `start\tend\tlabel`, start = end, label its number from 1. */
export function audacityLabels(timesS: readonly number[]): string {
	return timesS.map((t, i) => `${t.toFixed(6)}\t${t.toFixed(6)}\t${i + 1}\n`).join('');
}

/** The start of each readable line of an Audacity label file, sorted. */
export function parseAudacityLabels(text: string): number[] {
	const times: number[] = [];
	for (const line of text.split(/\r?\n/)) {
		const [start, end] = line.split('\t');
		const t = Number(start);
		if (start === undefined || end === undefined || start.trim() === '' || !Number.isFinite(t)) {
			continue;
		}
		times.push(t);
	}
	return times.sort((a, b) => a - b);
}

/** The journal's sound over [from, to) at its rate, silence where nothing was recorded. */
function sliceSamples(
	chunks: readonly DiagnosticAudioChunk[],
	from: number,
	to: number
): { sampleRate: number; samples: Int16Array } {
	const sampleRate = chunks[0]?.sampleRate ?? 16_000;
	const samples = new Int16Array(Math.max(0, Math.round((to - from) * sampleRate)));
	for (const chunk of chunks) {
		const offset = Math.round((chunk.audioTime - from) * sampleRate);
		const first = Math.max(0, -offset);
		const last = Math.min(chunk.samples.length, samples.length - offset);
		for (let i = first; i < last; i++) samples[offset + i] = chunk.samples[i];
	}
	return { sampleRate, samples };
}

/** One run as a suite of the oracle, and its WAV. */
export function buildOracleSuite(input: {
	name: string;
	run: OracleRun;
	take: DiagnosticTakeRow;
	events: readonly { audioTime: number; kind: string; data: unknown }[];
	chunks: readonly DiagnosticAudioChunk[];
	attempts: readonly Attempt[];
}): { suite: OracleSuite; wav: Uint8Array } {
	const { run, take } = input;
	const audioOf = (epochMs: number) => take.startedAudioTime + (epochMs - take.startedAt) / 1000;
	const played = run.attemptIds
		.map((id) => input.attempts.find((candidate) => candidate.id === id))
		.filter((attempt): attempt is Attempt => attempt !== undefined);
	// A cycle's own audio start when it has one (the journal's clock); else the wall clock's
	// mapping of the take, off by the output latency.
	const startOf = (attempt: Attempt) =>
		(attempt.plan as Partial<CyclePlanRecord> | null)?.startAudioS ?? audioOf(attempt.promptedAt);
	const first = played[0];
	const last = played.at(-1);
	const lastCycle = last && cycleOf(last);
	const from = (first ? startOf(first) : audioOf(run.fromMs)) - ORACLE_MARGIN_S;
	const to =
		(last && lastCycle ? startOf(last) + lastCycle.cycleMs / 1000 : audioOf(run.toMs)) +
		ORACLE_MARGIN_S;
	const { sampleRate, samples } = sliceSamples(input.chunks, from, to);
	const detected = input.events
		.filter(
			(event) => event.kind === ATTACK_EVENT && event.audioTime >= from && event.audioTime < to
		)
		.map((event) => event.audioTime - from)
		.sort((a, b) => a - b);
	const cycles: OracleSuite['cycles'] = [];
	for (const id of run.attemptIds) {
		const attempt = input.attempts.find((candidate) => candidate.id === id);
		const cycle = attempt && cycleOf(attempt);
		if (!attempt || !cycle) continue;
		const report = (attempt.data as { report?: Partial<CycleReport> } | null)?.report;
		cycles.push({
			attemptId: id,
			plan: cycle.plan,
			startS: startOf(attempt) - from,
			latency: report?.latency ?? null,
			verdict: attempt.verdict.value as CycleVerdict
		});
	}
	return {
		suite: {
			name: input.name,
			sessionId: run.sessionId,
			takeId: take.id,
			attemptIds: [...run.attemptIds],
			sliceStartAudioS: from,
			sampleRate,
			detected,
			cycles
		},
		wav: encodeWav(sampleRate, samples)
	};
}

/**
 * The oracle export: `ORACLE_TAKES` runs, the contested first, each as `suite-NN.wav` and
 * `suite-NN.txt` (the sensor's attacks, as Audacity labels), and `suites.json`.
 */
export async function buildOracleArchive(
	journal: Pick<DexieDiagnosticSink, 'takes' | 'eventsOf' | 'audioOf'>,
	attempts: readonly Attempt[],
	random: () => number,
	modified: Date = new Date()
): Promise<Blob> {
	const takes = await journal.takes();
	const encoder = new TextEncoder();
	const zip = new ZipWriter(modified);
	const suites: OracleSuite[] = [];
	for (const run of pickOracleRuns(oracleRuns(attempts), takes, random)) {
		const take = covering(run, takes);
		if (!take) continue;
		const chunks = await journal.audioOf(take.id);
		if (chunks.length === 0) continue;
		const name = `suite-${String(suites.length + 1).padStart(2, '0')}`;
		const { suite, wav } = buildOracleSuite({
			name,
			run,
			take,
			events: await journal.eventsOf(take.id),
			chunks,
			attempts
		});
		zip.add(`${name}.wav`, [wav]);
		zip.add(`${name}.txt`, [encoder.encode(audacityLabels(suite.detected))]);
		suites.push(suite);
	}
	zip.add('suites.json', [encoder.encode(JSON.stringify(suites, null, 2))]);
	return zip.finish();
}

/** Two attacks closer than this (ms) are the same attack. */
export const ORACLE_MATCH_MS = 25;

/** One to one, in time order, within `ORACLE_MATCH_MS`. Times in seconds. */
export function compareAttacks(
	detected: readonly number[],
	truth: readonly number[]
): SensorComparison {
	const heard = [...detected].sort((a, b) => a - b);
	const real = [...truth].sort((a, b) => a - b);
	const limit = ORACLE_MATCH_MS / 1000;
	const deltas: number[] = [];
	let i = 0;
	let j = 0;
	while (i < heard.length && j < real.length) {
		const delta = heard[i] - real[j];
		if (Math.abs(delta) <= limit) {
			deltas.push(delta * 1000);
			i++;
			j++;
		} else if (delta < 0) i++;
		else j++;
	}
	const matched = deltas.length;
	const mean = matched > 0 ? deltas.reduce((sum, d) => sum + d, 0) / matched : null;
	const spread =
		mean === null ? null : Math.sqrt(deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / matched);
	return {
		matched,
		missed: real.length - matched,
		falseAttacks: heard.length - matched,
		biasMs: mean,
		spreadMs: spread
	};
}

/** Each cycle of a suite judged again on `truth` (s from the slice start, before latency). */
export function rejudge(
	suite: OracleSuite,
	truth: readonly number[]
): { attemptId: number; before: CycleVerdict; after: CycleVerdict }[] {
	return suite.cycles.map(({ attemptId, plan, startS, latency, verdict }) => {
		const figure = figureFromJson(plan.figure);
		const window =
			'ms' in plan.window ? { ms: plan.window.ms } : { ofGap: Fraction.parse(plan.window.ofGap) };
		const tempo = {
			at: Fraction.ZERO,
			bpm: plan.tempo.bpm,
			unit: Fraction.parse(plan.tempo.unit)
		};
		const round = new PlanRound({
			plan: compileCyclePlan({
				figure,
				cycleBars: plan.cycleBars,
				startBar: plan.startBar,
				sensor: RHYTHM_SENSOR,
				window,
				accompanimentBars: plan.accompaniment.bars
			}),
			map: createTempoMap(startS, [tempo]),
			start: Fraction.ZERO,
			latency,
			thresholds: plan.thresholds,
			aids: []
		});
		const latencyS = (latency?.ms ?? 0) / 1000;
		for (const time of truth) {
			round.observe({
				time: time - latencyS,
				sensor: RHYTHM_SENSOR,
				readable: true,
				payload: null
			});
		}
		return { attemptId, before: verdict, after: round.settle().verdict.value as CycleVerdict };
	});
}

/** The report of an annotated oracle: `suites.json` and one `suite-NN.txt` per suite. */
export function oracleReport(files: readonly { name: string; text: string }[]): OracleReport {
	const index = files.find((file) => file.name.endsWith('suites.json'));
	const suites: OracleSuite[] = index ? (JSON.parse(index.text) as OracleSuite[]) : [];
	const labels = files.filter((file) => file.name.endsWith('.txt'));
	const base = (name: string) => name.replace(/^.*\//, '').replace(/\.txt$/, '');
	const rows: OracleReport['suites'] = [];
	const all = { detected: [] as number[], truth: [] as number[] };
	let offset = 0;
	for (const suite of suites) {
		const file = labels.find((label) => base(label.name) === suite.name);
		if (!file) continue;
		const truth = parseAudacityLabels(file.text);
		rows.push({
			name: suite.name,
			sensor: compareAttacks(suite.detected, truth),
			changed: rejudge(suite, truth).filter(
				(cycle) => JSON.stringify(cycle.before) !== JSON.stringify(cycle.after)
			)
		});
		// The suites laid end to end, far apart, for the totals.
		all.detected.push(...suite.detected.map((t) => t + offset));
		all.truth.push(...truth.map((t) => t + offset));
		offset += 1e6;
	}
	const names = new Set(suites.map((suite) => suite.name));
	return {
		suites: rows,
		total: compareAttacks(all.detected, all.truth),
		unmatched: labels.filter((label) => !names.has(base(label.name))).map((label) => label.name)
	};
}
