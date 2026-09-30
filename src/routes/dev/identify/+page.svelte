<script lang="ts">
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';
	import {
		DEMO_IDENTIFY_SCRIPT,
		DemoIdentifySession
	} from '$lib/ui/play/answer/DemoIdentifySession.svelte';

	const controller = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);

	$effect(() => {
		void controller.start();
	});
</script>

<PlayScreen {controller} />
