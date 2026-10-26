<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/primitives/Button.svelte';
	import InfoLine from '$lib/ui/primitives/InfoLine.svelte';
	import { playMessages } from './messages';

	/** The quiet play screen's info line: the session and its tempo, pause while playing, quit. */
	let {
		parts,
		playing,
		light,
		onpause,
		onleave
	}: {
		parts: string[];
		playing: boolean;
		/** Over the light page (start, end, pause): in ink, above it. */
		light: boolean;
		onpause: () => void;
		onleave: (event: MouseEvent) => void;
	} = $props();

	const t = $derived(playMessages());
</script>

<div class="top" class:light>
	<InfoLine {parts}>
		{#snippet end()}
			{#if playing}
				<Button variant="quiet" onclick={onpause}>{t.pause}</Button>
			{/if}
			<a class="leave" href={resolve('/')} onclick={onleave}>{t.quit}</a>
		{/snippet}
	</InfoLine>
</div>

<style>
	/* The field's tone, or ink on the light page. */
	.top:not(.light) {
		--np-text: var(--np-on-field);
	}

	/* The info line and « quitter » stay above the light page, in ink. */
	.top.light {
		position: relative;
		z-index: 2;
	}

	.top :global(.info-parts) {
		opacity: 0.9;
	}

	.top :global(.info-end button) {
		font-size: var(--np-size-meta);
		text-transform: inherit;
		letter-spacing: inherit;
	}

	.top :global(.info-end) {
		display: flex;
		align-items: baseline;
		gap: var(--np-step-3);
		text-transform: lowercase;
		letter-spacing: 0.06em;
	}

	.leave {
		color: inherit;
		font-size: var(--np-size-meta);
		text-decoration: none;
		padding: var(--np-step-1) 0;
	}

	.leave:hover,
	.leave:focus-visible {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.leave:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}
</style>
