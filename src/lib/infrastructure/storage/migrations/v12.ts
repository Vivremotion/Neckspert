// One round plan record for every attempt, and the mechanic `figure` (plan S, D9): Dexie version
// 12 and backup version 8. A rhythm attempt was of the mechanic `rhythm-figure` and kept its
// cycle's setup (`CyclePlanRecord`: its figure, bars, accompaniment, tempo, window, thresholds);
// it becomes of the mechanic `figure` and keeps the round plan that setup compiled to, as every
// attempt does (`RoundPlanRecord`), with its tempo, its thresholds and its audio start. Pure
// functions on plain records, applied alike by the database upgrade (`db.ts`) and by the import of
// a backup (`validateBackup.ts`). They read nothing of the live code but `Fraction`: the cycle
// compiler, the figure's JSON and the mechanic's keys are frozen here, with a tripwire test.

import { Fraction } from '$lib/domain/time/fraction';
import type { MechanicIdentity } from '$lib/domain/mechanics/types';
import type { BackupV7 } from './v11';

type Row = Record<string, unknown>;

/** The mechanic of the rhythm's attempts up to version 11, frozen. */
export const RHYTHM_FIGURE_MECHANIC_V11 = 'rhythm-figure';
/** Its name from version 12, frozen. */
export const FIGURE_MECHANIC_V12 = 'figure';
/** The sensor every rhythm cycle listened with up to version 11, frozen. */
export const RHYTHM_SENSOR_V11 = 'attack';

/**
 * The rhythm's mechanic as versions 8 to 11 knew it, frozen: a skill, its item a figure at a level
 * (`figureId@level`), the key version 12 keeps. Backups up to version 7 are read with it.
 */
export const RHYTHM_FIGURE_RULES_V11: MechanicIdentity<{ figureId: string; level: number }> = {
	id: RHYTHM_FIGURE_MECHANIC_V11,
	learner: 'skill',
	itemKey: ({ figureId, level }) => `${figureId}@${level}`,
	parseItem: (itemKey) => {
		const at = itemKey.lastIndexOf('@');
		const level = itemKey.slice(at + 1);
		if (at < 1 || !/^-?\d+$/.test(level)) {
			throw new Error(`Invalid rhythm item key: "${itemKey}"`);
		}
		return { figureId: itemKey.slice(0, at), level: Number(level) };
	}
};

/** A cycle's plan as versions 8 to 11 stored it (`CyclePlanRecord`, frozen). */
export interface CyclePlanRecordV11 {
	figureId: string;
	/** The figure in its versioned JSON (`figureToJson`). */
	figure: unknown;
	cycleBars: number;
	/** The cycle's first bar in the loops of the figure and of the accompaniment. */
	startBar: number;
	accompaniment: { figure: unknown; bars: ('on' | 'off')[] };
	tempo: { at: string; bpm: number; unit: string };
	window: { ms: number } | { ofGap: string };
	thresholds: Record<string, number>;
	/** Absent from the cycles stored before it was kept. */
	startAudioS?: number;
}

/** A round plan as version 12 stores it (`RoundPlanRecord`, frozen). */
export interface RoundPlanRecordV12 {
	prompt: string | null;
	expectations: {
		at: string | null;
		span: 'point' | { until: string };
		role: 'target' | 'judged-rest';
		sensor: string;
		content: { kind: string; value: unknown } | null;
		window: { ms: number } | { ofGap: string };
		bar: number;
	}[];
	length: string;
	policy: {
		unit: 'response' | 'cycle';
		pairing: { mode: string } & Record<string, unknown>;
		verdict: string;
		correction: boolean;
	};
	handover?: string;
	listenUntil?: string;
	mutedBars: number[];
	countEndsOn?: 'prompt' | 'target';
	barOffset?: string;
	startAudioS?: number;
	tempo?: { at: string; bpm: number; unit: string };
	thresholds?: Record<string, number>;
}

/** A backup at version 8: rhythm attempts of the mechanic `figure`, every plan a round plan. */
export interface BackupV8 extends Row {
	version: 8;
	attempts: Row[];
}

