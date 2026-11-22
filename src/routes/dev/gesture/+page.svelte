<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import NothingToShow from '$lib/ui/play/demo/NothingToShow.svelte';
	import { demoGestureSeries, gestureDemoExercise } from '$lib/ui/play/demo/demoGestureSeries';

	// `?view=grid`: a climb on the scrolling grid; the link on its lane otherwise. The real
	// session controller plays it, a scripted player strumming each change; « Rejouer » starts again.
	const mode = page.url.searchParams.get('view') === 'grid' ? 'climb' : 'link';
	const demo = gestureDemoExercise(mode) ? demoGestureSeries(mode, () => i18n.locale) : null;

	onMount(() => {
		if (!demo) return;
		const { controller } = demo;
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

{#if demo}
	<PlayFrame controller={demo.controller} />
{:else}
	<NothingToShow text="No exercise plays passages on this view: nothing to show." />
{/if}
