<!-- src/lib/components/ChordProgressionItem.svelte -->
<script lang="ts">
	import { chordStore } from '$lib/stores/chords.store.js';
	import { DEFAULT_BEATS } from '$lib/models';

	export let id: string = null;
	export let name: string = '';
	export let index: number = -1;
	export let beats: number = DEFAULT_BEATS;

	let isDragging = false;
	let isHovering = false;

	function handleDragStart(e: DragEvent) {
		isDragging = true;
		e.dataTransfer?.setData('text/plain', index.toString());
	}

	function handleDragEnd() {
		isDragging = false;
	}

	function handleClickRemove(e: Event) {
		e.stopPropagation();
		chordStore.removeChord(id);
	}

	function adjustBeats(delta: number, e: Event) {
		e.stopPropagation();
		chordStore.setChordBeats(id, beats + delta);
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

	<div class="beats-control flex items-center gap-1">
		<button
			class="beat-btn text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
			on:click={(e) => adjustBeats(-1, e)}
			disabled={beats <= 1}
			aria-label="Decrease beats"
		>−</button>
		<span class="text-xs font-mono text-slate-500 dark:text-slate-400">{beats}♩</span>
		<button
			class="beat-btn text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
			on:click={(e) => adjustBeats(1, e)}
			disabled={beats >= 16}
			aria-label="Increase beats"
		>+</button>
	</div>

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
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: grab;
		user-select: none;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
		gap: 4px;
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

	.beat-btn {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 2px;
	}

	.beat-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.beat-btn:hover:not(:disabled) {
		background: rgba(100, 116, 139, 0.15);
	}

	/* Responsive design for small screens */
	@media (max-width: 768px) {
		.chord-item {
			width: 80px;
			height: 80px;
		}

		.chord-value {
			font-size: 1.25rem;
		}

		.remove-button {
			width: 20px;
			height: 20px;
			right: 3px;
			top: 2px;
		}
	}

	/* Extra small screens */
	@media (max-width: 480px) {
		.chord-item {
			width: 70px;
			height: 70px;
		}

		.chord-value {
			font-size: 1.125rem;
		}

		.remove-button {
			width: 18px;
			height: 18px;
			right: 2px;
			top: 1px;
		}
	}
</style>
