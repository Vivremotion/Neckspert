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
>
	{#if verdict === 'perfect'}
		<circle cx="8" cy="8" r="5" fill="currentColor" />
	{:else if verdict === 'early'}
		<polygon points="13,2 7,2 7,5 2,8 7,11 7,14 13,14" fill="currentColor" />
	{:else if verdict === 'late'}
		<polygon points="3,2 9,2 9,5 14,8 9,11 9,14 3,14" fill="currentColor" />
	{:else}
		<path
			d="M4 4 L12 12 M12 4 L4 12"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="square"
		/>
	{/if}
</svg>

<style>
	svg {
		color: var(--np-ink);
		display: block;
		image-rendering: pixelated;
	}
	.inverted {
		color: var(--np-bg);
	}
</style>
