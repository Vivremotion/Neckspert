<script lang="ts">
	import type { LaneTile } from '$lib/ui/play/lane';
	import LaneCell from './LaneCell.svelte';

	let {
		tiles,
		targetLabel,
		bandLabel,
		caption,
		imprint
	}: {
		tiles: LaneTile[];
		targetLabel: string | null;
		bandLabel: string | null;
		caption: string | null;
		imprint: boolean;
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

<div class="lane">
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
	.lane {
		position: relative;
		display: flex;
		height: 120px;
		gap: var(--np-cell-gap);
	}
	.side {
		display: flex;
		gap: var(--np-cell-gap);
		min-width: 0;
	}
	.past {
		flex: 1 1 0;
		justify-content: flex-end;
	}
	.upcoming {
		flex: 2 1 0;
	}
	.now {
		position: absolute;
		top: calc(-1 * var(--np-step-1));
		bottom: calc(-1 * var(--np-step-1));
		left: 33.333%;
		width: 3px;
		transform: translateX(-50%);
		background: var(--np-now);
		pointer-events: none;
	}
</style>
