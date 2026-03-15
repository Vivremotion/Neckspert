<!-- src/components/ChordProgressionContainer.svelte -->
<script lang="ts">
	import { chordStore } from '../stores/chords.store.js';
	import { gameStore } from '../stores/game.store.js';
	import { ChordProgressionItem } from './index.ts';

	let draggedOverIndex: number | null = null;

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		draggedOverIndex = index;
	}

	function handleDrop(e: DragEvent) {
		// e.preventDefault();
		const fromIndex = parseInt(e.dataTransfer?.getData('text/plain') || '-1');
		if (draggedOverIndex !== null && fromIndex !== -1) {
			chordStore.reorderChords(fromIndex, draggedOverIndex);
		}
		draggedOverIndex = null;
	}

	function handleDragLeave() {
		draggedOverIndex = null;
	}

  function handleClick(e: MouseEvent, id: string) {
    e.preventDefault();
    chordStore.setCurrentChord(id);
  }
</script>

<div
	class="chord-container"
	on:drop={handleDrop}
	on:dragover|preventDefault
	on:dragleave={handleDragLeave}
	role="list"
>
	{#each $chordStore?.chords as { id, root, quality='', duration }, index}
		<div class="chord-slot" on:dragover={(e) => handleDragOver(e, index)} on:click={(e) => handleClick(e, id)} role="listitem">
			<ChordProgressionItem {id} name={root+quality} {index} {duration} isCurrent={$gameStore.isPlaying && id === $chordStore.currentChord?.id} />
			{#if index < $chordStore.chords.length - 1}
				<div class="separator bg-slate-400"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.chord-container {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		padding: 16px;
		min-height: 132px;
		justify-content: center;
		align-items: flex-start;
	}
  .chord-slot {
    display: flex;
    align-items: center;
  }
	.separator {
		width: 2px;
		height: 80px;
		margin-left: 16px;
	}
	
	/* Responsive design for small screens */
	@media (max-width: 768px) {
		.chord-container {
			flex-direction: row;
			justify-content: center;
			gap: 12px;
			padding: 12px;
		}
		
		.separator {
			display: none; /* Hide separators on small screens for cleaner layout */
		}
	}
	
	/* Extra small screens */
	@media (max-width: 480px) {
		.chord-container {
			gap: 8px;
			padding: 8px;
		}
	}
</style>
