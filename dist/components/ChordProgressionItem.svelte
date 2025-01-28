<!-- src/lib/components/ChordProgressionItem.svelte -->
<script lang="ts">
	import { chordStore } from '../stores/chords.store.js';

	export let id: string = null;
	export let name: string = '';
	export let index: number = -1;

	let isDragging = false;
	let isHovering = false;

	function handleDragStart(e: DragEvent) {
		isDragging = true;
		e.dataTransfer?.setData('text/plain', index.toString());
	}

	function handleDragEnd() {
		isDragging = false;
	}

  function handleClickRemove(e: ClickEvent) {
    e.stopPropagation();
    chordStore.removeChord(id);
  }
</script>

<div
	class="chord-item hover:shadow-md hover:shadow-slate-200 dark:hover:shadow-slate-900 dark:bg-slate-600"
	draggable="true"
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
	class:dragging={isDragging}
	on:mouseenter={() => (isHovering = true)}
	on:mouseleave={() => (isHovering = false)}
	role="listitem"
>
	<span class="chord-value prose prose-xl font-mono font-light dark:text-slate-200">{name}</span>
	{#if isHovering}
		<button
			class="remove-button text-xl font-thin dark:text-slate-200 dark:hover:text-slate-400"
			on:click={handleClickRemove}
			aria-label="Remove chord"
		>
			×
		</button>
	{/if}
</div>

<style>
	.chord-item {
		position: relative;
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		-webkit-user-select: none;
		   -moz-user-select: none;
		        user-select: none;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
	}

	.dragging {
		opacity: 0.5;
		transform: scale(0.95);
  }

	.remove-button {
		position: absolute;
    top: 0;
		right: 5px;
		width: 24px;
		height: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
