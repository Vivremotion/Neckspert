<script lang="ts">
	import '$lib/ui/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { provideAppServices } from '$lib/application/app';
	import { createApp } from '$lib/composition/createApp';
	import { defineMessages, i18n } from '$lib/i18n/index.svelte';
	import NavRail from '$lib/ui/primitives/NavRail.svelte';
	import { activeDestination, showsRail } from '$lib/ui/shell/navigation';

	let { children }: { children: Snippet } = $props();

	const services = createApp();
	provideAppServices(services);

	const navMessages = defineMessages({
		fr: {
			label: 'Navigation',
			brand: 'neckspert',
			practice: 'Pratiquer',
			library: 'Bibliothèque',
			progress: 'Progrès',
			settings: 'Réglages'
		},
		en: {
			label: 'Navigation',
			brand: 'neckspert',
			practice: 'Practice',
			library: 'Library',
			progress: 'Progress',
			settings: 'Settings'
		}
	});
	const nav = $derived(navMessages());
	const path = $derived(page.url.pathname);
	const rail = $derived(showsRail(path));
	const items = $derived([
		{ key: 'practice', href: resolve('/'), label: nav.practice },
		{ key: 'library', href: resolve('/session?kind=free'), label: nav.library },
		{ key: 'progress', href: resolve('/map'), label: nav.progress },
		{ key: 'settings', href: resolve('/settings'), label: nav.settings }
	]);

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
	{#if rail}
		<div class="shell">
			<NavRail label={nav.label} brand={nav.brand} {items} current={activeDestination(path)} />
			<main>{@render children()}</main>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	/* No overflow here: the document scrolls, so the rail's sticky binds to the viewport. */
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
	}

	:global(body:has(.shell)) {
		background: var(--np-ground);
	}

	.app {
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100dvh;
		container: app / inline-size;
	}

	/* The light world: the Game Boy rule on html and body stays for the session. */
	.shell {
		--rail-width: 168px;
		display: grid;
		grid-template-columns: var(--rail-width) 1fr;
		min-height: 100dvh;
		background: var(--np-ground);
		color: var(--np-text);
		font-family: var(--np-font-text);
		font-weight: 400;
		-webkit-font-smoothing: auto;
		image-rendering: auto;
	}

	.shell ::selection {
		background: var(--np-text);
		color: var(--np-ground);
	}

	main {
		min-width: 0;
	}

	@container app (width < 720px) {
		.shell {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
	}
</style>
