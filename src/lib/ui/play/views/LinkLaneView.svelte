<script lang="ts">
	import type { LinkLaneModel } from '$lib/application/mechanics/chordGrid';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import DrawnMiss from './DrawnMiss.svelte';
	import { linkLaneLayout } from './linkLane';
	import { viewMessages } from './messages';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const lane = $derived(model as LinkLaneModel);
	const view = $derived(controller.view);
	const t = $derived(viewMessages());
	// The silence and the counted bar before a new chord: it takes the screen.
	const counting = $derived(view.status === 'count-in' || view.countdown !== null);

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

	const tiles = $derived(linkLaneLayout(lane, { nowBeat, countedBeat }));
	const past = $derived(tiles.filter((tile) => tile.offset <= 0));
	const ahead = $derived(tiles.filter((tile) => tile.offset > 0));
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

	<!-- The notes' lane: a tile per beat, the way on the first beat of each bar. -->
	<div class="lane pixel-frame">
		<div class="lane-inner pixel-frame-inner">
			<div class="track">
				<div class="tiles">
					{#each past as tile (tile.beatIndex)}
						<div class="cell">
							<div class="body" class:due={tile.due} class:inverted={tile.justPlayed}>
								{#if tile.symbol}
									<span class="way" data-testid="link-tile"
										>{tile.symbol === 'root' ? lane.root : ARROWS[tile.symbol]}</span
									>
								{:else if tile.verdict}
									<VerdictSprite verdict={tile.verdict} size={48} inverted={tile.justPlayed} />
								{/if}
							</div>
						</div>
					{/each}
				</div>
				<div class="finish">
					<div class="hit" aria-hidden="true"></div>
				</div>
				<div class="tiles ahead-tiles">
					{#each ahead as tile (tile.beatIndex)}
						<div class="cell">
							<span class="beat-no" data-testid={tile.label !== null ? 'link-beat' : undefined}
								>{tile.label ?? ''}</span
							>
							<div class="body ahead" class:due={tile.due}>
								{#if tile.symbol}
									<span class="way" data-testid="link-tile"
										>{tile.symbol === 'root' ? lane.root : ARROWS[tile.symbol]}</span
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	{#if lane.miss}
		<DrawnMiss miss={lane.miss} />
	{/if}

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
		display: flex;
		min-width: 0;
	}

	/* The notes' lane frame: a shade border, its corners cut. */
	.pixel-frame {
		box-sizing: border-box;
		background: var(--np-shade);
		border: 4px solid var(--np-ink);
		padding: 4px 4px 7px 7px;
		clip-path: polygon(
			4px 0,
			calc(100% - 4px) 0,
			calc(100% - 4px) 4px,
			100% 4px,
			100% calc(100% - 4px),
			calc(100% - 4px) calc(100% - 4px),
			calc(100% - 4px) 100%,
			4px 100%,
			4px calc(100% - 4px),
			0 calc(100% - 4px),
			0 4px,
			4px 4px
		);
	}

	.pixel-frame-inner {
		box-sizing: border-box;
		height: 100%;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
	}

	.lane-inner {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		padding: 8px 12px 12px;
	}

	.track {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		min-width: 0;
		overflow: hidden;
	}

	.tiles {
		display: flex;
		align-items: flex-end;
		gap: 6px;
	}

	.ahead-tiles {
		flex: 1;
	}

	.cell {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: stretch;
		width: clamp(32px, 7cqi, 72px);
		flex: 0 0 auto;
	}

	.beat-no {
		min-height: var(--np-type-meta);
		text-align: center;
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	.body {
		box-sizing: border-box;
		display: grid;
		place-items: center;
		height: 72px;
		border: 4px solid var(--np-ink);
		background: var(--np-bg);
	}

	/* Ahead: a checker of ground and mid, as DESIGN.md makes a fifth tone. */
	.body.ahead {
		background-color: var(--np-bg);
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

	.body.due,
	.body.ahead.due,
	.body.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.way {
		font-size: var(--np-type-display);
		line-height: 1;
	}

	.finish {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
	}

	.hit {
		width: 4px;
		height: 72px;
		background: var(--np-ink);
		box-shadow:
			-8px 0 0 var(--np-ink),
			8px 0 0 var(--np-ink);
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
</style>
