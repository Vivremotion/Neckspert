<script lang="ts">
	import type { TriadsHome } from '$lib/application/app';
	import type { ExerciseDefinition } from '$lib/domain/exercise';
	import { i18n } from '$lib/i18n/index.svelte';
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
		onstart,
		triads = { anchorDue: 0, zoneDue: null },
		ontriads,
		gesture = { open: false },
		ongesture,
		rhythm
	}: {
		stats: HomeStats;
		now: number;
		onstart: () => void;
		/** The triads exercises: reviews due, and whether the zone is open. */
		triads?: TriadsHome;
		/** Starts a session of one triads exercise; without it, no triads button. */
		ontriads?: (kind: 'triads' | 'triads-zone') => void;
		/** The gesture track: offered once one of its exercises is open. */
		gesture?: { open: boolean };
		/** Starts a gesture session; without it, no gesture button. */
		ongesture?: () => void;
		/** The rhythm exercises, each a link to its session; without them, no rhythm button. */
		rhythm?: readonly Pick<ExerciseDefinition, 'id' | 'title'>[];
	} = $props();

	let rhythmOpen = $state(false);

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
				{#if ontriads}
					<div class="action">
						<PixelButton size="large" onclick={() => ontriads('triads')}>{t.triads}</PixelButton>
						{#if triads.anchorDue > 0}
							<p class="reviews">
								<PixelText scale={1}>{t.triadsDue(triads.anchorDue)}</PixelText>
							</p>
						{/if}
					</div>
					{#if triads.zoneDue !== null}
						<div class="action">
							<PixelButton size="large" onclick={() => ontriads('triads-zone')}>
								{t.triadsZone}
							</PixelButton>
							{#if triads.zoneDue > 0}
								<p class="reviews"><PixelText scale={1}>{t.due(triads.zoneDue)}</PixelText></p>
							{/if}
						</div>
					{/if}
				{/if}
				{#if ongesture && gesture.open}
					<div class="action">
						<PixelButton size="large" onclick={ongesture}>{t.gesture}</PixelButton>
					</div>
				{/if}
				{#if rhythm && rhythm.length > 0}
					<div class="action">
						<PixelButton
							size="large"
							pressed={rhythmOpen}
							onclick={() => (rhythmOpen = !rhythmOpen)}
						>
							{t.rhythm}
						</PixelButton>
						{#if rhythmOpen}
							<ul class="exercises" aria-label={t.rhythmExercises}>
								{#each rhythm as exercise (exercise.id)}
									<li>
										<a href={`/session?kind=exercise&exercise=${exercise.id}`}>
											{exercise.title?.[i18n.locale] ?? exercise.id}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
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

	.exercises {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--np-space-1, 8px);
	}

	.exercises a {
		display: block;
		box-sizing: border-box;
		padding: var(--np-space-2, 16px);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink);
		background: var(--np-bg);
		color: var(--np-ink);
		font-family: var(--np-font-pixel);
		font-size: var(--np-type-body);
		font-weight: 700;
		text-align: center;
		text-decoration: none;
		text-transform: uppercase;
	}

	.exercises a:hover,
	.exercises a:focus-visible {
		background: var(--np-ink);
		color: var(--np-bg);
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
