<script lang="ts">
	import type { RoutineEntry } from '$lib/application/app';
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

	const fixtures: {
		label: string;
		now: number;
		routines: RoutineEntry[];
		catalogRefused?: boolean;
	}[] = [
		{
			label: 'learn, reviews due',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn', { due: 6 }),
				routine('b', 'Triades', 'Triads', { due: 4 }),
				routine('c', 'Triades vers une case', 'Triads around a fret', { due: 2 }),
				routine('d', 'Changements', 'Changes', { due: null, resting: true })
			]
		},
		{
			label: 'first visit',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn'),
				routine('b', 'Triades', 'Triads'),
				routine('c', 'Triades vers une case', 'Triads around a fret', { open: false })
			]
		},
		{
			label: 'learn, next reviews later',
			now: 0,
			routines: [
				routine('a', 'Apprentissage', 'Learn', { nextReviewAt: 2 * 60 * 60 * 1000 }),
				routine('b', 'Triades', 'Triads', { nextReviewAt: 26 * 60 * 60 * 1000 })
			]
		},
		{
			label: 'nothing open, part of the catalog refused',
			now: 0,
			routines: [routine('a', 'Apprentissage', 'Learn', { open: false })],
			catalogRefused: true
		}
	];
</script>

<div class="dev">
	{#each fixtures as fixture (fixture.label)}
		<section>
			<h1>{fixture.label}</h1>
			<HomeScreen
				now={fixture.now}
				onstart={() => {}}
				routines={fixture.routines}
				onroutine={() => {}}
				catalogRefused={fixture.catalogRefused}
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
