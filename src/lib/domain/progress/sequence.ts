import type { Direction, LeadBeats } from '$lib/domain/types';
import { SEQUENCE_LENGTH } from './constants';

/**
 * A run of prompts in one scene (guitar or screen) and, in mode 1, at one lead. Trial of
 * 2026-10-04, isolated here and switched by SEQUENCES_ENABLED.
 */
export interface Sequence {
	direction: Direction;
	/** Mode 1 lead; null in mode 2. */
	lead: LeadBeats | null;
	/** Prompts served in it so far. */
	count: number;
}

/** Still taking prompts: started and not full. */
export function isOpen(sequence: Sequence | null): sequence is Sequence {
	return sequence !== null && sequence.count < SEQUENCE_LENGTH;
}

/** A prompt fits when no sequence is open, or when it has the open sequence's scene and lead. */
export function fits(
	sequence: Sequence | null,
	direction: Direction,
	lead: LeadBeats | null
): boolean {
	if (!isOpen(sequence)) return true;
	return sequence.direction === direction && sequence.lead === lead;
}

/** The sequence after serving a prompt: one more in the open one, or a new one. */
export function advance(
	sequence: Sequence | null,
	direction: Direction,
	lead: LeadBeats | null
): Sequence {
	if (isOpen(sequence) && fits(sequence, direction, lead)) {
		return { ...sequence, count: sequence.count + 1 };
	}
	return { direction, lead, count: 1 };
}

/**
 * A mode 1 sequence that follows a mode 1 sequence at another lead is announced by a counted
 * bar. A change of scene is counted by the session anyway.
 */
export function announcesLead(
	previous: Pick<Sequence, 'direction' | 'lead'> | null,
	direction: Direction,
	lead: LeadBeats | null
): boolean {
	return (
		previous !== null &&
		previous.direction === 'locate' &&
		direction === 'locate' &&
		previous.lead !== lead
	);
}
