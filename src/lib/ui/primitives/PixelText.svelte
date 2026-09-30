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

<svelte:element this={as} class="px" data-scale={scale}>
	{@render children()}
</svelte:element>

<style>
	.px {
		font-family: var(--np-font-pixel);
		font-weight: 700;
		font-size: var(--np-type-meta);
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 0;
	}

	.px[data-scale='2'] {
		font-size: var(--np-type-body);
		line-height: 1.3;
	}

	.px[data-scale='3'] {
		font-size: var(--np-type-title);
	}

	.px[data-scale='4'] {
		font-size: var(--np-type-display);
		font-variant-numeric: tabular-nums;
	}

	.px[data-scale='8'] {
		font-size: var(--np-type-hero);
	}
</style>
