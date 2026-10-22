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

<!-- The main word never breaks: its length lets the hero size shrink to the width it has. -->
<div class="prompt" data-size={size} style="--prompt-chars: {[...main].length};">
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

	/* One line, whatever the word: scaled down to fit the nearest container's width (the play
	   screen's centre), about 0.6em per glyph. */
	.prompt[data-size='hero'] .main {
		font-size: min(var(--np-size-hero), calc(100cqi / (var(--prompt-chars) * 0.6)));
		white-space: nowrap;
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

	/* What comes under the prompt (drawn string, aid tile, shape) shares its centre axis. */
	.below {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: var(--np-step-3);
	}
</style>
