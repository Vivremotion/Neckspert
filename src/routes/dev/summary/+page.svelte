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
		fatigueDetected: false,
		nextSuggestedAt: 2 * 60 * 60 * 1000,
		grade: 'S+'
	};
</script>

<SummaryScreen {summary} now={0} onhome={() => {}} onmap={() => {}} />

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}
</style>
