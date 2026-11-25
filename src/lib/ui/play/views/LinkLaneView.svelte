<script lang="ts">
	import type { PassageStageModel } from '$lib/application/presentation/passageStage';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import DrawnMiss from './DrawnMiss.svelte';
	import { laneTilesOfLink, linkLaneLayout } from './linkLane';
	import { PICTURE_VIEWS } from './pictures';

	/**
	 * The link on the notes' lane (« Près du silence »): the chord in the middle of the screen, as
	 * large as a note, its quality and its strings under it; a tile per beat at the bottom, the
	 * chord or the way (↗, ↘) on the first beat of each bar, the change asked as the target, the
	 * verdicts on the beats played. The counted bar is written large above the chord. A miss takes
	 * the chord's place, as on the notes' lane: the chord recalled over what was played and what
	 * was due. Aided, the neck of the set under the chord, in the room the lane leaves it: the
	 * chord gives it some of its size.
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

<div class="link-lane" data-aided={lane.aid ? '' : undefined}>
	<div class="centre">
		<!-- The count's row is always there, at the height of a prompt line: the chord never moves
		     when the counted bar comes or goes. -->
		<p class="count" data-testid="link-countdown" aria-live="polite">
			{view.countdown ?? ''}
		</p>
		{#if misses.length > 0}
			<!-- The miss in the chord's place, the chord recalled above it, until the next change. -->
			<div class="missed" data-testid="link-missed">
				<p class="recall">{lane.prompt.primary}</p>
				<div class="misses">
					{#each misses as miss, i (i)}
						<DrawnMiss {miss} chordDiagram={lane.chordDiagram} />
					{/each}
				</div>
			</div>
		{:else}
			<div data-testid="link-root">
				<Prompt main={lane.prompt.primary} line={lane.prompt.secondary} size="hero">
					{#if lane.prompt.detail}
						<p class="detail">{lane.prompt.detail}</p>
					{/if}
				</Prompt>
			</div>
		{/if}
		{#if lane.aid}
			{@const Aid = PICTURE_VIEWS[lane.aid.kind]}
			<!-- The set's neck under the chord, the shape played and the next one in circles, in the
			     room left above the lane: the neck's rows shrink to it. -->
			<div class="under">
				<div class="aid" data-testid="link-aid">
					<Aid picture={lane.aid} chordDiagram={lane.chordDiagram} />
				</div>
			</div>
		{/if}
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
	</div>
</div>

<style>
	/* The chord over the lane; the frame paints the ground. */
	.link-lane {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		flex: 1;
		min-width: 0;
		min-block-size: 0;
		gap: var(--np-step-4);
		font-family: var(--np-font-text);
	}

	/* Aided, the chord gives the neck some of its size: both stay on the screen. */
	.link-lane[data-aided] {
		--np-size-hero: clamp(72px, min(40vw, 18dvh), 160px);
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
		min-block-size: 0;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.centre p {
		margin: 0;
	}

	/* The count, light and large, read before the chord; its row kept when there is none. */
	.count {
		min-height: 1.1em;
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

	.missed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-step-3);
		min-width: 0;
	}

	/* The chord recalled over the drawings, at the size of a prompt line. */
	.recall {
		font-size: var(--np-size-prompt);
		line-height: 1.1;
		opacity: 0.8;
	}

	.misses {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--np-step-4);
	}

	/* The room left under the chord, measured for the neck (`--neck-room`); a neck taller than it
	   is cut at the bottom rather than pushed over the lane. */
	.under {
		container-type: size;
		flex: 1 1 0;
		display: flex;
		justify-content: center;
		align-items: center;
		inline-size: 100%;
		min-block-size: 0;
		overflow: hidden;
	}

	.aid {
		--neck-room: 100cqb;
		display: flex;
		justify-content: center;
		min-width: 0;
		max-block-size: 100%;
	}

	.bottom {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
		inline-size: 100%;
		min-width: 0;
	}
</style>
