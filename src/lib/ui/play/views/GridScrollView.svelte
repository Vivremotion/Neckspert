<script lang="ts">
	import type { PassageStageModel } from '$lib/application/presentation/passageStage';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { MARK_SIZE_PX } from '$lib/ui/primitives/LaneCell.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import VerdictMark from '$lib/ui/primitives/VerdictMark.svelte';
	import { verdictTone } from '$lib/ui/primitives/verdictTone';
	import { useInfoLine } from '../infoLine.svelte';
	import DrawnMiss from './DrawnMiss.svelte';
	import { gridPlacement } from './gridScroll';
	import { PICTURE_VIEWS } from './pictures';

	/**
	 * A chart played on the beat (« Près du silence »): the chord on show in the middle of the
	 * field, as large as a note, the next one beside it with an arrow; the chart under it as rows
	 * of bars, the chords in their cells, the cell on show light as a target, the cells played
	 * carrying the form of their verdict, the bars behind stepped back. The chart moves on bar by
	 * bar, never slides. The exercise's cue (the way, the zone) under the chord; the chart's title
	 * in the frame's info line. Aided, the neck under the chart.
	 */

	/** Bars on the line: the one before the current one, with its verdicts, then the next ones. */
	const VISIBLE_BARS = 4;
	const BARS_BEFORE = 1;

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const stage = $derived(model as PassageStageModel);
	const view = $derived(controller.view);

	// svelte-ignore state_referenced_locally
	let nowBeat = $state(controller.timeline.nowBeat());
	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	const placement = $derived(
		gridPlacement(stage, { nowBeat, visibleBars: VISIBLE_BARS, barsBefore: BARS_BEFORE })
	);

	const current = $derived(
		placement.current === null ? null : stage.rounds[placement.current].label
	);
	const next = $derived(placement.next === null ? null : stage.rounds[placement.next].label);

	/** The chart's title (the prompt's secondary) goes to the info line; said here without a frame. */
	const parts = $derived(stage.prompt.secondary ? [stage.prompt.secondary] : []);
	const info = useInfoLine();
	$effect(() => {
		if (!info) return;
		info.parts = parts;
		return () => {
			info.parts = [];
		};
	});
</script>

