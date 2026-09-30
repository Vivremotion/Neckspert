<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { cellsByString } from './neckGrid';
	import { mapMessages } from './messages';

	let {
		cells,
		onhome
	}: {
		cells: NeckMapCell[];
		onhome: () => void;
	} = $props();

	const t = $derived(mapMessages());
	const rows = $derived(cellsByString(cells));
</script>

<section class="map">
	<PixelText scale={3}>{t.title}</PixelText>
	<div class="board" role="grid" aria-label={t.title}>
		{#each rows as row (row[0].string)}
			<div class="row" role="row">
				{#each row as cell (cell.fret)}
					<div
						class="cell"
						class:mastered={cell.locate === 'mastered' || cell.identify === 'mastered'}
						class:acquired={cell.locate === 'acquired' || cell.identify === 'acquired'}
						class:learning={cell.locate === 'learning' || cell.identify === 'learning'}
						role="gridcell"
						aria-label="{t.cell(cell.string, cell.fret)}. {t.locate}: {t.status[
							cell.locate
						]}. {t.identify}: {t.status[cell.identify]}"
					>
						<span class="pitch">{cell.pitch}</span>
						<span class="dirs">
							<span data-status={cell.locate}>{t.status[cell.locate]}</span>
							<span data-status={cell.identify}>{t.status[cell.identify]}</span>
						</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
	<PixelButton size="large" onclick={onhome}>{t.home}</PixelButton>
</section>

<style>
	.map {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(2 * var(--np-tile, 8px));
		padding: calc(2 * var(--np-tile, 8px));
		box-sizing: border-box;
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		max-width: 56rem;
		overflow-x: auto;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(12, minmax(2.5rem, 1fr));
		gap: 2px;
	}

	.cell {
		border: 2px solid var(--np-ink, #451218);
		min-height: 3rem;
		padding: 2px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		font-variant-numeric: tabular-nums;
		background: var(--np-mid, #be6754);
		color: var(--np-ink, #451218);
	}

	.cell.learning {
		background-image: linear-gradient(
			45deg,
			var(--np-ink, #451218) 25%,
			transparent 25%,
			transparent 50%,
			var(--np-ink, #451218) 50%,
			var(--np-ink, #451218) 75%,
			transparent 75%,
			transparent
		);
		background-size: 4px 4px;
	}

	.cell.acquired {
		background: var(--np-shade, #813b2a);
		color: var(--np-bg, #e99568);
	}

	.cell.mastered {
		background: var(--np-ink, #451218);
		color: var(--np-bg, #e99568);
	}

	.pitch {
		font-size: 0.75rem;
	}

	.dirs {
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-size: 0.55rem;
		line-height: 1.1;
		text-transform: uppercase;
	}
</style>
