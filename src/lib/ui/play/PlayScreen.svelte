<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { laneTiles } from './lane';
	import { barLabel } from './barLabel';
	import { playMessages } from './messages';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import PixelWord from './PixelWord.svelte';
	import AnswerPanel from './answer/AnswerPanel.svelte';
	import { showsAnswerPad } from './answer/showsAnswerPad';

	let {
		controller,
		platesOnly = false
	}: {
		controller: PlaySessionController;
		platesOnly?: boolean;
	} = $props();

	const answering = $derived(showsAnswerPad(controller.view));

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
	{#if !platesOnly}
		<div class="stage">
			<div class="prompt" class:answering>
				{#if view.prompt && view.status !== 'count-in' && view.status !== 'idle'}
					{#if answering}
						<p class="primary">{view.prompt.primary}</p>
					{:else}
						<PixelWord text={view.prompt.primary} />
					{/if}
					<p class="string">{view.prompt.secondary}</p>
				{/if}
			</div>

			{#if view.lastVerdict}
				<div class="verdict pixel-frame">
					<div class="verdict-inner pixel-frame-inner">
						<div class="verdict-arrow" aria-hidden="true">
							<VerdictSprite verdict={view.lastVerdict.verdict} size={200} />
						</div>
						<div class="banner-frame pixel-frame">
							<p class="banner">{t.verdict[view.lastVerdict.verdict]}</p>
						</div>
						{#if view.lastVerdict.offsetMs !== null}
							<p class="offset">{formatOffset(view.lastVerdict.offsetMs)}</p>
						{/if}
						{#if view.lastVerdict.reactionMs !== null}
							<p class="reaction">{formatReaction(view.lastVerdict.reactionMs)}</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{#if answering}
			<div class="lane-slot" class:answering>
				<AnswerPanel {controller} />
			</div>
		{:else}
			<div class="lane pixel-frame">
				<div class="lane-inner pixel-frame-inner">
					{#if measure}
						<p class="measure">
							{t.measure(measure.bar, measure.bars, measure.beat, view.beatsPerBar)}
						</p>
					{/if}
					<div class="track">
						<div class="tiles">
							{#each lanePast as tile (tile.beatIndex)}
								<div class="cell">
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
						</div>
						<div class="finish">
							<div class="heart" aria-hidden="true">
								<svg viewBox="0 0 16 16" width="28" height="28" shape-rendering="crispEdges">
									<rect x="2" y="2" width="5" height="2" fill="currentColor" />
									<rect x="9" y="2" width="5" height="2" fill="currentColor" />
									<rect x="1" y="4" width="14" height="2" fill="currentColor" />
									<rect x="2" y="6" width="12" height="2" fill="currentColor" />
									<rect x="4" y="8" width="8" height="2" fill="currentColor" />
									<rect x="6" y="10" width="4" height="2" fill="currentColor" />
									<rect x="7" y="12" width="2" height="2" fill="currentColor" />
								</svg>
							</div>
							<div class="hit" aria-hidden="true"></div>
						</div>
						<div class="tiles ahead-tiles">
							{#each laneAhead as tile (tile.beatIndex)}
								<div class="cell">
									{#if tile.label !== null}
										<span class="beat-no">{tile.label}</span>
									{/if}
									<div class="body ahead"></div>
								</div>
							{/each}
						</div>
						{#if view.prompt}
							<p class="target">{view.prompt.primary}</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}

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
		display: flex;
		flex-direction: column;
		gap: 16px;
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		min-width: 0;
		height: auto;
		min-height: 100dvh;
		margin-inline: auto;
		padding: 8px;
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

	.stage {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		align-items: stretch;
	}

	.prompt {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 0;
		max-width: 100%;
		padding: 12px 16px 8px;
		background: var(--np-bg);
	}

	.string {
		margin: 0;
		color: var(--np-ink);
		font-size: var(--np-type-prompt);
		line-height: 1;
		letter-spacing: 0;
		text-align: center;
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.primary {
		margin: 0;
		color: var(--np-ink);
		font-size: var(--np-type-hero);
		line-height: 1;
		letter-spacing: 0;
		text-align: center;
		text-transform: none;
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.prompt.answering .primary {
		font-size: calc(var(--np-type-hero) * 0.75);
	}

	.pixel-frame {
		box-sizing: border-box;
		background: var(--np-shade);
		border: 4px solid var(--np-ink);
		padding: 4px 4px 7px 7px;
		clip-path: polygon(
			4px 0,
			calc(100% - 4px) 0,
			calc(100% - 4px) 4px,
			100% 4px,
			100% calc(100% - 4px),
			calc(100% - 4px) calc(100% - 4px),
			calc(100% - 4px) 100%,
			4px 100%,
			4px calc(100% - 4px),
			0 calc(100% - 4px),
			0 4px,
			4px 4px
		);
	}

	.pixel-frame-inner {
		box-sizing: border-box;
		height: 100%;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
	}

	.verdict {
		display: flex;
		flex: 1 1 40%;
		min-width: 0;
		min-height: 0;
	}

	.verdict-inner {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.verdict-arrow {
		display: grid;
		flex: 1;
		place-items: center;
		min-height: 0;
		padding: 12px;
	}

	.verdict-arrow :global(svg) {
		width: auto;
		height: 86%;
		max-width: 88%;
	}

	.banner-frame {
		margin: 0 12px;
	}

	.banner,
	.offset,
	.reaction {
		margin: 0;
		text-align: center;
		line-height: 1;
	}

	.banner {
		background: var(--np-ink);
		color: var(--np-bg);
		border: 4px solid var(--np-ink);
		font-size: var(--np-type-body);
		padding: 8px 6px;
		text-transform: uppercase;
	}

	.offset,
	.reaction {
		color: var(--np-ink);
		font-size: var(--np-type-meta);
		font-variant-numeric: tabular-nums;
		padding-top: 10px;
	}

	.reaction {
		padding-bottom: 14px;
	}

	.lane,
	.lane-slot {
		display: flex;
		flex: 1 1 auto;
		inline-size: 100%;
		min-width: 0;
		min-height: 0;
	}

	.lane-slot.answering {
		min-block-size: calc(4 * 64px + 3 * 8px);
	}

	.lane-inner {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		padding: 8px 12px 12px;
	}

	.measure {
		align-self: flex-end;
		margin: 0 0 6px;
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	.track {
		display: flex;
		flex: 1;
		align-items: flex-end;
		gap: 8px;
		min-width: 0;
		min-height: 0;
		overflow-x: auto;
	}

	.tiles {
		display: flex;
		align-items: flex-end;
		gap: 6px;
	}

	.ahead-tiles {
		flex: 1;
	}

	.cell {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: stretch;
		width: clamp(44px, 7cqi, 72px);
		flex: 0 0 auto;
	}

	.beat-no {
		min-height: var(--np-type-meta);
		text-align: center;
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	.body {
		box-sizing: border-box;
		display: grid;
		place-items: center;
		height: 72px;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
	}

	.body.ahead {
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
			4px 4px;
		background-size: 8px 8px;
	}

	.body.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.finish {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
	}

	.heart {
		color: var(--np-ink);
	}

	.hit {
		width: 4px;
		height: 72px;
		background: var(--np-ink);
		box-shadow:
			-8px 0 0 var(--np-ink),
			8px 0 0 var(--np-ink);
	}

	.target {
		box-sizing: border-box;
		display: grid;
		place-items: center;
		width: 80px;
		height: 80px;
		margin: 0 0 0 auto;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
		color: var(--np-ink);
		font-size: var(--np-type-body);
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
		font-size: var(--np-type-body);
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

	@container play (max-width: 860px) {
		.stage {
			flex-direction: column;
		}

		.verdict {
			flex-basis: auto;
		}

		.lane,
		.lane-slot {
			flex-basis: auto;
		}
	}
</style>
