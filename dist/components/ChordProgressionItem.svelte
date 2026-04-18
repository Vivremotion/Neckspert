<!-- src/lib/components/ChordProgressionItem.svelte -->
<script lang="ts">
	import { progressionStore } from '../stores/chords.store.js';
	import { DEFAULT_DURATION, cycleNoteValue, NOTE_LABELS } from '../domain/music';
	import type { NoteDuration } from '../domain/music';
	import NoteSymbol from './NoteSymbol.svelte';

	export let id: string;
	export let name: string;
	export let index: number;
	export let duration: NoteDuration = DEFAULT_DURATION;
	export let isCurrent: boolean = false;

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
		progressionStore.removeInstance(id);
	}

	function cycleValue(e: Event) {
		e.stopPropagation();
		const next = cycleNoteValue(duration.value);
		progressionStore.setInstanceDuration(id, { ...duration, value: next });
	}

	function toggleDot(e: Event) {
		e.stopPropagation();
		progressionStore.setInstanceDuration(id, { ...duration, dotted: !duration.dotted });
	}
</script>

<div
	class="chord-item bg-slate-200 hover:shadow-md hover:shadow-slate-200 dark:bg-slate-600 dark:hover:shadow-slate-900"
	class:current={isCurrent}
	draggable="true"
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
	class:dragging={isDragging}
	on:mouseenter={() => (isHovering = true)}
	on:mouseleave={() => (isHovering = false)}
	role="listitem"
>
	<span class="chord-value prose prose-xl font-mono font-light dark:text-slate-200">{name}</span>

	<div class="duration-control flex items-center gap-1">
		<button
			class="note-btn text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
			on:click={cycleValue}
			aria-label="Cycle note value: {NOTE_LABELS[duration.value]}"
			title={NOTE_LABELS[duration.value]}
		>
			<NoteSymbol value={duration.value} dotted={duration.dotted} size={16} />
		</button>
		<button
			class="dot-btn text-xs font-bold leading-none"
			class:dot-active={duration.dotted}
			on:click={toggleDot}
			aria-label={duration.dotted ? 'Remove dot' : 'Add dot'}
			title={duration.dotted ? 'Dotted' : 'Not dotted'}
		>
			·
		</button>
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
		-webkit-user-select: none;
		   -moz-user-select: none;
		        user-select: none;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
		gap: 4px;
		transition: all 0.1s ease;
	}

	.dragging {
		opacity: 0.5;
		transform: scale(0.95);
	}

	.current {
		scale: 1.1;
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

	.note-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 2px;
		padding: 2px;
	}

	.note-btn:hover {
		background: rgba(100, 116, 139, 0.15);
	}

	.dot-btn {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 50%;
		font-size: 18px;
		color: rgba(100, 116, 139, 0.4);
		transition: all 0.15s ease;
	}

	.dot-btn:hover {
		color: rgba(100, 116, 139, 0.8);
	}

	.dot-active {
		color: rgb(100, 116, 139);
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
