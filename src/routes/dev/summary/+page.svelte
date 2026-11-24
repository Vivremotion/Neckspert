<script lang="ts">
	import { exerciseSessionExercises } from '$lib/domain/exercise';
	import type { SessionSummary } from '$lib/domain/types';
	import SummaryScreen from '$lib/ui/screens/summary/SummaryScreen.svelte';

	const summary: SessionSummary = {
		sessionId: 'dev',
		pool: 'all',
		attemptCount: 12,
		correctCount: 10,
		medianOffsetMs: 24,
		identifyMedianReactionMs: 640,
		learnedCount: 3,
		pendingCount: 1,
		fatigueDetected: false,
		nextReviewAt: 2 * 60 * 60 * 1000,
		grade: 'S+',
		tempoBpm: 92,
		chords: false,
		memory: true,
		exercises: [],
		misses: []
	};

	const triads: SessionSummary = {
		...summary,
		pool: 'cold',
		grade: null,
		identifyMedianReactionMs: null,
		chords: true
	};

	/** The last registered exercise played cycle after cycle (the catalog's offbeats). */
	const figureExercise = exerciseSessionExercises().at(-1);

	const rhythm: SessionSummary = {
		...summary,
		pool: 'cold',
		grade: null,
		chords: false,
		memory: false,
		exercises: [
			{
				exerciseId: figureExercise?.id ?? '',
				rounds: 14,
				passed: 11,
				level: { shown: 3, of: 6 },
				tempo: { first: 80, last: 80 },
				inPassages: false,
				passages: null
			}
		]
	};
</script>

<SummaryScreen {summary} now={0} onhome={() => {}} onmap={() => {}} />
<SummaryScreen summary={triads} now={0} onhome={() => {}} onmap={() => {}} />
<SummaryScreen summary={rhythm} now={0} onhome={() => {}} onmap={() => {}} />
