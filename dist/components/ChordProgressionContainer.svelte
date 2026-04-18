<!-- src/components/ChordProgressionContainer.svelte -->
<script lang="ts">
	import { progressionStore } from '../stores/chords.store.js';
	import { gameStore } from '../stores/game.store.js';
	import { ChordProgressionItem } from './index.ts';

	let draggedOverIndex: number | null = null;

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		draggedOverIndex = index;
	}

	function handleDrop(e: DragEvent) {
		const fromIndex = parseInt(e.dataTransfer?.getData('text/plain') || '-1');
		if (draggedOverIndex !== null && fromIndex !== -1) {
			progressionStore.reorderInstances(fromIndex, draggedOverIndex);
		}
		draggedOverIndex = null;
	}

	function handleDragLeave() {
		draggedOverIndex = null;
	}

	function handleClick(e: MouseEvent, id: string) {
		e.preventDefault();
		progressionStore.setCurrentInstance(id);
	}
</script>

<div
	class="chord-container"
	on:drop={handleDrop}
	on:dragover|preventDefault
	on:dragleave={handleDragLeave}
	role="list"
>
	{#each $progressionStore?.instances as instance, index}
		{@const { id, voicing, duration } = instance}
		{@const name = (voicing.displayRoot ?? voicing.chord.root) + voicing.chord.quality}
		<div class="chord-slot" on:dragover={(e) => handleDragOver(e, index)} on:click={(e) => handleClick(e, id)} role="listitem">
			<ChordProgressionItem
				{id}
				{name}
				{index}
				{duration}
				isCurrent={$gameStore.isPlaying && id === $progressionStore.currentInstance?.id}
			/>
			{#if index < $progressionStore.instances.length - 1}
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

	@media (max-width: 768px) {
		.chord-container {
			flex-direction: row;
			justify-content: center;
			gap: 12px;
			padding: 12px;
		}

		.separator {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.chord-container {
			gap: 8px;
			padding: 8px;
		}
	}
</style>
