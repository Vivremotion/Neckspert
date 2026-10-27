<script lang="ts">
	import type { Picture } from '$lib/application/presentation/pictures';
	import type { PictureProps } from './pictures';
	import StringDiagram from '../StringDiagram.svelte';

	let { picture }: PictureProps = $props();

	const drawn: Extract<Picture, { kind: 'string' }> | null = $derived(
		picture.kind === 'string' ? picture : null
	);
</script>

<StringDiagram diagram={drawn} />
