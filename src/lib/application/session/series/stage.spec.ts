import { describe, expect, it } from 'vitest';
import { figureRules } from '$lib/domain/mechanics';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
import { METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { figurePresenter } from '$lib/application/mechanics/figurePresenters';
import { followsBeats, stageModel } from './stage';

const ITEM: PlannedItem = {
	exerciseId: RHYTHM_SILENT_BARS.id,
	mechanic: figureRules.id,
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

function modelOf(definition: ExerciseDefinition): Record<string, unknown> {
	const plan = compileRound(definition, ITEM, METER_4_4, { previewBeats: 0, fromRunStart: null });
	return stageModel({
		definition,
		item: ITEM,
		presenter: figurePresenter,
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
			live: null
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
});
