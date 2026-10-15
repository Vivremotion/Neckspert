// How the pitchless attack detector and the note detector agree, from the attack times each one
// journaled. Pure, and free of `$lib` imports: scripts/attack-shadow-report.ts loads it with
// plain Node.

/** How far apart (ms) a note onset and an attack may be to count as the same strike. */
export const SHADOW_PAIR_WITHIN_MS = 30;

export interface ShadowStats {
	/** Note onsets that have an attack within the window. */
	both: number;
	/** Note onsets with no attack. */
	onlyNotes: number;
	/** Attacks with no note onset and no rejection near: the note detector never heard them. */
	onlyAttacks: number;
	/** Attacks with no note onset but a rejected attack (`note.rejected`) within the window. */
	rejectedByNotes: number;
	/** Median of attack time minus note time over the pairs, ms. */
	medianDeltaMs: number | null;
	/** 90th percentile of the absolute delta over the pairs, ms. */
	p90AbsDeltaMs: number | null;
	/** Mean of attack time minus note time over the pairs, ms. */
	biasMs: number | null;
}

/** The audio times (s) of both detectors' attacks in one take's journal. */
export interface AttackTimes {
	notes: number[];
	attacks: number[];
	/** Attacks the note detector heard but rejected (`note.rejected`). */
	rejected: number[];
	/** Lines that could not be read: not JSON (a truncated last line), or no numeric audio time. */
	skipped: number;
}

/** Reads a take's `evenements.jsonl` (one JSON event per line); a line it cannot read is counted. */
export function attackTimesOf(jsonl: string): AttackTimes {
	const times: AttackTimes = { notes: [], attacks: [], rejected: [], skipped: 0 };
	for (const line of jsonl.split('\n')) {
		if (line.trim() === '') continue;
		let event: unknown;
		try {
			event = JSON.parse(line);
		} catch {
			times.skipped++;
			continue;
		}
		const { kind, audioTime } = (event ?? {}) as { kind?: unknown; audioTime?: unknown };
		if (typeof audioTime !== 'number' || !Number.isFinite(audioTime)) {
			times.skipped++;
		} else if (kind === 'note.attack') times.notes.push(audioTime);
		else if (kind === 'attack.detected') times.attacks.push(audioTime);
		else if (kind === 'note.rejected') times.rejected.push(audioTime);
	}
	return times;
}

/** Linear-interpolated quantile of a sorted list. */
function quantile(sorted: readonly number[], q: number): number {
	const position = (sorted.length - 1) * q;
	const below = Math.floor(position);
	const above = Math.ceil(position);
	return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/** Whether a take journaled anything from the note detector (an onset or a rejection). */
export function hasNoteDetector(times: AttackTimes): boolean {
	return times.notes.length > 0 || times.rejected.length > 0;
}

/**
 * Pairs each time of `left` with the nearest time of `right` within `within` seconds, one to one:
 * candidate pairs are taken from the closest. Both lists are sorted; returns index pairs.
 */
function pairNearest(
	left: readonly number[],
	right: readonly number[],
	within: number
): { left: number; right: number }[] {
	const candidates: { left: number; right: number; distance: number }[] = [];
	let first = 0;
	left.forEach((time, l) => {
		while (first < right.length && right[first] < time - within) first++;
		for (let r = first; r < right.length; r++) {
			if (right[r] > time + within) break;
			const distance = Math.abs(right[r] - time);
			if (distance <= within) candidates.push({ left: l, right: r, distance });
		}
	});
	candidates.sort((a, b) => a.distance - b.distance || a.left - b.left || a.right - b.right);

	const leftTaken = new Set<number>();
	const rightTaken = new Set<number>();
	const pairs: { left: number; right: number }[] = [];
	for (const { left: l, right: r } of candidates) {
		if (leftTaken.has(l) || rightTaken.has(r)) continue;
		leftTaken.add(l);
		rightTaken.add(r);
		pairs.push({ left: l, right: r });
	}
	return pairs;
}

/**
 * Pairs each note onset with the nearest attack within `withinMs`, one to one, so an attack goes
 * to the onset it is nearest to. The attacks left over are then matched the same way with the
 * note detector's rejections: those are `rejectedByNotes`, the rest `onlyAttacks`. Times are in
 * seconds.
 */
export function compareAttacks(
	notes: readonly number[],
	attacks: readonly number[],
	rejected: readonly number[] = [],
	withinMs = SHADOW_PAIR_WITHIN_MS
): ShadowStats {
	const sortedNotes = [...notes].sort((a, b) => a - b);
	const sortedAttacks = [...attacks].sort((a, b) => a - b);
	const within = withinMs / 1000;

	const pairs = pairNearest(sortedNotes, sortedAttacks, within);
	const deltas = pairs.map((pair) => (sortedAttacks[pair.right] - sortedNotes[pair.left]) * 1000);
	const paired = new Set(pairs.map((pair) => pair.right));
	const left = sortedAttacks.filter((_, attack) => !paired.has(attack));
	const rejectedByNotes = pairNearest(
		[...rejected].sort((a, b) => a - b),
		left,
		within
	).length;

	const both = deltas.length;
	const base = {
		both,
		onlyNotes: sortedNotes.length - both,
		onlyAttacks: left.length - rejectedByNotes,
		rejectedByNotes
	};
	if (both === 0) return { ...base, medianDeltaMs: null, p90AbsDeltaMs: null, biasMs: null };

	const signed = [...deltas].sort((a, b) => a - b);
	const absolute = deltas.map(Math.abs).sort((a, b) => a - b);
	return {
		...base,
		medianDeltaMs: quantile(signed, 0.5),
		p90AbsDeltaMs: quantile(absolute, 0.9),
		biasMs: deltas.reduce((sum, delta) => sum + delta, 0) / both
	};
}
