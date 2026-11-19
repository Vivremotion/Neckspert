import { passageIndices } from '$lib/domain/exercise/passage/indices';
import { findExercise } from '$lib/domain/exercise/registry';
import {
	chordShapes,
	expectedShape,
	type ChordShape
} from '$lib/domain/families/guitar/chordShapes';
import { gridById, gridChanges } from '$lib/domain/grid';
import { admittedMembers, MEMBER_CONTENT, type MemberContent } from '$lib/domain/judges';
import { passageOf } from '$lib/domain/session/passageSource';
import type { Attempt, Execution, GestureSummary } from '$lib/domain/types';

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
function isChange(attempt: Attempt): boolean {
	return passageOf(attempt) !== null || typeof storedChange(attempt).passageId === 'string';
}

/** The passage a change belongs to: the one it kept, or, stored before the passages, its change's. */
function passageIdOf(attempt: Attempt): string {
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
 * Whether a passage passed: a share of its changes right and in time of at least its exercise's
 * `passes`. An exercise no loaded file defines leaves its threshold unknown (an attempt keeps no
 * threshold): 1 then, the format's default, so such a passage passes only when all its changes did.
 */
function passed(exerciseId: string, attempts: readonly Attempt[]): boolean {
	if (attempts.length === 0) return false;
	const passes = findExercise(exerciseId)?.passages?.passes ?? 1;
	return attempts.filter((attempt) => attempt.success).length / attempts.length >= passes;
}

/**
 * A gesture session by exercise and grid played (spec 2026-10-10, section 7): passages succeeded of those
 * played, the share of changes right and in time, the tempo of its first round and of its last
 * one (its level may move it in session, plan H6 D4); then the missed changes, with the shape
 * heard and the shape due. A change stored before the passages is grouped by the passage it
 * kept, and has no shape drawn as due.
 */
export function summarizeGesture(
	executions: readonly Execution[],
	attempts: readonly Attempt[]
): GestureSummary {
	// The changes of an exercise no file defines as one that plays passages any more are left
	// out: nothing tells what it was (plan 5b gives every exercise its line).
	const changes = attempts.filter(
		(attempt) => isChange(attempt) && findExercise(attempt.exerciseId)?.passages !== undefined
	);
	const exercises = executions.flatMap(({ exerciseId, scope, tempoBpm }) => {
		const own = changes.filter(
			(attempt) => attempt.exerciseId === exerciseId && (attempt.scope ?? null) === (scope ?? null)
		);
		if (own.length === 0 || tempoBpm === null) return [];
		const passages = new Map<string, Attempt[]>();
		for (const attempt of own) {
			const id = passageIdOf(attempt);
			passages.set(id, [...(passages.get(id) ?? []), attempt]);
		}
		return [
			{
				exerciseId,
				...(scope !== undefined && { scope }),
				passagesPlayed: passages.size,
				passagesSucceeded: [...passages.values()].filter((each) => passed(exerciseId, each)).length,
				changeSuccessRate: own.filter((attempt) => attempt.success).length / own.length,
				tempoBpm,
				lastTempoBpm: own[own.length - 1].tempoBpm ?? tempoBpm
			}
		];
	});
	const misses = changes
		.filter((attempt) => attempt.correct !== true && attempt.id !== undefined)
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
	return { exercises, misses };
}
