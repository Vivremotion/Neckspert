<script lang="ts">
	import { playOriginOf } from '$lib/application/session/playOrigin';
	import { routines } from '$lib/domain/routine/registry';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import {
		DEMO_IDENTIFY_SCRIPT,
		DemoIdentifySession,
		identifyDemoExercise
	} from '$lib/ui/play/answer/DemoIdentifySession.svelte';

	import NothingToShow from '$lib/ui/play/demo/NothingToShow.svelte';

	const shown = identifyDemoExercise() !== undefined;

	// Held on the first prompt (case 8, corde de A) until an answer, so `?shot=1` needs nothing more.
	const controller = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);
	// Named as the first routine of the registry (the notes), as the demonstration always was.
	const first = routines()[0];
	if (first) controller.origin = playOriginOf({ routine: first.id });

	$effect(() => {
		if (shown) void controller.start();
	});
</script>

{#if shown}
	<!-- The answer keys, in the frame the notes play in. -->
	<PlayFrame {controller} />
{:else}
	<NothingToShow text="No exercise names places on the neck: nothing to show." />
{/if}
