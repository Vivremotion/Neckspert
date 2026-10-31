<script module lang="ts">
	/** The column of the cycle numbers, left of the run played. */
	export const CYCLE_COLUMN_PX = 32;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { beatPositions, type CycleReport, type Feedback, type Figure } from '$lib/domain/time';
	import type { FigureLayout } from '$lib/ui/notation';
	import { cycleFigure, cycleMarks, labelRows, shiftMark, type Mark } from './figure';
	import { figureMessages } from './figureMessages';
	import MarkShape from './MarkShape.svelte';

	/**
	 * The run played: the cycle's figure engraved whole, as small as it takes to hold on one
	 * line, and under each line one strip of marks per cycle played (where each attack landed).
	 */
	let {
		figure,
		cycleBars,
		reports,
		feedback,
		beatMs,
		maxWidth
	}: {
		figure: Figure;
		cycleBars: number;
		/** The report of each cycle played, one strip each. */
		reports: readonly CycleReport[];
		feedback: Feedback;
		/** The length of a beat, in ms. */
		beatMs: number;
		/** The width the engraving may take, the cycle numbers' column left out. */
		maxWidth: number;
	} = $props();

	type Notation = typeof import('$lib/ui/notation');

	/** Scales tried for the run played, largest first, until it holds on one line. */
	const PLAYED_SCALES = [1, 0.9, 0.8, 0.7, 0.6];
	/** Width of a character of a mark's figure, in ems of its size, to keep two figures apart. */
	const FIGURE_CHAR_EM = 0.7;
	/** The figures' size (`--np-type-body`) before it is measured. */
	const FIGURE_FALLBACK_PX = 22;

	const t = $derived(figureMessages());

	// VexFlow is heavy: the notation adapter is loaded once a run is shown, never before.
	let notation = $state<Notation | null>(null);
	onMount(() => {
		let live = true;
		import('$lib/ui/notation')
			.then(async (loaded) => {
				// Engraved on the music font itself, or the notes are spaced on a fallback's widths.
				await loaded.notationReady();
				if (live) notation = loaded;
			})
			.catch((error: unknown) => {
				// The run is left out; what surrounds it still says the cycle in words.
				console.warn('The notation could not load', error);
			});
		return () => {
			live = false;
		};
	});

	/** The figures are drawn large: their size follows the screen, read off a probe. */
	let figureProbe = $state<HTMLElement | null>(null);
	let figurePx = $state(FIGURE_FALLBACK_PX);
	$effect(() => {
		void maxWidth;
		const probe = figureProbe;
		if (!probe) return;
		const size = Number.parseFloat(getComputedStyle(probe).fontSize);
		if (size > 0) figurePx = size;
	});

	/** The cycle's figure as engraved: its attacks follow the cycle's expectations. */
	const engraved = $derived(cycleFigure(figure, cycleBars));
	let playedLayout = $state<FigureLayout | null>(null);
	/** The run played, engraved once off screen; each line shows its own part of it. */
	let playedSvg = $state<SVGElement | null>(null);

	/**
	 * The run played: the cycle's figure whole, as small as it takes to hold on one line. It is
	 * engraved apart, then shown line by line, each line with its strips of marks under it.
	 */
	$effect(() => {
		if (!notation) return;
		const host = document.createElement('div');
		const played: Figure = engraved;
		let layout: FigureLayout | null = null;
		for (const scale of PLAYED_SCALES) {
			layout = notation.renderFigure(host, played, { maxWidth, scale });
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

	/** Each engraved line of the run played, with one strip of marks per settled cycle under it. */
	const playedLines = $derived.by(() => {
		const layout = playedLayout;
		if (!layout) return [];
		const beats = beatPositions(figure.meter).length;
		const beatWidth = layout.barWidth / beats;
		const perCycle =
			feedback === 'summary'
				? []
				: reports.map((report) =>
						cycleMarks(report, layout, feedback, beatWidth, beatMs, engraved)
					);
		// The line of each bar: a bar whose x does not move right starts a new line.
		let barLine = 0;
		const barLines = layout.barX.map((x, b) =>
			b > 0 && x <= layout.barX[b - 1] ? ++barLine : barLine
		);
		return layout.lineY.map((top, line) => ({
			line,
			top,
			height: (layout.lineY[line + 1] ?? layout.height) - top,
			strips: perCycle.map((all, cycle) => {
				const marks = all.filter((mark) => mark.line === line);
				const rows = labelRows(marks, figurePx * FIGURE_CHAR_EM);
				const shift = shiftMark(reports[cycle]);
				const shown = shift && barLines[shift.bar] === line ? shift : null;
				return {
					cycle,
					marks: marks.map((mark, i) => ({ mark, row: rows[i] })),
					shift: shown && { x: layout.barX[shown.bar] ?? 0, lost: shown.lost }
				};
			})
		}));
	});

	function markLabel(mark: Mark): string {
		return mark.label ? `${t.mark[mark.kind]} ${mark.label} ms` : t.mark[mark.kind];
	}
</script>

<div class="played" style:--cycle-column="{CYCLE_COLUMN_PX}px">
	<span class="figure-label probe" aria-hidden="true" bind:this={figureProbe}>0</span>
	{#each playedLines as block (block.line)}
		<div
			class="engraving line"
			data-testid="figure-line"
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
				data-testid="figure-strip"
				data-line={block.line}
				role="group"
				aria-label={t.cycle(strip.cycle + 1)}
			>
				<span class="strip-label" aria-hidden="true">{strip.cycle + 1}</span>
				<div class="strip" style:width="{playedLayout?.width ?? 0}px">
					{#each strip.marks as { mark, row }, i (i)}
						<span
							class="mark {mark.kind}"
							data-testid="figure-mark"
							data-kind={mark.kind}
							style:left="{mark.x}px"
							role="img"
							aria-label={markLabel(mark)}
						>
							<MarkShape kind={mark.kind} />
							{#if mark.label && row !== null}
								<span class="figure-label" class:second={row === 1} aria-hidden="true"
									>{mark.label}</span
								>
							{/if}
						</span>
					{/each}
					{#if strip.shift}
						<span class="shift" data-testid="figure-shift" style:left="{strip.shift.x}px"
							>{strip.shift.lost ? t.shift.lost : t.shift.added}</span
						>
					{/if}
				</div>
			</div>
		{/each}
	{/each}
</div>

<style>
	.played {
		position: relative;
		min-width: 0;
		color: var(--np-ink);
		font-family: system-ui, sans-serif;
		font-weight: 400;
		text-transform: none;
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

	/* The run played is behind us: its notes fade, its marks stay readable. */
	:global(.faded) .engraving {
		opacity: 0.55;
	}

	/* The engraving and the strips of marks share one x: the cycle numbers sit left of both. */
	.played .engraving {
		margin-inline-start: var(--cycle-column);
	}

	/* Above the bar where a beat was lost or added, in words. */
	.shift {
		position: absolute;
		top: 0;
		white-space: nowrap;
		font-size: max(16px, var(--np-type-meta));
		line-height: 20px;
		color: var(--np-ink);
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

	.figure-label {
		position: absolute;
		left: 0;
		transform: translateX(-50%);
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
</style>
