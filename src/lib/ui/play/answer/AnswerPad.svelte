<script lang="ts">
	import type { AnswerChoice } from '$lib/application/session/contract';
	import type { PitchName } from '$lib/domain/music/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import { orderChoices } from './choices';
	import { answerMessages } from './messages';

	let {
		choices,
		disabled,
		onanswer
	}: {
		choices: AnswerChoice[];
		disabled: boolean;
		onanswer: (pitch: PitchName) => void;
	} = $props();

	const ordered = $derived(orderChoices(choices));
	const messages = $derived(answerMessages());

	/** First tap of the current prompt; cleared when the pad is enabled for the next one. */
	let picked = $state<PitchName | null>(null);

	$effect.pre(() => {
		if (!disabled) picked = null;
	});

	function pick(pitch: PitchName): void {
		if (disabled || picked !== null) return;
		picked = pitch;
		onanswer(pitch);
	}
</script>

<div class="answer-pad" role="group" aria-label={messages.group}>
	<div class="grid">
		{#each ordered as choice (choice.pitch)}
			<div class="cell" class:picked={picked === choice.pitch}>
				<PixelButton
					size="large"
					disabled={disabled || picked !== null}
					onclick={(_event: MouseEvent) => pick(choice.pitch)}>{choice.label}</PixelButton
				>
			</div>
		{/each}
	</div>
</div>

<style>
	.answer-pad {
		container: answer-pad / inline-size;
		inline-size: 100%;
		block-size: 100%;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(calc(8 * var(--np-tile)), 1fr));
		grid-auto-rows: minmax(calc(8 * var(--np-tile)), 1fr);
		gap: var(--np-tile);
		block-size: 100%;
	}

	@container answer-pad (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(6, minmax(calc(8 * var(--np-tile)), 1fr));
		}
	}

	.cell {
		display: grid;
		min-block-size: calc(8 * var(--np-tile));
		min-inline-size: calc(8 * var(--np-tile));
	}

	.cell > :global(*) {
		inline-size: 100%;
		block-size: 100%;
		/* Flat signs stay lowercase: "Gb", never "GB". */
		text-transform: none;
		white-space: nowrap;
		padding-inline: 4px;
	}

	.cell.picked > :global(*) {
		background-color: var(--np-ink);
		color: var(--np-bg);
		border-color: var(--np-ink);
	}

	@media (max-width: 559px) {
		.grid {
			grid-template-columns: repeat(3, minmax(calc(8 * var(--np-tile)), 1fr));
		}
	}
</style>
