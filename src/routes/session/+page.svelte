<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { finishDestination } from '$lib/application/session/finishDestination';
	import { sessionFromQuery } from '$lib/application/session/sessionFromQuery';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { sessionPageMessages } from './messages';

	let controller = $state<PlaySessionController | null>(null);
	/** The frame is shown once the controller has put its first view on stage (`ready`). */
	let ready = $state(false);
	let error = $state<string | null>(null);
	/** The address names no routine and no exercise a file defines: nothing to play. */
	let notFound = $state(false);

	const t = $derived(sessionPageMessages());

	onMount(async () => {
		try {
			const services = useAppServices();
			const origin = sessionFromQuery(page.url.searchParams);
			if (origin === null) {
				notFound = true;
				return;
			}
			controller =
				'routine' in origin
					? await services.startRoutine(origin.routine, { free: origin.free === true })
					: await services.startExercise(origin.exercise);
			// The frame tells the first exercise's instruction on its start screen.
			await controller.ready?.();
			ready = true;
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

{#if error || notFound}
	<!-- The nav bar is hidden on /session: the way out is here. -->
	<div class="error" role="alert">
		<p>{notFound ? t.notFound : error}</p>
		<a href={resolve('/')}>{t.home}</a>
	</div>
{:else if controller && ready}
	<!-- Every session shows its exercise's view in the common frame. -->
	<PlayFrame {controller} quitToSummary />
{/if}

<style>
	.error {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--np-step-4);
		min-height: 100dvh;
		padding: var(--np-step-4);
		box-sizing: border-box;
		background: var(--np-ground);
		color: var(--np-text);
		font-family: var(--np-font-text);
		font-size: var(--np-size-body);
		text-align: center;
	}
	.error p {
		margin: 0;
	}
	.error a {
		color: inherit;
		text-underline-offset: 4px;
	}
</style>
