<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import { playMessages } from './messages';
	import PixelWord from './PixelWord.svelte';
	import { PLAY_VIEWS, type PlayViewProps } from './views';
	import type { Component } from 'svelte';

	let {
		controller,
		kind = 'gesture',
		quitToSummary = false,
		views = PLAY_VIEWS
	}: {
		controller: PlaySessionController;
		/** Which session runs: its how-to shows before the start. */
		kind?: SessionKind;
		quitToSummary?: boolean;
		/** The registry the stage's view is looked up in. */
		views?: Record<string, Component<PlayViewProps>>;
	} = $props();

	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const Stage = $derived(view.stage ? (views[view.stage.view] ?? null) : null);
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');
	const running = $derived(
		view.status === 'count-in' || view.status === 'awaiting' || view.status === 'verdict'
	);
	/** A miss drawn by its mechanic: what was played and what was due. */
	const drawn = $derived(
		view.lastVerdict && (view.lastVerdict.heard || view.lastVerdict.expected)
			? view.lastVerdict
			: null
	);

	function leave(event: MouseEvent) {
		if (quitToSummary && view.status !== 'idle') {
			event.preventDefault();
			if (view.status !== 'finished') controller.quit();
			return;
		}
		if (view.status !== 'idle' && view.status !== 'finished') controller.quit();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== 'Enter') return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.closest('button, input, textarea, select') !== null
		) {
			return;
		}
		// Enter (or a pedal sending it): « Joué juste », while a miss is offered to contest.
		if (event.key === 'Enter') {
			if (view.contest !== 'available') return;
			event.preventDefault();
			controller.contest();
			return;
		}
		event.preventDefault();
		if (view.status === 'paused') controller.resume();
		else if (running) controller.pause();
	}
</script>

<svelte:window onkeydown={onKeydown} />
<section class="frame" data-status={view.status}>
	<div class="chrome">
		{#if running}
			<PixelButton size="large" onclick={() => controller.pause()}>{t.pause}</PixelButton>
		{/if}
		<a class="leave" href={resolve('/')} onclick={leave}>{t.quit}</a>
	</div>

	{#if view.countdown !== null}
		<!-- The counted bar, down to the change itself: big, over the view. -->
		<div class="countdown" aria-live="polite" aria-label={String(view.countdown)}>
			<div class="count"><PixelWord text={String(view.countdown)} /></div>
		</div>
	{/if}

	<div class="stage">
		{#if Stage && view.stage}
			<Stage {controller} model={view.stage.model} />
		{/if}
	</div>

	<div class="status">
		{#if view.lastVerdict && view.countdown === null}
			<div class="verdict">
				<p class="banner">{t.verdict[view.lastVerdict.verdict]}</p>
				{#if drawn}
					<div class="drawn">
						{#if drawn.heard}
							<div class="drawn-part">
								<p class="label">{t.played}</p>
								<ChordShape
									shape={drawn.heard}
									style={view.chordDiagram}
									locale={i18n.locale}
									size="small"
								/>
							</div>
						{/if}
						{#if drawn.expected}
							<div class="drawn-part">
								<p class="label">{t.expected}</p>
								<ChordShape
									shape={drawn.expected}
									style={view.chordDiagram}
									locale={i18n.locale}
									size="small"
								/>
							</div>
						{/if}
					</div>
					{#if drawn.gap}
						<p class="label">{drawn.gap}</p>
					{/if}
				{/if}
				{#if view.contest === 'available'}
					<PixelButton size="large" onclick={() => controller.contest()}
						>{t.playedRight}</PixelButton
					>
				{:else if view.contest === 'done'}
					<p class="label">{t.contested}</p>
				{/if}
			</div>
		{/if}
		{#if view.fatigueDetected}
			<p class="fatigue" role="status">{t.fatigue}</p>
		{/if}
	</div>

	{#if showStart}
		<div class="overlay">
			{#if view.status === 'finished'}
				<p class="how">{t.finished}</p>
			{:else if view.audioError === 'input'}
				<p class="how" role="alert">{t.noInput}</p>
			{:else}
				<p class="how">{t.howTo[kind]}</p>
			{/if}
			<PixelButton size="huge" onclick={() => controller.start()}
				>{view.status === 'finished' ? t.again : t.start}</PixelButton
			>
		</div>
	{:else if view.status === 'paused'}
		<div class="overlay">
			<PixelButton size="huge" onclick={() => controller.resume()}>{t.resume}</PixelButton>
		</div>
	{/if}
</section>

<style>
	.frame {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		min-height: 100dvh;
		margin-inline: auto;
		padding: var(--np-space-1, 8px);
		padding-block-start: calc(var(--np-tile) * 9);
		container: play / inline-size;
		background-color: var(--np-bg);
		background-image:
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%
			),
			linear-gradient(45deg, var(--np-mid) 25%, transparent 25%, transparent 75%, var(--np-mid) 75%);
		background-position:
			0 0,
			8px 8px;
		background-size: 16px 16px;
		color: var(--np-ink);
		font-family: var(--np-font-pixel);
		font-weight: 700;
	}

	.chrome {
		position: absolute;
		z-index: 8;
		top: var(--np-space-1, 8px);
		inset-inline: var(--np-space-1, 8px);
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: var(--np-space-1, 8px);
	}

	.leave {
		color: var(--np-ink);
		font: inherit;
		font-size: var(--np-type-body);
		text-transform: uppercase;
		text-decoration: none;
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		padding: var(--np-space-1, 8px) 12px;
	}

	/* The view takes the room it needs; the verdict follows right under it, in sight. */
	.countdown {
		position: absolute;
		z-index: 5;
		inset-inline: 0;
		top: calc(var(--np-tile) * 16);
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.count {
		padding: var(--np-space-2, 16px) var(--np-space-4, 32px);
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
	}

	.stage {
		display: flex;
		flex: 0 1 auto;
		min-width: 0;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
	}

	.status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-1, 8px);
		min-block-size: calc(var(--np-tile) * 8);
		padding: var(--np-space-1, 8px);
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
	}

	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--np-space-2, 16px);
	}

	.banner {
		margin: 0;
		padding: var(--np-space-1, 8px) 12px;
		background: var(--np-ink);
		color: var(--np-bg);
		font-size: var(--np-type-body);
		line-height: 1;
		text-transform: uppercase;
		animation: imprint 120ms ease-out both;
	}

	.drawn {
		display: flex;
		gap: var(--np-space-3, 24px);
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	.label,
	.fatigue {
		margin: 0;
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
		text-transform: uppercase;
	}

	.fatigue {
		padding: var(--np-space-1, 8px) var(--np-space-2, 16px);
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.overlay {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--np-space-3, 24px);
		padding: var(--np-space-4, 32px);
		background: var(--np-bg);
	}

	.how {
		margin: 0;
		max-width: 36rem;
		text-align: center;
		font-size: var(--np-type-body);
		text-transform: uppercase;
	}

	@keyframes imprint {
		from {
			transform: scale(0.96);
			opacity: 0.85;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.banner {
			animation: none;
		}
	}
</style>
