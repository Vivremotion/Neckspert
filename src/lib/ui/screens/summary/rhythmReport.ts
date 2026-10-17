import type { Locale, ExerciseSummary } from '$lib/domain/types';
import { feedbackLine } from '$lib/ui/play/views/rhythmFigure';
import type { summaryMessages } from './messages';

type Words = ReturnType<typeof summaryMessages>['report'];

export interface RhythmReportView {
	passed: boolean;
	headline: string;
	/** The plain-words line of the cycle. */
	feedback: string;
	reasons: string | null;
	/** One line per measure the report holds. */
	measures: string[];
	latency: string;
}

const signed = (ms: number): string => (ms > 0 ? `+${ms}` : ms < 0 ? `−${-ms}` : '0');

/** The cycle a rhythm summary keeps, said in plain words: its verdict and its measures. */
export function rhythmReportView(
	last: NonNullable<ExerciseSummary['lastCycle']>,
	words: Words,
	locale: Locale
): RhythmReportView {
	const { report, verdict, thresholds } = last;
	const systemLatency = report.latency?.provenance === 'system';

	const judged = (
		label: string,
		value: number,
		unit: 'ms' | 'ms/bar',
		limit: number | undefined,
		judges: boolean
	): string => {
		const say = unit === 'ms' ? words.ms : words.msPerBar;
		const shown = `${label}${words.colon}${say(Math.round(value))}`;
		if (!judges) return `${shown} (${words.notJudged})`;
		if (limit === undefined) return shown;
		const state = Math.abs(value) <= limit ? words.within : words.over;
		return `${shown} (${words.limit(say(limit))}, ${state})`;
	};

	const { measures } = report;
	const lines: string[] = [];
	if (measures.precision) {
		lines.push(
			judged(words.precision, measures.precision.value, 'ms', thresholds.precision, systemLatency)
		);
	}
	if (measures.regularity) {
		lines.push(
			judged(words.regularity, measures.regularity.value, 'ms', thresholds.regularity, true)
		);
	}
	if (measures.holdOffset) {
		lines.push(
			judged(words.holdOffset, measures.holdOffset.value, 'ms', thresholds.holdOffset, true)
		);
	}
	if (measures.holdDrift) {
		lines.push(
			judged(words.holdDrift, measures.holdDrift.value, 'ms/bar', thresholds.holdDrift, true)
		);
	}
	if (measures.placement) {
		const shown = `${words.placement}${words.colon}${signed(Math.round(measures.placement.value))} ms`;
		lines.push(systemLatency ? shown : `${shown} (${words.notJudged})`);
	}
	const forgotten = report.expectations.filter((e) => e.verdict === 'missed').length;
	const played = report.expectations.filter((e) => e.offsetMs !== null).length;
	lines.push(words.fidelity(played, report.expectations.length, forgotten, report.extra));
	if (report.shift) {
		lines.push(words.shift(report.shift.bar + 1, Math.round(report.shift.byS * 1000)));
	}

	const latency = report.latency
		? words.latency[systemLatency ? 'system' : 'player'](Math.round(report.latency.ms))
		: words.latency.none;

	return {
		passed: verdict.passed,
		headline: verdict.passed ? words.passed : words.failed,
		feedback: feedbackLine(report, locale, verdict).words,
		reasons: verdict.passed ? null : words.reasons(verdict.reasons.map((r) => words.reason[r])),
		measures: lines,
		latency: systemLatency ? latency : `${latency} (${words.latencyNotJudged})`
	};
}
