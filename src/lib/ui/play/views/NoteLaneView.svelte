<script lang="ts">
	import type { NoteLaneModel } from '$lib/application/mechanics/locate';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { playMessages } from '../messages';
	import StringDiagram from '../StringDiagram.svelte';
	import { captionOf, formatOffset, HITS } from '../verdictLine';
	import { noteLaneTiles } from './noteLane';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const lane = $derived(model as NoteLaneModel);
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

	const tiles = $derived(noteLaneTiles(lane, { nowBeat }, view.beatsPerBar));
	/** Before its round opens, the note waits: its string alone shows (D5). */
	const waiting = $derived(lane.anchorBeat === null);
	/** The verdict stays through the breathing bar, until the next note shows. */
	const verdict = $derived(lane.verdict);
	const caption = $derived(verdict ? captionOf(verdict, t) : null);
	/** A hit: its verdict, and its offset when timed, take the prompt's place. */
	const hit = $derived(verdict && HITS.has(verdict.verdict) ? verdict : null);
</script>

<div class="note-lane">
	<div class="centre">
		{#if waiting}
			<!-- The string comes first; the note, the only big letter, follows on the prompt beat. -->
			<Prompt main={lane.prompt.secondary} size="prompt">
				{#if lane.prompt.diagram}
					<StringDiagram diagram={lane.prompt.diagram} />
				{/if}
			</Prompt>
		{:else if verdict?.correction}
			<!-- The correction names the string itself: the note asked is recalled alone. -->
			<Prompt main={verdict.correction} recall={lane.prompt.primary} size="correction" />
		{:else if hit}
			<p class="hit" aria-live="polite">
				<span class="hit-name">{t.verdict[hit.verdict]}</span>
				{#if hit.offsetMs !== null}<span class="hit-offset">· {formatOffset(hit.offsetMs)}</span
					>{/if}
			</p>
		{:else if !verdict}
			<Prompt main={lane.prompt.primary} line={lane.prompt.secondary} size="hero">
				<StringDiagram diagram={lane.prompt.diagram} />
				{#if lane.prompt.aid}
					<p class="aid">{lane.prompt.aid}</p>
				{/if}
			</Prompt>
		{/if}
	</div>

	<div class="bottom">
		<Lane
			{tiles}
			beatsPerBar={view.beatsPerBar}
			targetLabel={waiting ? null : (lane.prompt.target ?? lane.prompt.primary)}
			bandLabel={null}
			{caption}
			imprint={view.status === 'verdict'}
		/>
	</div>
</div>

<style>
	/* The play screen's field (da-1), as `PlayScreen` draws the notes. */
	.note-lane {
		display: grid;
		grid-template-rows: 1fr auto;
		flex: 1;
		box-sizing: border-box;
		min-width: 0;
		min-height: 60dvh;
		padding: var(--np-step-4) clamp(var(--np-step-2), 3vw, var(--np-step-5)) var(--np-step-6);
		gap: var(--np-step-4);
		background: var(--np-field);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		font-weight: 400;
		image-rendering: auto;
		-webkit-font-smoothing: antialiased;
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
