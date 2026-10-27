<script lang="ts">
	import type { PromptStageModel } from '$lib/application/presentation';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { playMessages } from '../messages';
	import StringDiagram from '../StringDiagram.svelte';
	import { captionOf, formatOffset, HITS } from '../verdictLine';
	import { noteLaneTiles } from './noteLane';

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

	const tiles = $derived(noteLaneTiles(lane, { nowBeat }));
	/** The string drawn under the prompt, while it carries the aid. */
	const diagram = $derived(
		lane.prompt.pictures.find((picture) => picture.kind === 'string') ?? null
	);
	/** What shows of the note while it waits: its string. */
	const preview = $derived(lane.prompt.preview ?? lane.prompt.secondary);
	/** Before its round opens, the note waits: its string alone shows (D5). */
	const waiting = $derived(lane.anchorBeat === null);
	/** The verdict stays through the breathing bar, until the next note shows. */
	const verdict = $derived(lane.verdict);
	/** After a miss: where the note was. */
	const correction = $derived(verdict?.misses[0]?.correction ?? null);
	const caption = $derived(verdict ? captionOf(verdict, t) : null);
	/** A hit: its verdict, and its offset when timed, take the prompt's place. */
	const hit = $derived(verdict && HITS.has(verdict.verdict) ? verdict : null);
</script>

<div class="note-lane">
	<div class="centre">
		{#if view.countdown !== null}
			<!-- The counted bar in the prompt's place, the string coming under it. -->
			<div class="countdown" aria-live="polite">
				<Prompt main={String(view.countdown)} line={waiting ? preview : null} size="prompt">
					{#if waiting && diagram}
						<StringDiagram {diagram} />
					{/if}
				</Prompt>
			</div>
		{:else if waiting}
			<!-- The string comes first; the note, the only big letter, follows on the prompt beat. -->
			<Prompt main={preview ?? ''} size="prompt">
				{#if diagram}
					<StringDiagram {diagram} />
				{/if}
			</Prompt>
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
				<StringDiagram {diagram} />
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
			bandLabel={null}
			{caption}
			imprint={view.status === 'verdict'}
		/>
	</div>
</div>

<style>
	/* The prompt over the lane, as `PlayScreen` draws the notes; the frame paints the field. */
	.note-lane {
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
