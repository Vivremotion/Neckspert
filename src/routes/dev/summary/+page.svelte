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
		tempoBpm: 92
	};

	const KEY = 'D|maj|3:5,2:1,1:3';
	const triads: SessionSummary = {
		...summary,
		pool: 'cold',
		grade: null,
		identifyMedianReactionMs: null,
		triads: {
			refused: [
				{
					attemptId: 1,
					mechanic: 'triad-anchor',
					item: { voicingKey: KEY },
					heard: `${KEY}@14-15-14`,
					contested: false
				},
				{
					attemptId: 2,
					mechanic: 'triad-zone',
					item: { voicingKey: KEY, position: 2 },
					heard: null,
					contested: true
				}
			]
		}
	};
</script>

<SummaryScreen {summary} now={0} onhome={() => {}} onmap={() => {}} />
<SummaryScreen summary={triads} now={0} onhome={() => {}} onmap={() => {}} oncontest={() => {}} />

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}
</style>
