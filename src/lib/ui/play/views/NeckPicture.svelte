<script lang="ts">
	import { openPitch } from '$lib/domain/music';
	import type { StringNumber } from '$lib/domain/music/types';
	import NeckDiagram from './NeckDiagram.svelte';
	import type { PictureProps } from './pictures';

	let { picture }: PictureProps = $props();

	/** The six strings, the high one on top. */
	const STRINGS = ([1, 2, 3, 4, 5, 6] as const).map((string: StringNumber) => ({
		string,
		name: openPitch(string)
	}));

	const notes = $derived(
		picture.kind === 'neck'
			? picture.notes.map(({ string, fret, name, next }) => ({
					string,
					fret,
					name,
					tone: next ? ('next' as const) : ('now' as const)
				}))
			: []
	);
	const span = $derived(picture.kind === 'neck' ? picture.frets : undefined);
</script>

{#if notes.length > 0}
	<div class="neck-picture">
		<NeckDiagram {notes} strings={STRINGS} {span} />
	</div>
{/if}

<style>
	/* The frets stay close enough for one glance: the hand's span, not the view's width. */
	.neck-picture {
		max-inline-size: calc(var(--np-tile) * 72);
	}
</style>
