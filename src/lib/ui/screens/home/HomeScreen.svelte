<script lang="ts">
	import type { TriadsHome } from '$lib/application/app';
	import type { ExerciseDefinition } from '$lib/domain/exercise';
	import { SESSION_MS } from '$lib/domain/session/policy';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { HomeStats } from '$lib/domain/types';
	import BlockList from '$lib/ui/primitives/BlockList.svelte';
	import type { Block } from '$lib/ui/primitives/BlockList.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { formatMinutes } from './duration';
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
		rhythm,
		resting = []
	}: {
		stats: HomeStats;
		now: number;
		onstart: () => void;
		/** The triads exercises: reviews due, and whether the zone is open. */
		triads?: TriadsHome;
		/** Starts a session of one triads exercise; without it, no triads block. */
		ontriads?: (kind: 'triads' | 'triads-zone') => void;
		/** The gesture track: offered once one of its exercises is open. */
		gesture?: { open: boolean };
		/** Starts a gesture session; without it, no gesture block. */
		ongesture?: () => void;
		/** The rhythm exercises, each a link to its session; without them, no rhythm block. */
		rhythm?: readonly Pick<ExerciseDefinition, 'id' | 'title'>[];
		/** Exercises resting after « On change d’air »: marked, still to be played. */
		resting?: readonly string[];
	} = $props();

	const t = $derived(homeMessages());

	const words = $derived({ short: t.minutes, spoken: t.minutesSpoken });

	/** Due reviews, or when the next ones come; nothing without a learned card. */
	const reviews = $derived.by((): string | null => {
		if (stats.dueCount > 0) return t.due(stats.dueCount);
		if (stats.nextReviewAt == null) return null;
		const delay = formatRelativeDelay(stats.nextReviewAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
		return `${t.nextReviews} · ${delay}`;
	});

	const reaction = $derived(
		stats.medianColdOffsetMs == null
			? t.emptyReaction
			: `${Math.round(stats.medianColdOffsetMs)} ms`
	);

	const trend = $derived(
		formatTrend(stats.trend, {
			improving: t.improving,
			stable: t.stable,
			worsening: t.worsening
		})
	);

	const blocks = $derived.by((): Block[] => {
		const list: Block[] = [
			{
				key: 'learn',
				title: t.session,
				why: reviews ?? undefined,
				// The notes play on the response series: one session length, as every exercise.
				duration: formatMinutes(SESSION_MS, words),
				onselect: onstart
			}
		];
		if (ontriads) {
			list.push({
				key: 'triads',
				title: t.triads,
				why: triads.anchorDue > 0 ? t.triadsDue(triads.anchorDue) : undefined,
				duration: formatMinutes(SESSION_MS, words),
				onselect: () => ontriads('triads')
			});
			if (triads.zoneDue !== null) {
				list.push({
					key: 'triads-zone',
					title: t.triadsZone,
					why: triads.zoneDue > 0 ? t.due(triads.zoneDue) : undefined,
					duration: formatMinutes(SESSION_MS, words),
					onselect: () => ontriads('triads-zone')
				});
			}
		}
		if (ongesture && gesture.open) {
			list.push({
				key: 'gesture',
				title: t.gesture,
				duration: formatMinutes(SESSION_MS, words),
				onselect: ongesture
			});
		}
		for (const exercise of rhythm ?? []) {
			list.push({
				key: `rhythm-${exercise.id}`,
				title: t.rhythm,
				subtitle: exercise.title?.[i18n.locale] ?? exercise.id,
				why: resting.includes(exercise.id) ? t.resting : undefined,
				duration: formatMinutes(SESSION_MS, words),
				href: `/session?kind=exercise&exercise=${exercise.id}`
			});
		}
		return list;
	});
</script>

<Page title={t.title}>
	<BlockList label={t.blocks} {blocks} current="learn" />
	<footer>
		<p class="gap">
			<span class="label">{t.reactionLabel}</span>
			<span class="value">{reaction}</span>
			{#if trend}<span class="trend">{trend}</span>{/if}
		</p>
		<Button onclick={onstart}>{t.start}</Button>
	</footer>
</Page>

<style>
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--np-step-2);
		margin-top: var(--np-step-6);
	}

	.gap {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--np-step-1) var(--np-step-2);
	}

	.label {
		font-size: var(--np-size-meta);
		color: var(--np-muted-text);
	}

	.value {
		font-size: var(--np-size-title);
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	.trend {
		font-size: var(--np-size-meta);
		color: var(--np-earth-text);
	}
</style>
