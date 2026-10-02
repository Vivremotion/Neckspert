<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { finishDestination } from '$lib/application/session/finishDestination';
	import type { SessionKind } from '$lib/domain/types';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';

	let controller = $state<PlaySessionController | null>(null);
	let error = $state<string | null>(null);

	const kind = $derived((page.url.searchParams.get('kind') ?? 'learn') as SessionKind);

	onMount(async () => {
		try {
			controller = await useAppServices().startSession(kind);
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
		const href = finishDestination(kind, controller.sessionId);
		if (!href) return;
		left = true;
		void goto(href);
	});
</script>

{#if error}
	<p>{error}</p>
{:else if controller}
	<PlayScreen {controller} quitToSummary={kind !== 'placement'} />
{/if}
