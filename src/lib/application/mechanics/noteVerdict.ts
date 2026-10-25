import type { ResponseValue } from '$lib/domain/time';
import type { Locale, ResponseVerdict } from '$lib/domain/types';
import type { MechanicPresenter } from './types';

/** What the lane or the answer pad says of a settled round. */
export interface NoteVerdictView {
	verdict: ResponseVerdict;
	offsetMs: number | null;
	answerLabel: string | null;
	correction: string | null;
}

/**
 * The verdict a settled round tells of a note: its answer spelled as the prompt is, the
 * position or name after a miss, the offset from the beat.
 */
export function noteVerdict(
	presenter: Pick<MechanicPresenter, 'answerLabel' | 'reveal'>,
	item: unknown,
	value: ResponseValue,
	locale: Locale,
	random: () => number
): NoteVerdictView {
	const [asked] = value.expectations;
	return {
		verdict: value.verdict,
		offsetMs: value.timingOffsetMs,
		answerLabel:
			asked?.answer == null ? null : presenter.answerLabel(asked.answer, item, locale, random),
		correction: presenter.reveal(
			item,
			{ correct: asked?.correct === true, verdict: value.verdict },
			locale
		)
	};
}
