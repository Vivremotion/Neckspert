<script lang="ts">
	import { onMount } from 'svelte';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { ManualDemoClock } from '$lib/ui/play/demo/DemoPlaySession.svelte';
	import { DemoGestureSession } from '$lib/ui/play/demo/DemoGestureSession.svelte';

	const clock = new ManualDemoClock();
	const controller = new DemoGestureSession(clock);

	onMount(() => {
		// The demo plays at once: nothing to hear, only the view to see.
		void controller.start();
		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			const dt = now - last;
			last = now;
			if (controller.view.status !== 'paused' && controller.view.status !== 'idle') {
				clock.advance(dt / (60000 / controller.view.tempoBpm));
				controller.tick();
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<PlayFrame {controller} kind="gesture" />
