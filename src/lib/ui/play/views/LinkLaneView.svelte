<script lang="ts">
	import type { LinkLaneModel } from '$lib/application/mechanics/chordGrid';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import { linkLaneLayout } from './linkLane';
	import { viewMessages } from './messages';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const lane = $derived(model as LinkLaneModel);
	const view = $derived(controller.view);
	const t = $derived(viewMessages());
	const counting = $derived(view.countdown !== null);

	let nowBeat = $state(0);
	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		loop();
		return () => cancelAnimationFrame(raf);
	});

	/** Before its round opens, the change falls where the count ends: fixed at each count. */
	let countedBeat = $state<number | null>(null);
	$effect(() => {
		const left = view.countdown;
		countedBeat = left === null ? null : Math.round(controller.timeline.nowBeat()) + left;
	});

	const layout = $derived(
		linkLaneLayout(lane, {
			anchorBeat: view.targetBeatIndex ?? countedBeat,
			nowBeat,
			history: view.history
		})
	);
	const ARROWS = { up: '↗', down: '↘' } as const;

	/** The aid's neck: the frets of the two shapes, one either side; the high string on top. */
	const neck = $derived.by(() => {
		if (!lane.aid) return null;
		const notes = [
			...lane.aid.now.map((note) => ({ ...note, shape: 'now' as const })),
			...(lane.aid.next ?? []).map((note) => ({ ...note, shape: 'next' as const }))
		];
		const fretsPlayed = notes.map((note) => note.fret);
		const low = Math.max(0, Math.min(...fretsPlayed) - 1);
		const high = Math.max(...fretsPlayed) + 1;
		const frets = Array.from({ length: high - low + 1 }, (_, i) => low + i);
		const strings = [...lane.strings].reverse();
		return {
			notes,
			frets,
			strings,
			col: (fret: number) => frets.indexOf(fret) + 2,
			row: (string: number) => strings.findIndex((s) => s.string === string) + 1
		};
	});
</script>

