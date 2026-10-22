<script module lang="ts">
	/**
	 * Trial of 2026-10-04: the prompted string, drawn under the prompt while a note is learned.
	 * False removes it everywhere and leaves the play screen as it was; nothing else depends on it.
	 */
	export const STRING_DIAGRAM_AID = true;
</script>

<script lang="ts">
	import type { StringNumber } from '$lib/domain/music/types';

	let {
		diagram
	}: {
		/** The prompted string and the open note it is named after; null hides the drawing. */
		diagram: { string: StringNumber; label: string } | null;
	} = $props();

	/** Tab order: high E on top. */
	const STRINGS: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];
</script>

{#if STRING_DIAGRAM_AID && diagram}
	<div class="diagram" data-string={diagram.string} aria-hidden="true">
		{#each STRINGS as string (string)}
			<div class="row" class:target={string === diagram.string}>
				<span class="letter">{string === diagram.string ? diagram.label : ''}</span>
				<span class="line"></span>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* Six strings in the tone of the field, the prompted one thicker with its letter: an aid that goes away. */
	.diagram {
		display: grid;
		gap: 0;
		inline-size: min(240px, 100%);
		padding-block: var(--np-step-1);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
	}

	.row {
		display: grid;
		grid-template-columns: var(--np-step-3) 1fr;
		align-items: center;
		block-size: 12px;
	}

	.letter {
		font-size: var(--np-size-meta);
		line-height: 1;
		text-align: center;
	}

	.line {
		display: block;
		block-size: 1px;
		background: var(--np-on-field);
		opacity: 0.45;
	}

	/* Tall enough for its letter, which never spills over the next strings. */
	.row.target {
		block-size: calc(var(--np-size-meta) + 4px);
	}

	.target .line {
		block-size: 4px;
		opacity: 1;
	}
</style>
