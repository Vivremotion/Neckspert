<script lang="ts">
	import { bandSpan, justPlayedBack, type LaneTile } from '$lib/ui/play/lane';
	import LaneCell from './LaneCell.svelte';

	let {
		tiles,
		targetLabel,
		bandLabel,
		caption,
		imprint,
		beatsPerBar
	}: {
		tiles: LaneTile[];
		targetLabel: string | null;
		bandLabel: string | null;
		caption: string | null;
		imprint: boolean;
		beatsPerBar: number;
	} = $props();

	const past = $derived(tiles.filter((tile) => tile.offset <= 0));
	const upcoming = $derived(tiles.filter((tile) => tile.offset > 0));
	const band = $derived(bandLabel ? bandSpan(tiles) : null);
	const bandPast = $derived(band !== null && tiles[band.start].offset <= 0);
	const back = $derived(caption ? justPlayedBack(tiles) : null);

	function labelOf(tile: LaneTile): string | null {
		return tile.kind === 'target' ? targetLabel : null;
	}
</script>

<div class="lane" style="--lane-cells: {3 * beatsPerBar}; --lane-before: {beatsPerBar};">
	<div class="track" style="overflow-x: clip; overflow-y: visible;">
		<div class="side past">
			{#each past as tile (tile.beatIndex)}
				<LaneCell {tile} label={labelOf(tile)} imprint={imprint && tile.justPlayed} />
			{/each}
		</div>
		<div class="side upcoming">
			{#each upcoming as tile (tile.beatIndex)}
				<LaneCell {tile} label={labelOf(tile)} />
			{/each}
		</div>
		{#if band && bandLabel}
			<!-- The band reads as one piece: its name runs from its left edge across its cells,
			     shown only once it fits whole in the cells still on the lane. -->
			<div
				class="band-label"
				data-past={bandPast ? '' : undefined}
				style="--band-start: {band.start}; --band-cells: {band.cells};"
			>
				<span class="band-fit"><span class="band-name">{bandLabel}</span></span>
			</div>
		{/if}
		<div class="now" aria-hidden="true"></div>
	</div>
	{#if caption && back !== null}
		<!-- Outside the clip: one line over the cell just played, kept inside the lane's left edge. -->
		<p class="caption" style="--caption-back: {back};">{caption}</p>
	{/if}
</div>

<style>
	/* Every cell is 1/(3 × beatsPerBar) of the lane; the line sits between the
	   beatsPerBar cells before it and the rest, which is clipped on the right. */
	.lane {
		--cell-w: calc((100cqw - (var(--lane-cells) - 1) * var(--np-cell-gap)) / var(--lane-cells));
		--cell-pitch: calc(var(--cell-w) + var(--np-cell-gap));
		--past-w: calc(
			var(--lane-before) * var(--cell-w) + (var(--lane-before) - 1) * var(--np-cell-gap)
		);
		container-type: inline-size;
		width: 100%;
		position: relative;
		/* 120px at 1440; lower on a phone, where the cells are narrow. */
		height: clamp(var(--np-step-8), 8.4vw, 120px);
	}
	.track {
		position: relative;
		display: flex;
		height: 100%;
		gap: var(--np-cell-gap);
	}
	.side {
		display: flex;
		gap: var(--np-cell-gap);
	}
	.past {
		flex: none;
		width: var(--past-w);
		justify-content: flex-end;
	}
	.upcoming {
		flex: 1 1 0;
		min-width: 0;
		justify-content: flex-start;
		overflow-x: clip;
		overflow-y: visible;
	}
	.band-label {
		position: absolute;
		inset-block: 0;
		left: calc(var(--band-start) * var(--cell-pitch));
		/* The band's cells, cut at the lane's right edge. */
		width: min(
			calc(var(--band-cells) * var(--cell-pitch) - var(--np-cell-gap)),
			calc(100% - var(--band-start) * var(--cell-pitch))
		);
		box-sizing: border-box;
		display: flex;
		align-items: center;
		padding-inline: var(--np-step-2);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		font-size: var(--np-size-cell);
		font-weight: 500;
		line-height: 1;
		pointer-events: none;
	}
	.band-label[data-past] {
		opacity: var(--np-cell-past-opacity);
	}
	/* One line: a name too wide for the room left wraps onto a hidden second line, never cut. */
	.band-fit {
		display: flex;
		flex-wrap: wrap;
		min-width: 0;
		height: 1lh;
		overflow: hidden;
	}
	.band-fit::before {
		content: '';
		height: 1lh;
	}
	.band-name {
		white-space: nowrap;
	}
	.now {
		position: absolute;
		/* The strongest mark on screen: it overhangs the cells above and below. */
		top: calc(-1 * var(--np-step-2));
		bottom: calc(-1 * var(--np-step-2));
		left: calc(var(--past-w) + var(--np-cell-gap) / 2);
		width: 4px;
		transform: translateX(-50%);
		background: var(--np-now);
		pointer-events: none;
	}
	.caption {
		/* The centre of the cell just played, `--caption-back` cells left of the now line. */
		--caption-centre: calc(
			(var(--lane-before) - 1 - var(--caption-back)) * var(--cell-pitch) + var(--cell-w) / 2
		);
		position: absolute;
		bottom: 100%;
		left: var(--caption-centre);
		/* Centred over its cell, unless that would cross the lane's left edge. */
		translate: max(-50%, calc(-1 * var(--caption-centre))) 0;
		/* Above the now line's overhang, clear of the cells. */
		margin: 0 0 var(--np-step-4);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		font-size: var(--np-size-meta);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
	}
</style>
