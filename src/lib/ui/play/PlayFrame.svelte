<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { playMessages } from './messages';
	import PixelWord from './PixelWord.svelte';
	import QuietField from './QuietField.svelte';
	import QuietOverlay from './QuietOverlay.svelte';
	import QuietTop from './QuietTop.svelte';
	import { replayOf } from './replay.svelte';
	import { PLAY_VIEWS, VIEW_WORLDS, type PlayViewProps, type PlayWorld } from './views';
	import type { Component } from 'svelte';

	let {
		controller,
		kind = 'gesture',
		quitToSummary = false,
		views = PLAY_VIEWS
	}: {
		controller: PlaySessionController;
		/** Which session runs: its how-to shows before the start. */
		kind?: SessionKind;
		quitToSummary?: boolean;
		/** The registry the stage's view is looked up in. */
		views?: Record<string, Component<PlayViewProps>>;
	} = $props();

	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const Stage = $derived(view.stage ? (views[view.stage.view] ?? null) : null);
	/**
	 * The frame is drawn in the world of the view on stage; with none yet (the start screen, the
	 * end), in the world of what the session plays: the notes' and the triads' views are quiet.
	 */
	const world: PlayWorld = $derived(
		view.stage
			? (VIEW_WORLDS[view.stage.view] ?? 'pixel')
			: kind === 'learn' || kind === 'free' || kind === 'triads' || kind === 'triads-zone'
				? 'quiet'
				: 'pixel'
	);
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');
	/** In the quiet world, start, end and pause are a light page over the field. */
	const light = $derived(showStart || view.status === 'paused');
	const running = $derived(
		view.status === 'count-in' || view.status === 'awaiting' || view.status === 'verdict'
	);
	/**
	 * The controller plays figures: « Écouter la figure » and « Réécouter » have keys, Escape
	 * closes the pause, and the pause offers to quit the exercise. Other sessions are untouched.
	 */
	const figures = $derived(Boolean(controller.listen || controller.replay));
	const replay = $derived(replayOf(controller));
	/** A miss drawn by its mechanic: what was played and what was due. */
	const drawn = $derived(
		view.lastVerdict && (view.lastVerdict.heard || view.lastVerdict.expected)
			? view.lastVerdict
			: null
	);

	function leave(event: MouseEvent) {
		if (quitToSummary && view.status !== 'idle') {
			event.preventDefault();
			if (view.status !== 'finished') controller.quit();
			return;
		}
		if (view.status !== 'idle' && view.status !== 'finished') controller.quit();
	}

	/** « Quitter l’exercice », from the pause: no shortcut, on purpose. */
	function quitExercise() {
		controller.quit();
		if (!quitToSummary) void goto(resolve('/'));
	}

	/** E (L in English) listens to the figure, R replays the last run, Escape closes the pause. */
	function onFigureKey(event: KeyboardEvent): boolean {
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('input, textarea, select') !== null) {
			return false;
		}
		const key = event.key.toLowerCase();
		if (controller.listen && key === t.listenKey.toLowerCase()) {
			if (!running) return false;
			event.preventDefault();
			controller.listen();
			return true;
		}
		if (controller.replay && key === t.replayKey.toLowerCase()) {
			event.preventDefault();
			replay.run();
			return true;
		}
		if (event.key === 'Escape' && view.status === 'paused' && !view.briefing) {
			event.preventDefault();
			controller.resume();
			return true;
		}
		return false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (figures && onFigureKey(event)) return;
		if (event.code !== 'Space' && event.key !== 'Enter') return;
		const target = event.target;
		// A control a view marks `data-frame-space` leaves Space to the frame: it pauses there too.
		const frameSpace =
			event.code === 'Space' &&
			target instanceof HTMLElement &&
			target.closest('[data-frame-space]') !== null;
		if (
			!frameSpace &&
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
		else if (running) controller.pause();
	}

	/** A button is pressed by Space on keyup in some browsers: a marked control's Space stays the frame's. */
	function onKeyup(event: KeyboardEvent) {
		const target = event.target;
		if (
			event.code === 'Space' &&
			target instanceof HTMLElement &&
			target.closest('[data-frame-space]') !== null
		) {
			event.preventDefault();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} />
{#if world === 'quiet'}
	<QuietField {light} data-world="quiet" data-status={view.status}>
		<QuietTop
			parts={[t.kindName[kind], t.tempo(view.tempoBpm)]}
			playing={running}
			{light}
			onpause={() => controller.pause()}
			onleave={leave}
		/>

		<div class="quiet-stage">
			{#if Stage && view.stage}
				<Stage {controller} model={view.stage.model} />
			{:else if view.countdown !== null}
				<!-- No view yet: the frame counts the bar down in the middle of the field. -->
				<div class="quiet-count" aria-live="polite">
					<Prompt main={String(view.countdown)} size="prompt" />
				</div>
			{/if}
			{#if view.contest !== null || view.fatigueDetected}
				<div class="quiet-status">
					{#if view.contest === 'available'}
						<Button variant="quiet" onclick={() => controller.contest()}>{t.playedRight}</Button>
					{:else if view.contest === 'done'}
						<p>{t.contested}</p>
					{/if}
					{#if view.fatigueDetected}
						<p role="status">{t.fatigue}</p>
					{/if}
				</div>
			{/if}
		</div>

		<QuietOverlay
			status={view.status}
			audioError={view.audioError}
			how={view.briefing?.text ?? t.howTo[kind]}
			briefing={view.briefing?.text ?? null}
			onstart={() => controller.start()}
			onresume={() => controller.resume()}
		/>
	</QuietField>
{:else}
	<section class="frame" data-world="pixel" data-status={view.status}>
		<div class="chrome">
			{#if running}
				<PixelButton size="large" onclick={() => controller.pause()}>{t.pause}</PixelButton>
			{/if}
			<a class="leave" href={resolve('/')} onclick={leave}>{t.quit}</a>
		</div>

		<div class="stage">
			{#if Stage && view.stage}
				<Stage {controller} model={view.stage.model} />
			{/if}
		</div>

		{#snippet contestOffer()}
			{#if view.contest === 'available'}
				<PixelButton size="large" onclick={() => controller.contest()}>{t.playedRight}</PixelButton>
			{:else if view.contest === 'done'}
				<p class="label">{t.contested}</p>
			{/if}
		{/snippet}

		<div class="status">
			{#if view.countdown !== null}
				<!-- The counted bar, down to the change itself: big, where the verdicts come. -->
				<!-- In text: PixelWord draws the note letters only, no digit. -->
				<div class="counting">
					<p class="countdown" aria-live="polite" aria-label={String(view.countdown)}>
						{t.startsIn(view.countdown)}
					</p>
				</div>
			{:else if view.lastVerdict}
				<div class="verdict">
					<p class="banner">{t.verdict[view.lastVerdict.verdict]}</p>
					{#if drawn}
						<div class="drawn">
							{#if drawn.heard}
								<div class="drawn-part">
									<p class="label">{t.played}</p>
									<ChordShape
										shape={drawn.heard}
										style={view.chordDiagram}
										locale={i18n.locale}
										size="small"
									/>
								</div>
							{/if}
							{#if drawn.expected}
								<div class="drawn-part">
									<p class="label">{t.expected}</p>
									<ChordShape
										shape={drawn.expected}
										style={view.chordDiagram}
										locale={i18n.locale}
										size="small"
									/>
								</div>
							{/if}
						</div>
						{#if drawn.gap}
							<p class="label">{drawn.gap}</p>
						{/if}
					{/if}
					{@render contestOffer()}
				</div>
			{:else if view.contest !== null}
				<!-- A view that draws its own verdicts: the frame still offers « Joué juste ». -->
				<div class="verdict">
					{@render contestOffer()}
				</div>
			{/if}
			{#if view.fatigueDetected}
				<p class="fatigue" role="status">{t.fatigue}</p>
			{/if}
		</div>

		{#if showStart}
			<div class="overlay">
				{#if view.status === 'finished'}
					<p class="how">{t.finished}</p>
				{:else if view.audioError === 'input'}
					<p class="how" role="alert">{t.noInput}</p>
				{:else if view.audioError === 'bleed'}
					<!-- The game is not refused: a first encounter still reads its instruction. -->
					<p class="how" role="alert">{t.bleed}</p>
					<p class="how">{view.briefing?.text ?? t.howTo[kind]}</p>
				{:else}
					<p class="how">{view.briefing?.text ?? t.howTo[kind]}</p>
				{/if}
				<PixelButton size="huge" onclick={() => controller.start()}
					>{view.status === 'finished' ? t.again : t.start}</PixelButton
				>
			</div>
		{:else if view.status === 'paused' && view.briefing}
			<!-- An exercise met for the first time: its instruction, then a counted bar. -->
			<div class="overlay" role="dialog" aria-label={t.go}>
				<p class="how">{view.briefing.text}</p>
				<PixelButton size="huge" onclick={() => controller.resume()}>{t.go}</PixelButton>
			</div>
		{:else if view.status === 'paused'}
			<div class="overlay">
				<PixelButton size="huge" onclick={() => controller.resume()}>{t.resume}</PixelButton>
				{#if controller.replay}
					<PixelButton size="large" disabled={replay.pending} onclick={() => replay.run()}
						>{replay.pending ? t.replaying : `${t.replay} (${t.replayKey})`}</PixelButton
					>
				{/if}
				{#if figures}
					<PixelButton size="large" onclick={quitExercise}>{t.quitExercise}</PixelButton>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	/* The quiet world: the view fills the field under the info line, its status line below it. */
	.quiet-stage {
		grid-row: 2 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
		min-width: 0;
	}

	.quiet-count {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
	}

	.quiet-status {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: baseline;
		gap: var(--np-step-3);
		font-size: var(--np-size-meta);
		text-align: center;
	}

	.quiet-status p {
		margin: 0;
	}

	.frame {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		min-height: 100dvh;
		margin-inline: auto;
		padding: var(--np-space-1, 8px);
		padding-block-start: calc(var(--np-tile) * 9);
		container: play / inline-size;
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
			8px 8px;
		background-size: 16px 16px;
		color: var(--np-ink);
		font-family: var(--np-font-pixel);
		font-weight: 700;
	}

	.chrome {
		position: absolute;
		z-index: 8;
		top: var(--np-space-1, 8px);
		inset-inline: var(--np-space-1, 8px);
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: var(--np-space-1, 8px);
	}

	.leave {
		color: var(--np-ink);
		font: inherit;
		font-size: var(--np-type-body);
		text-transform: uppercase;
		text-decoration: none;
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		padding: var(--np-space-1, 8px) 12px;
	}

	/* The view takes the room it needs; the verdict follows right under it, in sight. */
	.counting {
		display: flex;
		align-items: center;
		gap: var(--np-space-2, 16px);
	}

	.countdown {
		margin: 0;
		font-size: var(--np-type-display);
		line-height: 1;
		text-align: center;
	}

	.stage {
		display: flex;
		flex: 0 1 auto;
		min-width: 0;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
	}

	.status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-1, 8px);
		min-block-size: calc(var(--np-tile) * 8);
		padding: var(--np-space-1, 8px);
		background: var(--np-bg);
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
	}

	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--np-space-2, 16px);
	}

	.banner {
		margin: 0;
		padding: var(--np-space-1, 8px) 12px;
		background: var(--np-ink);
		color: var(--np-bg);
		font-size: var(--np-type-body);
		line-height: 1;
		text-transform: uppercase;
		animation: imprint 120ms ease-out both;
	}

	.drawn {
		display: flex;
		gap: var(--np-space-3, 24px);
	}

	.drawn-part {
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	.label,
	.fatigue {
		margin: 0;
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
		text-transform: uppercase;
	}

	.fatigue {
		padding: var(--np-space-1, 8px) var(--np-space-2, 16px);
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.overlay {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--np-space-3, 24px);
		padding: var(--np-space-4, 32px);
		background: var(--np-bg);
	}

	.how {
		margin: 0;
		max-width: 36rem;
		text-align: center;
		font-size: var(--np-type-body);
		text-transform: uppercase;
	}

	@keyframes imprint {
		from {
			transform: scale(0.96);
			opacity: 0.85;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.banner {
			animation: none;
		}
	}
</style>
