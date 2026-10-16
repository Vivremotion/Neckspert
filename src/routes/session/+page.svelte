<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { exerciseFromQuery } from '$lib/application/session/exerciseFromQuery';
	import { finishDestination } from '$lib/application/session/finishDestination';
	import { sessionKindFromQuery } from '$lib/application/session/sessionKindFromQuery';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';

	let controller = $state<PlaySessionController | null>(null);
	let error = $state<string | null>(null);

	const kind = $derived(sessionKindFromQuery(page.url.searchParams.get('kind')));

	/** The common frame shows the exercise's own view: the gesture track and the rhythm exercises. */
	const framed = $derived(kind === 'gesture' || kind === 'exercise');

	onMount(async () => {
		try {
			const services = useAppServices();
			if (kind === 'exercise') {
				const exerciseId = exerciseFromQuery(page.url.searchParams.get('exercise'));
				if (exerciseId === null) {
					// A link to an exercise that does not exist: nothing to play, back to the home screen.
					void goto('/', { replaceState: true });
					return;
				}
				controller = await services.startExercise(exerciseId);
			} else {
				controller = await services.startSession(kind);
			}
			// The frame tells the first exercise's instruction on its start screen.
			if (framed) await controller.ready?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unavailable';
		}
	});

	onDestroy(() => {
		if (!controller) return;
		if (controller.view.status === 'idle' || controller.view.status === 'finished') return;
		controller.quit();
	});

	let left = false;

	$effect(() => {
		if (left || !controller || controller.view.status !== 'finished') return;
		const href = finishDestination(controller.sessionId);
		left = true;
		void goto(href);
	});
</script>

{#if error}
	<p>{error}</p>
{:else if controller && framed}
	<!-- The gesture track and the rhythm exercises show their view in the common frame; notes and triads keep their screen. -->
	<PlayFrame {controller} {kind} quitToSummary />
{:else if controller}
	<PlayScreen {controller} {kind} quitToSummary />
{/if}
