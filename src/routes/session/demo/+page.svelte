<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';
	import { DemoPlaySession, ManualDemoClock } from '$lib/ui/play/demo/DemoPlaySession.svelte';

	const clock = new ManualDemoClock();
	const controller = new DemoPlaySession({ clock });
	let ready = $state(false);
	const platesOnly = $derived(page.url.searchParams.get('platesOnly') === '1');
	const shot = $derived(page.url.searchParams.get('shot'));
	const withAid = $derived(page.url.searchParams.get('aid') === '1');
	const missed = $derived(page.url.searchParams.get('miss') === '1');
	/** Beats since the target: the played cell slides back through the breathing bar. */
	const late = $derived(Number(page.url.searchParams.get('late') ?? 0) || 0);
	const beat = $derived(page.url.searchParams.get('beat'));

	onMount(() => {
		let raf = 0;
		void (async () => {
			await controller.start();
			if (shot === 'prompt') {
				clock.setBeat(13);
				controller.view.status = 'awaiting';
				controller.view.prompt = {
					primary: 'F',
					secondary: 'corde de B',
					aid: withAid ? 'case 6' : null,
					diagram: withAid ? { string: 2, label: 'B' } : null
				};
				controller.view.promptBeatIndex = 12;
				controller.view.targetBeatIndex = 16;
				controller.view.leadBeats = 4;
				controller.view.lastVerdict = null;
				controller.view.preview = null;
				controller.view.history = [{ beatIndex: 6, verdict: 'late' }];
				ready = true;
				return;
			}
			if (shot === 'triad') {
				// A triad anchor with a long chord name: the root on its target, the chord on the band.
				clock.setBeat(beat === null ? 12 : Number(beat));
				controller.view.status = 'awaiting';
				controller.view.prompt = {
					primary: 'F#dim',
					secondary: 'fondamentale sur sol',
					detail: 'sol‑si‑mi',
					target: 'F#',
					band: 'F#dim',
					aid: null,
					diagram: null
				};
				controller.view.promptBeatIndex = 8;
				controller.view.targetBeatIndex = 16;
				controller.view.followUp = { fromBeat: 17, untilBeat: 20 };
				controller.view.leadBeats = 8;
				controller.view.lastVerdict = null;
				controller.view.preview = null;
				controller.view.history = [{ beatIndex: 4, verdict: 'perfect' }];
				ready = true;
				return;
			}
			if (shot === '1') {
				clock.setBeat(14 + late);
				controller.view.status = 'verdict';
				controller.view.prompt = {
					primary: 'F',
					secondary: 'corde de B',
					aid: withAid ? 'case 6' : null,
					diagram: withAid ? { string: 2, label: 'B' } : null
				};
				controller.view.promptBeatIndex = 8;
				// Through the breathing bar, the next target is not announced yet.
				controller.view.targetBeatIndex = late > 0 ? null : 16;
				controller.view.leadBeats = 8;
				controller.view.history = [
					{ beatIndex: 6, verdict: 'perfect' },
					{ beatIndex: 14, verdict: missed ? 'wrong' : 'late' }
				];
				controller.view.lastVerdict = missed
					? {
							verdict: 'wrong',
							offsetMs: 30,
							reactionMs: null,
							answerLabel: 'F#',
							correction: 'corde de B, case 6'
						}
					: {
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
