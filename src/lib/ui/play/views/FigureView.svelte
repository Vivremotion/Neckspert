<script lang="ts">
	import { onMount } from 'svelte';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { FigureStageModel } from '$lib/application/session/series/figureStage';
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
		liveMarks,
		toldCycle,
		type Mark
	} from './figure';
	import { figureMessages } from './figureMessages';
	import MarkShape from './MarkShape.svelte';
	import { PICTURE_VIEWS } from './pictures';
	import PlayedCycle, { CYCLE_COLUMN_PX } from './PlayedCycle.svelte';
	import Term from '$lib/ui/primitives/Term.svelte';
	import { provideGlossaryScope } from '$lib/ui/primitives/glossaryScope';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	type Notation = typeof import('$lib/ui/notation');

	/** The figure played is engraved large, the one to play next too; the run played smaller. */
	const LARGE_SCALE = 1.5;
	/** Beyond this many bars a figure is engraved at its plain size: more of it fits on the screen. */
	const LONG_FIGURE_BARS = 8;
	/** Room kept above the line played: what is written over its staff (a tuplet's number). */
	const LINE_MARGIN_PX = 24;
	/** Room kept under each line for the marks of a level that shows them as it plays. */
	const LIVE_MARKS_PX = 36;
	/** Width assumed before the view is measured (and where nothing measures it). */
	const FALLBACK_WIDTH = 640;
	/** From this width the breath shows the run played and the next figure side by side. */
	const SIDE_BY_SIDE_PX = 720;
	/** Share of the width the run played takes side by side: it carries the marks. */
	const PLAYED_SHARE = 3 / 5;
	/** Gap between the two panels (the grid's `--np-space-3`). */
	const GAP_PX = 24;

	provideGlossaryScope();

	const m = $derived(model as FigureStageModel);
	const t = $derived(figureMessages());
	const frame = $derived(playMessages());
	const replay = $derived(replayOf(controller));

	const breathing = $derived(m.phase === 'breath');
	// Kept apart so the engraving is redrawn only when its figure changes, not on every beat.
	const figure = $derived(m.figure);
	const next = $derived(m.next);
	const cycleBars = $derived(m.cycleBars);
	// Read apart too: the model is built again on every beat, its notation with it.
	const staff = $derived(m.notation.staff);
	const tab = $derived(m.notation.tab);
	// Read apart too: the room for the marks is engraved, the marks themselves are not.
	const marksRoom = $derived(m.live ? LIVE_MARKS_PX : 0);

	const levelText = $derived(m.level.aid ? t.aidLevel : t.level(m.level.shown, m.level.of));
	const header = $derived(t.header(m.exerciseLabel, levelText, t.tempo(m.tempo.unit, m.tempo.bpm)));
	const phaseText = $derived(t.phase[m.phase]);
	const told = $derived(breathing ? toldCycle(m.settled) : null);
	const line = $derived(
		told
			? feedbackLine(told.report, i18n.locale, told.verdict, m.plainWords, {
					wrongNotes: told.wrongNotes,
					meter: m.figure.meter,
					// Told in the bars of the run played as engraved, where their marks are.
					engraved: cycleFigure(m.figure, m.cycleBars)
				})
			: null
	);
	/** After a failed round whose notes derive from its item: what was asked (its shape). */
	const expected = $derived(told && !told.verdict.passed ? told.expected : null);

	// VexFlow is heavy: the notation adapter is loaded once this view shows, never before.
	let notation = $state<Notation | null>(null);
	/** The notation did not load (a stale deploy, offline): the stage says so, play goes on. */
	let notationFailed = $state(false);
	onMount(() => {
		let live = true;
		import('$lib/ui/notation')
			.then(async (loaded) => {
				// Engraved on the music font itself, or the notes are spaced on a fallback's widths.
				await loaded.notationReady();
				if (live) notation = loaded;
			})
			.catch((error: unknown) => {
				console.warn('The notation could not load', error);
				if (live) notationFailed = true;
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

	const sideBySide = $derived(width >= SIDE_BY_SIDE_PX);
	const playedWidth = $derived(
		(sideBySide ? Math.floor((width - GAP_PX) * PLAYED_SHARE) : width) - CYCLE_COLUMN_PX
	);
	const nextWidth = $derived(
		sideBySide ? Math.floor((width - GAP_PX) * (1 - PLAYED_SHARE)) : width
	);

	const scale = $derived(figure.bars > LONG_FIGURE_BARS ? 1 : LARGE_SCALE);

	let scoreHost = $state<HTMLElement | null>(null);
	let figureHost = $state<HTMLElement | null>(null);
	let nextHost = $state<HTMLElement | null>(null);
	let figureLayout = $state<FigureLayout | null>(null);

	$effect(() => {
		const host = figureHost;
		if (!notation || !host || breathing) return;
		figureLayout = notation.renderFigure(host, figure, {
			maxWidth: width,
			scale,
			notation: { staff, tab },
			underLine: marksRoom
		});
	});

	$effect(() => {
		const host = nextHost;
		if (!notation || !host || !breathing || !next) return;
		notation.renderFigure(host, next, {
			maxWidth: nextWidth,
			scale,
			notation: { staff, tab }
		});
	});

	const cursor = $derived(
		figureLayout && m.cursor && cursorVisible(m) ? cursorX(figure, figureLayout, m.cursor) : null
	);

	const cursorLine = $derived(cursor?.line ?? null);

	const shownMarks = $derived.by(() => {
		if (!m.live || !figureLayout || breathing) return [];
		const beatWidth = figureLayout.barWidth / beatPositions(figure.meter).length;
		const beatMs = 60000 / (controller.view.tempoBpm || m.tempo.bpm);
		return liveMarks(m.live, figureLayout, beatWidth, beatMs, figure);
	});

	// A figure taller than the screen starts from its top...
	$effect(() => {
		void figure;
		if (scoreHost) scoreHost.scrollTop = 0;
	});

	// ...and the line played stays in view, the next one under it.
	$effect(() => {
		if (!scoreHost || !figureLayout || cursorLine === null) return;
		scoreHost.scrollTop = Math.max(0, (figureLayout.lineY[cursorLine] ?? 0) - LINE_MARGIN_PX);
	});
</script>

<div class="figure-view" data-phase={m.phase} bind:this={root}>
	<header class="head">
		<p class="title" data-testid="figure-header">{header}</p>
		{#if m.phase === 'play' || m.phase === 'listening'}
			<p class="where" data-testid="figure-bar">
				<span>{t.bar(m.barInCycle + 1, m.cycleBars)}</span>
				<span class="sep" aria-hidden="true">·</span>
				<span class="click" class:muted={m.muted}>{m.muted ? t.silence : t.click}</span>
			</p>
		{/if}
		{#if phaseText}
			<p class="phase">{phaseText}</p>
		{/if}
	</header>

	{#if m.prompt}
		<p class="prompt" data-testid="figure-prompt">
			<span class="primary">{m.prompt.primary}</span>
			{#if m.prompt.secondary}
				<span class="secondary">{m.prompt.secondary}</span>
			{/if}
			{#if m.nextPrompt}
				<span class="next-prompt" data-testid="figure-next-prompt">→ {m.nextPrompt.primary}</span>
			{/if}
		</p>
	{/if}

	{#if m.neck}
		{@const Neck = PICTURE_VIEWS[m.neck.kind]}
		<section class="neck" data-testid="figure-neck">
			<Neck picture={m.neck} chordDiagram={m.chordDiagram} />
		</section>
	{/if}

	{#if notationFailed}
		<p class="notation-error" role="alert">{t.notationFailed}</p>
	{/if}

	{#if breathing}
		<div class="breath" class:stacked={!sideBySide}>
			<section class="panel faded" data-testid="figure-played" aria-label={t.played}>
				<h2 class="panel-title">{t.played}</h2>
				<PlayedCycle
					{figure}
					{cycleBars}
					reports={m.settled.map((cycle) => cycle.report)}
					feedback={m.feedback}
					beatMs={60000 / (controller.view.tempoBpm || m.tempo.bpm)}
					maxWidth={playedWidth}
				/>
				{#if m.feedback === 'summary'}
					<ul class="cycles">
						{#each m.settled as cycle, i (i)}
							<li class="cycle" class:failed={!cycle.verdict.passed} data-testid="figure-cycle">
								{t.cycle(i + 1)} · {cycle.verdict.passed ? t.passed : t.failed}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			<section class="panel" data-testid="figure-next" aria-label={t.toPlay}>
				<h2 class="panel-title">{t.toPlay}</h2>
				<div class="engraving large" bind:this={nextHost}></div>
			</section>
		</div>
		{#if expected}
			{@const Picture = PICTURE_VIEWS[expected.kind]}
			<section class="expected" data-testid="figure-expected" aria-label={t.expected}>
				<h2 class="panel-title">{t.expected}</h2>
				<Picture picture={expected} chordDiagram={m.chordDiagram} size="small" />
			</section>
		{/if}
		{#if line}
			<p class="feedback" data-testid="figure-feedback">
				{#if !m.plainWords && line.term && line.value !== null}
					<span class="term"
						><Term id={line.term} locale={i18n.locale}>{t.term[line.term]}</Term></span
					>
					<span>{line.value}</span>
				{:else}
					<span>{line.words}</span>
					{#if line.term}
						<span class="sep" aria-hidden="true">·</span>
						<span class="term"
							><Term id={line.term} locale={i18n.locale}>{t.term[line.term]}</Term></span
						>
					{/if}
				{/if}
			</p>
		{/if}
	{:else}
		<div class="score" data-testid="figure-score" bind:this={scoreHost}>
			<div class="engraving large" bind:this={figureHost}></div>
			{#if cursor && figureLayout}
				<span
					class="cursor"
					data-testid="figure-cursor"
					aria-hidden="true"
					style:left="{cursor.x}px"
					style:top="{figureLayout.lineY[cursor.line] ?? 0}px"
					style:height="{figureLayout.rowHeight}px"
				></span>
			{/if}
			{#if figureLayout}
				{#each shownMarks as mark, i (i)}
					<span
						class="live-mark"
						data-testid="figure-live-mark"
						data-kind={mark.kind}
						aria-hidden="true"
						style:left="{mark.x}px"
						style:top="{(figureLayout.lineY[mark.line] ?? 0) + figureLayout.rowHeight}px"
					>
						<MarkShape kind={mark.kind} />
					</span>
				{/each}
			{/if}
		</div>
	{/if}

	<div class="actions">
		{#if m.listen !== 'none'}
			<!-- Space pauses, as elsewhere: it must not press this button again once clicked. -->
			<button
				type="button"
				class="action"
				data-frame-space
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
	.figure-view {
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
	.feedback,
	.panel-title,
	.prompt {
		margin: 0;
	}

	/* The exercise's prompt, above the figure: what to play, not how. */
	.prompt {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--np-space-1) var(--np-space-3);
	}

	.prompt .primary {
		font-size: var(--np-type-prompt);
		font-weight: 600;
		line-height: 1.1;
	}

	.prompt .secondary {
		font-size: var(--np-type-body);
	}

	/* What comes next, beside what plays now: read at a glance, without taking its place. */
	.prompt .next-prompt {
		font-size: calc(var(--np-type-prompt) * 0.7);
		line-height: 1.1;
		color: var(--np-shade);
	}

	.expected {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--np-space-1);
	}

	.title {
		font-size: var(--np-type-body);
		font-weight: 600;
	}

	.where,
	.phase,
	.notation-error {
		font-size: var(--np-type-meta);
	}

	.notation-error {
		margin: 0;
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

	/* A figure taller than this scrolls here: the view and what follows it stay on the screen. */
	.score {
		position: relative;
		min-width: 0;
		max-block-size: 65dvh;
		overflow-y: auto;
		scroll-behavior: smooth;
	}

	.engraving {
		color: var(--np-ink);
		overflow-x: auto;
	}

	.engraving :global(svg) {
		display: block;
	}

	/* VexFlow clears the tab's lines behind a fret number in white: the ground's colour instead. */
	.engraving :global(.vf-tabnote rect) {
		fill: var(--np-bg);
	}

	.cursor {
		position: absolute;
		width: 4px;
		margin-left: -2px;
		background: var(--np-shade);
		opacity: 0.6;
		transition: left 90ms linear;
	}

	/* Read while playing, from a metre away: the shapes of the run played, larger. */
	.live-mark {
		--mark-scale: 1.5;
		position: absolute;
		width: 0;
		height: 0;
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
		max-block-size: 65dvh;
		overflow-y: auto;
	}

	.panel-title {
		font-size: var(--np-type-meta);
		font-weight: 600;
	}

	/* The run played is behind us: its notes fade, its marks stay readable. */
	.faded .panel-title {
		opacity: 0.55;
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

		.score {
			scroll-behavior: auto;
		}
	}
</style>
