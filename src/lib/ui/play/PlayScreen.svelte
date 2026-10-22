<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PlaySessionController, VerdictView } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import { laneTiles, laneWindow } from './lane';
	import { playMessages } from './messages';
	import Button from '$lib/ui/primitives/Button.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import InfoLine from '$lib/ui/primitives/InfoLine.svelte';
	import Lane from '$lib/ui/primitives/Lane.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import StringDiagram from './StringDiagram.svelte';
	import AnswerPanel from './answer/AnswerPanel.svelte';
	import { showsAnswerPad } from './answer/showsAnswerPad';

	let {
		controller,
		platesOnly = false,
		quitToSummary = false,
		kind = 'learn'
	}: {
		controller: PlaySessionController;
		platesOnly?: boolean;
		quitToSummary?: boolean;
		/** Which session runs: its how-to shows before the start. */
		kind?: SessionKind;
	} = $props();

	const answering = $derived(showsAnswerPad(controller.view));

	// Read once at mount, then every frame: the lane is right from the first paint.
	// svelte-ignore state_referenced_locally
	let nowBeat = $state(controller.timeline.nowBeat());
	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const tiles = $derived.by(() => {
		const target = view.targetBeatIndex;
		const { beatsBefore, beatsAfter } = laneWindow({
			nowBeat,
			beatsPerBar: view.beatsPerBar,
			targetBeatIndex: target,
			followUp: view.followUp
		});
		return laneTiles({
			nowBeat,
			beatsPerBar: view.beatsPerBar,
			promptBeatIndex: view.promptBeatIndex,
			targetBeatIndex: target,
			followUp: view.followUp,
			history: view.history,
			beatsBefore,
			beatsAfter
		});
	});
	const playing = $derived(
		view.status === 'count-in' || view.status === 'awaiting' || view.status === 'verdict'
	);
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');
	/** Start, end and pause: a light page over the field. */
	const light = $derived(showStart || view.status === 'paused');
	/** The last verdict stays through the breathing bar, until the next prompt or a counted bar. */
	const verdict = $derived(view.lastVerdict);
	/** A miss of a mechanic that draws shapes: what was played and what was expected. */
	const drawn = $derived(verdict && (verdict.heard || verdict.expected) ? verdict : null);
	/** A miss with the right answer to give: it takes the place of the prompt. */
	const correction = $derived(!drawn && verdict?.correction ? verdict.correction : null);
	const recall = $derived(view.prompt ? `${view.prompt.primary} · ${view.prompt.secondary}` : null);
	const caption = $derived(verdict ? captionOf(verdict) : null);

	function formatOffset(ms: number): string {
		const sign = ms > 0 ? '+' : '';
		return `${sign}${ms} ms`;
	}

	/** One line under the played cell: the verdict and its offset, or what was played. */
	function captionOf(v: VerdictView): string {
		const name = t.verdict[v.verdict].toLowerCase();
		if (v.verdict === 'wrong') return v.answerLabel ? t.playedAs(v.answerLabel) : t.nothingHeard;
		if (
			(v.verdict === 'early' || v.verdict === 'late' || v.verdict === 'offbeat') &&
			v.offsetMs !== null
		) {
			return `${name} · ${formatOffset(v.offsetMs)}`;
		}
		return name;
	}

	function leave(event: MouseEvent) {
		if (quitToSummary && view.status !== 'idle') {
			event.preventDefault();
			if (view.status !== 'finished') controller.quit();
			return;
		}
		if (view.status !== 'idle' && view.status !== 'finished') controller.quit();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== 'Enter') return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.closest('button, input, textarea, select') !== null
		) {
			return;
		}
		// Enter (or a pedal sending it): « Joué juste », while a miss is offered to contest.
		if (event.key === 'Enter') {
			if (view.contest !== 'available') return;
			event.preventDefault();
			controller.contest();
			return;
		}
		event.preventDefault();
		if (view.status === 'paused') controller.resume();
		else if (playing) controller.pause();
	}

	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<svelte:window onkeydown={onKeydown} />
