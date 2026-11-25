<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * The quiet play screen (« Près du silence »): the ground from edge to edge, as on every page
	 * (no field of its own: what is read in play is ink on the ground, as a score is), the info line
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
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		min-height: 100dvh;
		padding: var(--np-step-4) clamp(var(--np-step-2), 3vw, var(--np-step-5)) var(--np-step-6);
		gap: var(--np-step-4);
		background: var(--np-ground);
		color: var(--np-text);
	}
</style>
