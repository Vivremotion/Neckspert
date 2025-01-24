<!-- src/lib/components/ChordDiagram.svelte -->
<script lang="ts">
	import type { Chord, Note } from '$lib/models';
	import { calculateInterval } from '$lib/utils/musicTheory';

	export let chord: Chord;

	// SVG dimensions and spacing
	const width = 240;
	const height = 260;
	const stringSpacing = 30;
	const fretSpacing = 45;
	const topMargin = 40;
	const leftMargin = 45;
	const dotRadius = 12;

	// Calculate fret range
	$: frettedNotes = chord.notes.filter((n) => n.fret > 0);
	$: minFret = Math.min(...chord.notes.map((n) => n.fret || 0));
	$: maxFret = Math.max(...chord.notes.map((n) => n.fret || 0));
	$: fretRange = maxFret - minFret;
	$: displayedFrets = Math.max(4, fretRange);

	// Get all strings that should be marked with an X (not played)
	$: mutedStrings = [1, 2, 3, 4, 5, 6].filter(
		(string) => !chord.notes.some((note) => note.string === string)
	);

	// Get all notes playing an open string (fret is falsy, even if that should not happen)
	$: openStringNotes = chord.notes.filter((note) => !note.fret);

	// State for hover effects
	let hoveredNote: Note | null = null;

	// Helper functions
	function getStringX(string: number): number {
		// Remember string 1 is rightmost
		return leftMargin + (6 - string) * stringSpacing;
	}

	function getFretY(fret: number): number {
		const relativePosition = fret - minFret;
		return topMargin + relativePosition * fretSpacing + (minFret === 0 ? (-fretSpacing / 2) : (fretSpacing / 2));
	}

	function isRoot(note: Note): boolean {
		return note.name === chord.root;
	}
</script>

<svg {width} {height}>
	<!-- Fret number -->
	{#if minFret > 0}
		<text x={leftMargin / 2} y={topMargin + fretSpacing / 2} class="fret-number text-xl fill-slate-800 dark:fill-slate-300">
			{minFret}
		</text>
	{/if}

	<!-- Vertical lines (strings) -->
	{#each Array(6) as _, i}
		<line
			x1={getStringX(i + 1)}
			y1={topMargin}
			x2={getStringX(i + 1)}
			y2={topMargin + displayedFrets * fretSpacing}
			class="string stroke-slate-800 dark:stroke-slate-300"
		/>
	{/each}

	<!-- Horizontal lines (frets, +1 for the last at the bottom) -->
	{#each Array(displayedFrets + 1) as _, i}
		<line
			x1={getStringX(6)}
			y1={topMargin + i * fretSpacing}
			x2={getStringX(1)}
			y2={topMargin + i * fretSpacing}
			class="fret stroke-slate-800 dark:stroke-slate-300"
			class:nut={minFret === 0 && i === 0}
		/>
	{/each}

	<!-- Muted strings (X) -->
	{#each mutedStrings as string}
		<text
			x={getStringX(string)}
			y={topMargin / 2}
			class="muted text-2xl fill-slate-800 dark:fill-slate-300"
		>
			×
		</text>
	{/each}

	<!-- Open strings (○) -->
	{#each openStringNotes as note}
		<g
      on:mouseenter={() => (hoveredNote = note)}
      on:mouseleave={() => (hoveredNote = null)}>
			<circle
				cx={getStringX(note.string)}
				cy={topMargin / 2}
				r={dotRadius}
				class="open-string fill-transparent stroke-2 stroke-slate-800 dark:stroke-slate-300"
				class:root={isRoot(note)}
			/>
			<text x={getStringX(note.string)} y={topMargin / 2} class="note-name text-l fill-slate-800 dark:fill-slate-300">
				{hoveredNote?.string === note.string
					? calculateInterval(chord.root, hoveredNote.name)
					: note.name}
			</text>
		</g>
	{/each}

	<!-- Fretted notes (●) -->
	{#each frettedNotes as note}
		<g
      on:mouseenter={() => (hoveredNote = note)}
      on:mouseleave={() => (hoveredNote = null)}>
			<circle
				cx={getStringX(note.string)}
				cy={getFretY(note.fret)}
				r={dotRadius}
				class="fretted-note fill-slate-800 dark:fill-slate-300"
				class:root={isRoot(note)}
			/>
			<text x={getStringX(note.string)} y={getFretY(note.fret)} class="note-name fill-slate-300 dark:fill-slate-800">
				{hoveredNote === note ? calculateInterval(chord.root, note.name) : note.name}
			</text>
		</g>
	{/each}

	<!-- Finger numbers -->
	{#each chord.notes.filter((n) => n.finger !== undefined && n.fret !== 0) as note}
		<text
			x={getStringX(note.string)}
			y={topMargin * 1.5 + displayedFrets * fretSpacing}
			class="finger-number text-xl fill-slate-800 dark:fill-slate-300"
		>
			{note.finger}
		</text>
	{/each}
</svg>

<style>
	svg {
		user-select: none;
	}

	.string, .fret {
		stroke-width: 2;
	}

	.nut {
		stroke-width: 3;
	}

	.fret-number {
		text-anchor: end;
		dominant-baseline: middle;
	}

	.fretted-note,
	.open-string,
	.muted,
	.note-name,
	.finger-number {
		text-anchor: middle;
		dominant-baseline: central;
	}

	.root {
		fill: teal;
	}
</style>
