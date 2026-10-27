<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import type { PictureProps } from './pictures';

	let { picture, chordDiagram, size = 'aid' }: PictureProps = $props();
</script>

{#if picture.kind === 'shape'}
	<ChordShape shape={picture} style={chordDiagram} locale={i18n.locale} {size} />
{/if}
