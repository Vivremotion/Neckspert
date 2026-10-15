<script lang="ts">
	// Dev only: figures engraved by the notation adapter, to look at them in a real browser
	// (the Bravura check of scripts/functional-ui.mjs reads this page until the rhythm view exists).
	import { onMount } from 'svelte';
	import { RHYTHM_OFFBEATS } from '$lib/domain/exercise/rhythmCatalog';
	import { Fraction, METER_4_4, type Figure, type FigureElement } from '$lib/domain/time';
	import { renderFigure, type FigureLayout } from '$lib/ui/notation';

	const note = (n: number, d: number, tieToNext = false): FigureElement => ({
		kind: 'note',
		duration: Fraction.of(n, d),
		...(tieToNext ? { tieToNext } : {}),
		content: null
	});
	const rest = (n: number, d: number): FigureElement => ({
		kind: 'rest',
		duration: Fraction.of(n, d)
	});

	/** Four bars: eighths, an offbeat bar, a triplet with a tie over the bar line, and a long note. */
	const FOUR_BARS: Figure = {
		schema: 1,
		meter: METER_4_4,
		bars: 4,
		voices: [
			{
				id: 'main',
				elements: [
					...Array.from({ length: 8 }, () => note(1, 8)),
					note(1, 8),
					rest(1, 8),
					note(1, 8),
					rest(1, 8),
					note(1, 8),
					rest(1, 8),
					note(1, 8),
					rest(1, 8),
					note(1, 12),
					note(1, 12),
					note(1, 12),
					note(1, 4),
					note(1, 2, true),
					note(1, 1)
				],
				tuplets: [{ from: 16, to: 18, ratio: [3, 2] }]
			}
		]
	};

	const offbeats = RHYTHM_OFFBEATS.figures?.[0].figure;
	let hosts: HTMLElement[] = $state([]);
	let layouts: FigureLayout[] = $state([]);

	onMount(() => {
		if (offbeats) layouts[0] = renderFigure(hosts[0], offbeats, { maxWidth: 560 });
		layouts[1] = renderFigure(hosts[1], FOUR_BARS, { maxWidth: 360 });
		layouts[2] = renderFigure(hosts[2], FOUR_BARS, { maxWidth: 900, scale: 1.25 });
	});
</script>

<main>
	<h1>Notation</h1>
	{#each [0, 1, 2] as i (i)}
		<div class="figure" bind:this={hosts[i]}></div>
		<pre>{JSON.stringify(layouts[i])}</pre>
	{/each}
</main>

<style>
	main {
		padding: var(--np-space-2);
	}

	h1 {
		font-size: var(--np-type-title);
	}

	pre {
		font-size: 16px;
		white-space: pre-wrap;
	}

	.figure {
		margin-block: var(--np-space-2);
		color: var(--np-ink);
	}
</style>
