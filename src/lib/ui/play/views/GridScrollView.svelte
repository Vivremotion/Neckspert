<script lang="ts">
	import type { PassageStageModel } from '$lib/application/presentation/passageStage';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';
	import DrawnMiss from './DrawnMiss.svelte';
	import { gridPlacement } from './gridScroll';
	import { viewMessages } from './messages';
	import { PICTURE_VIEWS } from './pictures';

	/** Bars on the line: the one before the current one, with its verdicts, then the next ones. */
	const VISIBLE_BARS = 4;
	const BARS_BEFORE = 1;

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const stage = $derived(model as PassageStageModel);
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

	const placement = $derived(
		gridPlacement(stage, { nowBeat, visibleBars: VISIBLE_BARS, barsBefore: BARS_BEFORE })
	);

	const current = $derived(
		placement.current === null ? null : stage.rounds[placement.current].label
	);
	const next = $derived(placement.next === null ? null : stage.rounds[placement.next].label);
	const firstBar = $derived(placement.bars[0]?.bar ?? 0);
</script>

<div class="grid-scroll">
	<header class="head">
		{#if stage.prompt.secondary}
			<p class="title">{stage.prompt.secondary}</p>
		{/if}
		{#if stage.prompt.detail}
			<p class="cue">{stage.prompt.detail}</p>
		{/if}
	</header>

	<div class="now">
		<div class="current" aria-live="polite">
			{#if current !== null}
				<p class="symbol" data-testid="current-chord">{current}</p>
			{/if}
		</div>
		<div class="next" class:announced={placement.nextAnnounced}>
			<p class="label">{t.next}</p>
			<p class="symbol next-symbol" data-testid="next-chord">{next ?? t.end}</p>
		</div>
	</div>

	{#each stage.verdict?.misses ?? [] as miss, i (i)}
		<DrawnMiss {miss} chordDiagram={stage.chordDiagram} />
	{/each}

	{#key firstBar}
		<ol class="bars">
			{#each placement.bars as bar (bar.bar)}
				<li class="bar">
					{#each bar.cells as cell (`${cell.change}-${bar.bar}`)}
						<div
							class="cell {cell.state}"
							class:continued={cell.continued}
							style:flex-grow={cell.beats}
						>
							{#if !cell.continued}
								<span class="chord">{cell.symbol}</span>
							{/if}
							{#if cell.verdict}
								<span class="verdict"><VerdictSprite verdict={cell.verdict} size={24} /></span>
							{/if}
						</div>
					{/each}
				</li>
			{/each}
		</ol>
	{/key}

	{#if stage.aid}
		{@const Aid = PICTURE_VIEWS[stage.aid.kind]}
		<!-- Its own row under the cells, as the link's under its lane. No legend: the neck tells now
		from next by the colour of its notes. -->
		<div class="aid" data-testid="grid-aid">
			<Aid picture={stage.aid} chordDiagram={stage.chordDiagram} />
		</div>
	{/if}
</div>

<style>
	.grid-scroll {
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
	.cue,
	.label {
		margin: 0;
		font-size: var(--np-type-meta);
		line-height: 1;
		text-transform: uppercase;
	}

	.cue {
		font-size: var(--np-type-body);
	}

	.now {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: center;
		gap: var(--np-space-4, 32px);
	}

	.symbol {
		margin: 0;
		line-height: 1;
		text-transform: none;
	}

	.current .symbol {
		font-size: var(--np-type-hero);
	}

	.next {
		display: grid;
		justify-items: center;
		gap: var(--np-space-1, 8px);
	}

	/* The aid's neck at the view's width: a climb's first change spans the whole neck. */
	.aid {
		--neck-max: none;
		min-width: 0;
	}

	.next-symbol {
		font-size: var(--np-type-title);
		color: var(--np-shade);
	}

	/* A beat or less before it: the next chord turns to ink, inverted. */
	.next.announced .next-symbol {
		background: var(--np-ink);
		color: var(--np-bg);
		padding: 0 var(--np-space-1, 8px);
	}

	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--np-space-1, 8px);
		animation: scroll-in 160ms ease-out both;
	}

	.bar {
		display: flex;
		min-width: 0;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
	}

	.cell {
		display: flex;
		flex-basis: 0;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		min-width: 0;
		min-height: calc(var(--np-tile) * 6);
		padding: 4px var(--np-space-1, 8px);
		font-size: var(--np-type-meta);
		background: var(--np-bg);
		overflow: hidden;
	}

	.cell + .cell {
		border-inline-start: calc(var(--np-tile) / 4) solid var(--np-ink);
	}

	.cell.past {
		background: var(--np-mid);
	}

	.cell.current {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.cell.next {
		background: var(--np-mid);
		color: var(--np-ink);
	}

	.chord {
		overflow: hidden;
		text-overflow: clip;
		white-space: nowrap;
	}

	.verdict {
		display: inline-flex;
		animation: imprint 120ms ease-out both;
	}

	@keyframes scroll-in {
		from {
			transform: translateX(var(--np-space-4, 32px));
			opacity: 0.6;
		}
		to {
			transform: none;
			opacity: 1;
		}
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
		.bars,
		.verdict {
			animation: none;
		}
	}
</style>
