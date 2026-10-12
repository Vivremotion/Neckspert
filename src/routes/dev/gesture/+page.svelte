<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { ManualDemoClock } from '$lib/ui/play/demo/DemoPlaySession.svelte';
	import { DemoGestureSession } from '$lib/ui/play/demo/DemoGestureSession.svelte';

	// `?view=grid`: a climb on the scrolling grid; the link on its path otherwise.
	const clock = new ManualDemoClock();
	const controller = new DemoGestureSession(
		clock,
		page.url.searchParams.get('view') === 'grid' ? 'climb' : 'link'
	);

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
