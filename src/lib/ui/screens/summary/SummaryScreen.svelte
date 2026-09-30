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
	<div class="sheet">
		<header class="title">
			<PixelText scale={3}>{t.title}</PixelText>
		</header>
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
				<li class="fatigue" class:alert={summary.fatigueDetected}>
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
	</div>
</section>

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}

	.summary {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--np-space-4, 32px);
		box-sizing: border-box;
		background-color: var(--np-bg);
		background-image:
			linear-gradient(
				45deg,
				var(--np-mid) 25%,
				transparent 25%,
				transparent 75%,
				var(--np-mid) 75%
			),
			linear-gradient(45deg, var(--np-mid) 25%, transparent 25%, transparent 75%, var(--np-mid) 75%);
		background-position:
			0 0,
			calc(var(--np-tile, 8px)) calc(var(--np-tile, 8px));
		background-size: calc(var(--np-tile, 8px) * 2) calc(var(--np-tile, 8px) * 2);
	}

	.sheet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-3, 24px);
		width: min(100%, 30rem);
		animation: imprint 120ms ease-out both;
	}

	.title {
		margin-block-end: var(--np-space-1, 8px);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: var(--np-space-3, 24px) var(--np-space-4, 32px);
		display: flex;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
		width: 100%;
		box-sizing: border-box;
		font-variant-numeric: tabular-nums;
		font-family: var(--np-font-pixel);
		font-weight: 700;
		text-transform: uppercase;
		color: var(--np-ink);
		background: var(--np-bg);
	}

	.rows li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--np-space-3, 24px);
	}

	.rows span {
		flex: 1 1 auto;
		min-width: 0;
	}

	.rows strong {
		flex: 0 0 auto;
		font-size: 1.25em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.fatigue.alert {
		background: var(--np-ink);
		color: var(--np-bg);
		padding: var(--np-space-1, 8px) var(--np-space-2, 16px);
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-space-2, 16px);
		justify-content: center;
	}

	@keyframes imprint {
		from {
			transform: scale(0.96);
			opacity: 0.85;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet {
			animation: none;
		}
	}
</style>
