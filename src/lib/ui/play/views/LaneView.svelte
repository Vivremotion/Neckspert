<script lang="ts">
	import type { PromptStageModel } from '$lib/application/presentation';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { playMessages } from '../messages';
	import { captionOf, formatOffset, HITS } from '../verdictLine';
	import { laneViewTiles } from './laneView';
	import { PICTURE_VIEWS } from './pictures';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const lane = $derived(model as PromptStageModel);
	const view = $derived(controller.view);
	const t = $derived(playMessages());

	// Read once at mount, then every frame: the lane is right from the first paint.
	// svelte-ignore state_referenced_locally
	let nowBeat = $state(controller.timeline.nowBeat());
	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	const tiles = $derived(laneViewTiles(lane, { nowBeat }));
	/** What shows of the item while it waits: the part of the prompt that comes first. */
	const preview = $derived(lane.prompt.preview ?? lane.prompt.secondary);
	/** Before its round opens, the note waits: its string alone shows (D5). */
	const waiting = $derived(lane.anchorBeat === null);
	/** The verdict stays through the breathing bar, until the next note shows. */
	const verdict = $derived(lane.verdict);
	/** After a miss that draws what was heard and expected: one drawing per missed expectation. */
	const drawn = $derived((verdict?.misses ?? []).filter((miss) => miss.heard || miss.expected));
	/** After a miss that tells the right answer: it takes the place of the prompt. */
	const correction = $derived(drawn.length > 0 ? null : (verdict?.misses[0]?.correction ?? null));
	/** Above the drawings: the whole prompt recalled. */
	const recall = $derived(
		[lane.prompt.primary, lane.prompt.secondary].filter((part) => part).join(' · ')
	);
	const caption = $derived(verdict ? captionOf(verdict, t) : null);
	/** A hit: its verdict, and its offset when timed, take the prompt's place. */
	const hit = $derived(verdict && HITS.has(verdict.verdict) ? verdict : null);
</script>

<div class="lane-view">
	<div class="centre">
		{#if view.countdown !== null}
			<!-- The counted bar in the prompt's place, the string coming under it. -->
			<div class="countdown" aria-live="polite">
				<Prompt main={String(view.countdown)} line={waiting ? preview : null} size="prompt">
					{#if waiting}{@render pictures()}{/if}
				</Prompt>
			</div>
		{:else if waiting}
			<!-- The string comes first; the note, the only big letter, follows on the prompt beat. -->
			<Prompt main={preview ?? ''} size="prompt">
				{@render pictures()}
			</Prompt>
		{:else if drawn.length > 0}
			<div class="missed">
				{#if recall}<p class="recall">{recall}</p>{/if}
				<div class="misses">
					{#each drawn as miss, index (index)}
						<div class="miss" data-testid="miss">
							<div class="drawn">
								<div class="drawn-part">
									<p class="drawn-label">{t.played}</p>
									{#if miss.heard}
										{@const Heard = PICTURE_VIEWS[miss.heard.kind]}
										<Heard picture={miss.heard} chordDiagram={lane.chordDiagram} size="small" />
									{:else if miss.gap}
										<p class="heard-none">{miss.gap}</p>
									{/if}
								</div>
								<div class="drawn-part">
									<p class="drawn-label">{t.expected}</p>
									{#if miss.expected}
										{@const Expected = PICTURE_VIEWS[miss.expected.kind]}
										<Expected
											picture={miss.expected}
											chordDiagram={lane.chordDiagram}
											size="small"
										/>
									{/if}
								</div>
							</div>
							{#if miss.heard && miss.gap}
								<p class="gap">{miss.gap}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else if correction}
			<!-- The correction names the string itself: the note asked is recalled alone. -->
			<Prompt main={correction} recall={lane.prompt.primary} size="correction" />
		{:else if hit}
			<p class="hit" aria-live="polite">
				<span class="hit-name">{t.verdict[hit.verdict]}</span>
				{#if hit.offsetMs !== null}<span class="hit-offset">· {formatOffset(hit.offsetMs)}</span
					>{/if}
			</p>
		{:else if !verdict}
			<Prompt main={lane.prompt.primary} line={lane.prompt.secondary} size="hero">
				{#if lane.prompt.detail}
					<p class="detail">{lane.prompt.detail}</p>
				{/if}
				{@render pictures()}
				{#if lane.prompt.aid}
					<p class="aid">{lane.prompt.aid}</p>
				{/if}
			</Prompt>
		{/if}
	</div>

	<div class="bottom">
		<Lane
			{tiles}
			beatsPerBar={lane.beatsPerBar}
			targetLabel={waiting ? null : (lane.prompt.target ?? lane.prompt.primary)}
			bandLabel={waiting ? null : lane.prompt.band}
			{caption}
			imprint={view.status === 'verdict'}
		/>
	</div>
</div>

{#snippet pictures()}
	{#each lane.prompt.pictures as picture, index (index)}
		{@const Picture = PICTURE_VIEWS[picture.kind]}
		<Picture {picture} chordDiagram={lane.chordDiagram} />
	{/each}
{/snippet}

<style>
	/* The prompt over the lane; the frame paints the field. */
	.lane-view {
		display: grid;
		grid-template-rows: 1fr auto;
		flex: 1;
		min-width: 0;
		gap: var(--np-step-4);
	}

	.centre {
		/* The prompt's hero word scales to this width (cqi). */
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--np-step-2);
		min-width: 0;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.centre p {
		margin: 0;
	}

	/* Under the prompt: the chord's strings, read last. */
	.detail {
		font-size: var(--np-size-meta);
		opacity: 0.85;
	}

	/* Learning aid: the fret, on a light tile. */
	.aid {
		margin-top: var(--np-step-2);
		padding: var(--np-step-1) var(--np-step-2);
		background: var(--np-on-field);
		color: var(--np-text);
		font-size: var(--np-size-title);
		line-height: 1;
	}

	/* Under the hero note, at the correction's scale: read from a metre away. */
	.hit {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		column-gap: 0.3em;
		font-size: var(--np-size-correction);
		font-weight: 300;
		line-height: 1.05;
	}

	.hit-offset {
		font-size: var(--np-size-prompt);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.missed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-step-3);
	}

	.recall {
		font-size: var(--np-size-body);
		opacity: 0.8;
	}

	.misses {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--np-step-6);
	}

	.miss {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-step-3);
	}

	.drawn {
		display: flex;
		justify-content: center;
		gap: var(--np-step-6);
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: var(--np-step-1);
	}

	.drawn-label,
	.heard-none,
	.gap {
		font-size: var(--np-size-meta);
	}

	.heard-none {
		max-inline-size: 10ch;
		padding-block-start: var(--np-step-2);
	}

	.bottom {
		inline-size: 100%;
		min-width: 0;
		animation: scene-in 240ms var(--np-motion-ease) both;
	}

	/* The stage changes between lane (guitar) and answer keyboard (screen): the new one rises in. */
	@keyframes scene-in {
		from {
			opacity: 0;
			transform: translateY(var(--np-step-2));
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bottom {
			animation: none;
		}
	}
</style>
