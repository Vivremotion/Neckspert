<script lang="ts">
	import '$lib/ui/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { provideAppServices } from '$lib/application/app';
	import { createApp } from '$lib/composition/createApp';
	import { defineMessages, i18n } from '$lib/i18n/index.svelte';

	let { children }: { children: Snippet } = $props();

	const services = createApp();
	provideAppServices(services);

	const navMessages = defineMessages({
		fr: {
			label: 'Navigation',
			home: 'Accueil',
			free: 'Jeu libre',
			map: 'Carte',
			settings: 'Réglages'
		},
		en: { label: 'Navigation', home: 'Home', free: 'Free play', map: 'Neck', settings: 'Settings' }
	});
	const nav = $derived(navMessages());
	const path = $derived(page.url.pathname);
	const kind = $derived(page.url.searchParams.get('kind'));

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
	<nav class="nav" aria-label={nav.label}>
		<a href={resolve('/')} aria-current={path === '/' ? 'page' : undefined}>{nav.home}</a>
		<a
			href={resolve('/session?kind=free')}
			aria-current={path === '/session' && kind === 'free' ? 'page' : undefined}>{nav.free}</a
		>
		<a href={resolve('/map')} aria-current={path === '/map' ? 'page' : undefined}>{nav.map}</a>
		<a href={resolve('/settings')} aria-current={path === '/settings' ? 'page' : undefined}
			>{nav.settings}</a
		>
	</nav>
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

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-space-2);
		padding: var(--np-space-2);
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.nav a {
		color: inherit;
		font-family: var(--np-font-pixel);
		font-size: var(--np-type-body);
		font-weight: 700;
		text-decoration: none;
		text-transform: uppercase;
		padding: 4px 8px;
	}

	.nav a[aria-current='page'] {
		background: var(--np-bg);
		color: var(--np-ink);
	}
</style>
