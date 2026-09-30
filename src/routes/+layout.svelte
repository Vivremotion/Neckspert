<script lang="ts">
	import '$lib/ui/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { provideAppServices } from '$lib/application/app';
	import { createApp } from '$lib/composition/createApp';
	import { i18n } from '$lib/i18n/index.svelte';

	let { children }: { children: Snippet } = $props();

	const services = createApp();
	provideAppServices(services);

	$effect(() => {
		let cancelled = false;
		void services.settings.get().then((settings) => {
			if (!cancelled) i18n.locale = settings.locale;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
	{@render children()}
</div>

<style>
	.app {
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100dvh;
		container: app / inline-size;
	}
</style>
