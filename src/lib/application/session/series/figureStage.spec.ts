import { describe, expect, it } from 'vitest';
import { exerciseLevelsOf, RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS } from '$lib/domain/exercise';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
	Fraction,
	METER_4_4,
	type CycleReport,
	type Figure,
	type FigureElement,
	type RoundOutcome,
	type RoundPlan
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { PICTURES } from '$lib/application/presentation/pictures';
import { figurePosition, figureStage, levelView, tempoView, type CycleMoment } from './figureStage';

describe('the stage helpers', () => {
	it('write the tempo with its unit and number the levels from 1', () => {
		expect(tempoView({ at: Fraction.ZERO, bpm: 100, unit: Fraction.of(1, 4) })).toEqual({
			bpm: 100,
			unit: '♩'
		});
		const levels = exerciseLevelsOf(RHYTHM_SILENT_BARS);
		expect(levelView(levels, 0)).toEqual({ shown: 1, of: 6, aid: false });
		expect(levelView(levels, -1)).toEqual({ shown: 0, of: 6, aid: true });
	});

	it('place the cursor in the figure from the bar where the cycle began', () => {
		const [two] = RHYTHM_OFFBEATS.figures?.slice(1) ?? [];
		expect(figurePosition({ figure: two.figure, startBar: 0, barInCycle: 1, beat: 2 })).toEqual(
			Fraction.of(3, 2)
		);
		expect(figurePosition({ figure: two.figure, startBar: 1, barInCycle: 1, beat: 0 })).toEqual(
			Fraction.ZERO
		);
	});
});

const quarter: FigureElement = { kind: 'note', duration: Fraction.of(1, 4), content: null };
const QUARTERS: Figure = {
	schema: 2,
	meter: METER_4_4,
	bars: 1,
	voices: [{ id: 'main', elements: [quarter, quarter, quarter, quarter] }]
};

/** The notes of a chord shape over four quarter notes, its chord and its strings above them. */
const ARPEGGIO: ExerciseDefinition = {
	id: 'test-arpeggio',
	version: 1,
	mechanic: 'voicing-figure',
	view: 'figure',
	figures: [{ id: 'quarters', figure: QUARTERS }],
	round: {
		expectations: [
			{
				figure: { id: 'quarters' },
				at: { bars: 0 },
				sensor: 'note',
				content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] },
				window: { ms: 80 }
			}
		],
		length: { bars: 1 },
		handover: 'end',
		policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
	},
	presentation: { primary: '{chord}', secondary: '{strings}' },
	params: { pacing: { respirationBars: 1 } }
};

/** C, first inversion on G-B-E: E, G, C. */
const C_FIRST_INVERSION = { voicing: 'C|maj|3:3,2:5,1:1', occurrence: 0 };

