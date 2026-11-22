import { describe, expect, it } from 'vitest';
import { figureSet } from '$lib/domain/sets';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { figurePresenter } from '$lib/application/sets/figurePresenters';
import { followsBeats, stageModel } from './stage';
import { GESTURE_CLIMB, GESTURE_LINK, RHYTHM_SILENT_BARS } from '$lib/testing/catalog';
import { servedPassageRound } from '$lib/testing/changesPassages';
import { changePresenter, linkPresenter } from '$lib/application/sets/chordGrid';
import type { SetPresenter } from '$lib/application/sets/types';

const ITEM: PlannedItem = {
	exerciseId: RHYTHM_SILENT_BARS.id,
	skill: figureSet.id,
	exerciseLevel: 0,
	item: { figureId: 'eighths', level: 0 },
	phase: 'learning',
	temperature: 'hot',
	aid: 'none',
	leadBeats: null
};

/** The rhythm's figure with a prompt over it, drawn by `view`. */
const prompted = (view: string): ExerciseDefinition => ({
	...RHYTHM_SILENT_BARS,
	view,
	presentation: { primary: 'Joue la figure' }
});

function modelOf(
	definition: ExerciseDefinition,
	item: PlannedItem = ITEM,
	presenter: SetPresenter = figurePresenter
): Record<string, unknown> {
	const plan = compileRound(definition, item, METER_4_4, { previewBeats: 0, fromRunStart: null });
	return stageModel({
		definition,
		item,
		presenter,
		plan,
		settled: null,
		place: { anchorBeat: null, promptBeat: null, history: [], bands: [] },
		beatsPerBar: 4,
		chordDiagram: 'strings',
		locale: 'fr',
		random: () => 0,
		moment: { phase: 'round', barInRound: 0, beat: 0, fromRunStart: 0, muted: false },
		runRounds: [],
		endedSessions: 0,
		played: null,
		live: null,
		coming: null
	}) as Record<string, unknown>;
}

describe('the stage dispatch', () => {
	it('builds the figure stage for an exercise drawn by the figure view, its prompt above', () => {
		const model = modelOf(prompted('figure'));
		expect(model.phase).toBe('play');
		expect(model.prompt).toEqual({ primary: 'Joue la figure', secondary: null });
		expect(modelOf(RHYTHM_SILENT_BARS).prompt).toBeNull();
	});

	it('keeps the prompt stage for a figure drawn on the lane', () => {
		const model = modelOf(prompted('lane'));
		expect(model.phase).toBeUndefined();
		expect(model.prompt).toMatchObject({ primary: 'Joue la figure' });
	});

	it('follows the beats in the figure view only', () => {
		expect(followsBeats(RHYTHM_SILENT_BARS)).toBe(true);
		expect(followsBeats(prompted('figure'))).toBe(true);
		expect(followsBeats(prompted('lane'))).toBe(false);
		expect(followsBeats({ ...RHYTHM_SILENT_BARS, view: undefined })).toBe(false);
	});

	it('builds the passage stage for an exercise that writes its presentation and passages on a passage view', () => {
		const climb = { ...GESTURE_CLIMB, presentation: { primary: '{symbol}', target: '{symbol}' } };
		const { planned } = servedPassageRound(climb, 'grid=iohefy-a;strings=3,2,1', 1, {
			direction: 'up'
		});
		const model = modelOf(climb, planned, changePresenter);
		expect(model.index).toBe(1);
		expect((model.rounds as unknown[]).length).toBeGreaterThan(1);
		expect(model).toMatchObject({ prompt: { primary: 'G7' } });
		const link = { ...GESTURE_LINK, presentation: { primary: '{chord}' } };
		const tour = servedPassageRound(link, 'chord=D;strings=3,2,1', 0).planned;
		expect(modelOf(link, tour, linkPresenter)).toHaveProperty('rounds');
	});

	it("keeps the presenter's own model for a passage exercise without a presentation", () => {
		const { presentation: _presentation, ...bare } = GESTURE_CLIMB;
		const { planned } = servedPassageRound(bare, 'grid=iohefy-a;strings=3,2,1', 1, {
			direction: 'up'
		});
		const own = { ...changePresenter, stageOf: () => ({ model: { own: true } }) };
		const model = modelOf(bare, planned, own);
		expect(model).toEqual({ own: true });
	});

	it('keeps the prompt stage for a passage exercise drawn on the lane', () => {
		const climb = {
			...GESTURE_CLIMB,
			view: 'lane',
			presentation: { primary: '{symbol}' }
		};
		const { planned } = servedPassageRound(climb, 'grid=iohefy-a;strings=3,2,1', 1, {
			direction: 'up'
		});
		const model = modelOf(climb, planned, changePresenter);
		expect(model).toHaveProperty('promptBeat');
		expect(model).not.toHaveProperty('rounds');
	});
});
