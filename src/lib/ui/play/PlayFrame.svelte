<script lang="ts">
	import type { Announcement, PlaySessionController } from '$lib/application/session/contract';
	import { allGrids } from '$lib/domain/grid';
	import { i18n } from '$lib/i18n/index.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import { provideInfoLine } from './infoLine.svelte';
	import { playMessages } from './messages';
	import QuietField from './QuietField.svelte';
	import QuietOverlay from './QuietOverlay.svelte';
	import QuietTop from './QuietTop.svelte';
	import { replayOf } from './replay.svelte';
	import { PLAY_VIEWS, type PlayViewProps } from './views';
	import type { Component } from 'svelte';

	let {
		controller,
		quitToSummary = false,
		views = PLAY_VIEWS
	}: {
		controller: PlaySessionController;
		quitToSummary?: boolean;
		/** The registry the stage's view is looked up in. */
		views?: Record<string, Component<PlayViewProps>>;
	} = $props();

	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const Stage = $derived(view.stage ? (views[view.stage.view] ?? null) : null);
	/** What the view on stage adds to the info line (its exercise, its level, its bar). */
	const infoLine = provideInfoLine();
	/**
	 * The header names what plays: the routine, or the exercise alone; « Jeu libre » alone for a
	 * routine played freely (the notes' free play), in front of an exercise played alone freely.
	 */
	const named = $derived.by(() => {
		const origin = controller.origin;
		if (!origin) return [];
		const title = origin.title[i18n.locale];
		if (!origin.free) return [title];
		return origin.alone ? [t.freePlay, title] : [t.freePlay];
	});
	/**
	 * The info line: what plays, what its view adds (a part the name already says is not said
	 * twice), the tempo (the view's, written with its beat's unit, when it gives one).
	 */
	const infoParts = $derived.by(() => {
		const added = infoLine.parts.filter((part) => !named.includes(part));
		const parts = [...named, ...added];
		const tempo = infoLine.tempo ?? (view.tempoBpm > 0 ? t.tempo(view.tempoBpm) : null);
		return tempo === null ? parts : [...parts, tempo];
	});
	/**
	 * Before the start: the first exercise's instruction, else the routine's, else the general
	 * sentence of an exercise played alone.
	 */
	const how = $derived(view.briefing?.text ?? controller.origin?.howTo?.[i18n.locale] ?? t.howTo);
	const showStart = $derived(view.status === 'idle' || view.status === 'finished');
	/** Start, end and pause are a light page over the field. */
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
	/** What the series announces (a level reached, with its tempo), in words; null when nothing. */
	const announced = $derived(
		view.announcement
			? t.announcement[view.announcement.kind](
					view.announcement.level + 1,
					view.announcement.of,
					view.announcement.tempoBpm
				)
			: null
	);
	/** The exercise that changes air and leaves, by its name: told in the status line. */
	const leaving = $derived(view.leaving ? t.changeOfAirOf(leavingName(view.leaving)) : null);

	/** The exercise that changes air, by its name, and its scope's (a grid's title when it is one). */
	function leavingName(exercise: { title: { fr: string; en: string }; scope?: string }): string {
		const name = exercise.title[i18n.locale];
		if (exercise.scope === undefined) return name;
		const grid = allGrids().find((candidate) => candidate.id === exercise.scope);
		return `${name} · ${grid?.title ?? exercise.scope}`;
	}

	/**
	 * A level reached is told before play only (the breath, the listen-in, the count: cleared from
	 * its run's first bar), so it is told prominently, laid over the field, the view never moved;
	 * a remedy or the change of air stays in the status line, whatever the status.
	 */
	const LEVEL_TOLD: ReadonlySet<Announcement> = new Set(['level-up', 'level-down', 'aid-level']);
	const toldInField = $derived(view.announcement ? LEVEL_TOLD.has(view.announcement.kind) : false);
	/**
	 * The status line: the exercise that leaves, by its name (a level of the next one told in the
	 * field beside it), else the announcement when it is not told in the field.
	 */
	const toldInLine = $derived(leaving ?? (toldInField ? null : announced));

	function leave(event: MouseEvent) {
		if (quitToSummary && view.status !== 'idle') {
			event.preventDefault();
			if (view.status !== 'finished') controller.quit();
			return;
		}
		if (view.status !== 'idle' && view.status !== 'finished') controller.quit();
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
<QuietField {light} data-status={view.status}>
	<QuietTop
		parts={infoParts}
		playing={running}
		{light}
		onpause={() => controller.pause()}
		onleave={leave}
	/>

	<div class="stage">
		{#if toldInField && announced !== null}
			<!-- Before play: the level reached and its tempo, laid over the field, as large as a prompt line. -->
			<div class="told" role="status">
				<Prompt main={announced} size="prompt" />
			</div>
		{/if}
		{#if Stage && view.stage}
			<Stage {controller} model={view.stage.model} />
		{:else if view.countdown !== null}
			<!-- No view yet: the frame counts the bar down in the middle of the field. -->
			<div class="count" aria-live="polite">
				<Prompt main={String(view.countdown)} size="prompt" />
			</div>
		{/if}
		{#if view.contest !== null || view.fatigueDetected || toldInLine !== null}
			<div class="status">
				{#if toldInLine !== null}
					<p class="announcement" role="status">{toldInLine}</p>
				{/if}
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
		{how}
		briefing={view.briefing?.text ?? null}
		replay={controller.replay ? replay : null}
		replayKey={t.replayKey}
		onstart={() => controller.start()}
		onresume={() => controller.resume()}
	/>
</QuietField>

<style>
	/* The view fills the field under the info line, its status line below it. */
	.stage {
		position: relative;
		grid-row: 2 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
		min-width: 0;
		/* The band a level reached is told in, declared once: a view whose content starts at the
		   top keeps it free (`--play-told-band`). */
		--play-told-band: calc(var(--np-size-prompt) * 1.1 + 2 * var(--np-step-2));
	}

	.count {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
	}

	/* Laid over the top of the field, out of the flow: the view never moves when it comes or goes. */
	.told {
		position: absolute;
		z-index: 2;
		inset-block-start: 0;
		inset-inline: 0;
		display: flex;
		justify-content: center;
		padding-block: var(--np-step-2);
		background: var(--np-field);
		pointer-events: none;
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: baseline;
		gap: var(--np-step-3);
		font-size: var(--np-size-meta);
		text-align: center;
	}

	.status p {
		margin: 0;
	}

	.announcement {
		font-size: var(--np-size-body);
	}
</style>
