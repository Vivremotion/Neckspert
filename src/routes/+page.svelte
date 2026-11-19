<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { RoutineEntry } from '$lib/application/app';
	import { importedProblemCount } from '$lib/application/definitions/problems';
	import { loadedDefinitions } from '$lib/composition/definitions';
	import { exerciseSessionExercises } from '$lib/domain/exercise';
	import { sessionKindOf, type HomeStats, type SessionKind } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const services = useAppServices();

	function refusalsLoaded() {
		const loaded = loadedDefinitions();
		return loaded ? loaded.catalog.refusals : [];
	}

	let stats = $state<HomeStats | null>(null);
	let routines = $state<RoutineEntry[]>([]);
	/** The routines were read (or failed to be): the screen waits for them, so Space finds them. */
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
			() => {
				if (!cancelled) routinesRead = true;
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

	/**
	 * The bridge until Task 4 of plan 5a starts a session by its routine: the kind of session the
	 * stored origins name for the routine of `id`; null for a routine they do not know (an
	 * imported one), which cannot be started yet.
	 */
	function kindOf(id: string): Exclude<SessionKind, 'exercise'> | null {
		const kind = sessionKindOf({ routine: id });
		return kind === 'exercise' ? null : kind;
	}

	function startRoutine(id: string) {
		const kind = kindOf(id);
		if (kind !== null) void goto(`/session?kind=${kind}`);
	}

	/** « Commencer » and Space: the first open routine that can be started. */
	function start() {
		if (!stats) return;
		const first = routines.find((routine) => routine.open && kindOf(routine.id) !== null);
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
		startable={(id) => kindOf(id) !== null}
		exercises={exerciseSessionExercises()}
		{resting}
		refused={dev ? refusalsLoaded() : []}
		importedProblems={importedProblemCount(services.definitions.refusals())}
	/>
{/if}
