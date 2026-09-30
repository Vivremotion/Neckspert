<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { formatRelativeDelay } from './relativeTime';
	import { formatTrend } from './trend';
	import { isHomeActionEnabled } from './homeAction';
	import { homeMessages } from './messages';

	let {
		stats,
		now,
		onstart
	}: {
		stats: HomeStats;
		now: number;
		onstart: () => void;
	} = $props();

	const t = $derived(homeMessages());

	const enabled = $derived(isHomeActionEnabled(stats.nextAction));

	const buttonLabel = $derived.by(() => {
		if (stats.nextAction === 'placement') return t.placement;
		if (stats.nextAction === 'session') return t.session;
		if (stats.nextReviewAt == null) return t.soon;
		return formatRelativeDelay(stats.nextReviewAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
	});

	const reaction = $derived.by(() => {
		if (stats.medianColdReactionMs == null) return t.emptyReaction;
		const seconds = stats.medianColdReactionMs / 1000;
		return `${seconds.toFixed(2).replace('.', ',')} s`;
	});

	const trend = $derived(
		formatTrend(stats.trend, {
			improving: t.improving,
			stable: t.stable,
			worsening: t.worsening
		})
	);
</script>

<section class="home" aria-label="Neckspert Play">
	<div class="action">
		<PixelButton size="huge" disabled={!enabled} onclick={onstart}>
			{buttonLabel}
		</PixelButton>
	</div>
	<div class="stat">
		<PixelText scale={4}>{reaction}</PixelText>
		{#if trend}
			<PixelText scale={1}>{trend}</PixelText>
		{/if}
	</div>
</section>

<style>
	.home {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(8 * var(--np-tile, 8px));
		padding: calc(4 * var(--np-tile, 8px));
		box-sizing: border-box;
	}

	.action {
		width: min(100%, 28rem);
		display: flex;
		justify-content: center;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-tile, 8px);
		font-variant-numeric: tabular-nums;
	}
</style>
