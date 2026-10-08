<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const services = useAppServices();

	let stats = $state<HomeStats | null>(null);
	let triadsDue = $state(0);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.triadsDue().then(
			(value) => {
				if (!cancelled) triadsDue = value;
			},
			() => {}
		);
		void services.homeStats().then(
			(value) => {
				if (!cancelled) {
					stats = value;
					now = Date.now();
				}
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		return () => {
			cancelled = true;
		};
	});

	function start() {
		if (!stats) return;
		void goto('/session?kind=learn');
	}

	function startTriads() {
		void goto('/session?kind=triads');
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== ' ') return;
		if (event.repeat) return;
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
		event.preventDefault();
		start();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if error}
	<p role="alert">{error}</p>
{:else if stats}
	<HomeScreen {stats} {now} onstart={start} {triadsDue} ontriads={startTriads} />
{/if}
