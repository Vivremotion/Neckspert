<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'plain',
		children
	}: {
		variant?: 'plain' | 'double' | 'inverted';
		children?: Snippet;
	} = $props();
</script>

<div class="box" class:double={variant === 'double'} class:inverted={variant === 'inverted'}>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.box {
		box-sizing: border-box;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
		color: var(--np-ink);
		padding: var(--np-space-2);
	}
	.double {
		outline: calc(var(--np-tile) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile) / 2);
	}
	.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}
</style>