<div class="grid-scroll">
	{#if !info && parts.length > 0}
		<p class="meta" data-testid="grid-title">{parts.join(' · ')}</p>
	{/if}

	<div class="centre">
		<!-- The count's row is always there: the chord never moves when the counted bar comes or goes. -->
		<p class="count" data-testid="grid-countdown" aria-live="polite">{view.countdown ?? ''}</p>
		<div class="now" aria-live="polite">
			<!-- The chord on show as a hero prompt: one line whatever its symbol's length. Before the
			     first change its row is kept at its height, blank, so the next chord does not move. -->
			<div class="current" data-testid={current !== null ? 'current-chord' : undefined}>
				<Prompt main={current ?? '\u00a0'} size="hero" />
			</div>
			{#if next !== null}
				<!-- The next chord, with its arrow: no word for it. Announced a beat ahead, it lights up. -->
				<p class="next" class:announced={placement.nextAnnounced} data-testid="next-chord">
					<span class="arrow" aria-hidden="true">→</span>{next}
				</p>
			{/if}
		</div>
		{#if stage.prompt.detail}
			<p class="cue">{stage.prompt.detail}</p>
		{/if}
		{#if (stage.verdict?.misses ?? []).length > 0}
			<!-- A miss is laid over the bottom of the centre, out of the flow: the chord stays put. -->
			<div class="misses">
				{#each stage.verdict?.misses ?? [] as miss, i (i)}
					<DrawnMiss {miss} chordDiagram={stage.chordDiagram} />
				{/each}
			</div>
		{/if}
	</div>

	<div class="bottom">
		<ol class="bars">
			{#each placement.bars as bar (bar.bar)}
				<li class="bar">
					{#each bar.cells as cell (`${cell.change}-${bar.bar}`)}
						<div
							class="cell {cell.state}"
							class:continued={cell.continued}
							data-tone={cell.verdict ? verdictTone(cell.verdict) : undefined}
							style:flex-grow={cell.beats}
						>
							{#if !cell.continued}
								<span class="chord">{cell.symbol}</span>
							{/if}
							{#if cell.verdict}
								<span class="verdict"
									><VerdictMark verdict={cell.verdict} size={MARK_SIZE_PX} /></span
								>
							{/if}
						</div>
					{/each}
				</li>
			{/each}
		</ol>

		{#if stage.aid}
			{@const Aid = PICTURE_VIEWS[stage.aid.kind]}
			<!-- Its own row under the cells. No legend: the neck tells now from next by the tone of its notes. -->
			<div class="aid" data-testid="grid-aid">
				<Aid picture={stage.aid} chordDiagram={stage.chordDiagram} />
			</div>
		{/if}
	</div>
</div>

<style>
	/* The chord over the chart; the frame paints the field. */
	.grid-scroll {
		display: grid;
		grid-template-rows: auto 1fr auto;
		flex: 1;
		min-width: 0;
		gap: var(--np-step-4);
		font-family: var(--np-font-text);
	}

	/* Without a title the first row is empty: the chord still takes the middle. */
	.grid-scroll > .centre:first-child {
		grid-row: 1 / 3;
	}

	.grid-scroll p {
		margin: 0;
	}

	.meta {
		font-size: var(--np-size-meta);
		opacity: 0.8;
	}

	.centre {
		container-type: inline-size;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--np-step-3);
		min-width: 0;
		text-align: center;
	}

	/* The count's row is kept when there is none, so nothing under it moves. */
	.count {
		min-height: 1.1em;
		font-size: var(--np-size-prompt);
		font-weight: 300;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.misses {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--np-step-4);
	}

	/* The chord on show and the next one on one line, both one word, never cut. */
	.now {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: center;
		gap: var(--np-step-2) var(--np-step-5);
	}

	/* The hero's width is the chord's share of the row: the next chord keeps its place beside it. */
	.current {
		container-type: inline-size;
		min-width: 0;
		max-inline-size: 70cqi;
	}

	.next {
		display: inline-flex;
		align-items: baseline;
		gap: var(--np-step-2);
		font-size: var(--np-size-prompt);
		line-height: 1.1;
		white-space: nowrap;
		opacity: 0.6;
	}

	/* A beat or less before it: the next chord stands as clear as the one on show. */
	.next.announced {
		opacity: 1;
	}

	.cue {
		font-size: var(--np-size-body);
		opacity: 0.85;
	}

	.bottom {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
		min-width: 0;
	}

	/* The chart: four bars a row, each a row of cells; a cell's width is its beats. */
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--np-step-1);
	}

	.bar {
		display: flex;
		gap: var(--np-cell-gap);
		min-width: 0;
	}

	/* A cell's height is fixed: a verdict landing never grows the chart, so nothing above it moves. */
	.cell {
		position: relative;
		display: flex;
		flex-basis: 0;
		align-items: center;
		justify-content: center;
		min-width: 0;
		block-size: clamp(var(--np-step-7), 7vw, var(--np-step-8));
		padding: var(--np-step-1);
		box-sizing: border-box;
		background: var(--np-cell);
		color: var(--np-on-field);
		font-size: var(--np-size-cell);
		font-weight: 500;
		line-height: 1;
		border: 2px solid transparent;
		overflow: hidden;
	}

	/* A change that began in the bar before: its cell runs on, its name already written. */
	.cell.continued {
		opacity: 0.7;
	}

	/* Behind us: stepped back, the verdict still read. */
	.cell.past {
		opacity: var(--np-cell-past-opacity);
	}

	/* On show: the target's tile, light, the name in ink. */
	.cell.current {
		background: var(--np-on-field);
		color: var(--np-text);
	}

	/* Next: outlined, not yet lit. */
	.cell.next {
		border-color: var(--np-on-field);
	}

	/* A cell played takes the tone of its verdict, as a lane cell does. */
	.cell[data-tone='hit'] {
		background: var(--np-on-field);
		color: var(--np-text);
	}

	.cell[data-tone='partial'] {
		background: transparent;
		border-color: var(--np-on-field);
		color: var(--np-on-field);
	}

	.cell[data-tone='miss'] {
		background: var(--np-text);
		color: var(--np-on-field);
	}

	.chord {
		overflow: hidden;
		text-overflow: clip;
		white-space: nowrap;
	}

	/* The name sits above the mark, as on a lane cell. */
	.cell:has(.verdict) .chord {
		padding-block-end: var(--np-step-3);
	}

	/* The mark under the name, at the bottom of the cell, never in its place. */
	.verdict {
		position: absolute;
		inset-block-end: 2px;
		inset-inline: 0;
		display: flex;
		justify-content: center;
		animation: imprint var(--np-motion-imprint) var(--np-motion-ease);
	}

	.verdict :global(svg) {
		flex: none;
	}

	/* The aid's neck at the chart's width: a climb's first change spans the whole neck. */
	.aid {
		--neck-max: none;
		min-width: 0;
	}

	@keyframes imprint {
		from {
			transform: scale(1.4);
		}
		to {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.verdict {
			animation: none;
		}
	}
</style>
