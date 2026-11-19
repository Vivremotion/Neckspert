<script lang="ts">
	import { playOriginOf } from '$lib/application/session/playOrigin';
	import { routines } from '$lib/domain/routine/registry';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import {
		DEMO_IDENTIFY_SCRIPT,
		DemoIdentifySession
	} from '$lib/ui/play/answer/DemoIdentifySession.svelte';

	// Held on the first prompt (case 8, corde de A) until an answer, so `?shot=1` needs nothing more.
	const controller = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);
	// Named as the first routine of the registry (the notes), as the demonstration always was.
	const first = routines()[0];
	if (first) controller.origin = playOriginOf({ routine: first.id });

	$effect(() => {
		void controller.start();
	});
</script>

<!-- The answer keys, in the frame the notes play in. -->
<PlayFrame {controller} />
