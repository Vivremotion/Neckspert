<script lang="ts">
	import type { SessionSummary } from '$lib/domain/types';
	import SummaryScreen from '$lib/ui/screens/summary/SummaryScreen.svelte';

	const summary: SessionSummary = {
		sessionId: 'dev',
		coldCount: 12,
		coldCorrect: 10,
		medianColdReactionMs: 1050,
		learnedCount: 3,
		fatigueDetected: false,
		nextSuggestedAt: 2 * 60 * 60 * 1000
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
