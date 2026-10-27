<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { PromptStageModel } from '$lib/application/presentation';
	import type { Picture } from '$lib/application/presentation/pictures';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { DemoPlaySession, ManualDemoClock } from '$lib/ui/play/demo/DemoPlaySession.svelte';

	const clock = new ManualDemoClock();
	const controller = new DemoPlaySession({ clock });
	let ready = $state(false);
	const shot = $derived(page.url.searchParams.get('shot'));
	const withAid = $derived(page.url.searchParams.get('aid') === '1');
	const missed = $derived(page.url.searchParams.get('miss') === '1');
	/** Beats since the target: the played cell slides back through the breathing bar. */
	const late = $derived(Number(page.url.searchParams.get('late') ?? 0) || 0);
	const beat = $derived(page.url.searchParams.get('beat'));

	/** F# diminished on the G, B and E strings, the shape the aid draws. */
	const F_SHARP_DIM: Picture = {
		kind: 'shape',
		notes: [
			{ string: 3, fret: 11 },
			{ string: 2, fret: 10 },
			{ string: 1, fret: 8 }
		]
	};
	/** The same shape a fret too high: what a miss draws as heard. */
	const HEARD_DIM: Picture = {
		kind: 'shape',
		notes: [
			{ string: 3, fret: 12 },
			{ string: 2, fret: 11 },
			{ string: 1, fret: 9 }
		]
	};

	/** A still note lane: F on the B string, aided or not, at the given place. */
	function lane(
		place: Pick<PromptStageModel, 'anchorBeat' | 'promptBeat' | 'history' | 'verdict'>
	): { view: string; model: PromptStageModel } {
		return {
			view: 'lane',
			model: {
				prompt: {
					primary: 'F',
					secondary: 'corde de B',
					detail: null,
					target: null,
					band: null,
					preview: 'corde de B',
					aid: withAid ? 'case 6' : null,
					pictures: withAid ? [{ kind: 'string', string: 2, label: 'B' }] : []
				},
				bands: [],
				beatsPerBar: 4,
				chordDiagram: 'strings',
				choices: [],
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
				const settled = missed || late > 0;
				clock.setBeat(beat === null ? (settled ? 17 + late : 12) : Number(beat));
				controller.view.status = settled ? 'verdict' : 'awaiting';
				controller.view.countdown = null;
				controller.view.stage = {
					view: 'lane',
					model: {
						prompt: {
							primary: 'F#dim',
							secondary: 'fondamentale sur sol',
							detail: 'sol‑si‑mi',
							target: 'F#',
							band: 'F#dim',
							preview: 'fondamentale sur sol',
							aid: null,
							pictures: [F_SHARP_DIM]
						},
						anchorBeat: 16,
						promptBeat: 8,
						history: settled
							? [
									{ beatIndex: 4, verdict: 'perfect' },
									{ beatIndex: 16, verdict: 'wrong' }
								]
							: [{ beatIndex: 4, verdict: 'perfect' }],
						bands: [{ fromBeat: 17, untilBeat: 20 }],
						beatsPerBar: 4,
						verdict: settled
							? {
									verdict: 'wrong',
									offsetMs: null,
									answerLabel: '12 · 11 · 9',
									misses: [
										{
											correction: null,
											heard: HEARD_DIM,
											expected: F_SHARP_DIM,
											gap: 'une case plus bas'
										}
									]
								}
							: null,
						chordDiagram: 'strings',
						choices: []
					} satisfies PromptStageModel
				};
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
								misses: [
									{
										correction: 'corde de B, case 6',
										heard: null,
										expected: null,
										gap: null
									}
								]
							}
						: { verdict: 'late', offsetMs: 95, answerLabel: 'F', misses: [] }
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

{#if ready}
	<!-- The notes and the triads play in the frame, on the same lane view. -->
	<PlayFrame {controller} kind="learn" />
{/if}
