<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
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

<Page title={t.title} wide>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex: a scrollable region must take focus so the keyboard can scroll it -->
	<div class="frame" role="region" tabindex="0" aria-label={t.board}>
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
									{#if cell.locate === 'unseen' && cell.identify !== 'unseen'}
										<span aria-hidden="true">&nbsp;</span>
									{:else if cell.locate !== 'unseen'}
										{cell.locateRecallMs == null
											? t.status[cell.locate]
											: t.seconds(cell.locateRecallMs)}
									{/if}
								</span>
								<span data-status={cell.identify}>
									{#if cell.identify === 'unseen' && cell.locate !== 'unseen'}
										<span aria-hidden="true">&nbsp;</span>
									{:else if cell.identify !== 'unseen'}
										{cell.identifyMedianReactionMs == null
											? t.status[cell.identify]
											: t.seconds(cell.identifyMedianReactionMs)}
									{/if}
								</span>
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
	<footer>
		<Button variant="quiet" onclick={onhome}>{t.home}</Button>
	</footer>
</Page>

<style>
	.frame {
		margin-top: var(--np-step-6);
		overflow-x: auto;
		padding-bottom: var(--np-step-1);
	}

	.frame:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: max-content;
		min-width: 100%;
	}

	.row {
		display: flex;
		gap: 2px;
	}

	.cell {
		flex: 1 0 var(--np-step-8);
		min-width: var(--np-step-8);
		min-height: var(--np-step-8);
		box-sizing: border-box;
		padding: var(--np-step-1);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		border: 1px solid var(--np-rule);
		background: transparent;
		color: var(--np-text);
		font-variant-numeric: tabular-nums;
	}

	.cell.learning {
		border: 1px solid var(--np-text);
	}

	.cell.acquired {
		border: 2px solid var(--np-text);
	}

	.cell.mastered {
		border: 1px solid var(--np-text);
		background: var(--np-text);
		color: var(--np-ground);
	}

	.pitch {
		font-size: var(--np-size-body);
		font-weight: 500;
	}

	.dirs {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--np-size-meta);
		line-height: 1.15;
	}

	footer {
		margin-top: var(--np-step-4);
	}
</style>
