<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		as = 'span',
		scale = 1,
		children
	}: {
		as?: string;
		scale?: 1 | 2 | 3 | 4 | 8;
		children: Snippet;
	} = $props();
</script>

<svelte:element this={as} class="px" style="--scale: {scale}">
	{@render children()}
</svelte:element>

<style>
	.px {
		font-family: var(--np-font-pixel);
		font-weight: 700;
		font-size: calc(var(--np-tile) * var(--scale));
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 0;
	}
</style>
