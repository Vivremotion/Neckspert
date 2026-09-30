<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { laneTiles } from './lane';
	import { barLabel } from './barLabel';
	import { playMessages } from './messages';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import PixelWord from './PixelWord.svelte';

	let {
		controller,
		platesOnly = false
	}: {
		controller: PlaySessionController;
		platesOnly?: boolean;
	} = $props();

	let nowBeat = $state(0);
	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const tiles = $derived(
		laneTiles({
			nowBeat,
			beatsPerBar: view.beatsPerBar,
			promptBeatIndex: view.promptBeatIndex,
			targetBeatIndex: view.targetBeatIndex,
			history: view.history,
			beatsBefore: 4,
			beatsAfter: 8
		})
	);
	const measure = $derived(
		view.promptBeatIndex !== null && view.targetBeatIndex !== null
			? barLabel({
					nowBeat,
					promptBeatIndex: view.promptBeatIndex,
					targetBeatIndex: view.targetBeatIndex,
					beatsPerBar: view.beatsPerBar
				})
			: null
	);
	const justPlayed = $derived(tiles.find((tile) => tile.justPlayed) ?? null);
	const showPause = $derived(
		view.status === 'idle' || view.status === 'paused' || view.status === 'finished'
	);

	function formatOffset(ms: number): string {
		const sign = ms > 0 ? '+' : '';
		return `${sign}${ms} ms`;
	}

	function formatReaction(ms: number): string {
		return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space') return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.closest('button, input, textarea, select') !== null)
		) {
			return;
		}
		event.preventDefault();
		if (view.status === 'paused') controller.resume();
		else if (
			view.status === 'awaiting' ||
			view.status === 'verdict' ||
			view.status === 'count-in'
		) {
			controller.pause();
		}
	}

	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<svelte:window onkeydown={onKeydown} />
