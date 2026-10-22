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
		/** The prompted string (the prompt names it in words above); null hides the drawing. */
		diagram: { string: StringNumber } | null;
	} = $props();

	/** Tab order: high E on top. */
	const STRINGS: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];
</script>

{#if STRING_DIAGRAM_AID && diagram}
	<div class="diagram" data-string={diagram.string} aria-hidden="true">
		{#each STRINGS as string (string)}
			<div class="row" class:target={string === diagram.string}>
				<span class="line"></span>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* Six strings in the tone of the field, the prompted one thicker: an aid that goes away. No letter
	   beside them, so the drawing sits on the prompt's axis. */
	.diagram {
		display: grid;
		gap: 0;
		inline-size: 240px;
		max-inline-size: 100%;
		padding-block: var(--np-step-1);
	}

	.row {
		display: flex;
		align-items: center;
		block-size: 12px;
	}

	.line {
		display: block;
		flex: 1;
		block-size: 1px;
		background: var(--np-on-field);
		opacity: 0.45;
	}

	.target .line {
		block-size: 4px;
		opacity: 1;
	}
</style>
