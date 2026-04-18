<script lang="ts">
	import { progressionStore } from '$lib/stores/chords.store';
	import { searchVoicings } from '$lib/domain/music';
	import ChordDiagram from '$lib/components/ChordDiagram.svelte';
	import type { Voicing } from '$lib/domain/music';

	let searchTerm = '';
	let isOpen = false;
	let selectedIndex = -1;
	let dropdownElement: HTMLDivElement;
	let previewVoicing: Voicing | null = null;

	$: matchingVoicings = searchVoicings(searchTerm);

	function handleSelect(voicing: Voicing) {
		searchTerm = '';
		isOpen = false;
		selectedIndex = -1;
		progressionStore.addInstance(voicing);
	}

	function handleMouseEnter(voicing: Voicing) {
		previewVoicing = voicing;
	}

	function handleMouseLeave() {
		previewVoicing = null;
	}

	function handleFocus(): void {
		isOpen = true;
	}

	function handleBlur(): void {
		isOpen = false;
		selectedIndex = -1;
	}

	$: if (matchingVoicings) {
		selectedIndex = -1;
	}
</script>

<div class="search-container font-extralight">
	<input
		type="text"
		bind:value={searchTerm}
		on:focus={handleFocus}
		on:blur={handleBlur}
		placeholder="Search a chord"
		class="search-input
      border-0 border-b-2
      font-light text-slate-400 focus:ring-0
      dark:bg-slate-800
      dark:focus:border-slate-400"
		aria-expanded={isOpen}
		aria-controls="dropdown"
		role="combobox"
	/>

	{#if isOpen && matchingVoicings.length > 0}
		<div
			class="results-container bg-slate-200 shadow-md shadow-slate-200 dark:bg-slate-700 dark:shadow-slate-900"
			bind:this={dropdownElement}
			role="listbox"
		>
			<div class="chord-list">
				{#if matchingVoicings.length === 0}
					<div class="dropdown-item no-results dark:text-slate-300">No results found</div>
				{:else}
					{#each matchingVoicings as voicing, index}
						<div
							class="dropdown-item
            border-none bg-slate-100
            ring-0
            hover:bg-slate-300 dark:bg-slate-600
            dark:text-slate-200 dark:hover:bg-slate-700"
							class:selected={index === selectedIndex}
							on:mouseenter={() => handleMouseEnter(voicing)}
							on:mouseleave={handleMouseLeave}
							on:mousedown={() => handleSelect(voicing)}
							role="option"
							tabindex={index}
							aria-selected={index === selectedIndex}
						>
							{voicing.displayRoot ?? voicing.chord.root}{voicing.chord.quality} ({voicing.shape.label})
						</div>
					{/each}
				{/if}
			</div>
			{#if previewVoicing}
				<div
					class="preview-diagram-wrapper bg-slate-100 shadow-md
           shadow-slate-200 dark:bg-slate-600 dark:shadow-slate-900"
				>
					<ChordDiagram voicing={previewVoicing} />
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-container {
		position: relative;
		width: 300px;
	}

	.results-container {
		position: absolute;
		top: 100%;
		left: 0;
		width: 100%;
		z-index: 50;
		border-radius: 4px;
		overflow: visible;
		margin-top: 4px;
	}

	.search-input {
		width: 100%;
		padding: 8px 12px;
		font-size: 16px;
	}

	.chord-list {
		position: relative;
		width: 100%;
		z-index: 1;
		border-radius: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.preview-diagram-wrapper {
		position: relative;
		width: 100%;
		z-index: 2;
		margin-top: 4px;
		display: flex;
		justify-content: center;
		align-items: center;
		border-radius: 4px;
		padding: 8px;
	}

	.dropdown-item {
		padding: 8px 12px;
		cursor: pointer;
	}

	.no-results {
		font-style: italic;
		cursor: default;
	}
</style>
