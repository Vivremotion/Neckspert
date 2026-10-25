<script lang="ts">
	import type { DrawnMiss } from '$lib/application/mechanics/chordGrid';
	import { i18n } from '$lib/i18n/index.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import { playMessages } from '../messages';

	/** A miss drawn as the play frame drew its verdict: what was played, what was due, the gap. */
	let { miss }: { miss: DrawnMiss } = $props();

	const t = $derived(playMessages());
</script>

<div class="miss" data-testid="miss">
	<div class="drawn">
		{#if miss.heard}
			<div class="drawn-part">
				<p class="label">{t.played}</p>
				<ChordShape shape={miss.heard} style={miss.style} locale={i18n.locale} size="small" />
			</div>
		{/if}
		{#if miss.expected}
			<div class="drawn-part">
				<p class="label">{t.expected}</p>
				<ChordShape shape={miss.expected} style={miss.style} locale={i18n.locale} size="small" />
			</div>
		{/if}
	</div>
	{#if miss.gap}
		<p class="label">{miss.gap}</p>
	{/if}
</div>

<style>
	.miss {
		display: grid;
		justify-items: center;
		gap: var(--np-space-1, 8px);
	}

	.drawn {
		display: flex;
		gap: var(--np-space-3, 24px);
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	.label {
		margin: 0;
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
		text-transform: uppercase;
	}
</style>
