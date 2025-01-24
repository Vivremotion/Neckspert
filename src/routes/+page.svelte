<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import {
		ChordCombobox,
		ChordProgressionContainer,
		ChordDisplayer,
		PlayCommands
	} from '$lib/components';
	import { chordStore } from '$lib/stores/chords.store';
	import { HPCPDetector } from '$lib/services/HPCPDetector/HPCPDetector.ts';
	import { TrainerManager } from '$lib/services/TrainerManager.ts';

	onMount(() => {
		setContext('hpcpDetector', new HPCPDetector());
		setContext('trainerManager', new TrainerManager());
	})
</script>

<div class="app dark:bg-slate-800">
	<header>
		<h1 class="title prose font-serif text-4xl dark:prose-invert">Neckspert</h1>
	</header>
	<div class="top">
		<ChordCombobox items={['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']} />
		<div class="flex items-center">
			<ChordProgressionContainer />
			{#if $chordStore?.chords?.length}
				<PlayCommands />
			{/if}
		</div>
	</div>

	{#if $chordStore?.currentChord}
  <ChordDisplayer chord={$chordStore?.currentChord} />
  {/if}
</div>

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 48px;
		padding: 48px;
	}
	.top {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
	}
</style>
