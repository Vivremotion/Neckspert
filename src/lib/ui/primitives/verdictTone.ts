import type { ResponseVerdict } from '$lib/domain/types';

export type VerdictTone = 'hit' | 'partial' | 'miss';

/** The cell that carries a verdict mark takes its tint from this tone. */
export function verdictTone(verdict: ResponseVerdict): VerdictTone {
	switch (verdict) {
		case 'perfect':
		case 'early':
		case 'late':
			return 'hit';
		case 'offbeat':
			return 'partial';
		case 'corrected':
		case 'wrong':
			return 'miss';
	}
}
