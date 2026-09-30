<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';

	let controller = $state<PlaySessionController | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		const kind = (page.url.searchParams.get('kind') ?? 'daily') as SessionKind;
		try {
			controller = await useAppServices().startSession(kind);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unavailable';
		}
	});
</script>

{#if error}
	<p>{error}</p>
{:else if controller}
	<PlayScreen {controller} />
{/if}
