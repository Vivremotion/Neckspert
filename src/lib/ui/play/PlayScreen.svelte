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
	const lanePast = $derived(tiles.filter((tile) => tile.offset <= 0));
	const laneAhead = $derived(tiles.filter((tile) => tile.offset > 0));
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');

	const linePct = 30;
	const tilePct = 6.1;
	const tileGap = 0.4;

	function pastLeft(index: number, count: number): number {
		const stride = tilePct + tileGap;
		const right = linePct - 1.1 - (count - 1 - index) * stride;
		return right - tilePct;
	}

	function aheadLeft(index: number): number {
		return linePct + 1.3 + index * (tilePct + tileGap);
	}

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
			target.closest('button, input, textarea, select') !== null
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
				<VerdictSprite verdict={view.lastVerdict.verdict} size={280} />
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

		<div class="lane">
			{#if measure}
				<p class="measure">
					{t.measure(measure.bar, measure.bars, measure.beat, view.beatsPerBar)}
				</p>
			{/if}
			<div class="heart" style:left="{linePct}%" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="28" height="28" shape-rendering="crispEdges">
					<rect x="2" y="2" width="5" height="4" fill="currentColor" />
					<rect x="9" y="2" width="5" height="4" fill="currentColor" />
					<rect x="1" y="4" width="14" height="4" fill="currentColor" />
					<rect x="3" y="8" width="10" height="3" fill="currentColor" />
					<rect x="5" y="11" width="6" height="2" fill="currentColor" />
					<rect x="7" y="13" width="2" height="2" fill="currentColor" />
				</svg>
			</div>
			<div class="hit-line" style:left="{linePct}%" aria-hidden="true"></div>
			{#each lanePast as tile, index (tile.beatIndex)}
				<div class="cell" style:left="{pastLeft(index, lanePast.length)}%" style:width="{tilePct}%">
					<div
						class="body"
						class:inverted={tile.justPlayed}
						class:imprint={tile.justPlayed && view.status === 'verdict'}
					>
						{#if tile.verdict}
							<VerdictSprite verdict={tile.verdict} size={64} inverted={tile.justPlayed} />
						{/if}
					</div>
				</div>
			{/each}
			{#each laneAhead as tile, index (tile.beatIndex)}
				<div class="cell" style:left="{aheadLeft(index)}%" style:width="{tilePct}%">
					{#if tile.label !== null}
						<span class="beat-no">{tile.label}</span>
					{/if}
					<div class="body ahead"></div>
				</div>
			{/each}
			{#if view.prompt}
				<p class="target">{view.prompt.primary}</p>
			{/if}
		</div>

		{#if showStart}
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

	.field,
	.chrome,
	.text,
	.sprite-overlay,
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
		background-image:
			linear-gradient(
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
		top: 6%;
		width: var(--r-prompt-note-w);
		height: 46%;
	}
	.r-prompt-string {
		left: var(--r-prompt-string-x);
		top: 52%;
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
	.note {
		z-index: 3;
		display: grid;
		place-items: center;
		background: transparent;
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
		overflow: visible;
		background: transparent;
	}

	.sprite-overlay :global(svg) {
		width: min(240px, 78%);
		height: auto;
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
		font-size: var(--r-prompt-string-font);
		justify-content: flex-start;
		align-items: flex-end;
		white-space: nowrap;
		letter-spacing: -0.03em;
		background: transparent;
		width: max-content;
		height: auto;
		overflow: visible;
		color: var(--np-ink);
	}

	.banner {
		text-transform: uppercase;
		font-size: 52px;
		letter-spacing: -0.03em;
		white-space: nowrap;
	}

	.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.offset,
	.reaction {
		font-size: 44px;
	}

	.lane {
		position: absolute;
		z-index: 4;
		left: 12px;
		right: 12px;
		top: 68%;
		bottom: 12px;
		box-sizing: border-box;
		border: 5px solid var(--np-ink);
		background: var(--np-bg);
	}

	.measure {
		position: absolute;
		top: 14px;
		right: 18px;
		margin: 0;
		font-size: 22px;
		line-height: 1;
		letter-spacing: 0.01em;
		color: var(--np-ink);
		background: transparent;
	}

	.heart {
		position: absolute;
		top: 16px;
		z-index: 2;
		color: var(--np-ink);
		transform: translateX(-50%);
	}

	.hit-line {
		position: absolute;
		bottom: 16px;
		z-index: 2;
		width: 3px;
		height: 88px;
		transform: translateX(-50%);
		background: var(--np-ink);
		box-shadow:
			-6px 0 0 var(--np-ink),
			6px 0 0 var(--np-ink);
	}

	.cell {
		position: absolute;
		bottom: 16px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: stretch;
		height: 120px;
	}

	.beat-no {
		height: 26px;
		text-align: center;
		font-size: 22px;
		line-height: 26px;
		color: var(--np-ink);
	}

	.body {
		box-sizing: border-box;
		height: 88px;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
		display: grid;
		place-items: center;
	}

	.body.ahead {
		background-color: var(--np-bg);
		background-image:
			linear-gradient(
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

	.body.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.target {
		position: absolute;
		right: 16px;
		bottom: 16px;
		z-index: 2;
		box-sizing: border-box;
		width: 88px;
		height: 88px;
		margin: 0;
		display: grid;
		place-items: center;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
		color: var(--np-ink);
		font-size: 60px;
		line-height: 1;
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
		.lane {
			position: relative;
			left: auto;
			right: auto;
			top: auto;
			bottom: auto;
			width: auto;
			height: 240px;
			margin-top: 12px;
		}
	}
</style>
