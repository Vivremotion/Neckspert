<script lang="ts">
	/** Even-stroke block letters. The comp's "F" is one value of this, not a baked glyph. */
	let { text }: { text: string } = $props();

	const GLYPHS: Record<string, string[]> = {
		A: [
			'00111100',
			'01111110',
			'11000011',
			'11000011',
			'11111111',
			'11111111',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011'
		],
		B: [
			'11111100',
			'11111110',
			'11000011',
			'11000011',
			'11111110',
			'11111100',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11111110',
			'11111100'
		],
		C: [
			'01111110',
			'11111111',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11111111',
			'01111110'
		],
		D: [
			'11111100',
			'11111110',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11000011',
			'11111110',
			'11111100'
		],
		E: [
			'11111111',
			'11111111',
			'11000000',
			'11000000',
			'11111100',
			'11111100',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11111111',
			'11111111'
		],
		F: [
			'11111111',
			'11111111',
			'11000000',
			'11000000',
			'11111100',
			'11111100',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000',
			'11000000'
		],
		G: [
			'01111110',
			'11111111',
			'11000000',
			'11000000',
			'11000000',
			'11001111',
			'11001111',
			'11000011',
			'11000011',
			'11000011',
			'11111111',
			'01111110'
		],
		'#': [
			'01100110',
			'01100110',
			'11111111',
			'11111111',
			'01100110',
			'01100110',
			'11111111',
			'11111111',
			'01100110',
			'01100110',
			'00000000',
			'00000000'
		],
		m: [
			'00000000',
			'00000000',
			'00000000',
			'11101110',
			'11111111',
			'11011011',
			'11011011',
			'11011011',
			'11011011',
			'11011011',
			'11011011',
			'00000000'
		],
		b: [
			'110000',
			'110000',
			'110000',
			'111110',
			'111111',
			'110011',
			'110011',
			'110011',
			'110011',
			'111111',
			'111110',
			'000000'
		]
	};

	const blank = Array.from({ length: 12 }, () => '00000000');

	const glyphs = $derived(
		[...text].map((char) => GLYPHS[char] ?? GLYPHS[char.toUpperCase()] ?? blank)
	);

	const model = $derived.by(() => {
		const ink: { x: number; y: number }[] = [];
		let cursor = 0;
		for (const glyph of glyphs) {
			const width = glyph[0]?.length ?? 0;
			for (let y = 0; y < glyph.length; y++) {
				for (let x = 0; x < width; x++) {
					if (glyph[y][x] === '1') ink.push({ x: cursor + x, y });
				}
			}
			cursor += width + 1;
		}

		const occupied = new Set<string>();
		for (const cell of ink) {
			occupied.add(`${cell.x},${cell.y}`);
			occupied.add(`${cell.x + 1},${cell.y + 1}`);
		}

		const seen = new Set<string>();
		const halo: { x: number; y: number }[] = [];
		for (const key of occupied) {
			const [x, y] = key.split(',').map(Number);
			for (const [dx, dy] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			] as const) {
				const nx = x + dx;
				const ny = y + dy;
				const id = `${nx},${ny}`;
				if (occupied.has(id) || seen.has(id)) continue;
				seen.add(id);
				halo.push({ x: nx, y: ny });
			}
		}

		let minX = 0;
		let minY = 0;
		let maxX = 1;
		let maxY = 1;
		for (const cell of [...ink, ...halo]) {
			minX = Math.min(minX, cell.x, cell.x + 1);
			minY = Math.min(minY, cell.y, cell.y + 1);
			maxX = Math.max(maxX, cell.x + 2);
			maxY = Math.max(maxY, cell.y + 2);
		}

		return { ink, halo, minX, minY, width: maxX - minX, height: maxY - minY };
	});
</script>

<svg
	viewBox="{model.minX} {model.minY} {model.width} {model.height}"
	width={model.width * 16}
	height={model.height * 16}
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
>
	{#each model.halo as cell (`h${cell.x},${cell.y}`)}
		<rect x={cell.x} y={cell.y} width="0.5" height="0.5" class="halo" />
		<rect x={cell.x + 0.5} y={cell.y + 0.5} width="0.5" height="0.5" class="halo" />
	{/each}
	{#each model.ink as cell (`s${cell.x},${cell.y}`)}
		<rect x={cell.x + 1} y={cell.y + 1} width="1" height="1" class="shadow" />
	{/each}
	{#each model.ink as cell (`i${cell.x},${cell.y}`)}
		<rect x={cell.x} y={cell.y} width="1" height="1" class="ink" />
	{/each}
</svg>
<span class="read">{text}</span>

<style>
	svg {
		display: block;
		shape-rendering: crispEdges;
		max-width: 100%;
		height: auto;
	}
	.ink {
		fill: var(--np-ink);
	}
	.shadow,
	.halo {
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
