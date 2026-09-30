<script lang="ts">
	import type { Verdict } from '$lib/domain/types';

	let {
		verdict,
		size = 32,
		inverted = false
	}: {
		verdict: Verdict;
		size?: number;
		inverted?: boolean;
	} = $props();
</script>

<svg
	class:inverted
	width={size}
	height={size}
	viewBox="0 0 16 16"
	aria-hidden="true"
	focusable="false"
	shape-rendering="crispEdges"
>
	{#if verdict === 'perfect'}
		<rect x="5" y="1" width="6" height="2" fill="currentColor" />
		<rect x="3" y="3" width="10" height="2" fill="currentColor" />
		<rect x="2" y="5" width="12" height="6" fill="currentColor" />
		<rect x="3" y="11" width="10" height="2" fill="currentColor" />
		<rect x="5" y="13" width="6" height="2" fill="currentColor" />
	{:else if verdict === 'early'}
		<polygon points="15,4 8,4 8,1 1,8 8,15 8,12 15,12" fill="currentColor" />
	{:else if verdict === 'late'}
		<polygon points="1,4 8,4 8,1 15,8 8,15 8,12 1,12" fill="currentColor" />
	{:else}
		<polygon
			points="2,3 5,3 8,6 11,3 14,3 10,8 14,13 11,13 8,10 5,13 2,13 6,8"
			fill="currentColor"
		/>
	{/if}
</svg>

<style>
	svg {
		color: var(--np-ink);
		display: block;
		shape-rendering: crispEdges;
	}
	.inverted {
		color: var(--np-bg);
	}
</style>
