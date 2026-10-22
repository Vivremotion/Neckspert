<script lang="ts">
	import type { AnswerChoice } from '$lib/application/session/contract';
	import { keyboardKeys } from './keyboard';
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

	const keys = $derived(keyboardKeys(choices));
	const messages = $derived(answerMessages());

	/** First press of the current prompt; cleared when the keyboard is enabled for the next one. */
	let picked = $state<string | null>(null);

	$effect.pre(() => {
		if (!disabled) picked = null;
	});

	function press(value: string): void {
		if (disabled || picked !== null) return;
		picked = value;
		onanswer(value);
	}
</script>

<div class="answer-keyboard" role="group" aria-label={messages.group}>
	<div class="octave">
		{#each keys as key (key.choice.value)}
			<button
				type="button"
				class="key {key.color}"
				class:picked={picked === key.choice.value}
				style:--rank={key.whiteIndex}
				aria-label={key.choice.label}
				disabled={disabled || picked !== null}
				onclick={() => press(key.choice.value)}
			>
				{#each key.choice.label.split(' / ') as name (name)}
					<span>{name}</span>
				{/each}
			</button>
		{/each}
	</div>
</div>

<style>
	.answer-keyboard {
		container: answer-keyboard / inline-size;
		inline-size: 100%;
	}

	.octave {
		--white: calc(100% / 7);
		position: relative;
		inline-size: 100%;
		block-size: clamp(176px, 38cqi, 300px);
	}

	.key {
		position: absolute;
		inset-block-start: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		padding: var(--np-step-1) 0;
		border: 1px solid var(--np-text);
		font-family: var(--np-font-text);
		font-size: var(--np-size-meta);
		line-height: 1.2;
		cursor: pointer;
	}

	.key:disabled {
		cursor: default;
	}

	.white {
		inline-size: var(--white);
		inset-inline-start: calc(var(--white) * var(--rank));
		block-size: 100%;
		background: var(--np-on-field);
		color: var(--np-text);
	}

	.black {
		inline-size: calc(var(--white) * 0.6);
		inset-inline-start: calc(var(--white) * (var(--rank) + 1) - var(--white) * 0.3);
		block-size: 60%;
		background: var(--np-text);
		color: var(--np-on-field);
		z-index: 1;
	}

	.key:focus-visible {
		outline: 3px solid var(--np-now);
		outline-offset: 2px;
		z-index: 2;
	}

	.key.picked {
		background: var(--np-now);
		color: var(--np-text);
	}
</style>
