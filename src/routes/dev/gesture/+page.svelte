<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { demoGestureSeries } from '$lib/ui/play/demo/demoGestureSeries';

	// `?view=grid`: a climb on the scrolling grid; the link on its lane otherwise. The real
	// session controller plays it, a scripted player strumming each change; « Rejouer » starts again.
	const demo = demoGestureSeries(
		page.url.searchParams.get('view') === 'grid' ? 'climb' : 'link',
		() => i18n.locale
	);
	const controller = demo.controller;

	onMount(() => {
		// The demo plays at once: nothing to hear, only the view to see.
		void controller.start();
		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			demo.advance((now - last) / 1000);
			last = now;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			controller.quit();
		};
	});
</script>

<PlayFrame {controller} kind="gesture" />
