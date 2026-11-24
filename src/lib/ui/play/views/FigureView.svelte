<script lang="ts">
	import { onMount } from 'svelte';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { FigureStageModel } from '$lib/application/session/series/figureStage';
	import { attackPositions, beatPositions } from '$lib/domain/time';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { FigureLayout } from '$lib/ui/notation';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Term from '$lib/ui/primitives/Term.svelte';
	import { provideGlossaryScope } from '$lib/ui/primitives/glossaryScope';
	import { useInfoLine } from '../infoLine.svelte';
	import { playMessages } from '../messages';
	import { replayOf } from '../replay.svelte';
	import {
		cursorVisible,
		cursorX,
		cycleFigure,
		cyclesOnFigure,
		feedbackLine,
		liveMarks,
		toldCycle
	} from './figure';
	import { figureMessages } from './figureMessages';
	import MarkShape from './MarkShape.svelte';
	import { PICTURE_VIEWS } from './pictures';
	import PlayedCycle, { type PlayedStrip } from './PlayedCycle.svelte';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	type Notation = typeof import('$lib/ui/notation');

	/** The figure to play is engraved large, from the breath that announces it on. */
	const LARGE_SCALE = 1.5;
	/** Beyond this many bars a figure is engraved at its plain size: more of it fits on the screen. */
	const LONG_FIGURE_BARS = 8;
	/** Room kept above the line played: what is written over its staff (a tuplet's number). */
	const LINE_MARGIN_PX = 24;
	/** Room kept under each line for the marks of a level that shows them as it plays. */
	const LIVE_MARKS_PX = 36;
	/** Width assumed before the view is measured (and where nothing measures it). */
	const FALLBACK_WIDTH = 640;

	provideGlossaryScope();

	const m = $derived(model as FigureStageModel);
	const t = $derived(figureMessages());
	const frame = $derived(playMessages());
	const replay = $derived(replayOf(controller));
	const view = $derived(controller.view);

	const breathing = $derived(m.phase === 'breath');
	/**
	 * The figure in the score box: the one played or heard; at the breath, the one to play next,
	 * where the figure played stood, at its size, so nothing moves when the run starts. The run
	 * played comes under it with its marks.
	 */
	const shown = $derived(breathing ? (m.next ?? m.figure) : m.figure);
	// Kept apart so the run played is drawn again only when its figure changes, not on every beat.
	const played = $derived(m.figure);
	const cycleBars = $derived(m.cycleBars);
	// Read apart too: the model is built again on every beat, its notation with it.
	const staff = $derived(m.notation.staff);
	const tab = $derived(m.notation.tab);
	// Read apart too: the room for the marks is engraved, the marks themselves are not.
	const marksRoom = $derived(m.live ? LIVE_MARKS_PX : 0);

	/**
	 * What the view adds to the frame's info line: the exercise, its level, the bar played and,
	 * in a bar without click, « silence » (the cursor is gone too). No « clic »: the click is
	 * the rule, its absence the state worth a word.
	 */
	const levelText = $derived(m.level.aid ? t.aidLevel : t.level(m.level.shown, m.level.of));
	const inPlay = $derived(m.phase === 'play' || m.phase === 'listening');
	const parts = $derived([
		m.exerciseLabel,
		levelText,
		...(inPlay ? [t.bar(m.barInCycle + 1, m.cycleBars)] : []),
		...(inPlay && m.muted ? [t.silence] : [])
	]);
	const info = useInfoLine();
	$effect(() => {
		if (!info) return;
		info.parts = parts;
		return () => {
			info.parts = [];
		};
	});

	/** The figure goes by without the player: the accompaniment alone, or a figure heard. */
	const phaseText = $derived(
		m.phase === 'listen-in' || m.phase === 'listening' ? t.phase[m.phase] : null
	);
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
	/**
	 * The strips of marks under the run played: the cycles that played the figure engraved
	 * (`cyclesOnFigure`), the one told in words marked. A cycle of another length (a sequence
	 * whose changes last 2, 4 or 8 beats) gets no strip: its marks would land on other notes.
	 */
	const strips = $derived.by((): PlayedStrip[] => {
		const attacks = attackPositions(cycleFigure(played, cycleBars)).length;
		return cyclesOnFigure(m.settled, attacks).map(({ cycle, settled }) => ({
			cycle,
			report: settled.report,
			told: settled === told
		}));
	});

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

	const scale = $derived(shown.bars > LONG_FIGURE_BARS ? 1 : LARGE_SCALE);

	let scoreHost = $state<HTMLElement | null>(null);
	let figureHost = $state<HTMLElement | null>(null);
	let figureLayout = $state<FigureLayout | null>(null);

	$effect(() => {
		const host = figureHost;
		if (!notation || !host) return;
		figureLayout = notation.renderFigure(host, shown, {
			maxWidth: width,
			scale,
			notation: { staff, tab },
			underLine: marksRoom
		});
	});

	const cursor = $derived(
		figureLayout && m.cursor && cursorVisible(m) ? cursorX(shown, figureLayout, m.cursor) : null
	);

	const cursorLine = $derived(cursor?.line ?? null);

	const shownMarks = $derived.by(() => {
		if (!m.live || !figureLayout || breathing) return [];
		const beatWidth = figureLayout.barWidth / beatPositions(shown.meter).length;
		const beatMs = 60000 / (view.tempoBpm || m.tempo.bpm);
		return liveMarks(m.live, figureLayout, beatWidth, beatMs, shown);
	});

	// A figure taller than the screen starts from its top...
	$effect(() => {
		void shown;
		if (scoreHost) scoreHost.scrollTop = 0;
	});

	// ...and the line played stays at the top of its box, the next one under it to be read ahead.
	// The box jumps there at once when the line changes (its CSS animates no scroll): a score that
	// slides while it is read cannot be played from.
	$effect(() => {
		if (!scoreHost || !figureLayout || cursorLine === null) return;
		scoreHost.scrollTop = Math.max(0, (figureLayout.lineY[cursorLine] ?? 0) - LINE_MARGIN_PX);
	});