<section
	class="play"
	class:light
	data-status={view.status}
	data-plates-only={platesOnly ? '1' : '0'}
>
	{#if !platesOnly}
		<div class="top">
			<InfoLine parts={[t.kindName[kind], t.tempo(view.tempoBpm)]}>
				{#snippet end()}
					{#if playing}
						<Button variant="quiet" onclick={() => controller.pause()}>{t.pause}</Button>
					{/if}
					<a class="leave" href={resolve('/')} onclick={leave}>{t.quit}</a>
				{/snippet}
			</InfoLine>
		</div>

		<div class="centre" class:answering>
			{#if view.status === 'count-in' && view.countdown !== null}
				<div class="countdown" aria-live="polite">
					<Prompt main={String(view.countdown)} line={view.preview?.secondary} size="prompt">
						{#if view.preview?.diagram}
							<StringDiagram diagram={view.preview.diagram} />
						{/if}
					</Prompt>
				</div>
			{:else if view.preview && view.status === 'count-in'}
				<!-- The string comes first; the note, the only big letter, follows on the prompt beat. -->
				<Prompt main={view.preview.secondary} size="prompt">
					{#if view.preview.diagram}
						<StringDiagram diagram={view.preview.diagram} />
					{/if}
				</Prompt>
			{:else if drawn}
				<div class="missed">
					{#if recall}<p class="recall">{recall}</p>{/if}
					<div class="drawn">
						<div class="drawn-part">
							<p class="drawn-label">{t.played}</p>
							{#if drawn.heard}
								<ChordShape
									shape={drawn.heard}
									style={view.chordDiagram}
									locale={i18n.locale}
									size="small"
								/>
							{:else}
								<p class="heard-none">{drawn.gap}</p>
							{/if}
						</div>
						<div class="drawn-part">
							<p class="drawn-label">{t.expected}</p>
							{#if drawn.expected}
								<ChordShape
									shape={drawn.expected}
									style={view.chordDiagram}
									locale={i18n.locale}
									size="small"
								/>
							{/if}
						</div>
					</div>
					{#if drawn.heard && drawn.gap}
						<p class="gap">{drawn.gap}</p>
					{/if}
					{@render contest()}
				</div>
			{:else if correction}
				<Prompt main={correction} {recall} size="prompt">
					{@render contest()}
				</Prompt>
			{:else if verdict}
				<!-- A hit: the centre is quiet, the lane says it. -->
				{@render contest()}
			{:else if view.prompt && view.status !== 'count-in' && view.status !== 'idle'}
				<Prompt
					main={view.prompt.primary}
					line={view.prompt.secondary}
					size={answering ? 'prompt' : 'hero'}
				>
					{#if view.prompt.detail}
						<p class="detail">{view.prompt.detail}</p>
					{/if}
					<StringDiagram diagram={view.prompt.diagram} />
					{#if view.prompt.shape}
						<ChordShape shape={view.prompt.shape} style={view.chordDiagram} locale={i18n.locale} />
					{/if}
					{#if view.prompt.aid}
						<p class="aid">{view.prompt.aid}</p>
					{/if}
				</Prompt>
			{/if}
		</div>

		{#if answering}
			<div class="bottom answer scene-in">
				<p class="answer-caption" aria-live="polite">{caption ?? ''}</p>
				<AnswerPanel {controller} />
			</div>
		{:else}
			<div class="bottom scene-in">
				<Lane
					{tiles}
					beatsPerBar={view.beatsPerBar}
					targetLabel={view.prompt ? (view.prompt.target ?? view.prompt.primary) : null}
					bandLabel={view.prompt?.band ?? null}
					{caption}
					imprint={view.status === 'verdict'}
				/>
			</div>
		{/if}

		{#if showStart}
			<div class="overlay">
				{#if view.status === 'finished'}
					<p class="how">{t.finished}</p>
				{:else if view.audioError === 'input'}
					<p class="how no-input" role="alert">{t.noInput}</p>
				{:else}
					<p class="how">{t.howTo[kind]}</p>
				{/if}
				<Button onclick={() => controller.start()}
					>{view.status === 'finished' ? t.again : t.start}</Button
				>
			</div>
		{:else if view.status === 'paused'}
			<div class="overlay">
				<Button onclick={() => controller.resume()}>{t.resume}</Button>
			</div>
		{/if}
	{/if}
</section>

{#snippet contest()}
	{#if view.contest === 'available'}
		<div class="contest">
			<Button variant="quiet" onclick={() => controller.contest()}>{t.playedRight}</Button>
		</div>
	{:else if view.contest === 'done'}
		<p class="contested">{t.contested}</p>
	{/if}
{/snippet}

<style>
	.play {
		/* The info line's ink: the field's tone, or ink on the light page. */
		--top-ink: var(--np-on-field);
		/* Chord shapes take the colours of the field. */
		--shape-ink: var(--np-on-field);
		--shape-ground: var(--np-text);
		--shape-accent: var(--np-cell-downbeat);
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		min-height: 100dvh;
		padding: var(--np-step-4) clamp(var(--np-step-2), 3vw, var(--np-step-5)) var(--np-step-6);
		gap: var(--np-step-4);
		/* A veil over the lightest stop of the field, under the info line. */
		background: linear-gradient(rgba(35, 33, 31, 0.4), transparent 160px), var(--np-field);
		color: var(--np-on-field);
		font-family: var(--np-font-text);
		/* Not the pixel world's bold, unsmoothed body. */
		font-weight: 400;
		image-rendering: auto;
		-webkit-font-smoothing: antialiased;
	}

	.play.light {
		--top-ink: var(--np-text);
	}

	.top {
		--np-text: var(--top-ink);
	}

	.top :global(.info-parts) {
		opacity: 0.9;
	}

	.top :global(.info-end button) {
		font-size: var(--np-size-meta);
		text-transform: inherit;
		letter-spacing: inherit;
	}

	.top :global(.info-end) {
		display: flex;
		align-items: baseline;
		gap: var(--np-step-3);
		text-transform: lowercase;
		letter-spacing: 0.06em;
	}

	.leave {
		color: inherit;
		font-size: var(--np-size-meta);
		text-decoration: none;
		padding: var(--np-step-1) 0;
	}

	.leave:hover,
	.leave:focus-visible {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.leave:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	.centre {
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

	/* A triad's strings, under its root string or position: read last. */
	.detail {
		font-size: var(--np-size-meta);
		opacity: 0.85;
	}

	/* Learning aid: the fret (mode 1) or the note name (mode 2), on a light tile. */
	.aid {
		margin-top: var(--np-step-2);
		padding: var(--np-step-1) var(--np-step-2);
		background: var(--np-on-field);
		color: var(--np-text);
		font-size: var(--np-size-title);
		line-height: 1;
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
	.gap,
	.contested {
		font-size: var(--np-size-meta);
	}

	.heard-none {
		max-inline-size: 10ch;
		padding-block-start: var(--np-step-2);
	}

	.contest {
		display: flex;
		justify-content: center;
		font-size: var(--np-size-meta);
	}

	.bottom {
		inline-size: 100%;
		min-width: 0;
	}

	.answer {
		display: grid;
		justify-items: center;
		gap: var(--np-step-2);
	}

	.answer-caption {
		margin: 0;
		min-block-size: 1.4em;
		font-size: var(--np-size-body);
		font-variant-numeric: tabular-nums;
	}

	/* The stage changes between lane (guitar) and answer keyboard (screen): the new one rises in. */
	.scene-in {
		animation: scene-in 240ms var(--np-motion-ease) both;
	}

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
		.scene-in {
			animation: none;
		}
	}

	/* Start, end and pause: a light page, the how-to, one amber button. */
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		align-content: center;
		gap: var(--np-step-5);
		padding: var(--np-step-5);
		background: var(--np-ground);
		color: var(--np-text);
	}

	/* The info line and « quitter » stay above the light page, in ink. */
	.light .top {
		position: relative;
		z-index: 2;
	}

	.how {
		margin: 0;
		max-width: 36rem;
		font-size: var(--np-size-body);
		line-height: 1.5;
		text-align: center;
	}
</style>
