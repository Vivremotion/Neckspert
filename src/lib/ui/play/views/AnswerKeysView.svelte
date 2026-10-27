<script lang="ts">
	import type { PromptStageModel } from '$lib/application/presentation';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import Prompt from '$lib/ui/primitives/Prompt.svelte';
	import AnswerKeyboard from '../answer/AnswerKeyboard.svelte';
	import { playMessages } from '../messages';
	import { captionOf, formatOffset, HITS } from '../verdictLine';

	let { controller, model }: { controller: PlaySessionController; model: unknown } = $props();

	const keys = $derived(model as PromptStageModel);
	const view = $derived(controller.view);
	const t = $derived(playMessages());
	/** The counted bar: the keyboard is on stage already, the prompt comes on its beat. */
	const counting = $derived(view.status === 'count-in' || view.countdown !== null);
	const verdict = $derived(keys.verdict);
	/** After a miss: the right name. */
	const correction = $derived(verdict?.misses[0]?.correction ?? null);
	const caption = $derived(verdict ? captionOf(verdict, t) : null);
	const hit = $derived(verdict && HITS.has(verdict.verdict) ? verdict : null);
	/** Above the note name of a correction: the fret and the string, which the name alone loses. */
	const recall = $derived(
		[keys.prompt.primary, keys.prompt.secondary].filter((part) => part).join(' · ')
	);
</script>

<div class="answer-keys">
	<div class="centre">
		{#if counting}
			<!-- The keyboard on stage already; the counted bar in the prompt's place. -->
			{#if view.countdown !== null}
				<div class="countdown" aria-live="polite">
					<Prompt main={String(view.countdown)} size="prompt" />
				</div>
			{/if}
		{:else if correction}
			<Prompt main={correction} {recall} size="correction" />
		{:else if hit}
			<p class="hit" aria-live="polite">
				<span class="hit-name">{t.verdict[hit.verdict]}</span>
				{#if hit.offsetMs !== null}<span class="hit-offset">· {formatOffset(hit.offsetMs)}</span
					>{/if}
			</p>
		{:else if !verdict}
			<Prompt main={keys.prompt.primary} line={keys.prompt.secondary} size="prompt">
				{#if keys.prompt.aid}
					<p class="aid">{keys.prompt.aid}</p>
				{/if}
			</Prompt>
		{/if}
	</div>

	<div class="bottom">
		<p class="answer-caption" aria-live="polite">{caption ?? ''}</p>
		<AnswerKeyboard
			choices={keys.choices}
			disabled={view.status !== 'awaiting'}
			onanswer={(value) => controller.answer(value)}
		/>
	</div>
</div>

<style>
	/* The prompt over the keys, as `PlayScreen` draws them; the frame paints the field. */
	.answer-keys {
		display: grid;
		grid-template-rows: 1fr auto;
		flex: 1;
		min-width: 0;
		gap: var(--np-step-4);
	}

	.centre {
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

	/* Learning aid: the note name, on a light tile. */
	.aid {
		margin-top: var(--np-step-2);
		padding: var(--np-step-1) var(--np-step-2);
		background: var(--np-on-field);
		color: var(--np-text);
		font-size: var(--np-size-title);
		line-height: 1;
	}

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
		display: grid;
		justify-items: center;
		gap: var(--np-step-2);
		inline-size: 100%;
		min-width: 0;
		animation: scene-in 240ms var(--np-motion-ease) both;
	}

	.answer-caption {
		margin: 0;
		min-block-size: 1.4em;
		font-size: var(--np-size-body);
		font-variant-numeric: tabular-nums;
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
