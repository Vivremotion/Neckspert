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
	/** Attacks with no note onset. */
	onlyAttacks: number;
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
	/** Lines that could not be read: not JSON (a truncated last line), or no numeric audio time. */
	skipped: number;
}

/** Reads a take's `evenements.jsonl` (one JSON event per line); a line it cannot read is counted. */
export function attackTimesOf(jsonl: string): AttackTimes {
	const times: AttackTimes = { notes: [], attacks: [], skipped: 0 };
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

/**
 * Pairs each note onset with the nearest attack within `withinMs`, one to one: candidate pairs are
 * taken from the closest, so an attack goes to the onset it is nearest to. Times are in seconds.
 */
export function compareAttacks(
	notes: readonly number[],
	attacks: readonly number[],
	withinMs = SHADOW_PAIR_WITHIN_MS
): ShadowStats {
	const sortedNotes = [...notes].sort((a, b) => a - b);
	const sortedAttacks = [...attacks].sort((a, b) => a - b);
	const within = withinMs / 1000;

	const candidates: { note: number; attack: number; distance: number }[] = [];
	let first = 0;
	sortedNotes.forEach((time, note) => {
		while (first < sortedAttacks.length && sortedAttacks[first] < time - within) first++;
		for (let attack = first; attack < sortedAttacks.length; attack++) {
			const distance = Math.abs(sortedAttacks[attack] - time);
			if (sortedAttacks[attack] > time + within) break;
			if (distance <= within) candidates.push({ note, attack, distance });
		}
	});
	candidates.sort((a, b) => a.distance - b.distance || a.note - b.note || a.attack - b.attack);

	const noteTaken = new Set<number>();
	const attackTaken = new Set<number>();
	const deltas: number[] = [];
	for (const { note, attack } of candidates) {
		if (noteTaken.has(note) || attackTaken.has(attack)) continue;
		noteTaken.add(note);
		attackTaken.add(attack);
		deltas.push((sortedAttacks[attack] - sortedNotes[note]) * 1000);
	}

	const both = deltas.length;
	const base = {
		both,
		onlyNotes: sortedNotes.length - both,
		onlyAttacks: sortedAttacks.length - both
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
