<script lang="ts">
	import type { LaneTile } from '$lib/ui/play/lane';
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
	const firstBandBeat = $derived(tiles.find((tile) => tile.kind === 'band')?.beatIndex ?? null);

	function labelOf(tile: LaneTile): string | null {
		if (tile.kind === 'target') return targetLabel;
		if (tile.kind === 'band' && tile.beatIndex === firstBandBeat) return bandLabel;
		return null;
	}
</script>

<div
	class="lane"
	style="--lane-cells: {3 * beatsPerBar}; --lane-before: {beatsPerBar}; overflow: hidden;"
>
	<div class="side past">
		{#each past as tile (tile.beatIndex)}
			<LaneCell
				{tile}
				label={labelOf(tile)}
				caption={tile.justPlayed ? caption : null}
				imprint={imprint && tile.justPlayed}
			/>
		{/each}
	</div>
	<div class="side upcoming">
		{#each upcoming as tile (tile.beatIndex)}
			<LaneCell {tile} label={labelOf(tile)} />
		{/each}
	</div>
	<div class="now" aria-hidden="true"></div>
</div>

<style>
	/* Every cell is 1/(3 × beatsPerBar) of the lane; the line sits between the
	   beatsPerBar cells before it and the rest, which is clipped on the right. */
	.lane {
		--cell-w: calc((100cqw - (var(--lane-cells) - 1) * var(--np-cell-gap)) / var(--lane-cells));
		--past-w: calc(
			var(--lane-before) * var(--cell-w) + (var(--lane-before) - 1) * var(--np-cell-gap)
		);
		container-type: inline-size;
		position: relative;
		display: flex;
		height: 120px;
		gap: var(--np-cell-gap);
	}
	.side {
		display: flex;
		gap: var(--np-cell-gap);
		overflow: hidden;
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
	}
	.now {
		position: absolute;
		top: calc(-1 * var(--np-step-1));
		bottom: calc(-1 * var(--np-step-1));
		left: calc(var(--past-w) + var(--np-cell-gap) / 2);
		width: 3px;
		transform: translateX(-50%);
		background: var(--np-now);
		pointer-events: none;
	}
</style>
