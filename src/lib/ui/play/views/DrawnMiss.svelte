<script lang="ts">
	import type { MissView } from '$lib/application/presentation/contentViews';
	import type { ChordDiagramStyle } from '$lib/domain/types';
	import { playMessages } from '../messages';
	import { PICTURE_VIEWS } from './pictures';

	/**
	 * A miss drawn as the play frame drew its verdict: what was played, what was due (their
	 * pictures, chord shapes in `chordDiagram`), the gap.
	 */
	let { miss, chordDiagram }: { miss: MissView; chordDiagram: ChordDiagramStyle } = $props();

	const t = $derived(playMessages());
</script>

<div class="miss" data-testid="miss">
	<div class="drawn">
		{#if miss.heard}
			{@const Heard = PICTURE_VIEWS[miss.heard.kind]}
			<div class="drawn-part">
				<p class="label">{t.played}</p>
				<Heard picture={miss.heard} {chordDiagram} size="small" />
			</div>
		{/if}
		{#if miss.expected}
			{@const Expected = PICTURE_VIEWS[miss.expected.kind]}
			<div class="drawn-part">
				<p class="label">{t.expected}</p>
				<Expected picture={miss.expected} {chordDiagram} size="small" />
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
