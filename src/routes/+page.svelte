<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { RoutineEntry } from '$lib/application/app';
	import { importedProblemCount } from '$lib/application/definitions/problems';
	import { loadedDefinitions } from '$lib/composition/definitions';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const services = useAppServices();

	/** What the load refused of the catalog, files and objects alike. */
	function catalogRefusals() {
		const loaded = loadedDefinitions();
		return loaded ? loaded.catalog.refusals : [];
	}

	let routines = $state<RoutineEntry[]>([]);
	/** The routines were read: the screen waits for them, so Space finds them; a failure is told. */
	let routinesRead = $state(false);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.routines().then(
			(value) => {
				if (!cancelled) {
					routines = value;
					now = Date.now();
					routinesRead = true;
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
		if (!routinesRead) return;
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
{:else if routinesRead}
	<HomeScreen
		{now}
		onstart={start}
		{routines}
		onroutine={startRoutine}
		refused={dev ? catalogRefusals() : []}
		catalogRefused={catalogRefusals().length > 0}
		importedProblems={importedProblemCount(services.definitions.refusals())}
	/>
{/if}
