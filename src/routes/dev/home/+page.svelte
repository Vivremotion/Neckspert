<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const fixtures: { label: string; stats: HomeStats; now: number }[] = [
		{
			label: 'session',
			now: 0,
			stats: {
				nextAction: 'session',
				nextReviewAt: null,
				medianColdReactionMs: 1180,
				trend: 'improving'
			}
		},
		{
			label: 'placement',
			now: 0,
			stats: {
				nextAction: 'placement',
				nextReviewAt: null,
				medianColdReactionMs: null,
				trend: null
			}
		},
		{
			label: 'wait',
			now: 0,
			stats: {
				nextAction: 'wait',
				nextReviewAt: 2 * 60 * 60 * 1000,
				medianColdReactionMs: 1400,
				trend: 'worsening'
			}
		}
	];
</script>

<main class="dev">
	{#each fixtures as fixture (fixture.label)}
		<section>
			<h1>{fixture.label}</h1>
			<HomeScreen stats={fixture.stats} now={fixture.now} onstart={() => {}} />
		</section>
	{/each}
</main>

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}

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
