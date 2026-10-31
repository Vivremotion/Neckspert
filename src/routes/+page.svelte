<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { TriadsHome } from '$lib/application/app';
	import { refusedLocalExercises } from '$lib/composition/localExercises';
	import { exerciseSessionExercises } from '$lib/domain/exercise';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const services = useAppServices();

	let stats = $state<HomeStats | null>(null);
	let triads = $state<TriadsHome>({ anchorDue: 0, zoneDue: null });
	let gesture = $state({ open: false });
	let resting = $state<string[]>([]);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.triads().then(
			(value) => {
				if (!cancelled) triads = value;
			},
			() => {}
		);
		void services.resting(exerciseSessionExercises().map((exercise) => exercise.id)).then(
			(value) => {
				if (!cancelled) resting = value;
			},
			() => {}
		);
		void services.gesture().then(
			(value) => {
				if (!cancelled) gesture = value;
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

	function startTriads(kind: 'triads' | 'triads-zone') {
		void goto(`/session?kind=${kind}`);
	}

	function startGesture() {
		void goto('/session?kind=gesture');
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== ' ') return;
		if (event.repeat) return;
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
		event.preventDefault();
		start();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if error}
	<p role="alert">{error}</p>
{:else if stats}
	<HomeScreen
		{stats}
		{now}
		onstart={start}
		{triads}
		ontriads={startTriads}
		{gesture}
		ongesture={startGesture}
		exercises={exerciseSessionExercises()}
		{resting}
		refused={dev ? refusedLocalExercises() : []}
	/>
{/if}