<div class="link-lane">
	<header class="head">
		<p class="root" class:counting data-testid="link-root">{lane.root}</p>
		<div class="what">
			<p class="quality">{lane.quality}</p>
			<p class="label">{t.onStrings}</p>
			<p class="label">{lane.set}</p>
		</div>
	</header>

	<div class="lane">
		<span class="bar" aria-hidden="true"></span>
		{#each layout.tiles as tile, i (i)}
			<div class="slot" style:--offset={tile.offset} data-state={tile.state}>
				{#if tile.labelled && layout.beat !== null}
					<span class="beat-no" data-testid="link-beat">{layout.beat}</span>
				{:else if tile.verdict && tile.state === 'past'}
					<span class="verdict"><VerdictSprite verdict={tile.verdict} size={24} /></span>
				{/if}
				<span class="tile {tile.state}" data-testid={tile.symbol ? 'link-tile' : undefined}>
					{tile.symbol === 'root' ? lane.root : tile.symbol ? ARROWS[tile.symbol] : ''}
				</span>
			</div>
		{/each}
	</div>

	{#if neck}
		<div
			class="neck"
			data-testid="aid-neck"
			style:grid-template-columns={`auto repeat(${neck.frets.length}, minmax(0, 1fr))`}
			style:grid-template-rows={`repeat(${neck.strings.length}, var(--row)) auto`}
		>
			{#each neck.strings as s (s.string)}
				<span class="name" style:grid-row={neck.row(s.string)} style:grid-column="1">{s.name}</span>
				<span
					class="string"
					style:grid-row={neck.row(s.string)}
					style:grid-column={`2 / ${neck.frets.length + 2}`}
				></span>
			{/each}
			{#each neck.notes as note (`${note.shape}-${note.string}`)}
				<span
					class="note {note.shape}"
					data-testid="aid-note"
					data-shape={note.shape}
					style:grid-column={neck.col(note.fret)}
					style:grid-row={neck.row(note.string)}>{note.name}</span
				>
			{/each}
			{#each neck.frets as fret (fret)}
				<span
					class="fret"
					style:grid-column={neck.col(fret)}
					style:grid-row={neck.strings.length + 1}>{fret}</span
				>
			{/each}
		</div>
	{/if}
</div>

<style>
	.link-lane {
		--row: calc(var(--np-tile) * 6);
		--hit: 25%;
		--bar-width: 18%;
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--np-space-4, 32px);
		min-width: 0;
		padding: var(--np-space-2, 16px);
		background: var(--np-bg);
		color: var(--np-ink);
		font-family: var(--np-font-pixel);
		font-weight: 700;
	}

	.head {
		display: flex;
		align-items: flex-start;
		gap: var(--np-space-3, 24px);
	}

	.root,
	.quality,
	.label {
		margin: 0;
		line-height: 1;
	}

	/* The chord is the event of the screen: far above the hero size, whatever the container. */
	.root {
		font-size: calc(var(--np-tile) * 16);
	}

	/* The counted bar: the new chord takes the screen. */
	.root.counting {
		font-size: calc(var(--np-tile) * 28);
	}

	.what {
		display: grid;
		gap: var(--np-space-1, 8px);
	}

	.quality {
		font-size: var(--np-type-body);
	}

	.label {
		font-size: var(--np-type-meta);
	}

	.lane {
		position: relative;
		block-size: calc(var(--np-tile) * 14);
		overflow: hidden;
	}

	.bar {
		position: absolute;
		inset-block: 0;
		inset-inline-start: var(--hit);
		inline-size: calc(var(--np-tile) * 3 / 4);
		margin-inline-start: calc(var(--np-tile) * -3 / 4);
		background: var(--np-ink);
		z-index: 1;
	}

	.slot {
		position: absolute;
		inset-block-end: var(--np-space-2, 16px);
		inset-inline-start: calc(var(--hit) + var(--offset) * var(--bar-width));
		inline-size: calc(var(--bar-width) - var(--np-space-2, 16px));
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	.beat-no,
	.verdict {
		font-size: var(--np-type-meta);
		line-height: 1;
		min-block-size: var(--np-type-meta);
	}

	.tile {
		box-sizing: border-box;
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: calc(var(--np-tile) * 9);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
		font-size: var(--np-type-display);
		line-height: 1;
	}

	.tile.now {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.tile.next {
		background: var(--np-mid);
	}

	.tile.later {
		border-color: var(--np-shade);
		color: var(--np-shade);
	}

	/* Played: a checker of ground and mid, as DESIGN.md makes a fifth tone. */
	.tile.past {
		border-color: var(--np-shade);
		color: var(--np-shade);
		background-image:
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%
			),
			linear-gradient(45deg, var(--np-mid) 25%, transparent 25%, transparent 75%, var(--np-mid) 75%);
		background-position:
			0 0,
			4px 4px;
		background-size: 8px 8px;
	}

	.verdict {
		display: inline-flex;
		animation: imprint 120ms ease-out both;
	}

	.neck {
		display: grid;
		align-items: center;
		min-width: 0;
	}

	.name,
	.fret {
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
	}

	.name {
		padding-inline-end: var(--np-space-1, 8px);
	}

	.fret {
		color: var(--np-shade);
		padding-block-start: 4px;
	}

	.string {
		block-size: calc(var(--np-tile) / 2);
		background: var(--np-shade);
	}

	/* The one exception to the square world: a note is a circle, the colour of its tile. */
	.note {
		justify-self: center;
		z-index: 1;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		inline-size: min(calc(var(--np-tile) * 5), 90%);
		aspect-ratio: 1;
		border-radius: 50%;
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	.note.now {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.note.next {
		background: var(--np-mid);
		color: var(--np-ink);
	}

	@keyframes imprint {
		from {
			transform: scale(1.4);
		}
		to {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.verdict {
			animation: none;
		}
	}
</style>
