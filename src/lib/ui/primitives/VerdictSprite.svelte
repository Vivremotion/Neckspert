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
		<rect x="4" y="0" width="8" height="2" fill="currentColor" />
		<rect x="2" y="2" width="12" height="2" fill="currentColor" />
		<rect x="1" y="4" width="14" height="8" fill="currentColor" />
		<rect x="2" y="12" width="12" height="2" fill="currentColor" />
		<rect x="4" y="14" width="8" height="2" fill="currentColor" />
	{:else if verdict === 'early'}
		<polygon points="15,4 8,4 8,1 1,8 8,15 8,12 15,12" fill="currentColor" />
	{:else if verdict === 'late'}
		<polygon points="1,4 8,4 8,1 15,8 8,15 8,12 1,12" fill="currentColor" />
	{:else}
		<polygon
			points="1,2 6,2 8,5 10,2 15,2 11,8 15,14 10,14 8,11 6,14 1,14 5,8"
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
