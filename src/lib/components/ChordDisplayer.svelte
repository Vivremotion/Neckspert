<script lang="ts">
    import ChordDiagram from '$lib/components/ChordDiagram.svelte';
    import type { Chord } from '$lib/models';

    export let chord: Chord;
</script>

<div class="chord-displayer flex flex-col items-center">
    <h2 class="text-slate-800 dark:text-slate-300 font-serif text-3xl my-4">{chord.root}{chord.quality}</h2>
    <div class="info font-mono text-slate-800 dark:text-slate-300">({chord.voicing} shape)</div>
    <ChordDiagram chord={chord}/>
</div>
