import type { Component } from 'svelte';
import type { PlaySessionController } from '$lib/application/session/contract';
import AnswerKeysView from './AnswerKeysView.svelte';
import GridScrollView from './GridScrollView.svelte';
import LinkLaneView from './LinkLaneView.svelte';
import NoteLaneView from './NoteLaneView.svelte';
import RhythmFigureView from './RhythmFigureView.svelte';

/** What a play view is given: the session, and the screen model of its mechanic. */
export type PlayViewProps = { controller: PlaySessionController; model: unknown };

/**
 * The play views, by the name an exercise gives (`ExerciseDefinition.view`). A new presentation
 * (the teacher's chart, a score, a track) is one more entry, the engine untouched.
 */
export const PLAY_VIEWS: Record<string, Component<PlayViewProps>> = {
	'answer-keys': AnswerKeysView,
	'grid-scroll': GridScrollView,
	'link-lane': LinkLaneView,
	'note-lane': NoteLaneView,
	'rhythm-figure': RhythmFigureView
};
