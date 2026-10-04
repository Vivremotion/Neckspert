<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';
	import { DemoPlaySession, ManualDemoClock } from '$lib/ui/play/demo/DemoPlaySession.svelte';

	const clock = new ManualDemoClock();
	const controller = new DemoPlaySession({ clock });
	let ready = $state(false);
	const platesOnly = $derived(page.url.searchParams.get('platesOnly') === '1');
	const shot = $derived(page.url.searchParams.get('shot') === '1');
	const withAid = $derived(page.url.searchParams.get('aid') === '1');

	onMount(() => {
		let raf = 0;
		void (async () => {
			await controller.start();
			if (shot) {
				clock.setBeat(14);
				controller.view.status = 'verdict';
				controller.view.prompt = {
					direction: 'locate',
					primary: 'F',
					secondary: 'corde de B',
					aid: withAid ? 'case 6' : null,
					diagram: null
				};
				controller.view.promptBeatIndex = 8;
				controller.view.targetBeatIndex = 16;
				controller.view.leadBeats = 8;
				controller.view.history = [
					{ beatIndex: 10, verdict: 'perfect' },
					{ beatIndex: 11, verdict: 'perfect' },
					{ beatIndex: 12, verdict: 'early' },
					{ beatIndex: 13, verdict: 'wrong' },
					{ beatIndex: 14, verdict: 'late' }
				];
				controller.view.lastVerdict = {
					verdict: 'late',
					offsetMs: 95,
					reactionMs: 1210,
					answerLabel: 'F',
					correction: null
				};
				ready = true;
				return;
			}
			ready = true;
			let last = performance.now();
			const loop = (now: number) => {
				const dt = now - last;
				last = now;
				if (controller.view.status !== 'paused') {
					const beats = dt / (60000 / controller.view.tempoBpm);
					clock.setBeat(clock.nowBeat() + beats);
					controller.tick();
				}
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
		})();
		return () => cancelAnimationFrame(raf);
	});
</script>

{#if ready}
	<PlayScreen {controller} {platesOnly} />
{/if}