function isRecord(value: unknown): value is Row {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(problem: string): never {
	throw new RangeError(`cycle plan: ${problem}`);
}

/**
 * Where each attack of a stored figure starts, and the length of its bar, read from its JSON as
 * versions 8 to 11 wrote it, frozen: its first voice, tied notes counted once, a rest expecting
 * nothing.
 */
function storedAttacks(figure: unknown): { bars: number; bar: Fraction; attacks: Fraction[] } {
	if (!isRecord(figure) || !isRecord(figure.meter) || !Array.isArray(figure.voices)) {
		fail('its figure is not a figure');
	}
	const { count, unit } = figure.meter;
	const bars = figure.bars;
	if (!Number.isInteger(count) || (count as number) < 1 || typeof unit !== 'string') {
		fail('its figure has no meter');
	}
	if (!Number.isInteger(bars) || (bars as number) < 1) fail('its figure has no bars');
	const bar = Fraction.parse(unit).mul(Fraction.of(count as number));
	const [voice] = figure.voices as unknown[];
	if (!isRecord(voice) || !Array.isArray(voice.elements)) fail('its figure has no voice');
	const attacks: Fraction[] = [];
	let at = Fraction.ZERO;
	let tied = false;
	for (const element of voice.elements as unknown[]) {
		if (!isRecord(element) || typeof element.duration !== 'string') {
			fail('an element of its figure has no duration');
		}
		if (element.kind === 'note') {
			if (!tied) attacks.push(at);
			tied = element.tieToNext === true;
		} else if (element.kind === 'rest') {
			tied = false;
		} else {
			fail(`an element of its figure is a "${String(element.kind)}"`);
		}
		at = at.add(Fraction.parse(element.duration));
	}
	if (at.compare(bar.mul(Fraction.of(bars as number))) !== 0) {
		fail(`its figure does not fill its ${String(bars)} bars`);
	}
	return { bars: bars as number, bar, attacks };
}

/**
 * The round plan a stored cycle was judged against, with what it was played at: the cycle
 * compiler of versions 8 to 11 (`compileCyclePlan`), frozen. Its figure looped over its bars from
 * bar `startBar` of the loop, one point target per attack, heard by the attack sensor; its
 * accompaniment's bars turned by the same `startBar`, the silent ones muted; judged whole by the
 * alignment and the cycle verdict, handed over at its end. Throws on a record it cannot read.
 */
export function cyclePlanToV12(record: CyclePlanRecordV11): RoundPlanRecordV12 {
	const { cycleBars, startBar, window } = record;
	const { bars, bar, attacks } = storedAttacks(record.figure);
	if (!Number.isInteger(cycleBars) || cycleBars < 1) fail(`cycleBars ${cycleBars}`);
	if (!Number.isInteger(startBar) || startBar < 0) fail(`startBar ${startBar}`);
	if (cycleBars % bars !== 0) fail(`${cycleBars} bars are not whole loops of ${bars}`);
	const accompanimentBars = record.accompaniment?.bars;
	if (!Array.isArray(accompanimentBars) || accompanimentBars.length === 0) {
		fail('its accompaniment has no bar');
	}
	if (!isRecord(window) || !('ms' in window || 'ofGap' in window)) fail('it has no window');
	const expectations: RoundPlanRecordV12['expectations'] = [];
	const mutedBars: number[] = [];
	for (let i = 0; i < cycleBars; i++) {
		const figureBar = (startBar + i) % bars;
		const from = bar.mul(Fraction.of(figureBar));
		const to = bar.mul(Fraction.of(figureBar + 1));
		const origin = bar.mul(Fraction.of(i));
		for (const attack of attacks) {
			if (attack.compare(from) < 0 || attack.compare(to) >= 0) continue;
			expectations.push({
				at: origin.add(attack.sub(from)).toString(),
				span: 'point',
				role: 'target',
				sensor: RHYTHM_SENSOR_V11,
				content: null,
				window: { ...window },
				bar: i
			});
		}
		if (accompanimentBars[(startBar + i) % accompanimentBars.length] === 'off') mutedBars.push(i);
	}
	const length = bar.mul(Fraction.of(cycleBars)).toString();
	return {
		prompt: null,
		expectations,
		length,
		policy: { unit: 'cycle', pairing: { mode: 'alignment' }, verdict: 'cycle', correction: false },
		handover: length,
		mutedBars,
		...(record.startAudioS !== undefined && { startAudioS: record.startAudioS }),
		tempo: { ...record.tempo },
		thresholds: { ...record.thresholds }
	};
}

/** Whether a stored plan is a cycle's setup (version 11's `CyclePlanRecord`), not a round plan. */
export function isCyclePlanV11(plan: unknown): boolean {
	return isRecord(plan) && Object.hasOwn(plan, 'cycleBars');
}

/**
 * A rhythm attempt as version 12 keeps it: of the mechanic `figure`, its card key renamed with it
 * (the item key stays), its cycle plan rewritten as the round plan it judged (`cyclePlanToV12`);
 * a plan it cannot read is dropped (null, as an attempt stored before plans). Any other attempt is
 * returned as it is.
 */
export function attemptToV12<T>(attempt: T): T {
	if (!isRecord(attempt) || attempt.mechanic !== RHYTHM_FIGURE_MECHANIC_V11) return attempt;
	const prefix = `${RHYTHM_FIGURE_MECHANIC_V11}:`;
	const cardKey =
		typeof attempt.cardKey === 'string' && attempt.cardKey.startsWith(prefix)
			? `${FIGURE_MECHANIC_V12}:${attempt.cardKey.slice(prefix.length)}`
			: attempt.cardKey;
	let plan = attempt.plan;
	if (isCyclePlanV11(plan)) {
		try {
			plan = cyclePlanToV12(plan as CyclePlanRecordV11);
		} catch {
			plan = null;
		}
	}
	return { ...attempt, mechanic: FIGURE_MECHANIC_V12, cardKey, plan } as T;
}

/** A version 7 backup as version 8: its rhythm attempts upgraded (`attemptToV12`). */
export function backupV7ToV8(backup: BackupV7): BackupV8 {
	return { ...backup, version: 8, attempts: backup.attempts.map(attemptToV12) };
}
