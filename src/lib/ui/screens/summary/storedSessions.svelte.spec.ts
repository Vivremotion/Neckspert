import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeSession } from '$lib/domain/progress';
import type { SessionRecord } from '$lib/domain/types';
import SummaryScreen from './SummaryScreen.svelte';

afterEach(() => cleanup());

/** A session stored before plan 5a, as migration 13 wrote it, with what it recorded. */
const stored = (origin: Partial<SessionRecord>, executions: SessionRecord['executions']) =>
	({
		id: 's1',
		startedAt: 0,
		endedAt: 1,
		fatigueDetected: false,
		executions,
		latencyMs: 0,
		...origin
	}) satisfies SessionRecord;

/** The summary screen of a stored session, its text. */
function shown(record: SessionRecord): string {
	const summary = summarizeSession({ record, attempts: [], allAttempts: [], cards: [], now: 1 });
	const { container } = render(SummaryScreen, {
		props: { summary, now: 1, onhome: () => {}, onmap: () => {} }
	});
	return container.textContent ?? '';
}

describe('the summary of a stored session, told by what it played (Review Focus 4)', () => {
	it('shows a notes session as one: notes learned, naming, its tempo, its next reviews', () => {
		const text = shown(
			stored({ routine: 'notes' }, [
				{ exerciseId: 'identify-note', tempoBpm: null },
				{ exerciseId: 'locate-note-string', tempoBpm: 80 }
			])
		);
		expect(text).toContain('Notes apprises');
		expect(text).toContain('♩ = 80');
		expect(text).toContain('Prochaines révisions');
		expect(text).not.toContain('Triades apprises');
		// No cold attempt: the cold figures are not shown.
		expect(text).toContain('Aucune révision à froid cette fois');
	});

	it('shows the notes’ free play over every attempt, with no next reviews', () => {
		const text = shown(stored({ routine: 'notes', free: true }, []));
		expect(text).toContain('Précision');
		expect(text).toContain('Nommer');
		expect(text).not.toContain('Précision à froid');
		expect(text).not.toContain('Prochaines révisions');
	});

	it.each([
		[{ routine: 'chords' }, 'chord-anchor', 85],
		[{ routine: 'chords-zone' }, 'chord-zone', 75]
	])(
		'shows a session of triads (%o) counting triads, at its exercise’s tempo',
		(origin, id, bpm) => {
			const text = shown(stored(origin, [{ exerciseId: id, tempoBpm: bpm }]));
			expect(text).toContain('Triades apprises');
			expect(text).toContain(`♩ = ${bpm}`);
			expect(text).not.toContain('Notes apprises');
		}
	);

	it('shows a session of the changes by exercise', () => {
		const text = shown(
			stored({ routine: 'changes' }, [{ exerciseId: 'grid-reading', tempoBpm: 80 }])
		);
		expect(text).not.toContain('Notes apprises');
		expect(text).not.toContain('Triades apprises');
		expect(text).not.toContain('Précision');
	});

	it('shows a session that names neither a routine nor an exercise as the notes', () => {
		const text = shown(stored({}, [{ exerciseId: 'locate-note-string', tempoBpm: 80 }]));
		expect(text).toContain('Notes apprises');
		expect(text).toContain('♩ = 80');
	});

	it('shows a triad exercise played alone as triads', () => {
		const text = shown(stored({ exercise: 'chord-anchor', free: true }, []));
		expect(text).toContain('Triades apprises');
		expect(text).not.toContain('Nommer');
	});
});
