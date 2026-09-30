<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onclick,
		disabled = false,
		size = 'large',
		children
	}: {
		onclick: (e: MouseEvent) => void;
		disabled?: boolean;
		size?: 'large' | 'huge';
		children: Snippet;
	} = $props();
</script>

<button type="button" class="btn" class:huge={size === 'huge'} {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.btn {
		font: inherit;
		font-weight: 700;
		text-transform: uppercase;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-mid);
		color: var(--np-ink);
		min-block-size: calc(var(--np-tile) * 6);
		min-inline-size: calc(var(--np-tile) * 12);
		padding: var(--np-space-2) var(--np-space-3);
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn:focus-visible {
		outline: calc(var(--np-tile) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile) / 2);
	}
	.huge {
		min-block-size: calc(var(--np-tile) * 10);
		min-inline-size: calc(var(--np-tile) * 20);
		font-size: 1.5em;
	}
</style>
