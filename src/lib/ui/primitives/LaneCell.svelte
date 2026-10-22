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
	data-tone={tone ?? undefined}
	data-band-edge={tile.bandEdge ?? undefined}
	data-imprint={imprint ? '' : undefined}
>
	{#if tone !== null && tile.verdict !== null}
		<VerdictMark verdict={tile.verdict} size={28} />
	{:else if label}
		<span class="label">{label}</span>
	{/if}
	{#if caption}
		<span class="caption">{caption}</span>
	{/if}
</div>

<style>
	.cell {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--np-cell);
		color: var(--np-text);
		font-family: var(--np-font-text);
		font-size: var(--np-size-title);
		box-sizing: border-box;
		border: 2px solid transparent;
	}
	.cell[data-downbeat] {
		background: var(--np-cell-downbeat);
	}
	.cell[data-past] {
		opacity: var(--np-cell-past-opacity);
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
		margin-top: var(--np-step-1);
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
