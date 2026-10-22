<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import AnswerKeyboard from './AnswerKeyboard.svelte';
	import { identifyChoices } from './choices';

	let { controller }: { controller: PlaySessionController } = $props();

	const choices = $derived(controller.view.answerChoices ?? identifyChoices());
	const disabled = $derived(controller.view.status !== 'awaiting');
</script>

<AnswerKeyboard {choices} {disabled} onanswer={(value) => controller.answer(value)} />
