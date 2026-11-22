import { passageIndices } from '$lib/domain/exercise/passage/indices';
import { findExercise } from '$lib/domain/exercise/registry';
import {
	chordShapes,
	expectedShape,
	type ChordShape
} from '$lib/domain/families/guitar/chordShapes';
import { gridById, gridChanges } from '$lib/domain/grid';
import { admittedMembers, MEMBER_CONTENT, type MemberContent } from '$lib/domain/judges';
import type { Attempt, SummaryMiss } from '$lib/domain/types';
import { passageOf } from './passageSource';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `data` of a change: what the summary reads of it, new or stored before the passages. */
function dataOf(attempt: Attempt): Record<string, unknown> {
	return isRecord(attempt.data) ? attempt.data : {};
}

/**
 * A change stored before the passages kept its whole change (`data.item`, with its passage's id
 * and its symbol), and no `data.passage`.
 */
function storedChange(attempt: Attempt): { passageId?: unknown; symbol?: unknown } {
	const { item } = dataOf(attempt);
	return isRecord(item) ? item : {};
}

/**
 * Whether an attempt is a change: it carries its passage (`data.passage`), or, stored before the
 * passages, the passage id its whole change kept.
 */
export function isChange(attempt: Attempt): boolean {
	return passageOf(attempt) !== null || typeof storedChange(attempt).passageId === 'string';
}

/** The passage a change belongs to: the one it kept, or, stored before the passages, its change's. */
export function passageIdOf(attempt: Attempt): string {
	const passage = passageOf(attempt);
	if (passage) return passage.id;
	const { passageId } = storedChange(attempt);
	return typeof passageId === 'string' ? passageId : `attempt:${attempt.id ?? attempt.promptedAt}`;
}

/** A change's symbol: its grid's change, the chord its passage's index names, or the one stored. */
function symbolOf(attempt: Attempt): string {
	const { symbol } = storedChange(attempt);
	if (typeof symbol === 'string') return symbol;
	const { item } = dataOf(attempt);
	if (isRecord(item) && typeof item.grid === 'string' && typeof item.index === 'number') {
		try {
			return gridChanges(gridById(item.grid))[item.index]?.symbol ?? '';
		} catch {
			return '';
		}
	}
	const passage = passageOf(attempt);
	const definition = findExercise(attempt.exerciseId);
	if (!passage || !definition) return '';
	const index = passageIndices(definition).find((each) => each.key === passage.index);
	return typeof index?.of.chord === 'string' ? index.of.chord : '';
}

function decidedOf(attempt: Attempt): string | null {
	const { answer } = dataOf(attempt);
	return isRecord(answer) && typeof answer.decided === 'string' ? answer.decided : null;
}

/** The member content of the chord sensor its plan kept; null when there is none (before the passages). */
function memberContentOf(attempt: Attempt): MemberContent | null {
	const expectations = isRecord(attempt.plan) ? attempt.plan.expectations : undefined;
	if (!Array.isArray(expectations)) return null;
	for (const expectation of expectations) {
		const content = isRecord(expectation) ? expectation.content : null;
		if (!isRecord(content) || content.kind !== MEMBER_CONTENT) continue;
		const value = content.value as MemberContent;
		if (value?.family === chordShapes.id) return value;
	}
	return null;
}

/**
 * The shape that was due on a missed change, as its round admitted it (`expectedShape`); null when
 * its plan keeps no member content (a change stored before the passages), or cannot be read.
 */
function dueOf(attempt: Attempt, decided: string | null): ChordShape | null {
	const content = memberContentOf(attempt);
	if (!content) return null;
	try {
		const admitted = admittedMembers(content) as ChordShape[];
		return expectedShape(admitted, decided, content.previous ?? null);
	} catch {
		return null;
	}
}

function fretsOf(shape: { notes: readonly { fret: number }[] } | null): string | null {
	return shape && shape.notes.map((note) => note.fret).join('-');
}

/**
 * The missed changes of a session, oldest first, with the shape heard and the shape due. A change
 * stored before the passages has no shape drawn as due. Only the changes of an exercise a file
 * defines as one that plays passages: nothing tells how another's would be drawn or contested.
 */
export function summaryMisses(attempts: readonly Attempt[]): SummaryMiss[] {
	return attempts
		.filter(
			(attempt) =>
				isChange(attempt) &&
				findExercise(attempt.exerciseId)?.passages !== undefined &&
				attempt.correct !== true &&
				attempt.id !== undefined
		)
		.map((attempt) => {
			const decided = decidedOf(attempt);
			return {
				attemptId: attempt.id as number,
				exerciseId: attempt.exerciseId,
				symbol: symbolOf(attempt),
				heard: fretsOf(decided === null ? null : chordShapes.member(decided)),
				expected: fretsOf(dueOf(attempt, decided)),
				contested: attempt.contested ?? false
			};
		});
}
