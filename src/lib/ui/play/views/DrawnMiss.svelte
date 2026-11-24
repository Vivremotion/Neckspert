<script lang="ts">
	import type { MissView } from '$lib/application/presentation/contentViews';
	import type { ChordDiagramStyle } from '$lib/domain/types';
	import { playMessages } from '../messages';
	import { PICTURE_VIEWS } from './pictures';

	/**
	 * A miss drawn as the notes' lane draws its own: what was played, what was due (their
	 * pictures, chord shapes in `chordDiagram`), the gap between them in words.
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
		<p class="gap">{miss.gap}</p>
	{/if}
</div>

<style>
	.miss {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-step-3);
		font-family: var(--np-font-text);
	}

	.drawn {
		display: flex;
		justify-content: center;
		gap: var(--np-step-6);
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: var(--np-step-1);
	}

	.label,
	.gap {
		margin: 0;
		font-size: var(--np-size-meta);
		text-align: center;
	}
</style>
