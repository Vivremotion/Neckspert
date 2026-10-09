<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import { laneTiles } from './lane';
	import { playMessages } from './messages';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import PixelWord from './PixelWord.svelte';
	import StringDiagram from './StringDiagram.svelte';
	import AnswerPanel from './answer/AnswerPanel.svelte';
	import { showsAnswerPad } from './answer/showsAnswerPad';

	let {
		controller,
		platesOnly = false,
		quitToSummary = false,
		kind = 'learn'
	}: {
		controller: PlaySessionController;
		platesOnly?: boolean;
		quitToSummary?: boolean;
		/** Which session runs: its how-to shows before the start. */
		kind?: SessionKind;
	} = $props();

	const answering = $derived(showsAnswerPad(controller.view));

	let nowBeat = $state(0);
	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const tiles = $derived.by(() => {
		const target = view.targetBeatIndex;
		// Up to one beat past the target, or to the end of the band that follows it.
		const last = view.followUp?.untilBeat ?? (target == null ? null : target + 1);
		const beatsAfter = last == null ? 8 : Math.max(8, last - Math.floor(nowBeat));
		return laneTiles({
			nowBeat,
			beatsPerBar: view.beatsPerBar,
			promptBeatIndex: view.promptBeatIndex,
			targetBeatIndex: target,
			followUp: view.followUp,
			history: view.history,
			beatsBefore: 4,
			beatsAfter
		});
	});
	const lanePast = $derived(tiles.filter((tile) => tile.offset <= 0));
	const laneAhead = $derived(tiles.filter((tile) => tile.offset > 0));
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');
	/** A miss of a mechanic that draws shapes: what was played and what was expected. */
	const drawn = $derived(
		view.lastVerdict && (view.lastVerdict.heard || view.lastVerdict.expected)
			? view.lastVerdict
			: null
	);

	function formatOffset(ms: number): string {
		const sign = ms > 0 ? '+' : '';
		return `${sign}${ms} ms`;
	}

	function formatReaction(ms: number): string {
		return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
	}

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
		<div class="chrome">
			{#if view.status === 'count-in' || view.status === 'awaiting' || view.status === 'verdict'}
				<PixelButton size="large" onclick={() => controller.pause()}>{t.pause}</PixelButton>
			{/if}
			<a class="leave" href={resolve('/')} onclick={leave}>{t.quit}</a>
		</div>
		<div class="stage">
			<div class="prompt" class:answering>
				{#if view.status === 'count-in' && view.countdown !== null}
					<div class="countdown" aria-live="polite">
						{#if answering}
							<p class="primary">{view.countdown}</p>
						{:else}
							<PixelWord text={String(view.countdown)} />
						{/if}
					</div>
					{#if view.preview}
						<p class="string preview">{view.preview.secondary}</p>
						<StringDiagram diagram={view.preview.diagram} />
					{/if}
				{:else if view.preview && view.status === 'count-in'}
					<!-- The string comes first; the note, the only big letter, follows on the prompt beat. -->
					<p class="string preview">{view.preview.secondary}</p>
					<StringDiagram diagram={view.preview.diagram} />
				{:else if view.prompt && view.status !== 'count-in' && view.status !== 'idle'}
					{#if answering}
						<p class="primary">{view.prompt.primary}</p>
					{:else}
						<PixelWord text={view.prompt.primary} />
					{/if}
					<p class="string">{view.prompt.secondary}</p>
					{#if view.prompt.detail}
						<p class="detail">{view.prompt.detail}</p>
					{/if}
					<StringDiagram diagram={view.prompt.diagram} />
					{#if view.prompt.shape}
						<ChordShape shape={view.prompt.shape} style={view.chordDiagram} locale={i18n.locale} />
					{/if}
					{#if view.prompt.aid}
						<p class="aid">{view.prompt.aid}</p>
					{/if}
				{/if}
			</div>

			{#if view.lastVerdict}
				<div class="verdict pixel-frame">
					<div class="verdict-inner pixel-frame-inner" class:with-shapes={drawn !== null}>
						<div class="verdict-arrow" aria-hidden="true">
							<VerdictSprite verdict={view.lastVerdict.verdict} size={200} />
						</div>
						<div class="banner-frame pixel-frame">
							<p class="banner">{t.verdict[view.lastVerdict.verdict]}</p>
						</div>
						{#if view.lastVerdict.correction && !drawn}
							<p class="correction">{view.lastVerdict.correction}</p>
						{/if}
						{#if drawn}
							<div class="drawn">
								<div class="drawn-part">
									<p class="drawn-label">{t.played}</p>
									{#if drawn.heard}
										<ChordShape
											shape={drawn.heard}
											style={view.chordDiagram}
											locale={i18n.locale}
											size="small"
										/>
									{:else}
										<p class="heard-none">{drawn.gap}</p>
									{/if}
								</div>
								<div class="drawn-part">
									<p class="drawn-label">{t.expected}</p>
									{#if drawn.expected}
										<ChordShape
											shape={drawn.expected}
											style={view.chordDiagram}
											locale={i18n.locale}
											size="small"
										/>
									{/if}
								</div>
							</div>
							{#if drawn.heard && drawn.gap}
								<p class="gap">{drawn.gap}</p>
							{/if}
						{/if}
						{#if view.contest === 'available'}
							<div class="contest">
								<PixelButton size="large" onclick={() => controller.contest()}
									>{t.playedRight}</PixelButton
								>
							</div>
						{:else if view.contest === 'done'}
							<p class="contested">{t.contested}</p>
						{/if}
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
			<div class="lane-slot scene-in" class:answering>
				<AnswerPanel {controller} />
			</div>
		{:else}
			<div class="lane pixel-frame scene-in">
				<div class="lane-inner pixel-frame-inner">
					<div class="track">
						<div class="tiles">
							{#each lanePast as tile (tile.beatIndex)}
								<div class="cell">
									<div
										class="body"
										class:due={tile.kind === 'target'}
										class:band={tile.kind === 'band'}
										class:band-start={tile.bandEdge === 'start'}
										class:band-end={tile.bandEdge === 'end'}
										class:inverted={tile.justPlayed}
										class:imprint={tile.justPlayed && view.status === 'verdict'}
									>
										{#if tile.kind === 'target' && view.prompt}
											<span class="note">{view.prompt.target ?? view.prompt.primary}</span>
										{:else if tile.bandEdge === 'start' && view.prompt?.band}
											<span class="note band-label">{view.prompt.band}</span>
										{:else if tile.verdict}
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
									<div
										class="body ahead"
										class:due={tile.kind === 'target'}
										class:band={tile.kind === 'band'}
										class:band-start={tile.bandEdge === 'start'}
										class:band-end={tile.bandEdge === 'end'}
									>
										{#if tile.kind === 'target' && view.prompt}
											<span class="note">{view.prompt.target ?? view.prompt.primary}</span>
										{:else if tile.bandEdge === 'start' && view.prompt?.band}
											<span class="note band-label">{view.prompt.band}</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if showStart}
			<div class="overlay">
				{#if view.status === 'finished'}
					<p class="done">Série terminée</p>
				{:else if view.audioError === 'input'}
					<p class="how no-input" role="alert">{t.noInput}</p>
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
	{/if}
</section>

<style>
	.chrome {
		position: absolute;
		z-index: 8;
		top: 8px;
		inset-inline: 8px;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		align-items: center;
	}

	.leave {
		color: var(--np-ink);
		font: inherit;
		font-weight: 700;
		text-transform: uppercase;
		text-decoration: none;
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		padding: 8px 12px;
	}

	.how {
		margin: 0;
		max-width: 36rem;
		text-align: center;
		font-size: var(--np-type-body);
		text-transform: uppercase;
	}

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

	/* Mode 1: the note is the only big letter; the string reads smaller so its name is not played. */
	.prompt:not(.answering) .string {
		font-size: var(--np-type-body);
	}

	/* A triad's strings, under its root string or position: read last, in the dimmer tone. */
	.detail {
		margin: 0;
		color: var(--np-shade);
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
	}

	/* The stage changes between lane (guitar) and answer pad (screen): the new one rises in. */
	.scene-in {
		animation: scene-in 240ms ease-out both;
	}

	@keyframes scene-in {
		from {
			opacity: 0;
			transform: translateY(var(--np-space-2, 16px));
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scene-in {
			animation: none;
		}
	}

	/* Learning aid: the fret (mode 1) or the note name (mode 2), set apart in inverted tones. */
	.aid {
		margin: 0;
		padding: var(--np-space-1, 8px) var(--np-space-2, 16px);
		background: var(--np-ink);
		color: var(--np-bg);
		font-size: var(--np-type-prompt);
		line-height: 1;
		letter-spacing: 0;
		text-align: center;
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

	/* After a miss: the right answer, read during the breathing bar. */
	.correction {
		margin: 0;
		padding: 10px 12px 0;
		color: var(--np-ink);
		font-size: var(--np-type-body);
		line-height: 1;
		text-align: center;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}

	/* With shapes drawn, the sprite gives them its room. */
	.with-shapes .verdict-arrow {
		flex: 0 0 auto;
		block-size: 96px;
		padding: 8px;
	}

	.drawn {
		display: flex;
		justify-content: center;
		gap: var(--np-space-3, 24px);
		padding: 10px 12px 0;
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 4px;
	}

	.drawn-label,
	.heard-none,
	.gap,
	.contested {
		margin: 0;
		color: var(--np-ink);
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
		text-transform: uppercase;
	}

	.heard-none {
		max-inline-size: 10ch;
		padding-block-start: var(--np-space-2, 16px);
	}

	.gap,
	.contested {
		padding: 10px 12px 0;
	}

	.contest {
		display: flex;
		justify-content: center;
		padding: 10px 12px 0;
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

	.body.due {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.note {
		font-size: clamp(18px, 4cqi, 28px);
		line-height: 1;
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

	.body.ahead.due {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	/*
	 * A second gesture due anywhere in these beats (the chord of a triad anchor): one band in the
	 * shade tone, joined across the gaps between its tiles, closed at its two ends.
	 */
	.body.band,
	.body.ahead.band {
		position: relative;
		background: var(--np-shade);
		color: var(--np-bg);
		border-inline-width: 0;
		margin-inline-end: -6px;
		place-items: center start;
	}

	.body.band.band-start {
		border-inline-start-width: 4px;
	}

	.body.band.band-end {
		border-inline-end-width: 4px;
		margin-inline-end: 0;
	}

	/* The chord name is written once, from the start of the band, over the tiles that follow. */
	.band-label {
		position: relative;
		z-index: 1;
		padding-inline-start: 8px;
		white-space: nowrap;
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
