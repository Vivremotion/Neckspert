<!-- src/lib/components/ChordDiagram.svelte -->
<script lang="ts">
	import type { Voicing } from '$lib/domain/music';
	import type { Position } from '$lib/domain/music';
	import { getDisplayPitchName, CHROMATIC_NOTES } from '$lib/domain/music';

	export let voicing: Voicing;

	// SVG dimensions and spacing
	const width = 240;
	const height = 260;
	const stringSpacing = 30;
	const fretSpacing = 45;
	const topMargin = 40;
	const leftMargin = 45;
	const dotRadius = 12;

	// Interval abbreviations (semitone distance from root)
	const INTERVAL_NAMES: Record<number, string> = {
		0: 'R', 1: 'm2', 2: 'M2', 3: 'm3', 4: '3',
		5: '4', 6: 'TT', 7: '5', 8: 'm6', 9: 'M6', 10: '7', 11: 'M7'
	};

	function calculateInterval(pitchName: string): string {
		const rootIndex = CHROMATIC_NOTES.indexOf(voicing.chord.root);
		const noteIndex = CHROMATIC_NOTES.indexOf(pitchName as typeof CHROMATIC_NOTES[number]);
		const dist = (noteIndex - rootIndex + 12) % 12;
		return INTERVAL_NAMES[dist] ?? pitchName;
	}

	// Calculate fret range
	$: frettedPositions = voicing.positions.filter((p) => p.fret > 0);
	$: minFret = Math.min(...voicing.positions.map((p) => p.fret || 0));
	$: maxFret = Math.max(...voicing.positions.map((p) => p.fret || 0));
	$: fretRange = maxFret - minFret;
	$: displayedFrets = Math.max(4, fretRange);

	// Strings not present in voicing are muted
	$: mutedStrings = [1, 2, 3, 4, 5, 6].filter(
		(s) => !voicing.positions.some((p) => p.string === s)
	);

	// Open string positions
	$: openPositions = voicing.positions.filter((p) => !p.fret);

	// Hovering state
	let hoveredPosition: Position | null = null;

	function getStringX(string: number): number {
		return leftMargin + (6 - string) * stringSpacing;
	}

	function getFretY(fret: number): number {
		const relativePosition = fret - minFret;
		return topMargin + relativePosition * fretSpacing + (minFret === 0 ? -fretSpacing / 2 : fretSpacing / 2);
	}

	function isRoot(pos: Position): boolean {
		const pitch = voicing.pitches[voicing.positions.indexOf(pos)];
		return pitch === voicing.chord.root;
	}

	function getPitchAt(pos: Position): string {
		const idx = voicing.positions.indexOf(pos);
		const pitch = voicing.pitches[idx];
		return getDisplayPitchName(pitch, voicing.displayRoot);
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

	<!-- Horizontal lines (frets) -->
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

	<!-- Muted strings (×) -->
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
	{#each openPositions as pos}
		<g
			on:mouseenter={() => (hoveredPosition = pos)}
			on:mouseleave={() => (hoveredPosition = null)}
		>
			<circle
				cx={getStringX(pos.string)}
				cy={topMargin / 2}
				r={dotRadius}
				class="open-string fill-transparent stroke-2 stroke-slate-800 dark:stroke-slate-300"
				class:root={isRoot(pos)}
			/>
			<text x={getStringX(pos.string)} y={topMargin / 2} class="note-name text-l fill-slate-800 dark:fill-slate-300">
				{hoveredPosition === pos ? calculateInterval(getPitchAt(pos)) : getPitchAt(pos)}
			</text>
		</g>
	{/each}

	<!-- Fretted notes (●) -->
	{#each frettedPositions as pos}
		<g
			on:mouseenter={() => (hoveredPosition = pos)}
			on:mouseleave={() => (hoveredPosition = null)}
		>
			<circle
				cx={getStringX(pos.string)}
				cy={getFretY(pos.fret)}
				r={dotRadius}
				class="fretted-note fill-slate-800 dark:fill-slate-300"
				class:root={isRoot(pos)}
			/>
			<text x={getStringX(pos.string)} y={getFretY(pos.fret)} class="note-name fill-slate-300 dark:fill-slate-800">
				{hoveredPosition === pos ? calculateInterval(getPitchAt(pos)) : getPitchAt(pos)}
			</text>
		</g>
	{/each}

	<!-- Finger numbers -->
	{#each voicing.positions.filter((p) => p.finger !== undefined && p.fret !== 0) as pos}
		<text
			x={getStringX(pos.string)}
			y={topMargin * 1.5 + displayedFrets * fretSpacing}
			class="finger-number text-xl fill-slate-800 dark:fill-slate-300"
		>
			{pos.finger}
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
