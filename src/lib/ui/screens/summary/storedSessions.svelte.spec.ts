import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppServices } from '$lib/application/services/createAppServices';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { introduceCard, markLearned } from '$lib/domain/progress';
import type { Attempt, CardState, SessionRecord } from '$lib/domain/types';
import { responseAttempt } from '$lib/testing/attempts';
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

/** When each change was prompted: in the order the test writes them. */
let prompted = 0;

/** A change of a grid as a session of the changes stored it, in its passage. */
function change(
	exerciseId: string,
	passageId: string,
	index: number,
	success: boolean,
	tempoBpm = 80
): Attempt {
	return responseAttempt({
		sessionId: 's1',
		exerciseId,
		skill: exerciseId,
		scope: 'iohefy-a',
		cardKey: `${exerciseId}:iohefy-a#${index}`,
		phase: 'free',
		temperature: 'hot',
		promptedAt: ++prompted,
		tempoBpm,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: success,
		verdict: success ? 'perfect' : 'wrong',
		data: {
			item: { grid: 'iohefy-a', index },
			passage: { id: passageId, index: 'grid=iohefy-a;strings=3,2,1', rank: index, each: {} },
			answer: null,
			confusion: null
		},
		observations: [],
		plan: null
	});
}

/** A cycle of a figure exercise as its session stored it, at the level played. */
function cycle(exerciseId: string, level: number, success: boolean, aids?: Attempt['aids']) {
	return {
		sessionId: 's1',
		exerciseId,
		skill: 'inner-pulse',
		cardKey: `inner-pulse:offbeats-1@${level}`,
		phase: 'free',
		temperature: 'hot',
		...(aids && { aids }),
		promptedAt: 0,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: null,
		success,
		verdict: { relation: 'plan', version: 1, value: success ? 'ok' : 'miss' },
		measures: {},
		plan: null,
		data: { item: { figureId: 'offbeats-1', level }, level, report: {} },
		observations: []
	} as unknown as Attempt;
}

/**
 * The summary screen of a stored session, its text, as the service sums it up: only the stores
 * `sessionSummary` reads are given.
 */
async function shown(record: SessionRecord, stored: readonly Attempt[] = []): Promise<string> {
	const sessions = new InMemorySessionRepository();
	const cards = new InMemoryCardStateRepository();
	const attempts = new InMemoryAttemptRepository();
	await sessions.put(record);
	for (const attempt of stored) await attempts.add(attempt);
	const memory = new SessionMemory();
	await cards.putMany([
		learned('locate-note-string:6:G', 'locate-note-string', { string: 6, pitch: 'G' }),
		learned('chord-anchor:D|maj|3:5,2:1,1:3', 'chord-anchor', {
			voicingKey: 'D|maj|3:5,2:1,1:3'
		})
	]);
	const services = createAppServices({
		sessions,
		cards,
		attempts,
		levels: new InMemoryLevelStateRepository(),
		memory,
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

	it('tells a session of the changes as it did: per exercise and grid, its passages, its changes, its tempos', async () => {
		const climb = [0, 1, 2].map((i) => change('grid-in-direction', 'p1', i, true));
		const jam = [
			...[0, 1, 2, 3].map((i) => change('grid-reading', 'p2', i, i !== 3)),
			...[0, 1].map((i) => change('grid-reading', 'p3', i, true, 85))
		];
		const text = await shown(
			stored({ routine: 'changes' }, [
				{ exerciseId: 'grid-in-direction', scope: 'iohefy-a', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', scope: 'iohefy-a', tempoBpm: 80 }
			]),
			[...climb, ...jam]
		);
		expect(text).toContain('Contrainte de déplacement · I Only Have Eyes for You');
		expect(text).toContain('1 / 1 passages réussis');
		expect(text).toContain('100 % justes et à temps');
		expect(text).toContain('Jam · I Only Have Eyes for You');
		expect(text).toContain('1 / 2 passages réussis');
		expect(text).toContain('83 % justes et à temps');
		expect(text).toContain('♩ = 80 → 85');
		expect(text).toContain('Changements ratés');
		expect(text).not.toContain('Notes apprises');
		expect(text).not.toContain('Niveau atteint');
	});

	it('tells an exercise of figures played alone: its level and its cycles, nothing of the aids an old attempt kept', async () => {
		const text = await shown(stored({ exercise: RHYTHM_OFFBEATS.id, levelReached: 1 }), [
			cycle(RHYTHM_OFFBEATS.id, 0, true, ['listen']),
			cycle(RHYTHM_OFFBEATS.id, 1, true, ['cursor']),
			cycle(RHYTHM_OFFBEATS.id, 1, false)
		]);
		expect(text).toContain('Contretemps');
		expect(text).toContain('Niveau atteint : 2 sur 4');
		expect(text).toContain('2 cycles réussis sur 3');
		expect(text).not.toMatch(/aide|aidé/);
		expect(text).not.toContain('Notes apprises');
	});

	it('gives no line to a passages exercise played alone with no change, as before', async () => {
		const text = await shown(
			stored({ exercise: 'grid-in-direction' }, [
				{ exerciseId: 'grid-in-direction', scope: 'iohefy-a', tempoBpm: 80 }
			])
		);
		expect(document.querySelector('li.exercise')).toBeNull();
		expect(text).not.toContain('cycle');
		expect(text).not.toContain('Notes apprises');
	});

	it('keeps the line of an exercise no file defines any more, its id for title (D2)', async () => {
		const text = await shown(stored({ exercise: 'rhythm-removed', levelReached: 1 }), [
			cycle('rhythm-removed', 0, true),
			cycle('rhythm-removed', 0, false)
		]);
		expect(text).toContain('rhythm-removed');
		expect(text).toContain('1 cycle réussi sur 2');
		expect(text).toContain('♩ = 80');
		expect(text).not.toContain('Niveau atteint');
		expect(text).not.toContain('Notes apprises');
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
