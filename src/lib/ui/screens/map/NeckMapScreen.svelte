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
	<header class="title">
		<PixelText scale={3}>{t.title}</PixelText>
	</header>
	<div class="cartridge">
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
	</div>
	<PixelButton size="large" onclick={onhome}>{t.home}</PixelButton>
</section>

<style>
	.map {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-2, 16px);
		padding: var(--np-space-2, 16px);
		box-sizing: border-box;
		animation: imprint 120ms ease-out both;
	}

	.title {
		margin-block-end: var(--np-space-1, 8px);
	}

	.cartridge {
		width: 100%;
		max-width: 56rem;
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink);
		outline: calc(var(--np-tile, 8px) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile, 8px) / 2);
		padding: var(--np-space-1, 8px);
		box-sizing: border-box;
		background: var(--np-bg);
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		overflow-x: auto;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(12, minmax(2.5rem, 1fr));
		gap: 2px;
	}

	.cell {
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink);
		min-height: 3rem;
		padding: 2px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		font-family: var(--np-font-pixel);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		background: var(--np-mid);
		color: var(--np-ink);
		box-sizing: border-box;
	}

	.cell.learning {
		background-color: var(--np-mid);
		background-image: linear-gradient(
			45deg,
			var(--np-ink) 25%,
			transparent 25%,
			transparent 50%,
			var(--np-ink) 50%,
			var(--np-ink) 75%,
			transparent 75%,
			transparent
		);
		background-size: var(--np-tile, 8px) var(--np-tile, 8px);
	}

	.cell.acquired {
		background: var(--np-shade);
		color: var(--np-bg);
	}

	.cell.mastered {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.pitch {
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.dirs {
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-size: 0.55rem;
		line-height: 1.1;
		text-transform: uppercase;
	}

	@keyframes imprint {
		from {
			transform: scale(0.98);
			opacity: 0.85;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.map {
			animation: none;
		}
	}
</style>
