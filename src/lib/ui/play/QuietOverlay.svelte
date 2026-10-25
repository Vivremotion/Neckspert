<script lang="ts">
	import type { PlayView } from '$lib/application/session/contract';
	import Button from '$lib/ui/primitives/Button.svelte';
	import { playMessages } from './messages';

	/** Start, end and pause of the quiet play screen: a light page over the field, one button. */
	let {
		status,
		audioError,
		how,
		briefing,
		onstart,
		onresume
	}: {
		status: PlayView['status'];
		audioError: PlayView['audioError'];
		/** What the start screen tells before the first prompt. */
		how: string;
		/** An exercise met for the first time, at its own stop: its instruction, then a counted bar. */
		briefing: string | null;
		onstart: () => void;
		onresume: () => void;
	} = $props();

	const t = $derived(playMessages());
</script>

{#if status === 'idle' || status === 'finished'}
	<div class="overlay">
		{#if status === 'finished'}
			<p class="how">{t.finished}</p>
		{:else if audioError === 'input'}
			<p class="how no-input" role="alert">{t.noInput}</p>
		{:else if audioError === 'bleed'}
			<!-- The game is not refused: a first encounter still reads its instruction. -->
			<p class="how" role="alert">{t.bleed}</p>
			<p class="how">{how}</p>
		{:else}
			<p class="how">{how}</p>
		{/if}
		<Button onclick={onstart}>{status === 'finished' ? t.again : t.start}</Button>
	</div>
{:else if status === 'paused' && briefing !== null}
	<div class="overlay" role="dialog" aria-label={t.go}>
		<p class="how">{briefing}</p>
		<Button onclick={onresume}>{t.go}</Button>
	</div>
{:else if status === 'paused'}
	<div class="overlay">
		<Button onclick={onresume}>{t.resume}</Button>
	</div>
{/if}

<style>
	/* A light page, the how-to, one amber button. */
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		align-content: center;
		gap: var(--np-step-5);
		padding: var(--np-step-5);
		background: var(--np-ground);
		color: var(--np-text);
	}

	.how {
		margin: 0;
		max-width: 36rem;
		font-size: var(--np-size-body);
		line-height: 1.5;
		text-align: center;
	}
</style>
