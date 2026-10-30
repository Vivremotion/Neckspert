<script lang="ts">
	// Dev only: the figure view in its frame, with a still model, to look at it in a real browser
	// (scripts/functional-ui.mjs checks the Bravura font, the cursor and the text sizes here).
	// `?phase=play` a clicked bar, `?phase=muted` a silent one, `?phase=along` a cycle played along
	// (the anti-blocking's remedy), `?phase=shift` a breath after a beat lost, `?phase=wrong` a
	// breath after wrong notes of a figure derived from a chord shape, its prompt above and the
	// shape asked, the breath otherwise. `?shot=written` a figure written with its notes (a G
	// major scale in position), engraved as staff and tab; `?shot=derived` the triad arpeggio's
	// aid level, the tab of the notes derived from its chord shape under its prompt.
	// The frame tells what the series announces (a remedy, the level reached at the breath).
	import { page } from '$app/state';
	import type { PlayView } from '$lib/application/session/contract';
	import {
		figureStage,
		type FigureStageModel,
		type SettledCycle
	} from '$lib/application/session/series/figureStage';
	import { RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
	import { compileRound } from '$lib/domain/exercise/round';
	import { voicingFigureRules } from '$lib/domain/mechanics/voicingFigure';
	import {
		Fraction,
		METER_4_4,
		type CycleReport,
		type Figure,
		type FigureElement
	} from '$lib/domain/time';
	import type { PlannedItem } from '$lib/domain/types';
	import { ARPEGGIO_EXERCISE, ARPEGGIO_ITEMS } from '$lib/testing/arpeggioExercise';
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
			verdict: passed ? { passed: true } : { passed: false, reasons: ['missed', 'extra'] },
			wrongNotes: [],
			expected: null
		};
	}

	const phase = page.url.searchParams.get('phase');
	const base: FigureStageModel = {
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
		listen: 'free',
		plainWords: true,
		prompt: null,
		notation: { staff: false, tab: false },
		neck: null,
		live: null,
		nextPrompt: null,
		chordDiagram: 'strings'
	};
	/** A failed cycle whose second bar lost a beat. */
	function lostBeat(): SettledCycle {
		const failed = cycle(4, false);
		return {
			report: { ...failed.report, shift: { bar: 1, byS: -0.375 } },
			verdict: { passed: false, reasons: ['shift'] },
			wrongNotes: [],
			expected: null
		};
	}

	/** A failed cycle with two wrong notes in place: bar 1 beat 2, bar 2 beat 2 (eighths 3 and 10). */
	function wrongNotes(): SettledCycle {
		const played = cycle(5, true);
		const wrong = [3, 10];
		return {
			report: {
				...played.report,
				expectations: played.report.expectations.map((e) =>
					wrong.includes(e.index) ? { ...e, verdict: 'wrong-pitch', answer: { midi: 69 } } : e
				)
			},
			verdict: { passed: false, reasons: ['wrong-pitch'] },
			wrongNotes: wrong.map((index) => ({
				at: Fraction.of(index, 8),
				index,
				gap: 'A au lieu de G'
			})),
			expected: {
				kind: 'shape',
				notes: [
					{ string: 3, fret: 9 },
					{ string: 2, fret: 8 },
					{ string: 1, fret: 8 }
				]
			}
		};
	}

	/** An eighth note of `pitch` (MIDI) on `string`. */
	const fretted = (pitch: number, string: number): FigureElement => ({
		kind: 'note',
		duration: Fraction.of(1, 8),
		content: null,
		pitch,
		string
	});
	/** G major in position, up and down: G3 on the D string to G4 on the B string. */
	const SCALE: [number, number][] = [
		[55, 4],
		[57, 4],
		[59, 3],
		[60, 3],
		[62, 3],
		[64, 2],
		[66, 2],
		[67, 2]
	];
	const scale: Figure = {
		schema: 2,
		meter: METER_4_4,
		bars: 2,
		voices: [
			{
				id: 'main',
				elements: [...SCALE, ...[...SCALE].reverse()].map(([pitch, string]) =>
					fretted(pitch, string)
				)
			}
		]
	};
	const written: FigureStageModel = {
		...base,
		exerciseLabel: 'Gamme de sol',
		level: { shown: 1, of: 3, aid: false },
		figure: scale,
		barInCycle: 0,
		cycleBars: 2,
		cursor: Fraction.of(3, 8),
		notation: { staff: true, tab: true }
	};

	/** The arpeggio's aid level, its round under way: the tab of the C chord's notes. */
	function derived(): FigureStageModel {
		const item: PlannedItem = {
			exerciseId: ARPEGGIO_EXERCISE.id,
			mechanic: ARPEGGIO_EXERCISE.mechanic,
			exerciseLevel: -1,
			item: voicingFigureRules.parseItem(ARPEGGIO_ITEMS[0]),
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		};
		return figureStage({
			definition: ARPEGGIO_EXERCISE,
			item,
			plan: compileRound(ARPEGGIO_EXERCISE, item, METER_4_4, {
				previewBeats: 0,
				fromRunStart: null
			}),
			moment: 'round',
			barInRound: 0,
			beat: 1,
			startBar: 0,
			muted: false,
			settled: [],
			played: null,
			locale: 'fr',
			random: () => 0,
			chordDiagram: 'strings',
			endedSessions: 0
		});
	}

	const shot = page.url.searchParams.get('shot');
	const breath: FigureStageModel = {
		...base,
		phase: 'breath',
		cursor: null,
		next: figure,
		settled: [cycle(0, true), cycle(1, false), cycle(2, true), cycle(3, true)],
		level: { shown: 4, of: 6, aid: false }
	};
	const model: FigureStageModel =
		shot === 'written'
			? written
			: shot === 'derived'
				? derived()
				: phase === 'play' || phase === 'along'
					? base
					: phase === 'muted'
						? { ...base, barInCycle: 0, muted: true }
						: phase === 'shift'
							? { ...breath, settled: [lostBeat()] }
							: phase === 'wrong'
								? {
										...breath,
										settled: [wrongNotes()],
										prompt: { primary: 'Do', secondary: 'cordes sol, si, mi' }
									}
								: breath;
	const announcement: PlayView['announcement'] =
		phase === 'along'
			? { kind: 'play-along', level: 2, of: 6, tempoBpm: 80 }
			: phase === null && shot === null
				? { kind: 'level-up', level: 3, of: 6, tempoBpm: 80 }
				: null;

	const controller = new DevRhythmController();
	controller.view.status = 'awaiting';
	controller.view.stage = { view: 'figure', model };
	controller.view.announcement = announcement;
</script>

<PlayFrame {controller} kind="exercise" />
