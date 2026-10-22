<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		main,
		line = null,
		recall = null,
		size = 'hero',
		children
	}: {
		main: string;
		/** Under the main text: the string. */
		line?: string | null;
		/** Above, small: the prompt recalled during a correction. */
		recall?: string | null;
		/** hero: the note alone; prompt: a smaller main line; correction: a fret in the prompt's place. */
		size?: 'hero' | 'prompt' | 'correction';
		children?: Snippet;
	} = $props();
</script>

<div class="prompt" data-size={size}>
	{#if recall}<p class="recall">{recall}</p>{/if}
	<p class="main">{main}</p>
	{#if line}<p class="line">{line}</p>{/if}
	{#if children}<div class="below">{@render children()}</div>{/if}
</div>

<style>
	.prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-step-2);
		text-align: center;
		font-family: var(--np-font-text);
		color: var(--np-on-field);
	}

	p {
		margin: 0;
	}

	.recall {
		font-size: var(--np-size-prompt);
		line-height: 1.1;
		opacity: 0.8;
	}

	.main {
		font-size: var(--np-size-prompt);
		font-weight: 400;
		line-height: 1.1;
	}

	.prompt[data-size='hero'] .main {
		font-size: var(--np-size-hero);
		font-weight: 300;
		line-height: 1;
	}

	/* Light and large, but it wraps: never wider than the screen. */
	.prompt[data-size='correction'] .main {
		max-inline-size: 100%;
		font-size: var(--np-size-correction);
		font-weight: 300;
		line-height: 1.05;
		overflow-wrap: break-word;
	}

	.line {
		font-size: var(--np-size-prompt);
	}

	.below {
		margin-top: var(--np-step-3);
	}
</style>