<section class="play" data-status={view.status} data-plates-only={platesOnly ? '1' : '0'}>
	<div class="r-field field"></div>

	{#if !platesOnly}
		<div class="numeral-scrub history" aria-hidden="true"></div>
		<div class="numeral-scrub upcoming" aria-hidden="true"></div>

		{#if view.prompt && view.status !== 'count-in' && view.status !== 'idle'}
			<div class="r-prompt-note note">
				<PixelWord text={view.prompt.primary} />
			</div>
			<p class="r-prompt-string text string">{view.prompt.secondary}</p>
		{/if}

		{#if view.lastVerdict}
			<div class="r-verdict-box chrome">
				<PixelBox variant="double" />
			</div>
			<div class="r-verdict-sprite sprite-overlay" aria-hidden="true">
				<VerdictSprite verdict={view.lastVerdict.verdict} size={240} />
			</div>
			<p class="r-verdict-banner text banner inverted">
				{t.verdict[view.lastVerdict.verdict]}
			</p>
			{#if view.lastVerdict.offsetMs !== null}
				<p class="r-verdict-offset text offset">{formatOffset(view.lastVerdict.offsetMs)}</p>
			{/if}
			{#if view.lastVerdict.reactionMs !== null}
				<p class="r-verdict-reaction text reaction">
					{formatReaction(view.lastVerdict.reactionMs)}
				</p>
			{/if}
		{/if}

		<div class="r-lane-heart chrome heart" aria-hidden="true">
			<svg viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges">
				<rect x="2" y="2" width="5" height="4" fill="currentColor" />
				<rect x="9" y="2" width="5" height="4" fill="currentColor" />
				<rect x="1" y="4" width="14" height="4" fill="currentColor" />
				<rect x="3" y="8" width="10" height="3" fill="currentColor" />
				<rect x="5" y="11" width="6" height="2" fill="currentColor" />
				<rect x="7" y="13" width="2" height="2" fill="currentColor" />
			</svg>
		</div>

		<div class="r-lane-finish chrome finish">
			{#if justPlayed?.verdict}
				<div class="just-played inverted" class:imprint={view.status === 'verdict'}>
					<VerdictSprite verdict={justPlayed.verdict} size={64} inverted />
				</div>
			{/if}
			<div class="hit-line" aria-hidden="true"></div>
		</div>

		{#if measure}
			<p class="r-lane-label text label">
				{t.measure(measure.bar, measure.bars, measure.beat, view.beatsPerBar)}
			</p>
		{/if}

		{#if view.prompt}
			<p class="r-lane-target text target inverted">{view.prompt.primary}</p>
		{/if}

		{#if showPause}
			<div class="overlay">
				{#if view.status === 'finished'}
					<p class="done">Série terminée</p>
				{/if}
				<PixelButton size="huge" onclick={() => controller.start()}>{t.start}</PixelButton>
			</div>
		{:else if view.status === 'paused'}
			<div class="overlay">
				<PixelButton size="huge" onclick={() => controller.resume()}>{t.resume}</PixelButton>
			</div>
		{/if}
	{/if}
</section>

<style>
	.play {
		position: relative;
		width: 1280px;
		height: 720px;
		overflow: hidden;
		background: var(--np-bg);
		margin: 0;
	}

	.chrome,
	.text,
	.sprite-overlay,
	.numeral-scrub,
	.note {
		position: absolute;
		box-sizing: border-box;
		margin: 0;
	}

	.r-field {
		left: var(--r-field-x);
		top: var(--r-field-y);
		width: var(--r-field-w);
		height: var(--r-field-h);
		background-color: var(--np-bg);
		background-image: linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			),
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			);
		background-position:
			0 0,
			4px 4px;
		background-size: 8px 8px;
	}
	.r-prompt-note {
		left: var(--r-prompt-note-x);
		top: var(--r-prompt-note-y);
		width: var(--r-prompt-note-w);
		height: var(--r-prompt-note-h);
	}
	.r-prompt-string {
		left: var(--r-prompt-string-x);
		top: var(--r-prompt-string-y);
		width: var(--r-prompt-string-w);
		height: var(--r-prompt-string-h);
	}
	.r-verdict-box {
		left: var(--r-verdict-box-x);
		top: var(--r-verdict-box-y);
		width: var(--r-verdict-box-w);
		height: var(--r-verdict-box-h);
		padding: 10px;
		z-index: 2;
	}
	.r-verdict-sprite {
		left: var(--r-verdict-sprite-x);
		top: var(--r-verdict-sprite-y);
		width: var(--r-verdict-sprite-w);
		height: var(--r-verdict-sprite-h);
	}
	.r-verdict-banner {
		left: var(--r-verdict-banner-x);
		top: var(--r-verdict-banner-y);
		width: var(--r-verdict-banner-w);
		height: var(--r-verdict-banner-h);
	}
	.r-verdict-offset {
		left: var(--r-verdict-offset-x);
		top: var(--r-verdict-offset-y);
		width: var(--r-verdict-offset-w);
		height: var(--r-verdict-offset-h);
	}
	.r-verdict-reaction {
		left: var(--r-verdict-reaction-x);
		top: var(--r-verdict-reaction-y);
		width: var(--r-verdict-reaction-w);
		height: var(--r-verdict-reaction-h);
	}
	.r-lane-heart {
		left: var(--r-lane-heart-x);
		top: var(--r-lane-heart-y);
		width: var(--r-lane-heart-w);
		height: var(--r-lane-heart-h);
	}
	.r-lane-finish {
		left: var(--r-lane-finish-x);
		top: var(--r-lane-finish-y);
		width: var(--r-lane-finish-w);
		height: var(--r-lane-finish-h);
	}
	.r-lane-label {
		left: var(--r-lane-label-x);
		top: var(--r-lane-label-y);
		width: var(--r-lane-label-w);
		height: var(--r-lane-label-h);
	}
	.r-lane-target {
		left: var(--r-lane-target-x);
		top: var(--r-lane-target-y);
		width: var(--r-lane-target-w);
		height: var(--r-lane-target-h);
	}

	.numeral-scrub {
		top: 72.5%;
		height: 6.5%;
		background: var(--np-bg);
		z-index: 2;
		pointer-events: none;
	}
	.numeral-scrub.history {
		left: 0;
		width: 29%;
	}
	.numeral-scrub.upcoming {
		left: 41%;
		width: 48%;
	}

	.note {
		z-index: 3;
		display: grid;
		place-items: center;
		padding: 4%;
		/* Cover solid field-plate leftovers with the same dither vocabulary */
		background-color: var(--np-bg);
		background-image: linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			),
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			);
		background-size: 6px 6px;
		background-position:
			0 0,
			3px 3px;
	}

	.r-verdict-box :global(.box) {
		width: 100%;
		height: 100%;
		padding: 0;
		background: transparent;
	}

	.sprite-overlay {
		display: grid;
		place-items: center;
		pointer-events: none;
		z-index: 3;
		overflow: hidden;
		background: var(--np-bg);
	}

	.text {
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--np-font-pixel);
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0;
		color: var(--np-ink);
		text-transform: none;
		z-index: 4;
		overflow: hidden;
		-webkit-font-smoothing: none;
		font-smooth: never;
	}

	.string {
		font-family: var(--r-prompt-string-family), sans-serif;
		font-weight: var(--r-prompt-string-weight);
		font-size: 80px;
		justify-content: flex-start;
		white-space: nowrap;
		letter-spacing: -0.04em;
		background: var(--np-bg);
		padding-inline: 4px;
	}

	.banner {
		text-transform: uppercase;
		font-size: 52px;
		letter-spacing: -0.03em;
		white-space: nowrap;
	}

	.offset,
	.reaction {
		font-size: 44px;
	}

	.label {
		font-size: 26px;
		text-transform: uppercase;
		justify-content: flex-end;
		padding-inline: 12px;
		white-space: nowrap;
		background: var(--np-bg);
	}

	.target {
		font-size: 72px;
		z-index: 5;
		background: var(--np-bg);
		color: var(--np-ink);
		border: 6px solid var(--np-ink);
	}

	.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.heart {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 8px;
		color: var(--np-ink);
		z-index: 5;
		background: transparent;
	}

	.finish {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 2px;
		z-index: 4;
		padding: 18px 0 10px;
		background: transparent;
		pointer-events: none;
	}

	.hit-line {
		width: 3px;
		align-self: stretch;
		background: var(--np-ink);
		box-shadow:
			-4px 0 0 var(--np-ink),
			4px 0 0 var(--np-ink);
		flex: 0 0 auto;
	}

	.just-played {
		display: grid;
		place-items: center;
		width: 88px;
		height: 88px;
		flex: 0 0 auto;
		border: 4px solid var(--np-ink);
		box-sizing: border-box;
	}

	.overlay {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 16px;
		background: color-mix(in srgb, var(--np-bg) 82%, transparent);
	}

	.done {
		margin: 0;
		font-size: 32px;
		text-transform: uppercase;
	}

	.imprint {
		animation: imprint 120ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes imprint {
		from {
			transform: scale(1.35);
		}
		to {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.imprint {
			animation: none;
		}
	}

	@media (max-width: 800px) {
		.play {
			width: 100%;
			height: auto;
			min-height: 100dvh;
			aspect-ratio: auto;
		}
		.r-field,
		.r-prompt-note,
		.note,
		.r-prompt-string {
			position: relative;
			left: auto;
			top: auto;
			width: 100%;
		}
		.r-verdict-box,
		.r-verdict-sprite,
		.sprite-overlay,
		.r-verdict-banner,
		.r-verdict-offset,
		.r-verdict-reaction {
			position: absolute;
			width: 46%;
			left: auto;
			right: 8px;
		}
		.r-lane-finish,
		.r-lane-heart,
		.r-lane-label,
		.r-lane-target {
			position: relative;
			left: auto;
			top: auto;
			width: 100%;
		}
	}
</style>
