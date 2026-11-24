<script module lang="ts">
	import type { CycleReport } from '$lib/domain/time';

	/** One strip of marks under the run played: a cycle's report, its number in the run (from 0). */
	export interface PlayedStrip {
		cycle: number;
		report: CycleReport;
		/** The cycle the breath tells in words: its strip is full, the others step back. */
		told?: boolean;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { beatPositions, type Feedback, type Figure } from '$lib/domain/time';
	import type { FigureLayout } from '$lib/ui/notation';
	import { cycleFigure, cycleMarks, labelRows, shiftMark, type Mark } from './figure';
	import { figureMessages } from './figureMessages';
	import MarkShape from './MarkShape.svelte';

	/**
	 * The run played: the cycle's figure engraved whole, as small as it takes to hold on one
	 * line, and under each line one strip of marks per cycle played (where each attack landed).
	 * Drawn in the colour of its text, in the field or on a light page.
	 */
	let {
		figure,
		cycleBars,
		strips,
		feedback,
		beatMs,
		maxWidth,
		faded = false
	}: {
		figure: Figure;
		cycleBars: number;
		/** The cycles whose marks fall on this figure, one strip each. */
		strips: readonly PlayedStrip[];
		feedback: Feedback;
		/** The length of a beat, in ms. */
		beatMs: number;
		/** The width the engraving may take. */
		maxWidth: number;
		/** The run is behind us: its notes step back, its marks stay readable. */
		faded?: boolean;
	} = $props();

	type Notation = typeof import('$lib/ui/notation');

	/** Scales tried for the run played, largest first, until it holds on one line. */
	const PLAYED_SCALES = [1, 0.9, 0.8, 0.7, 0.6];
	/** Width of a character of a mark's figure, in ems of its size, to keep two figures apart. */
	const FIGURE_CHAR_EM = 0.7;
	/** The figures' size (`--np-size-body`) before it is measured. */
	const FIGURE_FALLBACK_PX = 20;

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

	/** One strip is told: the others step back, so the eye finds the one the words are about. */
	const anyTold = $derived(strips.some((strip) => strip.told));

	/** Each engraved line of the run played, with one strip of marks per cycle under it. */
	const playedLines = $derived.by(() => {
		const layout = playedLayout;
		if (!layout) return [];
		const beats = beatPositions(figure.meter).length;
		const beatWidth = layout.barWidth / beats;
		const perCycle =
			feedback === 'summary'
				? []
				: strips.map((strip) => ({
						strip,
						marks: cycleMarks(strip.report, layout, feedback, beatWidth, beatMs, engraved)
					}));
		// The line of each bar: a bar whose x does not move right starts a new line.
		let barLine = 0;
		const barLines = layout.barX.map((x, b) =>
			b > 0 && x <= layout.barX[b - 1] ? ++barLine : barLine
		);
		return layout.lineY.map((top, line) => ({
			line,
			top,
			height: (layout.lineY[line + 1] ?? layout.height) - top,
			strips: perCycle.map(({ strip, marks: all }) => {
				const marks = all.filter((mark) => mark.line === line);
				const rows = labelRows(marks, figurePx * FIGURE_CHAR_EM);
				const shift = shiftMark(strip.report);
				const shown = shift && barLines[shift.bar] === line ? shift : null;
				return {
					cycle: strip.cycle,
					told: strip.told === true,
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

<div class="played" class:faded>
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
			<!-- The cycle is named for assistive technology only: no numbers in play. -->
			<div
				class="strip"
				class:dim={anyTold && !strip.told}
				data-testid="figure-strip"
				data-line={block.line}
				data-told={strip.told ? 'true' : undefined}
				role="group"
				aria-label={t.cycle(strip.cycle + 1)}
				style:width="{playedLayout?.width ?? 0}px"
			>
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
		{/each}
	{/each}
</div>

<style>
	.played {
		position: relative;
		min-width: 0;
		font-family: var(--np-font-text);
		font-weight: 400;
	}

	.engraving {
		overflow-x: auto;
	}

	.engraving :global(svg) {
		display: block;
	}

	/* A window on one line of the run played: the engraving above and below it is cut. */
	.engraving.line {
		overflow: hidden;
	}

	/* The run played is behind us: its notes step back, its marks stay readable. */
	.faded .engraving {
		opacity: 0.55;
	}

	/* Above the bar where a beat was lost or added, in words. */
	.shift {
		position: absolute;
		top: 0;
		white-space: nowrap;
		font-size: var(--np-size-meta);
		line-height: 20px;
	}

	/* The shape on top, then two rows of figures. */
	.strip {
		position: relative;
		height: calc(24px + 2 * var(--np-size-body));
	}

	/* The strips the words are not about step back, so the one they are about stands out. */
	.strip.dim {
		opacity: 0.5;
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
		font-size: var(--np-size-body);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.figure-label.second {
		top: calc(22px + var(--np-size-body));
	}

	.figure-label.probe {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
	}
</style>
