<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { RoutineEntry } from '$lib/application/app';
	import { importedProblemCount } from '$lib/application/definitions/problems';
	import { loadedDefinitions } from '$lib/composition/definitions';
	import { exerciseSessionExercises } from '$lib/domain/exercise';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const services = useAppServices();

	function refusalsLoaded() {
		const loaded = loadedDefinitions();
		return loaded ? loaded.catalog.refusals : [];
	}

	let stats = $state<HomeStats | null>(null);
	let routines = $state<RoutineEntry[]>([]);
	/** The routines were read: the screen waits for them, so Space finds them; a failure is told. */
	let routinesRead = $state(false);
	let resting = $state<string[]>([]);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.routines().then(
			(value) => {
				if (!cancelled) {
					routines = value;
					routinesRead = true;
				}
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		void services.resting(exerciseSessionExercises().map((exercise) => exercise.id)).then(
			(value) => {
				if (!cancelled) resting = value;
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

	/** A routine's session, by its id (D6). */
	function startRoutine(id: string) {
		void goto(`/session?routine=${encodeURIComponent(id)}`);
	}

	/** « Commencer » and Space: the first open routine. */
	function start() {
		if (!stats) return;
		const first = routines.find((routine) => routine.open);
		if (first) startRoutine(first.id);
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
{:else if stats && routinesRead}
	<HomeScreen
		{stats}
		{now}
		onstart={start}
		{routines}
		onroutine={startRoutine}
		exercises={exerciseSessionExercises()}
		{resting}
		refused={dev ? refusalsLoaded() : []}
		importedProblems={importedProblemCount(services.definitions.refusals())}
	/>
{/if}
