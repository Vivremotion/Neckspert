<script lang="ts">
	import type { ShapeView } from '$lib/application/session/contract';
	import type { StringNumber } from '$lib/domain/music/types';
	import type { ChordDiagramStyle, Locale } from '$lib/domain/types';

	let {
		shape,
		style,
		locale,
		size = 'aid'
	}: {
		shape: ShapeView;
		style: ChordDiagramStyle;
		locale: Locale;
		/** 'aid' under a prompt; 'small' side by side in the verdict. */
		size?: 'aid' | 'small';
	} = $props();

	const STRING_NAMES: Record<Locale, Record<StringNumber, string>> = {
		fr: { 1: 'mi', 2: 'si', 3: 'sol', 4: 'ré', 5: 'la', 6: 'mi' },
		en: { 1: 'E', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }
	};

	/** Tab order on strings: high E on top. On the grid, low E on the left. */
	const HIGH_FIRST: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];
	const LOW_FIRST: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

	/** Frets a grid shows: enough for any close triad. */
	const GRID_FRETS = 4;
	/** Grid geometry, in viewBox units. */
	const STRING_GAP = 12;
	const FRET_GAP = 14;
	const LEFT = 6;
	const TOP = 10;

	const fretOf = $derived(new Map(shape.notes.map((note) => [note.string, note.fret])));
	const pressed = $derived(shape.notes.map((note) => note.fret).filter((fret) => fret > 0));
	/** First fret the grid shows: the nut when the shape fits under it, else its lowest fret. */
	const base = $derived(
		pressed.length === 0 || Math.max(...pressed) <= GRID_FRETS ? 1 : Math.min(...pressed)
	);
	const width = LEFT * 2 + STRING_GAP * 5;
	const height = TOP + FRET_GAP * GRID_FRETS + 2;
	const x = (string: StringNumber) => LEFT + STRING_GAP * LOW_FIRST.indexOf(string);
</script>

{#if style === 'strings'}
	<div
		class="chord-shape strings"
		class:small={size === 'small'}
		data-style="strings"
		aria-hidden="true"
	>
		{#each HIGH_FIRST as string (string)}
			{@const fret = fretOf.get(string)}
			<div class="row" class:played={fret !== undefined}>
				<span class="name">{fret !== undefined ? STRING_NAMES[locale][string] : ''}</span>
				<span class="line">
					{#if fret !== undefined}<span class="fret">{fret}</span>{/if}
				</span>
			</div>
		{/each}
	</div>
{:else}
	<div class="chord-shape grid" class:small={size === 'small'} data-style="grid" aria-hidden="true">
		{#if base > 1}<span class="base">{base}</span>{/if}
		<svg viewBox="0 0 {width} {height}" shape-rendering="crispEdges">
			{#if base === 1}
				<rect class="nut" x={LEFT - 1} y={TOP - 3} width={STRING_GAP * 5 + 2} height="3" />
			{/if}
			{#each Array.from({ length: GRID_FRETS + 1 }, (_, i) => i) as line (line)}
				<rect
					class="fret-line"
					x={LEFT}
					y={TOP + FRET_GAP * line}
					width={STRING_GAP * 5}
					height="1"
				/>
			{/each}
			{#each LOW_FIRST as string (string)}
				<rect class="string-line" x={x(string)} y={TOP} width="1" height={FRET_GAP * GRID_FRETS} />
			{/each}
			{#each shape.notes as note (note.string)}
				{#if note.fret === 0}
					<rect class="open" x={x(note.string) - 2} y={TOP - 9} width="5" height="5" />
				{:else}
					<rect
						class="dot"
						data-string={note.string}
						data-fret={note.fret}
						x={x(note.string) - 3}
						y={TOP + FRET_GAP * (note.fret - base) + FRET_GAP / 2 - 3}
						width="7"
						height="7"
					/>
				{/if}
			{/each}
		</svg>
	</div>
{/if}

<style>
	.chord-shape {
		color: var(--np-ink);
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	/* Strings: as the locate aid draws one string, the shape's three thick, named, with frets. */
	.strings {
		display: grid;
		inline-size: min(240px, 100%);
		padding-block: var(--np-space-1, 8px);
	}

	.strings.small {
		inline-size: min(160px, 100%);
	}

	.row {
		display: grid;
		grid-template-columns: var(--np-space-4, 32px) 1fr;
		align-items: center;
		block-size: 12px;
	}

	.row.played {
		block-size: calc(var(--np-type-meta) + 4px);
	}

	.name {
		text-align: center;
	}

	.line {
		position: relative;
		display: block;
		block-size: 4px;
		background: var(--np-mid);
	}

	.played .line {
		block-size: var(--np-tile, 8px);
		background: var(--np-ink);
	}

	/* The fret sits on its string, in a tile of the background. */
	.fret {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);
		padding-inline: 6px;
		background: var(--np-bg);
		border: 2px solid var(--np-ink);
	}

	/* Grid: strings down, frets across, the fret it starts from written beside it. */
	.grid {
		position: relative;
		inline-size: min(160px, 100%);
		padding-inline-start: var(--np-space-3, 24px);
	}

	.grid.small {
		inline-size: min(110px, 100%);
	}

	.grid svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
	}

	.base {
		position: absolute;
		inset-inline-start: 0;
		inset-block-start: 22%;
	}

	.nut,
	.dot {
		fill: var(--np-ink);
	}

	.fret-line,
	.string-line {
		fill: var(--np-shade);
	}

	.open {
		fill: none;
		stroke: var(--np-ink);
		stroke-width: 1.5;
	}
</style>
