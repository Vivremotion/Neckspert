<script lang="ts">
	import type { RoutineEntry } from '$lib/application/app';
	import { exerciseSessionExercises } from '$lib/domain/exercise';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	/** A routine as the service would tell it; fixtures only, the titles written here. */
	const routine = (
		id: string,
		fr: string,
		en: string,
		over: Partial<RoutineEntry> = {}
	): RoutineEntry => ({
		id,
		title: { fr, en },
		open: true,
		due: 0,
		nextReviewAt: null,
		resting: false,
		...over
	});

	const fixtures: { label: string; stats: HomeStats; now: number; routines: RoutineEntry[] }[] = [
		{
			label: 'learn, reviews due',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn', { due: 6 }),
				routine('b', 'Triades', 'Triads', { due: 4 }),
				routine('c', 'Triades vers une case', 'Triads around a fret', { due: 2 }),
				routine('d', 'Changements', 'Changes', { due: null, resting: true })
			],
			stats: { medianColdOffsetMs: 40, trend: 'improving' }
		},
		{
			label: 'first visit',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn'),
				routine('b', 'Triades', 'Triads'),
				routine('c', 'Triades vers une case', 'Triads around a fret', { open: false })
			],
			stats: { medianColdOffsetMs: null, trend: null }
		},
		{
			label: 'learn, next reviews later',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn', { nextReviewAt: 2 * 60 * 60 * 1000 }),
				routine('b', 'Triades', 'Triads', { nextReviewAt: 26 * 60 * 60 * 1000 })
			],
			stats: { medianColdOffsetMs: 80, trend: 'worsening' }
		}
	];
</script>

<div class="dev">
	{#each fixtures as fixture (fixture.label)}
		<section>
			<h1>{fixture.label}</h1>
			<HomeScreen
				stats={fixture.stats}
				now={fixture.now}
				onstart={() => {}}
				routines={fixture.routines}
				onroutine={() => {}}
				exercises={exerciseSessionExercises()}
			/>
		</section>
	{/each}
</div>

<style>
	.dev {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	h1 {
		font-family: inherit;
		font-size: 1rem;
		margin: 0;
		padding: 0.5rem;
	}
</style>
