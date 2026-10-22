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
							aria-label="{t.cell(cell.string, cell.fret)}. {t.locate}: {cell.locateRecallMs == null
								? t.status[cell.locate]
								: `${t.status[cell.locate]}, ${t.recall(t.seconds(cell.locateRecallMs))}`}. {t.identify}: {t
								.status[cell.identify]}{cell.identifyMedianReactionMs == null
								? ''
								: `, ${t.seconds(cell.identifyMedianReactionMs)}`}"
						>
							<span class="pitch">{cell.pitch}</span>
							<span class="dirs">
								<span data-status={cell.locate}>
									{cell.locateRecallMs == null
										? t.status[cell.locate]
										: t.seconds(cell.locateRecallMs)}
								</span>
								<span data-status={cell.identify}>
									{cell.identifyMedianReactionMs == null
										? t.status[cell.identify]
										: t.seconds(cell.identifyMedianReactionMs)}
								</span>
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
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
	}

	.map {
		container: map / inline-size;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-2, 16px);
		padding: var(--np-space-2, 16px);
		box-sizing: border-box;
		animation: imprint 120ms ease-out both;
		background-color: var(--np-bg);
		background-image:
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%
			),
			linear-gradient(45deg, var(--np-mid) 25%, transparent 25%, transparent 75%, var(--np-mid) 75%);
		background-position:
			0 0,
			calc(var(--np-tile, 8px)) calc(var(--np-tile, 8px));
		background-size: calc(var(--np-tile, 8px) * 2) calc(var(--np-tile, 8px) * 2);
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
		max-width: 100%;
		min-width: 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}

	.cell {
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink);
		flex: 1 1 4.75rem;
		min-width: min(100%, 4.75rem);
		max-width: 100%;
		min-height: 4.5rem;
		padding: var(--np-space-1, 8px) 2px;
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
		background-color: var(--np-bg);
		background-image:
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			),
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%,
				var(--np-mid)
			);
		background-position:
			0 0,
			calc(var(--np-tile, 8px) / 2) calc(var(--np-tile, 8px) / 2);
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

	.cell.learning .pitch,
	.cell.learning .dirs {
		background: var(--np-bg);
		color: var(--np-ink);
	}

	.pitch {
		font-size: var(--np-type-body);
		text-transform: uppercase;
	}

	.dirs {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--np-type-meta);
		line-height: 1.15;
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

	@container map (min-width: 960px) {
		.cell {
			flex-basis: 0;
			min-width: 0;
		}
	}
</style>
