<script lang="ts">
	// Dev only: the rhythm view in its frame, with a still model, to look at it in a real browser
	// (scripts/functional-ui.mjs checks the Bravura font, the cursor and the text sizes here).
	// `?phase=play` a clicked bar, `?phase=muted` a silent one, `?phase=along` a cycle played along
	// (the anti-blocking's remedy), `?phase=shift` a breath after a beat lost, the breath otherwise.
	import { page } from '$app/state';
	import type { RhythmStageModel, SettledCycle } from '$lib/application/session/plan/rhythmStage';
	import { RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
	import { Fraction, type CycleReport } from '$lib/domain/time';
	import PlayFrame from '$lib/ui/play/PlayFrame.svelte';
	import { StageController } from '$lib/ui/play/views/testing/StageController.svelte';

	/** A still session: listening and replaying only say so. */
	class DevRhythmController extends StageController {
		listen(): void {
			this.calls.push('listen');
		}

		replay(): Promise<void> {
			this.calls.push('replay');
			return new Promise((resolve) => setTimeout(resolve, 1500));
		}
	}

	const figure = RHYTHM_SILENT_BARS.figures?.[0]?.figure;
	if (!figure) throw new Error('the silent bars exercise has no figure');

	/** A cycle of four bars of eighths (32 attacks), bar 0 muted; offsets drawn from `seed`. */
	function cycle(seed: number, passed: boolean): SettledCycle {
		const expectations: CycleReport['expectations'] = Array.from({ length: 32 }, (_, index) => {
			const offsetMs = Math.round(Math.sin(index * 1.7 + seed) * 40);
			if (!passed && index === 5) return { index, verdict: 'missed', offsetMs: null };
			const verdict = Math.abs(offsetMs) <= 30 ? 'on-time' : offsetMs < 0 ? 'early' : 'late';
			return { index, verdict, offsetMs };
		});
		return {
			report: {
				expectations,
				dropped: [],
				extra: passed ? 0 : 1,
				shift: null,
				measures: {
					holdOffset: { value: -35, unit: 'ms' },
					regularity: { value: 24, unit: 'ms' }
				},
				latency: { ms: 18, provenance: 'player' }
			},
			verdict: passed ? { passed: true } : { passed: false, reasons: ['missed', 'extra'] }
		};
	}

	const phase = page.url.searchParams.get('phase');
	const base: RhythmStageModel = {
		phase: 'play',
		exerciseLabel: 'Mesures silencieuses',
		level: { shown: 3, of: 6, aid: false },
		tempo: { bpm: 80, unit: '♩' },
		figure,
		next: null,
		barInCycle: 1,
		cycleBars: 4,
		muted: false,
		cursor: Fraction.of(3, 8),
		feedback: 'every-cycle',
		settled: [],
		announcement: null,
		listen: 'free',
		plainWords: true
	};
	/** A failed cycle whose second bar lost a beat. */
	function lostBeat(): SettledCycle {
		const failed = cycle(4, false);
		return {
			report: { ...failed.report, shift: { bar: 1, byS: -0.375 } },
			verdict: { passed: false, reasons: ['shift'] }
		};
	}

	const breath: RhythmStageModel = {
		...base,
		phase: 'breath',
		cursor: null,
		next: figure,
		settled: [cycle(0, true), cycle(1, false), cycle(2, true), cycle(3, true)],
		announcement: 'level-up',
		level: { shown: 4, of: 6, aid: false }
	};
	const model: RhythmStageModel =
		phase === 'play'
			? base
			: phase === 'muted'
				? { ...base, barInCycle: 0, muted: true }
				: phase === 'along'
					? { ...base, announcement: 'play-along' }
					: phase === 'shift'
						? { ...breath, settled: [lostBeat()], announcement: null }
						: {
								...base,
								phase: 'breath',
								cursor: null,
								next: figure,
								settled: [cycle(0, true), cycle(1, false), cycle(2, true), cycle(3, true)],
								announcement: 'level-up',
								level: { shown: 4, of: 6, aid: false }
							};

	const controller = new DevRhythmController();
	controller.view.status = 'awaiting';
	controller.view.stage = { view: 'rhythm-figure', model };
</script>

<PlayFrame {controller} kind="exercise" />
