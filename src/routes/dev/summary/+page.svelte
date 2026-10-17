<script lang="ts">
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
		knownCount: 3,
		fatigueDetected: false,
		nextReviewAt: 2 * 60 * 60 * 1000,
		grade: 'S+',
		tempoBpm: 92,
		kind: 'learn'
	};

	const triads: SessionSummary = {
		...summary,
		pool: 'cold',
		grade: null,
		identifyMedianReactionMs: null,
		kind: 'triads'
	};

	const rhythm: SessionSummary = {
		...summary,
		pool: 'cold',
		grade: null,
		kind: 'exercise',
		exercise: {
			exerciseId: 'rhythm-offbeats',
			levelReached: { shown: 3, of: 6, aid: false },
			cycles: 14,
			successes: 11,
			aided: 2
		}
	};
</script>

<SummaryScreen {summary} now={0} onhome={() => {}} onmap={() => {}} />
<SummaryScreen summary={triads} now={0} onhome={() => {}} onmap={() => {}} />
<SummaryScreen summary={rhythm} now={0} onhome={() => {}} onmap={() => {}} />

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}
</style>
