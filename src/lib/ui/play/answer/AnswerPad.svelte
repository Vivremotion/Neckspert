<script lang="ts">
	import type { AnswerChoice } from '$lib/application/session/contract';
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
		onanswer: (value: string) => void;
	} = $props();

	const ordered = $derived(orderChoices(choices));
	const messages = $derived(answerMessages());

	/** First tap of the current prompt; cleared when the pad is enabled for the next one. */
	let picked = $state<string | null>(null);

	$effect.pre(() => {
		if (!disabled) picked = null;
	});

	function pick(value: string): void {
		if (disabled || picked !== null) return;
		picked = value;
		onanswer(value);
	}
</script>

<div class="answer-pad" role="group" aria-label={messages.group}>
	<div class="grid">
		{#each ordered as choice (choice.value)}
			<div class="cell" class:picked={picked === choice.value}>
				<PixelButton
					size="large"
					disabled={disabled || picked !== null}
					onclick={(_event: MouseEvent) => pick(choice.value)}>{choice.label}</PixelButton
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-rows: minmax(44px, 1fr);
		gap: var(--np-tile);
		inline-size: 100%;
		min-width: 0;
	}

	@container answer-pad (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}

	.cell {
		display: grid;
		min-block-size: 44px;
		min-inline-size: 0;
	}

	.cell > :global(*) {
		inline-size: 100%;
		block-size: 100%;
		/* Flat signs stay lowercase: "Gb", never "GB". */
		text-transform: none;
		white-space: normal;
		overflow-wrap: anywhere;
		padding-inline: 4px;
	}

	.cell.picked > :global(*) {
		background-color: var(--np-ink);
		color: var(--np-bg);
		border-color: var(--np-ink);
	}

	@media (max-width: 559px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
