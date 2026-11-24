<script lang="ts">
	import type { PassageStageModel } from '$lib/application/presentation/passageStage';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import DrawnMiss from './DrawnMiss.svelte';
	import { laneTilesOfLink, linkLaneLayout } from './linkLane';
	import { PICTURE_VIEWS } from './pictures';

	/**
	 * The link on the notes' lane (« Près du silence »): the chord in the middle of the field, as
	 * large as a note, its quality and its strings under it; a tile per beat at the bottom, the
	 * chord or the way (↗, ↘) on the first beat of each bar, the change asked as the target, the
	 * verdicts on the beats played. The counted bar is written large above the chord. Aided, the
	 * neck of the set under the lane.
	 */
	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const lane = $derived(model as PassageStageModel);
	const view = $derived(controller.view);

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

	/** Before its round opens, the change falls where the count ends: fixed at each count. */
	let countedBeat = $state<number | null>(null);
	$effect(() => {
		const left = view.countdown;
		countedBeat = left === null ? null : Math.round(controller.timeline.nowBeat()) + left;
	});

	const tiles = $derived(laneTilesOfLink(linkLaneLayout(lane, { nowBeat, countedBeat })));
	const misses = $derived(lane.verdict?.misses ?? []);
</script>

<div class="link-lane">
	<div class="centre">
		{#if view.countdown !== null}
			<!-- The counted bar before a new chord, above it: the chord keeps the screen. -->
			<p class="count" data-testid="link-countdown" aria-live="polite">{view.countdown}</p>
		{/if}
		<div data-testid="link-root">
			<Prompt main={lane.prompt.primary} line={lane.prompt.secondary} size="hero">
				{#if lane.prompt.detail}
					<p class="detail">{lane.prompt.detail}</p>
				{/if}
			</Prompt>
		</div>
		{#each misses as miss, i (i)}
			<DrawnMiss {miss} chordDiagram={lane.chordDiagram} />
		{/each}
	</div>

	<div class="bottom">
		<Lane
			{tiles}
			beatsPerBar={lane.beatsPerBar}
			targetLabel={null}
			bandLabel={null}
			caption={null}
			imprint={view.status === 'verdict'}
		/>
		{#if lane.aid}
			{@const Aid = PICTURE_VIEWS[lane.aid.kind]}
			<!-- The set's neck under the lane, the shape played and the next one in circles. -->
			<div class="aid" data-testid="link-aid">
				<Aid picture={lane.aid} chordDiagram={lane.chordDiagram} />
			</div>
		{/if}
	</div>
</div>

<style>
	/* The chord over the lane; the frame paints the field. */
	.link-lane {
		display: grid;
		grid-template-rows: 1fr auto;
		flex: 1;
		min-width: 0;
		gap: var(--np-step-4);
		font-family: var(--np-font-text);
	}

	.centre {
		/* The prompt's hero word scales to this width (cqi). */
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--np-step-3);
		min-width: 0;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.centre p {
		margin: 0;
	}

	/* The count, light and large, read before the chord. */
	.count {
		font-size: var(--np-size-prompt);
		font-weight: 300;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	/* Under the chord: its strings, read last. */
	.detail {
		font-size: var(--np-size-meta);
		opacity: 0.85;
	}

	.bottom {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
		inline-size: 100%;
		min-width: 0;
	}

	.aid {
		display: flex;
		justify-content: center;
		min-width: 0;
	}
</style>
