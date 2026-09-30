<script lang="ts">
	import '$lib/ui/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
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
