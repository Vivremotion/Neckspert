import type { MechanicId } from '$lib/domain/exercise/types';
import type { LeadBeats } from '$lib/domain/types';
import { SEQUENCE_LENGTH } from './constants';

/**
 * A run of prompts of one mechanic (one scene, guitar or screen) and, in locate, at one lead.
 * Trial of 2026-10-04, isolated here and switched by SEQUENCES_ENABLED.
 */
export interface Sequence {
	mechanic: MechanicId;
	/** Locate lead; null in identify. */
	lead: LeadBeats | null;
	/** Prompts served in it so far. */
	count: number;
}

/** Still taking prompts: started and not full. */
export function isOpen(sequence: Sequence | null): sequence is Sequence {
	return sequence !== null && sequence.count < SEQUENCE_LENGTH;
}

/** A prompt fits when no sequence is open, or when it has the open sequence's mechanic and lead. */
export function fits(
	sequence: Sequence | null,
	mechanic: MechanicId,
	lead: LeadBeats | null
): boolean {
	if (!isOpen(sequence)) return true;
	return sequence.mechanic === mechanic && sequence.lead === lead;
}

/** The sequence after serving a prompt: one more in the open one, or a new one. */
export function advance(
	sequence: Sequence | null,
	mechanic: MechanicId,
	lead: LeadBeats | null
): Sequence {
	if (isOpen(sequence) && fits(sequence, mechanic, lead)) {
		return { ...sequence, count: sequence.count + 1 };
	}
	return { mechanic, lead, count: 1 };
}

/**
 * A locate sequence that follows a locate sequence at another lead is announced by a counted
 * bar. A change of scene is counted by the session anyway.
 */
export function announcesLead(
	previous: Pick<Sequence, 'mechanic' | 'lead'> | null,
	mechanic: MechanicId,
	lead: LeadBeats | null
): boolean {
	return (
		previous !== null &&
		previous.mechanic === 'locate' &&
		mechanic === 'locate' &&
		previous.lead !== lead
	);
}
