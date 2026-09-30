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
		<rect x="4" y="1" width="8" height="2" fill="currentColor" />
		<rect x="2" y="3" width="12" height="2" fill="currentColor" />
		<rect x="1" y="5" width="14" height="6" fill="currentColor" />
		<rect x="2" y="11" width="12" height="2" fill="currentColor" />
		<rect x="4" y="13" width="8" height="2" fill="currentColor" />
	{:else if verdict === 'early'}
		<rect x="7" y="6" width="8" height="4" fill="currentColor" />
		<rect x="7" y="4" width="2" height="8" fill="currentColor" />
		<rect x="5" y="5" width="2" height="6" fill="currentColor" />
		<rect x="3" y="6" width="2" height="4" fill="currentColor" />
		<rect x="1" y="7" width="2" height="2" fill="currentColor" />
	{:else if verdict === 'late'}
		<rect x="1" y="6" width="8" height="4" fill="currentColor" />
		<rect x="7" y="4" width="2" height="8" fill="currentColor" />
		<rect x="9" y="5" width="2" height="6" fill="currentColor" />
		<rect x="11" y="6" width="2" height="4" fill="currentColor" />
		<rect x="13" y="7" width="2" height="2" fill="currentColor" />
	{:else}
		<rect x="2" y="2" width="3" height="3" fill="currentColor" />
		<rect x="5" y="5" width="3" height="3" fill="currentColor" />
		<rect x="8" y="8" width="3" height="3" fill="currentColor" />
		<rect x="11" y="11" width="3" height="3" fill="currentColor" />
		<rect x="11" y="2" width="3" height="3" fill="currentColor" />
		<rect x="8" y="5" width="3" height="3" fill="currentColor" />
		<rect x="5" y="8" width="3" height="3" fill="currentColor" />
		<rect x="2" y="11" width="3" height="3" fill="currentColor" />
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
