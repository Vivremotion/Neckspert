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
		block-size: 100%;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(64px, 1fr));
		grid-auto-rows: minmax(64px, 1fr);
		gap: 8px;
		block-size: 100%;
	}

	@container answer-pad (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(6, minmax(64px, 1fr));
		}
	}

	.cell {
		display: grid;
		min-block-size: 64px;
		min-inline-size: 64px;
	}

	.cell > :global(*) {
		inline-size: 100%;
		block-size: 100%;
		/* Flat signs stay lowercase: "Gb", never "GB". */
		text-transform: none;
	}
</style>
