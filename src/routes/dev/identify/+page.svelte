<script lang="ts">
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import {
		DEMO_IDENTIFY_SCRIPT,
		DemoIdentifySession
	} from '$lib/ui/play/answer/DemoIdentifySession.svelte';

	// Held on the first prompt (case 8, corde de A) until an answer, so `?shot=1` needs nothing more.
	const controller = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);

	$effect(() => {
		void controller.start();
	});
</script>

<!-- The answer keys, in the frame the notes play in. -->
<PlayFrame {controller} kind="learn" />
