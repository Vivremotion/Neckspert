<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'primary',
		onclick,
		disabled = false,
		children
	}: {
		variant?: 'primary' | 'quiet';
		onclick?: (event: MouseEvent) => void;
		disabled?: boolean;
		children: Snippet;
	} = $props();
</script>

<button type="button" data-variant={variant} {onclick} {disabled}>
	{@render children()}
</button>

<style>
	button {
		font-family: var(--np-font-text);
		font-size: var(--np-size-body);
		cursor: pointer;
		border: 0;
	}

	button:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	button[data-variant='primary'] {
		background: var(--np-now);
		color: var(--np-text);
		font-size: var(--np-size-title);
		padding: var(--np-step-2) var(--np-step-4);
		border-radius: 2px;
	}

	button[data-variant='quiet'] {
		background: none;
		color: inherit;
		padding: var(--np-step-1) 0;
	}

	button[data-variant='quiet']:hover,
	button[data-variant='quiet']:focus-visible {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	button:disabled {
		cursor: default;
		opacity: 0.6;
	}
</style>
