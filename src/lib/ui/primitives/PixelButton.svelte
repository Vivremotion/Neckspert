<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onclick,
		disabled = false,
		size = 'large',
		label,
		children
	}: {
		onclick: (e: MouseEvent) => void;
		disabled?: boolean;
		size?: 'large' | 'huge';
		/** Accessible name when the visible glyph is shared with another control. */
		label?: string;
		children: Snippet;
	} = $props();
</script>

<button type="button" class="btn" class:huge={size === 'huge'} aria-label={label} {disabled} {onclick}>
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
		min-inline-size: min(100%, calc(var(--np-tile) * 12));
		max-width: 100%;
		box-sizing: border-box;
		padding: var(--np-space-2) var(--np-space-3);
		font-size: var(--np-type-body);
		white-space: normal;
		overflow-wrap: anywhere;
		cursor: pointer;
	}
	.btn:disabled {
		background: var(--np-bg);
		color: var(--np-ink);
		cursor: not-allowed;
	}
	.btn:focus-visible {
		outline: calc(var(--np-tile) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile) / 2);
	}
	.huge {
		min-block-size: calc(var(--np-tile) * 8);
		min-inline-size: min(100%, calc(var(--np-tile) * 16));
		font-size: var(--np-type-title);
	}
</style>
