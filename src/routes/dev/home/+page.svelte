<script lang="ts">
	import type { TriadsHome } from '$lib/application/app';
	import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const fixtures: { label: string; stats: HomeStats; now: number; triads?: TriadsHome }[] = [
		{
			label: 'learn, reviews due',
			now: 0,
			triads: { anchorDue: 4, zoneDue: 2 },
			stats: {
				dueCount: 6,
				nextReviewAt: null,
				medianColdOffsetMs: 40,
				trend: 'improving'
			}
		},
		{
			label: 'first visit',
			now: 0,
			stats: {
				dueCount: 0,
				nextReviewAt: null,
				medianColdOffsetMs: null,
				trend: null
			}
		},
		{
			label: 'learn, next reviews later',
			now: 0,
			stats: {
				dueCount: 0,
				nextReviewAt: 2 * 60 * 60 * 1000,
				medianColdOffsetMs: 80,
				trend: 'worsening'
			}
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
				triads={fixture.triads}
				ontriads={() => {}}
				rhythm={RHYTHM_EXERCISES}
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
