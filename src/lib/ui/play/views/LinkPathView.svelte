<script lang="ts">
	import type { LinkPathModel } from '$lib/application/mechanics/chordGrid';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import { linkPathLayout } from './linkPath';
	import { viewMessages } from './messages';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const path = $derived(model as LinkPathModel);
	const view = $derived(controller.view);
	const t = $derived(viewMessages());

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

	const layout = $derived(
		linkPathLayout(path, {
			targetBeatIndex: view.targetBeatIndex,
			nowBeat,
			history: view.history
		})
	);
	const current = $derived(path.shapes[layout.current - 1]);
	/** Grid column of a fret: the string names take the first. */
	const col = (fret: number) => layout.frets.indexOf(fret) + 2;
	/** Grid row of a string: the numbers take the first, the high string comes next. */
	const row = (string: number) => layout.strings.findIndex((s) => s.string === string) + 2;
	const fretRow = $derived(layout.strings.length + 2);
</script>

<div class="link-path" class:unaided={!path.aided}>
	<header class="head">
		<p class="title">{t.link} · {path.chord} · {path.set}</p>
		<p class="way">{layout.descending ? t.goingDown : t.upThenDown}</p>
	</header>

	<div class="now">
		<div class="now-shape" aria-live="polite">
			<p class="label">{layout.label === 'now' ? t.now : t.first}</p>
			<p class="big" data-testid="current-shape">{layout.current}</p>
			<p class="inversion">{current.inversion}</p>
		</div>
		<div class="side">
			<div class="beats" role="img" aria-label={t.beats(layout.filledBeats)}>
				{#each [1, 2, 3, 4] as beat (beat)}
					<span class="beat" class:filled={beat <= layout.filledBeats}></span>
				{/each}
			</div>
			{#if layout.next !== null}
				<p class="next">{t.next} <span class="tag-number">{layout.next}</span></p>
			{/if}
		</div>
	</div>

	<div
		class="neck"
		style:grid-template-columns={`auto repeat(${layout.frets.length}, minmax(0, 1fr))`}
		style:grid-template-rows={`auto repeat(${layout.strings.length}, var(--row)) auto`}
	>
		{#each layout.strings as s (s.string)}
			<span class="name" style:grid-row={row(s.string)} style:grid-column="1">{s.name}</span>
			<span
				class="string"
				style:grid-row={row(s.string)}
				style:grid-column={`2 / ${layout.frets.length + 2}`}
			></span>
		{/each}
		{#each layout.blocks as block (block.number)}
			<span
				class="block {block.state}"
				style:grid-column={`${col(block.from)} / ${col(block.to) + 1}`}
				style:grid-row={`2 / ${fretRow}`}
			></span>
			<span
				class="tag {block.state}"
				style:grid-column={col(block.from)}
				style:grid-row="1"
				data-testid="shape-tag"
			>
				<span class="tag-number">{block.number}</span>
				{#if block.verdict}
					<span class="verdict"><VerdictSprite verdict={block.verdict} size={20} /></span>
				{/if}
			</span>
		{/each}
		{#each layout.arrows as arrow, i (i)}
			<span class="arrow" style:grid-column={col(arrow.fret)} style:grid-row="1" aria-hidden="true"
				>{arrow.direction === 'up' ? '→' : '←'}</span
			>
		{/each}
		{#each layout.dots as dot (`${dot.number}-${dot.string}`)}
			<span
				class="dot {dot.state}"
				style:grid-column={col(dot.fret)}
				style:grid-row={row(dot.string)}
			></span>
		{/each}
		{#each layout.frets as fret (fret)}
			<span class="fret" style:grid-column={col(fret)} style:grid-row={fretRow}>{fret}</span>
		{/each}
	</div>
</div>

<style>
	.link-path {
		--row: calc(var(--np-tile) * 4);
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
		min-width: 0;
		padding: var(--np-space-2, 16px);
		background: var(--np-bg);
		color: var(--np-ink);
		font-family: var(--np-font-pixel);
		font-weight: 700;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--np-space-1, 8px);
	}

	.title,
	.way,
	.label,
	.inversion,
	.next {
		margin: 0;
		line-height: 1;
		text-transform: uppercase;
	}

	.title {
		font-size: var(--np-type-body);
	}

	.way,
	.label,
	.next {
		font-size: var(--np-type-meta);
	}

	.now {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--np-space-4, 32px);
	}

	.now-shape {
		display: grid;
		justify-items: center;
		gap: var(--np-space-1, 8px);
		padding: var(--np-space-2, 16px) var(--np-space-3, 24px);
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.big {
		margin: 0;
		font-size: var(--np-type-hero);
		line-height: 1;
	}

	.inversion {
		font-size: var(--np-type-body);
	}

	.side {
		display: grid;
		justify-items: center;
		gap: var(--np-space-2, 16px);
	}

	.beats {
		display: flex;
		gap: var(--np-space-1, 8px);
	}

	.beat {
		inline-size: calc(var(--np-tile) * 3);
		block-size: calc(var(--np-tile) * 3);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
	}

	.beat.filled {
		background: var(--np-ink);
	}

	.tag-number {
		display: inline-grid;
		place-items: center;
		min-inline-size: 1.2em;
		padding: 0 4px;
		border: calc(var(--np-tile) / 4) solid currentColor;
		font-size: var(--np-type-meta);
		line-height: 1.1;
	}

	.neck {
		display: grid;
		column-gap: 0;
		row-gap: 0;
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
		text-transform: none;
	}

	.fret {
		color: var(--np-shade);
		padding-block-start: 4px;
	}

	.string {
		block-size: calc(var(--np-tile) / 2);
		background: var(--np-shade);
	}

	/* A shape's frets over the set: a frame; the one to play now is filled. */
	.block {
		align-self: stretch;
		margin: 0 2px;
		border: calc(var(--np-tile) / 4) solid var(--np-mid);
	}

	.block.next {
		border: calc(var(--np-tile) / 4) dashed var(--np-ink);
	}

	.block.current {
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-mid);
	}

	/* Without the aid, the frets are to find: the frames only, the current one checkered. */
	.unaided .block.current {
		background-image:
			linear-gradient(45deg, var(--np-bg) 25%, transparent 25%, transparent 75%, var(--np-bg) 75%),
			linear-gradient(45deg, var(--np-bg) 25%, transparent 25%, transparent 75%, var(--np-bg) 75%);
		background-position:
			0 0,
			4px 4px;
		background-size: 8px 8px;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		justify-self: start;
		padding-block-end: 4px;
		color: var(--np-shade);
	}

	.tag.current {
		color: var(--np-ink);
	}

	.tag.current .tag-number {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	/* Framed, so that the early and late arrows are never read as the way. */
	.verdict {
		display: inline-flex;
		padding: 1px;
		background: var(--np-bg);
		border: calc(var(--np-tile) / 4) solid var(--np-ink);
		color: var(--np-ink);
		animation: imprint 120ms ease-out both;
	}

	.arrow {
		justify-self: center;
		font-size: var(--np-type-body);
		line-height: 1;
	}

	/* Never wider than its fret: a narrow neck keeps its dots apart. */
	.dot {
		justify-self: center;
		z-index: 1;
		box-sizing: border-box;
		inline-size: min(calc(var(--np-tile) * 2), 70%);
		aspect-ratio: 1;
		background: var(--np-mid);
	}

	.dot.next {
		background: var(--np-bg);
		border: calc(var(--np-tile) / 4) solid var(--np-ink);
	}

	.dot.current {
		inline-size: min(calc(var(--np-tile) * 3), 90%);
		background: var(--np-ink);
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
