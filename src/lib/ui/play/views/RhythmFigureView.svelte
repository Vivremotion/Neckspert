<script lang="ts">
	import { onMount } from 'svelte';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { RhythmStageModel } from '$lib/application/session/plan/rhythmStage';
	import { beatPositions, type Figure } from '$lib/domain/time';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { FigureLayout } from '$lib/ui/notation';
	import { playMessages } from '../messages';
	import { replayOf } from '../replay.svelte';
	import {
		cursorVisible,
		cursorX,
		cycleFigure,
		cycleMarks,
		feedbackLine,
		labelRows,
		toldCycle,
		type Mark
	} from './rhythmFigure';
	import { rhythmMessages } from './rhythmMessages';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	type Notation = typeof import('$lib/ui/notation');

	/** The figure played is engraved large, the one to play next too; the run played smaller. */
	const LARGE_SCALE = 1.5;
	/** Scales tried for the run played, largest first, until it holds on one line. */
	const PLAYED_SCALES = [1, 0.9, 0.8, 0.7, 0.6];
	/** Width assumed before the view is measured (and where nothing measures it). */
	const FALLBACK_WIDTH = 640;
	/** From this width the breath shows the run played and the next figure side by side. */
	const SIDE_BY_SIDE_PX = 720;
	/** Share of the width the run played takes side by side: it carries the marks. */
	const PLAYED_SHARE = 3 / 5;
	/** Gap between the two panels (the grid's `--np-space-3`). */
	const GAP_PX = 24;
	/** The column of the cycle numbers, left of the run played. */
	const CYCLE_COLUMN_PX = 32;
	/** Width of a character of a mark's figure, in ems of its size, to keep two figures apart. */
	const FIGURE_CHAR_EM = 0.7;
	/** The figures' size (`--np-type-body`) before it is measured. */
	const FIGURE_FALLBACK_PX = 22;

	const m = $derived(model as RhythmStageModel);
	const t = $derived(rhythmMessages());
	const frame = $derived(playMessages());
	const replay = $derived(replayOf(controller));

	const breathing = $derived(m.phase === 'breath');
	// Kept apart so the engraving is redrawn only when its figure changes, not on every beat.
	const figure = $derived(m.figure);
	const next = $derived(m.next);
	const cycleBars = $derived(m.cycleBars);

	const levelText = $derived(m.level.aid ? t.aidLevel : t.level(m.level.shown, m.level.of));
	const header = $derived(t.header(m.exerciseLabel, levelText, t.tempo(m.tempo.unit, m.tempo.bpm)));
	const phaseText = $derived(t.phase[m.phase]);
	const told = $derived(breathing ? toldCycle(m.settled) : null);
	const line = $derived(told ? feedbackLine(told.report, i18n.locale, told.verdict) : null);

	// VexFlow is heavy: the notation adapter is loaded once this view shows, never before.
	let notation = $state<Notation | null>(null);
	onMount(() => {
		let live = true;
		void import('$lib/ui/notation').then(async (loaded) => {
			// Engraved on the music font itself, or the notes are spaced on a fallback's widths.
			await loaded.notationReady();
			if (live) notation = loaded;
		});
		return () => {
			live = false;
		};
	});

	let root = $state<HTMLElement | null>(null);
	let measured = $state(0);
	/** The view's content width: what the engravings may take. */
	$effect(() => {
		const element = root;
		if (!element) return;
		const style = getComputedStyle(element);
		const padding =
			(Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
		measured = element.clientWidth - padding;
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) => {
			measured = entry.contentRect.width;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});
	const width = $derived(measured > 0 ? measured : FALLBACK_WIDTH);

	/** The figures are drawn large: their size follows the screen, read off a probe. */
	let figureProbe = $state<HTMLElement | null>(null);
	let figurePx = $state(FIGURE_FALLBACK_PX);
	$effect(() => {
		void width;
		const probe = figureProbe;
		if (!probe) return;
		const size = Number.parseFloat(getComputedStyle(probe).fontSize);
		if (size > 0) figurePx = size;
	});
	const sideBySide = $derived(width >= SIDE_BY_SIDE_PX);
	const playedWidth = $derived(
		(sideBySide ? Math.floor((width - GAP_PX) * PLAYED_SHARE) : width) - CYCLE_COLUMN_PX
	);
	const nextWidth = $derived(
		sideBySide ? Math.floor((width - GAP_PX) * (1 - PLAYED_SHARE)) : width
	);

	let figureHost = $state<HTMLElement | null>(null);
	let nextHost = $state<HTMLElement | null>(null);
	let figureLayout = $state<FigureLayout | null>(null);
	let playedLayout = $state<FigureLayout | null>(null);
	/** The run played, engraved once off screen; each line shows its own part of it. */
	let playedSvg = $state<SVGElement | null>(null);

	$effect(() => {
		const host = figureHost;
		if (!notation || !host || breathing) return;
		figureLayout = notation.renderFigure(host, figure, { maxWidth: width, scale: LARGE_SCALE });
	});

	/**
	 * The run played: the cycle's figure whole, as small as it takes to hold on one line. It is
	 * engraved apart, then shown line by line, each line with its strips of marks under it.
	 */
	$effect(() => {
		if (!notation || !breathing) return;
		const host = document.createElement('div');
		const played: Figure = cycleFigure(figure, cycleBars);
		let layout: FigureLayout | null = null;
		for (const scale of PLAYED_SCALES) {
			layout = notation.renderFigure(host, played, { maxWidth: playedWidth, scale });
			if (layout.lineY.length === 1) break;
		}
		playedLayout = layout;
		playedSvg = host.querySelector('svg');
	});

	/** Shows the part of the engraving from `top`, the window's height cutting the rest. */
	function engravedLine(node: HTMLElement, params: { svg: SVGElement; top: number }) {
		const show = ({ svg, top }: { svg: SVGElement; top: number }) => {
			const copy = svg.cloneNode(true) as SVGElement;
			copy.style.marginTop = `${-top}px`;
			node.replaceChildren(copy);
		};
		show(params);
		return { update: show };
	}

	$effect(() => {
		const host = nextHost;
		if (!notation || !host || !breathing || !next) return;
		notation.renderFigure(host, next, { maxWidth: nextWidth, scale: LARGE_SCALE });
	});

	const cursor = $derived(
		figureLayout && m.cursor && cursorVisible(m) ? cursorX(figure, figureLayout, m.cursor) : null
	);

	/** Each engraved line of the run played, with one strip of marks per settled cycle under it. */
	const playedLines = $derived.by(() => {
		const layout = playedLayout;
		if (!breathing || !layout) return [];
		const beats = beatPositions(figure.meter).length;
		const beatWidth = layout.barWidth / beats;
		// The model's tempo is the next run's at the breath; the frame's is the run played.
		const beatMs = 60000 / (controller.view.tempoBpm || m.tempo.bpm);
		const perCycle =
			m.feedback === 'summary'
				? []
				: m.settled.map((cycle) => cycleMarks(cycle.report, layout, m.feedback, beatWidth, beatMs));
		return layout.lineY.map((top, line) => ({
			line,
			top,
			height: (layout.lineY[line + 1] ?? layout.height) - top,
			strips: perCycle.map((all, cycle) => {
				const marks = all.filter((mark) => mark.line === line);
				const rows = labelRows(marks, figurePx * FIGURE_CHAR_EM);
				return { cycle, marks: marks.map((mark, i) => ({ mark, row: rows[i] })) };
			})
		}));
	});

	function markLabel(mark: Mark): string {
		return mark.label ? `${t.mark[mark.kind]} ${mark.label} ms` : t.mark[mark.kind];
	}
</script>

<div class="rhythm" data-phase={m.phase} bind:this={root}>
	<header class="head">
		<p class="title" data-testid="rhythm-header">{header}</p>
		{#if m.phase === 'play' || m.phase === 'listening'}
			<p class="where" data-testid="rhythm-bar">
				<span>{t.bar(m.barInCycle + 1, m.cycleBars)}</span>
				<span class="sep" aria-hidden="true">·</span>
				<span class="click" class:muted={m.muted}>{m.muted ? t.silence : t.click}</span>
			</p>
		{/if}
		{#if phaseText}
			<p class="phase">{phaseText}</p>
		{/if}
	</header>

	{#if breathing}
		{#if m.announcement}
			<p class="announcement" role="status">{t.announcement[m.announcement](levelText)}</p>
		{/if}
		<div class="breath" class:stacked={!sideBySide}>
			<section class="panel faded" data-testid="rhythm-played" aria-label={t.played}>
				<h2 class="panel-title">{t.played}</h2>
				<div class="played" style:--cycle-column="{CYCLE_COLUMN_PX}px">
					<span class="figure-label probe" aria-hidden="true" bind:this={figureProbe}>0</span>
					{#each playedLines as block (block.line)}
						<div
							class="engraving line"
							data-testid="rhythm-line"
							data-line={block.line}
							style:height="{block.height}px"
							style:width="{playedLayout?.width ?? 0}px"
						>
							{#if playedSvg}
								<div use:engravedLine={{ svg: playedSvg, top: block.top }}></div>
							{/if}
						</div>
						{#each block.strips as strip (strip.cycle)}
							<div
								class="strip-row"
								data-testid="rhythm-strip"
								data-line={block.line}
								role="group"
								aria-label={t.cycle(strip.cycle + 1)}
							>
								<span class="strip-label" aria-hidden="true">{strip.cycle + 1}</span>
								<div class="strip" style:width="{playedLayout?.width ?? 0}px">
									{#each strip.marks as { mark, row }, i (i)}
										<span
											class="mark {mark.kind}"
											data-testid="rhythm-mark"
											data-kind={mark.kind}
											style:left="{mark.x}px"
											role="img"
											aria-label={markLabel(mark)}
										>
											<span class="shape" aria-hidden="true"></span>
											{#if mark.label && row !== null}
												<span class="figure-label" class:second={row === 1} aria-hidden="true"
													>{mark.label}</span
												>
											{/if}
										</span>
									{/each}
								</div>
							</div>
						{/each}
					{/each}
				</div>
				{#if m.feedback === 'summary'}
					<ul class="cycles">
						{#each m.settled as cycle, i (i)}
							<li class="cycle" class:failed={!cycle.verdict.passed} data-testid="rhythm-cycle">
								{t.cycle(i + 1)} · {cycle.verdict.passed ? t.passed : t.failed}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			<section class="panel" data-testid="rhythm-next" aria-label={t.toPlay}>
				<h2 class="panel-title">{t.toPlay}</h2>
				<div class="engraving large" bind:this={nextHost}></div>
			</section>
		</div>
		{#if line}
			<p class="feedback" data-testid="rhythm-feedback">
				<span>{line.words}</span>
				{#if line.term}
					<span class="sep" aria-hidden="true">·</span>
					<span class="term">{t.term[line.term]}</span>
				{/if}
			</p>
		{/if}
	{:else}
		<div class="score">
			<div class="engraving large" bind:this={figureHost}></div>
			{#if cursor && figureLayout}
				<span
					class="cursor"
					data-testid="rhythm-cursor"
					aria-hidden="true"
					style:left="{cursor.x}px"
					style:top="{figureLayout.lineY[cursor.line] ?? 0}px"
					style:height="{figureLayout.rowHeight}px"
				></span>
			{/if}
		</div>
	{/if}

	<div class="actions">
		{#if m.listen !== 'none'}
			<button
				type="button"
				class="action"
				aria-keyshortcuts={frame.listenKey}
				onclick={() => controller.listen?.()}
			>
				{t.listen} <kbd>{frame.listenKey}</kbd>
			</button>
		{/if}
		{#if breathing && controller.replay}
			<button
				type="button"
				class="action"
				aria-keyshortcuts={frame.replayKey}
				disabled={replay.pending}
				onclick={() => replay.run()}
			>
				{replay.pending ? frame.replaying : frame.replay}
				<kbd>{frame.replayKey}</kbd>
			</button>
		{/if}
	</div>
</div>

<style>
	.rhythm {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-3);
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: var(--np-space-3) var(--np-space-2);
		color: var(--np-ink);
		font-family: system-ui, sans-serif;
		font-weight: 400;
		text-transform: none;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--np-space-1) var(--np-space-3);
	}

	.title,
	.where,
	.phase,
	.announcement,
	.feedback,
	.panel-title {
		margin: 0;
	}

	.title {
		font-size: var(--np-type-body);
		font-weight: 600;
	}

	.where,
	.phase {
		font-size: var(--np-type-meta);
	}

	.where {
		display: flex;
		gap: var(--np-space-1);
	}

	.click.muted {
		font-weight: 600;
	}

	.sep {
		color: var(--np-shade);
	}

	.score,
	.played {
		position: relative;
		min-width: 0;
	}

	.engraving {
		color: var(--np-ink);
		overflow-x: auto;
	}

	.engraving :global(svg) {
		display: block;
	}

	/* A window on one line of the run played: the engraving above and below it is cut. */
	.engraving.line {
		overflow: hidden;
	}

	.cursor {
		position: absolute;
		width: 4px;
		margin-left: -2px;
		background: var(--np-shade);
		opacity: 0.6;
		transition: left 90ms linear;
	}

	.breath {
		display: grid;
		grid-template-columns: 3fr 2fr;
		gap: var(--np-space-3);
		align-items: start;
	}

	.breath.stacked {
		grid-template-columns: 1fr;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-1);
		min-width: 0;
	}

	.panel-title {
		font-size: var(--np-type-meta);
		font-weight: 600;
	}

	/* The run played is behind us: its notes fade, its marks stay readable. */
	.faded .engraving,
	.faded .panel-title {
		opacity: 0.55;
	}

	/* The engraving and the strips of marks share one x: the cycle numbers sit left of both. */
	.played .engraving {
		margin-inline-start: var(--cycle-column);
	}

	.strip-row {
		display: flex;
		align-items: flex-start;
	}

	.strip-label {
		flex: none;
		width: var(--cycle-column);
		font-size: var(--np-type-meta);
		line-height: 20px;
		color: var(--np-shade);
	}

	/* The shape on top, then two rows of figures. */
	.strip {
		position: relative;
		flex: none;
		height: calc(24px + 2 * var(--np-type-body));
	}

	.mark {
		position: absolute;
		top: 0;
		width: 0;
		height: 100%;
	}

	.mark > * {
		position: absolute;
		left: 0;
		transform: translateX(-50%);
	}

	.shape {
		top: 2px;
	}

	.shape {
		display: block;
		box-sizing: border-box;
	}

	.missed .shape {
		top: 0;
	}

	/* Each kind has its own shape, so colour is never the only cue. */
	.on-time .shape {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--np-shade);
	}

	.early .shape,
	.late .shape {
		width: 0;
		height: 0;
		border-block: 8px solid transparent;
	}

	.early .shape {
		border-inline-end: 12px solid var(--np-ink);
	}

	.late .shape {
		border-inline-start: 12px solid var(--np-ink);
	}

	.missed .shape {
		width: 16px;
		height: 16px;
		border: 3px solid var(--np-ink);
		border-radius: 50%;
	}

	.extra .shape {
		width: 12px;
		height: 12px;
		border: 3px solid var(--np-ink);
		transform: rotate(45deg);
		margin-block: 2px;
	}

	/* « Le chiffre en grand »: read from a metre away. */
	.figure-label {
		top: 20px;
		font-size: var(--np-type-body);
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.figure-label.second {
		top: calc(22px + var(--np-type-body));
	}

	.figure-label.probe {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
	}

	.cycles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-space-1) var(--np-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--np-type-meta);
	}

	.cycle.failed {
		font-weight: 600;
		text-decoration: underline;
	}

	.announcement {
		font-size: var(--np-type-body);
		font-weight: 600;
	}

	.feedback {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-space-1);
		font-size: var(--np-type-body);
	}

	.term {
		font-style: italic;
		text-decoration: underline dotted;
		text-underline-offset: 4px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-space-2);
	}

	.action {
		display: inline-flex;
		align-items: center;
		gap: var(--np-space-1);
		padding: var(--np-space-1) var(--np-space-2);
		font: inherit;
		font-size: var(--np-type-meta);
		color: var(--np-ink);
		background: transparent;
		border: 2px solid var(--np-ink);
		border-radius: 6px;
		cursor: pointer;
	}

	.action:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.action:focus-visible {
		outline: 3px solid var(--np-shade);
		outline-offset: 2px;
	}

	kbd {
		padding: 0 6px;
		font: inherit;
		border: 1px solid currentColor;
		border-radius: 4px;
	}

	@media (prefers-reduced-motion: reduce) {
		.cursor {
			transition: none;
		}
	}
</style>
