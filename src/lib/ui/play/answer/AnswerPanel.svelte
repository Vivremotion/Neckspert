<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import AnswerPad from './AnswerPad.svelte';
	import { identifyChoices } from './choices';

	let { controller }: { controller: PlaySessionController } = $props();

	const choices = $derived(controller.view.answerChoices ?? identifyChoices());
	const disabled = $derived(controller.view.status !== 'awaiting');
</script>

<AnswerPad {choices} {disabled} onanswer={(pitch) => controller.answer(pitch)} />
