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

	const triads = $derived(summary.kind === 'triads');

	const t = $derived(summaryMessages());
	const accuracyLabel = $derived(summary.pool === 'all' ? t.accuracyAll : t.accuracy);
	const noCold = $derived(summary.pool === 'cold' && summary.attemptCount === 0);

	const accuracy = $derived.by(() => {
		const ratio = coldAccuracyRatio(summary.correctCount, summary.attemptCount);
		if (ratio == null) return t.empty;
		return `${Math.round(ratio * 100)} %`;
	});

	const median = $derived.by(() => {
		if (summary.medianOffsetMs == null) return t.empty;
		return `${Math.round(summary.medianOffsetMs)} ms`;
	});

	const naming = $derived.by(() => {
		if (summary.identifyMedianReactionMs == null) return t.empty;
		return `${(summary.identifyMedianReactionMs / 1000).toFixed(2).replace('.', ',')} s`;
	});

	const next = $derived.by(() => {
		if (summary.nextReviewAt == null) return t.empty;
		return formatRelativeDelay(summary.nextReviewAt, now, {
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
		{#if summary.grade}
			<p class="grade"><PixelText scale={4}>{summary.grade}</PixelText></p>
		{/if}
		<PixelBox variant="double">
			<ul class="rows">
				{#if summary.tempoBpm !== null}
					<li>
						<span>{t.tempo}</span>
						<strong>{t.bpm(summary.tempoBpm)}</strong>
					</li>
				{/if}
				{#if noCold}
					<li>
						<span>{t.noCold}</span>
					</li>
				{:else}
					<li>
						<span>{accuracyLabel}</span>
						<strong>{accuracy}</strong>
					</li>
					<li>
						<span>{t.median}</span>
						<strong>{median}</strong>
					</li>
					{#if !triads}
						<li>
							<span>{t.naming}</span>
							<strong>{naming}</strong>
						</li>
					{/if}
				{/if}
				<li>
					<span>{triads ? t.learnedTriads : t.learned}</span>
					<strong>{summary.learnedCount}</strong>
				</li>
				{#if summary.knownCount > 0}
					<li>
						<span>{triads ? t.knownTriads(summary.knownCount) : t.known(summary.knownCount)}</span>
					</li>
				{/if}
				{#if summary.pendingCount > 0}
					<li>
						<span
							>{triads
								? t.pendingTriads(summary.pendingCount)
								: t.pending(summary.pendingCount)}</span
						>
					</li>
				{/if}
				<li class="fatigue" class:alert={summary.fatigueDetected}>
					<span>{summary.fatigueDetected ? t.fatigue : t.noFatigue}</span>
				</li>
				{#if summary.pool !== 'all'}
					<li>
						<span>{t.next}</span>
						<strong>{next}</strong>
					</li>
				{/if}
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

	.grade {
		margin: 0;
		text-align: center;
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
		font-size: var(--np-type-body);
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
		font-size: var(--np-type-title);
		font-variant-numeric: tabular-nums;
		white-space: normal;
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
