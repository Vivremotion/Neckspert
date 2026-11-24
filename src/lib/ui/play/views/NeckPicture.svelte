<script lang="ts">
	import { TRIAD_STRING_NAMES } from '$lib/application/presentation/triadMessages';
	import { openPitch } from '$lib/domain/music';
	import type { StringNumber } from '$lib/domain/music/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import NeckDiagram from './NeckDiagram.svelte';
	import type { PictureProps } from './pictures';

	let { picture }: PictureProps = $props();

	/** The six strings, the high one on top, named by their open note. */
	const SIX = ([1, 2, 3, 4, 5, 6] as const).map((string: StringNumber) => ({
		string,
		name: openPitch(string)
	}));

	/**
	 * The strings drawn, the high one on top: those the picture names (low to high), named as a
	 * prompt names them (« sol‑si‑mi »); else all six.
	 */
	const strings = $derived(
		picture.kind === 'neck' && picture.strings
			? [...picture.strings]
					.reverse()
					.map((string) => ({ string, name: TRIAD_STRING_NAMES[i18n.locale][string] }))
			: SIX
	);

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
		<NeckDiagram {notes} {strings} {span} />
	</div>
{/if}

<style>
	/* The frets stay close enough for one glance: the hand's span, unless the view gives the neck
	its width (`--neck-max`). A span too wide for the room scrolls in its row rather than
	squeezing its frets. */
	.neck-picture {
		max-inline-size: var(--neck-max, calc(var(--neck-tile, var(--np-tile)) * 72));
		overflow-x: auto;
	}
</style>
