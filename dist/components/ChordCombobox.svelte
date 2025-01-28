<script lang="ts">
	import { chordStore } from '../stores/chords.store';
	import { searchChords } from '../utils/chordUtils';
  import ChordDiagram from './ChordDiagram.svelte';

	let searchTerm = '';
	let isOpen = false;
	let selectedIndex = -1;
	let dropdownElement: HTMLDivElement;
  let previewChord: Chord | null = null;

	$: matchingChords = searchChords(searchTerm);

	function handleSelect(chord: Chord) {
		searchTerm = '';
		isOpen = false;
		selectedIndex = -1;
		chordStore.addChord(chord);
	}

	function handleMouseEnter(chord: Chord) {
		previewChord = chord;
	}

	function handleMouseLeave() {
		previewChord = null;
	}

	function handleFocus(): void {
		isOpen = true;
	}

	function handleBlur(): void {
		isOpen = false;
		selectedIndex = -1;
	}

	// Reset selectedIndex when filtered items change
	$: if (matchingChords) {
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

	{#if isOpen && matchingChords.length > 0}
		<div
			class="results-container bg-slate-200 shadow-md shadow-slate-200 dark:shadow-slate-700"
			bind:this={dropdownElement}
			role="listbox"
		>
			<div class="chord-list">
				{#if matchingChords.length === 0}
					<div class="dropdown-item no-results dark:text-slate-300">
						No results found
					</div>
				{:else}
					{#each matchingChords as chord, index}
						<div
							class="dropdown-item
            border-none ring-0
            hover:bg-slate-300
            bg-slate-100 dark:bg-slate-600
            dark:text-slate-200 dark:hover:bg-slate-700"
							class:selected={index === selectedIndex}
              on:mouseenter={() => handleMouseEnter(chord)}
              on:mouseleave={handleMouseLeave}
							on:mousedown={() => handleSelect(chord)}
							role="option"
							tabindex={index}
							aria-selected={index === selectedIndex}
						>
							{chord.root}{chord.quality} ({chord.voicing} shape)
						</div>
					{/each}
				{/if}
			</div>
      {#if previewChord}
        <div class="preview bg-slate-100 dark:bg-slate-600 absolute top-52">
          <ChordDiagram chord={previewChord} />
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

	.search-input {
		width: 100%;
		padding: 8px 12px;
		font-size: 16px;
	}

	.chord-list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 10;
		border-radius: 4px;
		max-height: 200px;
		overflow-y: auto;
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
