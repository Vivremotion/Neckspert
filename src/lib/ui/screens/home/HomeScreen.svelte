<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
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
	<div class="cartridge">
		<PixelBox variant="double">
			<div class="inner">
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
			</div>
		</PixelBox>
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

	.home {
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

	.cartridge {
		width: min(100%, 28rem);
		animation: imprint 120ms ease-out both;
	}

	.inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-8, 64px);
		padding: var(--np-space-6, 48px) var(--np-space-4, 32px);
		box-sizing: border-box;
		background: var(--np-bg);
	}

	.action {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-1, 8px);
		font-variant-numeric: tabular-nums;
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
		.cartridge {
			animation: none;
		}
	}
</style>
