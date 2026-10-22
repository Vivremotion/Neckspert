<script lang="ts">
	import type { LaneTile } from '$lib/ui/play/lane';
	import VerdictMark from './VerdictMark.svelte';
	import { verdictTone } from './verdictTone';

	let {
		tile,
		label = null,
		caption = null,
		imprint = false
	}: {
		tile: LaneTile;
		label?: string | null;
		caption?: string | null;
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
			<VerdictMark verdict={tile.verdict} size={28} />
		</span>
	{/if}
	{#if caption}
		<span class="caption">{caption}</span>
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
	.mark :global(svg) {
		inline-size: min(28px, 70%);
		block-size: auto;
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
	.cell[data-kind='band'] {
		background: var(--np-cell-downbeat);
		color: var(--np-on-field);
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
	.caption {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		/* Below the now line's overhang. */
		margin-top: var(--np-step-3);
		font-size: var(--np-size-meta);
		color: var(--np-on-field);
		white-space: nowrap;
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
