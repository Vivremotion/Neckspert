<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { formatRelativeDelay } from './relativeTime';
	import { formatTrend } from './trend';
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

	/** Due reviews, or when the next ones come; nothing without a learned card. */
	const reviews = $derived.by((): { label: string; delay: string | null } | null => {
		if (stats.dueCount > 0) return { label: t.due(stats.dueCount), delay: null };
		if (stats.nextReviewAt == null) return null;
		return {
			label: t.nextReviews,
			delay: formatRelativeDelay(stats.nextReviewAt, now, {
				soon: t.soon,
				inMinutes: t.inMinutes,
				inHours: t.inHours,
				inDays: t.inDays
			})
		};
	});

	const reaction = $derived.by(() => {
		if (stats.medianColdOffsetMs == null) return t.emptyReaction;
		return `${Math.round(stats.medianColdOffsetMs)} ms`;
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
				<p class="how"><PixelText scale={1}>{t.how}</PixelText></p>
				<div class="action">
					<PixelButton size="huge" onclick={onstart}>
						{t.session}
					</PixelButton>
					{#if reviews}
						<p class="reviews">
							<PixelText scale={1}>{reviews.label}</PixelText>
							{#if reviews.delay}
								<PixelText scale={1}>{reviews.delay}</PixelText>
							{/if}
						</p>
					{/if}
				</div>
				<div class="stat">
					<p class="caption"><PixelText scale={1}>{t.reactionLabel}</PixelText></p>
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

	.how {
		margin: 0;
		max-width: 28rem;
		text-align: center;
	}

	.action {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-2, 16px);
	}

	.reviews {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--np-space-1, 8px);
		text-align: center;
	}

	.action :global(button) {
		width: 100%;
		max-width: 100%;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--np-space-1, 8px);
		font-variant-numeric: tabular-nums;
	}

	.caption {
		margin: 0;
		text-transform: uppercase;
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
