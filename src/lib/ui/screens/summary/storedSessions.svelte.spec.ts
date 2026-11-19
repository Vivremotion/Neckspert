import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppServices } from '$lib/application/services/createAppServices';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { introduceCard, markLearned } from '$lib/domain/progress';
import type { CardState, SessionRecord } from '$lib/domain/types';
import {
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemorySessionRepository
} from '$lib/testing/fakes';
import { RHYTHM_OFFBEATS } from '$lib/testing/catalog';
import SummaryScreen from './SummaryScreen.svelte';

afterEach(() => cleanup());

const NOW = 1;

/** A session stored before plan 5a, as migration 13 wrote it, with what it recorded. */
const stored = (
	origin: Partial<SessionRecord>,
	executions: SessionRecord['executions'] = []
): SessionRecord => ({
	id: 's1',
	startedAt: 0,
	endedAt: 1,
	fatigueDetected: false,
	executions,
	latencyMs: 0,
	...origin
});

/** A learned card, due later: the summary has a next review to tell. */
function learned(key: string, skill: string, item: unknown): CardState {
	const card = markLearned(introduceCard({ key, skill, item }, 0, 's0'), 0);
	return { ...card, scheduling: { ...card.scheduling, due: 2 * 3_600_000 } };
}

/**
 * The summary screen of a stored session, its text, as the service sums it up: only the stores
 * `sessionSummary` reads are given.
 */
async function shown(record: SessionRecord): Promise<string> {
	const sessions = new InMemorySessionRepository();
	const cards = new InMemoryCardStateRepository();
	await sessions.put(record);
	await cards.putMany([
		learned('locate-note-string:6:G', 'locate-note-string', { string: 6, pitch: 'G' }),
		learned('chord-anchor:D|maj|3:5,2:1,1:3', 'chord-anchor', {
			voicingKey: 'D|maj|3:5,2:1,1:3'
		})
	]);
	const services = createAppServices({
		sessions,
		cards,
		attempts: new InMemoryAttemptRepository(),
		levels: new InMemoryLevelStateRepository(),
		memory: new SessionMemory(),
		now: () => NOW
	} as unknown as Parameters<typeof createAppServices>[0]);
	const summary = await services.sessionSummary(record.id);
	const { container } = render(SummaryScreen, {
		props: { summary, now: NOW, onhome: () => {}, onmap: () => {} }
	});
	return container.textContent ?? '';
}

describe('the summary of a stored session, told by what it played (Review Focus 4)', () => {
	it('shows a notes session as one: notes learned, its tempo, its next reviews', async () => {
		const text = await shown(
			stored({ routine: 'notes' }, [
				{ exerciseId: 'identify-note', tempoBpm: null },
				{ exerciseId: 'locate-note-string', tempoBpm: 80 }
			])
		);
		expect(text).toContain('Notes apprises');
		expect(text).toContain('♩ = 80');
		expect(text).toContain('Prochaines révisions');
		expect(text).toContain('Dans 2 h');
		expect(text).not.toContain('Triades apprises');
		// No cold attempt: the cold figures are not shown.
		expect(text).toContain('Aucune révision à froid cette fois');
	});

	it('shows the notes’ free play over every attempt, with no next reviews', async () => {
		const text = await shown(stored({ routine: 'notes', free: true }));
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
		async (origin, id, bpm) => {
			const text = await shown(stored(origin, [{ exerciseId: id, tempoBpm: bpm }]));
			expect(text).toContain('Triades apprises');
			expect(text).toContain(`♩ = ${bpm}`);
			expect(text).toContain('Prochaines révisions');
			expect(text).not.toContain('Notes apprises');
		}
	);

	it('shows a session of the changes by exercise', async () => {
		const text = await shown(
			stored({ routine: 'changes' }, [{ exerciseId: 'grid-reading', tempoBpm: 80 }])
		);
		expect(text).not.toContain('Notes apprises');
		expect(text).not.toContain('Triades apprises');
		expect(text).not.toContain('Précision');
	});

	it('shows an exercise of figures played alone by its own block', async () => {
		const text = await shown(stored({ exercise: RHYTHM_OFFBEATS.id, levelReached: 1 }));
		expect(text).toContain('Contretemps');
		expect(text).toContain('Niveau atteint');
		expect(text).not.toContain('Notes apprises');
	});

	it('shows a session that names neither a routine nor an exercise as the notes', async () => {
		const text = await shown(stored({}, [{ exerciseId: 'locate-note-string', tempoBpm: 80 }]));
		expect(text).toContain('Notes apprises');
		expect(text).toContain('♩ = 80');
	});

	it.each([[{ routine: 'kazoo' }], [{ exercise: 'kazoo' }]])(
		'falls back on what it holds for %o, which no file defines any more',
		async (origin) => {
			const text = await shown(stored(origin, [{ exerciseId: 'kazoo', tempoBpm: 80 }]));
			// Nothing of it is known: the notes' rows, no tempo, nothing to review.
			expect(text).toContain('Notes apprises');
			expect(text).not.toContain('♩');
			expect(text).toContain('Prochaines révisions');
		}
	);

	it('shows a triad exercise played alone as a free play of triads: no next reviews', async () => {
		const text = await shown(stored({ exercise: 'chord-anchor', free: true }));
		expect(text).toContain('Triades apprises');
		expect(text).toContain('Précision');
		expect(text).not.toContain('Précision à froid');
		expect(text).not.toContain('Nommer');
		expect(text).not.toContain('Prochaines révisions');
	});
});
