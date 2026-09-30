<script lang="ts">
	import type { SessionSummary } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { coldAccuracyRatio } from '$lib/ui/screens/home/coldAccuracy';
	import { formatRelativeDelay } from '$lib/ui/screens/home/relativeTime';
	import { summaryMessages } from './messages';

	let {
		summary,
		now,
		onhome,
		onmap
	}: {
		summary: SessionSummary;
		now: number;
		onhome: () => void;
		onmap: () => void;
	} = $props();

	const t = $derived(summaryMessages());

	const accuracy = $derived.by(() => {
		const ratio = coldAccuracyRatio(summary.coldCorrect, summary.coldCount);
		if (ratio == null) return t.empty;
		return `${Math.round(ratio * 100)} %`;
	});

	const median = $derived.by(() => {
		if (summary.medianColdReactionMs == null) return t.empty;
		return `${(summary.medianColdReactionMs / 1000).toFixed(2).replace('.', ',')} s`;
	});

	const next = $derived.by(() => {
		if (summary.nextSuggestedAt == null) return t.empty;
		return formatRelativeDelay(summary.nextSuggestedAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
	});
</script>

<section class="summary">
	<PixelText scale={3}>{t.title}</PixelText>
	<PixelBox variant="double">
		<ul class="rows">
			<li>
				<span>{t.accuracy}</span>
				<strong>{accuracy}</strong>
			</li>
			<li>
				<span>{t.median}</span>
				<strong>{median}</strong>
			</li>
			<li>
				<span>{t.learned}</span>
				<strong>{summary.learnedCount}</strong>
			</li>
			<li>
				<span>{summary.fatigueDetected ? t.fatigue : t.noFatigue}</span>
			</li>
			<li>
				<span>{t.next}</span>
				<strong>{next}</strong>
			</li>
		</ul>
	</PixelBox>
	<nav class="nav">
		<PixelButton size="large" onclick={onhome}>{t.home}</PixelButton>
		<PixelButton size="large" onclick={onmap}>{t.map}</PixelButton>
	</nav>
</section>

<style>
	.summary {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(3 * var(--np-tile, 8px));
		padding: calc(4 * var(--np-tile, 8px));
		box-sizing: border-box;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: calc(2 * var(--np-tile, 8px));
		display: flex;
		flex-direction: column;
		gap: var(--np-tile, 8px);
		min-width: min(100%, 22rem);
		font-variant-numeric: tabular-nums;
	}

	.rows li {
		display: flex;
		justify-content: space-between;
		gap: calc(2 * var(--np-tile, 8px));
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-tile, 8px);
		justify-content: center;
	}
</style>
