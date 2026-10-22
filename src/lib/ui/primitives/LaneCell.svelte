<script lang="ts" module>
	/** The mark never scales with the cell: its glyph stays about 16px, even on a phone lane. */
	export const MARK_SIZE_PX = 32;
</script>

<script lang="ts">
	import type { LaneTile } from '$lib/ui/play/lane';
	import VerdictMark from './VerdictMark.svelte';
	import { verdictTone } from './verdictTone';

	let {
		tile,
		label = null,
		imprint = false
	}: {
		tile: LaneTile;
		label?: string | null;
		imprint?: boolean;
	} = $props();

	const tone = $derived(
		tile.kind === 'history' && tile.verdict !== null ? verdictTone(tile.verdict) : null
	);
</script>

<div
	class="cell"
	data-kind={tile.kind}
	data-downbeat={tile.downbeat ? '' : undefined}
	data-past={tile.offset <= 0 ? '' : undefined}
	data-just-played={tile.justPlayed ? '' : undefined}
	data-tone={tone ?? undefined}
	data-band-edge={tile.bandEdge ?? undefined}
	data-imprint={imprint ? '' : undefined}
>
	{#if label}
		<span class="label">{label}</span>
	{/if}
	{#if tone !== null && tile.verdict !== null}
		<!-- The verdict's form under the name, at the bottom of the cell, never in its place. -->
		<span class="mark" data-with-label={label ? '' : undefined}>
			<VerdictMark verdict={tile.verdict} size={MARK_SIZE_PX} />
		</span>
	{/if}
</div>

<style>
	.cell {
		position: relative;
		flex: none;
		width: var(--cell-w);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--np-cell);
		color: var(--np-text);
		font-family: var(--np-font-text);
		font-size: var(--np-size-cell);
		font-weight: 500;
		line-height: 1;
		box-sizing: border-box;
		border: 2px solid transparent;
	}
	.cell[data-downbeat] {
		background: var(--np-cell-downbeat);
	}
	/* The past fades, except the cell just played: its verdict is read at full strength. */
	.cell[data-past]:not([data-just-played]) {
		opacity: var(--np-cell-past-opacity);
	}
	.mark {
		display: flex;
		justify-content: center;
		inline-size: 100%;
	}
	/* A fixed size: on a phone the mark may fill the cell's width, never shrink under it. */
	.mark :global(svg) {
		flex: none;
	}
	.cell:has(.mark[data-with-label]) {
		padding-block-end: var(--np-step-3);
	}
	.mark[data-with-label] {
		position: absolute;
		inset-block-end: var(--np-step-1);
		inset-inline: 0;
	}
	.cell[data-kind='target'],
	.cell[data-tone='hit'] {
		background: var(--np-on-field);
		color: var(--np-text);
	}
	.cell[data-tone='partial'] {
		background: transparent;
		border-color: var(--np-on-field);
		color: var(--np-on-field);
	}
	.cell[data-tone='miss'] {
		background: var(--np-text);
		color: var(--np-on-field);
	}
	/* One held chord, one band: each band cell spans the gap after it (its footprint on the lane
	   is unchanged), so the fill runs unbroken from its first beat to its last. */
	.cell[data-kind='band'] {
		width: calc(var(--cell-w) + var(--np-cell-gap));
		margin-inline-end: calc(-1 * var(--np-cell-gap));
		background: var(--np-cell-downbeat);
		color: var(--np-on-field);
	}
	.cell[data-band-edge='end'] {
		width: var(--cell-w);
		margin-inline-end: 0;
	}
	.cell[data-band-edge='start'] {
		border-left-color: var(--np-on-field);
	}
	.cell[data-band-edge='end'] {
		border-right-color: var(--np-on-field);
	}
	.cell[data-imprint] {
		animation: imprint var(--np-motion-imprint) var(--np-motion-ease);
	}
	@keyframes imprint {
		from {
			transform: scale(1.12);
		}
		to {
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cell[data-imprint] {
			animation: none;
		}
	}
</style>
