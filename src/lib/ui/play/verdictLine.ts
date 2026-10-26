import type { VerdictView } from '$lib/application/session/contract';
import type { ResponseVerdict } from '$lib/domain/types';

/** The verdicts of a success, said in the centre in the prompt's place. */
export const HITS: ReadonlySet<ResponseVerdict> = new Set(['perfect', 'early', 'late', 'offbeat']);

/** What a caption is said with: the play screen's words. */
export interface VerdictWords {
	playedAs: (label: string) => string;
	nothingHeard: string;
	verdict: Record<ResponseVerdict, string>;
}

/** Signed, with a true minus: « +42 ms », « −8 ms », « 0 ms ». */
export function formatOffset(ms: number): string {
	const rounded = Math.round(ms);
	const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
	return `${sign}${Math.abs(rounded)} ms`;
}

/** One line over the played cell: the verdict or what was played, then its offset when timed. */
export function captionOf(
	v: Pick<VerdictView, 'verdict' | 'offsetMs' | 'answerLabel'>,
	words: VerdictWords
): string {
	const said =
		v.verdict === 'wrong'
			? v.answerLabel
				? words.playedAs(v.answerLabel)
				: words.nothingHeard
			: words.verdict[v.verdict].toLowerCase();
	return v.offsetMs === null ? said : `${said} · ${formatOffset(v.offsetMs)}`;
}
