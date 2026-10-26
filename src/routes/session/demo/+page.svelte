<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { NoteLaneModel } from '$lib/application/mechanics/locate';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
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
	/** The triads still play on their own screen: their shot is drawn there. */
	const triad = $derived(shot === 'triad');

	/** A still note lane: F on the B string, aided or not, at the given place. */
	function lane(place: Omit<NoteLaneModel, 'prompt'>): { view: string; model: NoteLaneModel } {
		return {
			view: 'note-lane',
			model: {
				prompt: {
					primary: 'F',
					secondary: 'corde de B',
					aid: withAid ? 'case 6' : null,
					diagram: withAid ? { string: 2, label: 'B' } : null
				},
				...place
			}
		};
	}

	onMount(() => {
		let raf = 0;
		void (async () => {
			await controller.start();
			if (shot === 'prompt') {
				clock.setBeat(13);
				controller.view.status = 'awaiting';
				controller.view.countdown = null;
				controller.view.stage = lane({
					promptBeat: 12,
					anchorBeat: 16,
					history: [{ beatIndex: 6, verdict: 'late' }],
					verdict: null
				});
				ready = true;
				return;
			}
			if (shot === 'triad') {
				// A triad anchor with a long chord name: the root on its target, the chord on the band.
				clock.setBeat(beat === null ? 12 : Number(beat));
				controller.view.status = 'awaiting';
				controller.view.countdown = null;
				controller.view.stage = null;
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
				// Through the breathing bar after the target, the verdict stays.
				clock.setBeat(14 + late);
				controller.view.status = 'verdict';
				controller.view.countdown = null;
				controller.view.stage = lane({
					promptBeat: 6,
					anchorBeat: 14,
					history: [
						{ beatIndex: 6, verdict: 'perfect' },
						{ beatIndex: 14, verdict: missed ? 'wrong' : 'late' }
					],
					verdict: missed
						? {
								verdict: 'wrong',
								offsetMs: 30,
								answerLabel: 'F#',
								correction: 'corde de B, case 6'
							}
						: { verdict: 'late', offsetMs: 95, answerLabel: 'F', correction: null }
				});
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

{#if ready && triad}
	<PlayScreen {controller} {platesOnly} />
{:else if ready}
	<!-- The notes play in the frame, on their own view. -->
	<PlayFrame {controller} kind="learn" />
{/if}
