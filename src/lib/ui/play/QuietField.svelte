<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * The quiet play screen (« Près du silence »): the misty field from edge to edge, the info line
	 * above, the prompt in the middle, the lane or the keys below.
	 */
	let {
		light,
		children,
		...rest
	}: {
		/** Start, end and pause: a light page over the field. */
		light: boolean;
		children: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();
</script>

<section class="play" class:light {...rest}>
	{@render children()}
</section>

<style>
	.play {
		/* Chord shapes take the colours of the field. */
		--shape-ink: var(--np-on-field);
		--shape-ground: var(--np-text);
		--shape-accent: var(--np-cell-downbeat);
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		min-height: 100dvh;
		padding: var(--np-step-4) clamp(var(--np-step-2), 3vw, var(--np-step-5)) var(--np-step-6);
		gap: var(--np-step-4);
		/* A veil over the lightest stop of the field, under the info line. */
		background: linear-gradient(rgba(35, 33, 31, 0.4), transparent 160px), var(--np-field);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		/* Not the pixel world's bold, unsmoothed body. */
		font-weight: 400;
		image-rendering: auto;
		-webkit-font-smoothing: antialiased;
	}
</style>