</script>

<div class="figure-view" data-phase={m.phase} bind:this={root}>
	{#if !info}
		<!-- Without a frame to carry the info line (a test, a demo): the view says its parts itself. -->
		<p class="meta" data-testid="figure-header">{parts.join(' · ')}</p>
	{/if}

	<!-- Always in the flow, at the height of a prompt line: the figure never moves when the prompt,
	     the count or the state come or go. -->
	<div class="top">
		{#if m.prompt || view.countdown !== null || phaseText}
			{#if m.prompt}
				<p class="prompt" data-testid="figure-prompt">
					<span class="primary">{m.prompt.primary}</span>
					{#if m.prompt.secondary}
						<span class="secondary">{m.prompt.secondary}</span>
					{/if}
					{#if m.nextPrompt}
						<span class="next-prompt" data-testid="figure-next-prompt"
							>→ {m.nextPrompt.primary}</span
						>
					{/if}
				</p>
			{/if}
			{#if view.countdown !== null}
				<!-- The counted bar, in the prompt's row, as large as a prompt line. -->
				<p class="count" data-testid="figure-countdown" aria-live="polite">{view.countdown}</p>
			{:else if phaseText}
				<p class="phase">{phaseText}</p>
			{/if}
		{/if}
	</div>

	{#if m.neck}
		{@const Neck = PICTURE_VIEWS[m.neck.kind]}
		<section class="neck" data-testid="figure-neck">
			<Neck picture={m.neck} chordDiagram={m.chordDiagram} />
		</section>
	{/if}

	{#if notationFailed}
		<p class="notation-error" role="alert">{t.notationFailed}</p>
	{/if}

	<div
		class="score"
		data-testid="figure-score"
		data-shows={breathing ? 'next' : 'played'}
		bind:this={scoreHost}
	>
		<div class="engraving large" bind:this={figureHost}></div>
		{#if cursor && figureLayout}
			<!-- A cursor of its own on each line: it slides along its line, never from one to the next. -->
			{#key cursor.line}
				<span
					class="cursor"
					data-testid="figure-cursor"
					aria-hidden="true"
					style:left="{cursor.x}px"
					style:top="{figureLayout.lineY[cursor.line] ?? 0}px"
					style:height="{figureLayout.rowHeight}px"
				></span>
			{/key}
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

	{#if breathing}
		<!-- The run played, under the figure to play: its notes stepped back, its marks readable. -->
		<section class="played" data-testid="figure-played" aria-label={t.played}>
			<PlayedCycle
				figure={played}
				{cycleBars}
				{strips}
				feedback={m.feedback}
				beatMs={60000 / (view.tempoBpm || m.tempo.bpm)}
				maxWidth={width}
				faded
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
		{#if expected}
			{@const Picture = PICTURE_VIEWS[expected.kind]}
			<section class="expected" data-testid="figure-expected" aria-label={t.expected}>
				<p class="meta">{t.expected}</p>
				<Picture picture={expected} chordDiagram={m.chordDiagram} size="small" />
			</section>
		{/if}
	{/if}

	{#if m.listen !== 'none' || (breathing && controller.replay)}
		<div class="actions">
			{#if m.listen !== 'none'}
				<!-- Space pauses, as elsewhere: it must not press this button again once clicked. -->
				<span data-frame-space>
					<Button variant="quiet" onclick={() => controller.listen?.()}>
						{t.listen} <kbd>{frame.listenKey}</kbd>
					</Button>
				</span>
			{/if}
			{#if breathing && controller.replay}
				<Button variant="quiet" disabled={replay.pending} onclick={() => replay.run()}>
					{replay.pending ? frame.replaying : frame.replay}
					<kbd>{frame.replayKey}</kbd>
				</Button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* The view in the field: mist on the haze, the family of the quiet world. */
	.figure-view {
		/* The neck's notes and the terms' definitions take the field's tones. */
		--neck-tile: var(--np-step-1);
		--neck-size: var(--np-size-meta);
		--neck-gap: var(--np-step-1);
		--neck-ink: var(--np-on-field);
		--neck-ground: var(--np-text);
		--neck-muted: var(--np-cell-band);
		--neck-next: var(--np-cell-band);
		--neck-next-text: var(--np-text);
		--term-ground: var(--np-on-field);
		--term-text: var(--np-text);
		--term-rule: var(--np-rule);
		--term-gap: var(--np-step-1);
		--term-pad: var(--np-step-2);
		display: flex;
		flex-direction: column;
		gap: var(--np-step-3);
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		/* The frame lays a level reached over the top of the field (`PlayFrame`, `.told`: a prompt
		   line with its padding): the view starts under that band, so the figure to play is never
		   covered, and never moves when the announcement comes or goes. */
		padding-block-start: calc(var(--np-size-prompt) * 1.1 + 2 * var(--np-step-2));
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		font-weight: 400;
	}

	p {
		margin: 0;
	}

	.meta {
		font-size: var(--np-size-meta);
		opacity: 0.8;
	}

	/* Above the figure: the prompt (what to play, not how) on the left, the count or the state. */
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--np-step-1) var(--np-step-4);
		min-height: calc(var(--np-size-prompt) * 1.1);
	}

	.prompt {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--np-step-1) var(--np-step-3);
	}

	.prompt .primary {
		font-size: var(--np-size-prompt);
		font-weight: 400;
		line-height: 1.1;
	}

	.prompt .secondary {
		font-size: var(--np-size-body);
	}

	/* What comes next, beside what plays now: read at a glance, without taking its place. */
	.prompt .next-prompt {
		font-size: var(--np-size-title);
		line-height: 1.1;
		opacity: 0.7;
	}

	/* The counted bar: the figure of a prompt line, light, where the eye already is. */
	.count {
		margin-inline-start: auto;
		font-size: var(--np-size-prompt);
		font-weight: 300;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.phase {
		margin-inline-start: auto;
		font-size: var(--np-size-body);
		opacity: 0.8;
	}

	.notation-error {
		font-size: var(--np-size-meta);
	}

	.expected {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--np-step-1);
	}

	/* A figure taller than this scrolls here: the view and what follows it stay on the screen.
	   No smooth scroll: the box jumps to the line played. */
	.score {
		position: relative;
		min-width: 0;
		max-block-size: 65dvh;
		overflow-y: auto;
	}

	.engraving {
		overflow-x: auto;
	}

	.engraving :global(svg) {
		display: block;
	}

	/* VexFlow clears the tab's lines behind a fret number in white: the field shows through
	   instead, the number drawn over the line. */
	.engraving :global(.vf-tabnote rect) {
		fill: transparent;
	}

	/* The now line of the score, as the lane's: amber, the only one. */
	.cursor {
		position: absolute;
		width: 3px;
		margin-left: -1.5px;
		background: var(--np-now);
		transition: left 90ms linear;
	}

	/* Read while playing, from a metre away: the shapes of the run played, larger. */
	.live-mark {
		--mark-scale: 1.5;
		position: absolute;
		width: 0;
		height: 0;
	}

	.played {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-1);
		min-width: 0;
		max-block-size: 50dvh;
		overflow-y: auto;
	}

	.cycles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-step-1) var(--np-step-2);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--np-size-meta);
	}

	.cycle.failed {
		font-weight: 700;
		text-decoration: underline;
	}

	/* The verdict in words, at the size of a title: read from a metre away. */
	.feedback {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--np-step-1);
		font-size: var(--np-size-title);
		font-weight: 300;
		line-height: 1.2;
	}

	.sep {
		opacity: 0.6;
	}

	.term {
		font-style: italic;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-step-4);
		font-size: var(--np-size-meta);
	}

	.actions :global(button) {
		font-size: var(--np-size-meta);
	}

	kbd {
		padding: 0 6px;
		font: inherit;
		border: 1px solid currentColor;
		border-radius: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.cursor {
			transition: none;
		}
	}
</style>
