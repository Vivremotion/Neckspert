<script lang="ts">
	import ChordDiagram from '$lib/components/ChordDiagram.svelte';
	import { gameStore } from '$lib/stores/game.store';
	import type { ChordInstance } from '$lib/domain/music';

	export let instance: ChordInstance;

	$: voicing = instance.voicing;
	$: label = `${voicing.displayRoot ?? voicing.chord.root}${voicing.chord.quality}`;
</script>

<div class="chord-displayer flex flex-col items-center">
	<h2 class="text-slate-800 dark:text-slate-300 font-serif text-3xl my-4">{label}</h2>
	<div class="info font-mono text-slate-800 dark:text-slate-300">({voicing.shape.label})</div>
	{#if !$gameStore.hideDiagram}
		<ChordDiagram {voicing} />
	{/if}
</div>