function planned<I>(definition: ExerciseDefinition, item: I): PlannedItem<I> {
	return {
		exerciseId: definition.id,
		mechanic: definition.mechanic,
		exerciseLevel: 0,
		item,
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
}

const planOf = (definition: ExerciseDefinition, item: PlannedItem): RoundPlan =>
	compileRound(definition, item, METER_4_4, { previewBeats: 0, fromRunStart: null });

/** A cycle outcome: its report, passed or failed for `reasons`. */
function outcome(report: CycleReport, reasons: string[]): RoundOutcome {
	return {
		success: reasons.length === 0,
		correct: null,
		verdict: {
			relation: 'cycle',
			version: 1,
			value: reasons.length === 0 ? { passed: true } : { passed: false, reasons }
		},
		measures: report.measures,
		aids: [],
		detail: report
	};
}

const report = (expectations: CycleReport['expectations']): CycleReport => ({
	expectations,
	dropped: [],
	extra: 0,
	shift: null,
	measures: {},
	latency: null
});

function stage(
	definition: ExerciseDefinition,
	item: PlannedItem,
	moment: CycleMoment,
	more: Partial<Parameters<typeof figureStage>[0]> = {}
) {
	return figureStage({
		definition,
		item,
		plan: planOf(definition, item),
		moment,
		barInRound: 0,
		beat: 0,
		startBar: 0,
		muted: false,
		settled: [],
		played: null,
		locale: 'fr',
		random: () => 0,
		chordDiagram: 'strings',
		endedSessions: 0,
		...more
	});
}

describe('figureStage', () => {
	const item = planned(ARPEGGIO, C_FIRST_INVERSION);

	it("shows the exercise's prompt above the figure, and none without a presentation", () => {
		const fields = ITEM_FIELDS['voicing-figure'].fields(C_FIRST_INVERSION, 'fr', () => 0);
		expect(stage(ARPEGGIO, item, 'round').prompt).toEqual({
			primary: fields.chord,
			secondary: fields.strings
		});
		const rhythm = planned(RHYTHM_SILENT_BARS, { figureId: 'eighths', level: 0 });
		expect(stage(RHYTHM_SILENT_BARS, rhythm, 'round').prompt).toBeNull();
		// The staff and the tab come with plan S's last view (Task 12).
		expect(stage(ARPEGGIO, item, 'round').notation).toBeNull();
	});

	it('reads the bars of the round on the plan it is given, compiling nothing on the beat', () => {
		const plan = planOf(ARPEGGIO, item);
		const longer: RoundPlan = { ...plan, length: plan.length.mul(Fraction.of(2)) };
		expect(stage(ARPEGGIO, item, 'round', { plan: longer }).cycleBars).toBe(2);
	});

	it('tells each wrong note of a settled round by its place and the note heard', () => {
		const plan = planOf(ARPEGGIO, item);
		const played = report([
			{ index: 0, verdict: 'on-time', offsetMs: 0 },
			// G asked (the 2nd note of the shape), A played.
			{ index: 1, verdict: 'wrong-pitch', offsetMs: 10, answer: { midi: 69 } },
			{ index: 2, verdict: 'on-time', offsetMs: 0 },
			{ index: 3, verdict: 'missed', offsetMs: null }
		]);
		const model = stage(ARPEGGIO, item, 'breath', {
			played: { item, plan },
			settled: [{ item, plan, outcome: outcome(played, ['missed', 'wrong-pitch']) }]
		});
		expect(model.settled[0].wrongNotes).toEqual([{ at: Fraction.of(1, 4), gap: 'A au lieu de G' }]);
	});

	it('shows the expected shape after a failed derived round, and none after a passed one', () => {
		const plan = planOf(ARPEGGIO, item);
		const failed = report([{ index: 0, verdict: 'missed', offsetMs: null }]);
		const passed = report([{ index: 0, verdict: 'on-time', offsetMs: 0 }]);
		const model = stage(ARPEGGIO, item, 'breath', {
			played: { item, plan },
			settled: [
				{ item, plan, outcome: outcome(failed, ['missed']) },
				{ item, plan, outcome: outcome(passed, []) }
			]
		});
		const shape = PICTURES.shape.draw(C_FIRST_INVERSION);
		expect(shape).toMatchObject({ kind: 'shape' });
		expect(model.settled.map((cycle) => cycle.expected)).toEqual([shape, null]);
		expect(model.chordDiagram).toBe('strings');
	});

	it('shows no shape after a failed round of a figure that derives nothing', () => {
		const rhythm = planned(RHYTHM_SILENT_BARS, { figureId: 'eighths', level: 0 });
		const plan = planOf(RHYTHM_SILENT_BARS, rhythm);
		const failed = report([{ index: 0, verdict: 'missed', offsetMs: null }]);
		const model = stage(RHYTHM_SILENT_BARS, rhythm, 'breath', {
			played: { item: rhythm, plan },
			settled: [{ item: rhythm, plan, outcome: outcome(failed, ['missed']) }]
		});
		expect(model.settled[0]).toMatchObject({ expected: null, wrongNotes: [] });
	});
});
