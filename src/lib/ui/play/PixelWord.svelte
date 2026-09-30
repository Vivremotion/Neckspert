<script lang="ts">
	/** Block letters for any prompt. The comp's "F" is one value of this, not a baked glyph. */
	let { text }: { text: string } = $props();

	const GLYPHS: Record<string, string[]> = {
		A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
		B: ['11110', '11011', '11011', '11110', '11011', '11011', '11110'],
		C: ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
		D: ['11110', '11011', '11011', '11011', '11011', '11011', '11110'],
		E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
		F: ['11111', '11000', '11000', '11110', '11000', '11000', '11000'],
		G: ['01111', '11000', '11000', '11011', '11011', '11011', '01111'],
		'#': ['01010', '11111', '01010', '11111', '01010', '00000', '00000'],
		b: ['11000', '11000', '11110', '11011', '11011', '11110', '00000']
	};

	const blank = ['00000', '00000', '00000', '00000', '00000', '00000', '00000'];

	const glyphs = $derived(
		[...text].map((char) => GLYPHS[char] ?? GLYPHS[char.toUpperCase()] ?? blank)
	);
	const rows = 7;
	const cols = $derived(glyphs.reduce((sum, glyph) => sum + glyph[0].length + 1, 0));

	function origin(index: number): number {
		return glyphs.slice(0, index).reduce((sum, item) => sum + item[0].length + 1, 0);
	}
</script>

<svg viewBox="0 0 {cols + 1} {rows + 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
	{#each glyphs as glyph, index (index)}
		{#each glyph as row, y (y)}
			{#each [...row] as cell, cx (`s${index}-${y}-${cx}`)}
				{#if cell === '1'}
					<rect
						x={origin(index) + cx + 1}
						y={y + 1}
						width="1"
						height="1"
						class={(origin(index) + cx + y) % 2 === 0 ? 'shadow-mid' : 'shadow-shade'}
					/>
				{/if}
			{/each}
		{/each}
	{/each}
	{#each glyphs as glyph, index (`ink-${index}`)}
		{#each glyph as row, y (`ink-${index}-${y}`)}
			{#each [...row] as cell, cx (`ink-${index}-${y}-${cx}`)}
				{#if cell === '1'}
					<rect x={origin(index) + cx} {y} width="1" height="1" class="ink" />
				{/if}
			{/each}
		{/each}
	{/each}
</svg>
<span class="read">{text}</span>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
		shape-rendering: crispEdges;
	}
	.ink {
		fill: var(--np-ink);
	}
	.shadow-mid {
		fill: var(--np-mid);
	}
	.shadow-shade {
		fill: var(--np-shade);
	}
	.read {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
