<script lang="ts">
	import { resolve } from '$app/paths';
	import type { RoutineEntry } from '$lib/application/app';
	import type { Refusal } from '$lib/domain/definitions';
	import type { ExerciseDefinition } from '$lib/domain/exercise';
	import { SESSION_MS } from '$lib/domain/session/policy';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { HomeStats } from '$lib/domain/types';
	import { refusalText } from '$lib/ui/definitions/refusalMessages';
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
		routines = [],
		onroutine,
		startable = () => true,
		exercises,
		resting = [],
		refused = [],
		importedProblems = 0
	}: {
		stats: HomeStats;
		now: number;
		/** « Commencer » (and Space, on the page): the first open routine. */
		onstart: () => void;
		/** Every routine, in the order registered; the open ones are shown. */
		routines?: readonly RoutineEntry[];
		/** Starts a session of the routine; without it, no routine block can be started. */
		onroutine?: (id: string) => void;
		/** Whether the routine of `id` can be started yet (the bridge of the home page). */
		startable?: (id: string) => boolean;
		/** The exercises played on their own, each a link to its session; without them, no such block. */
		exercises?: readonly Pick<ExerciseDefinition, 'id' | 'title'>[];
		/** Exercises resting after « On change d’air »: marked, still to be played. */
		resting?: readonly string[];
		/** What the definition files refused, with the reason; development builds pass them. */
		refused?: readonly Refusal[];
		/** How many imported files have a refusal; shown in every build. */
		importedProblems?: number;
	} = $props();

	const t = $derived(homeMessages());

	const words = $derived({ short: t.minutes, spoken: t.minutesSpoken });

	const offered = $derived(routines.filter((routine) => routine.open));

	/** Due reviews, or when the next ones come; nothing without a learned card. */
	function reviewsOf(routine: RoutineEntry): string | null {
		if (routine.due !== null && routine.due > 0) return t.due(routine.due);
		if (routine.nextReviewAt === null) return null;
		const delay = formatRelativeDelay(routine.nextReviewAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
		return `${t.nextReviews} · ${delay}`;
	}

	/** Its reviews, and « au repos » as an exercise's entry marks it. */
	function whyOf(routine: RoutineEntry): string | undefined {
		const lines = [reviewsOf(routine), routine.resting ? t.resting : null].filter(
			(line) => line !== null
		);
		return lines.length > 0 ? lines.join(' · ') : undefined;
	}

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
		const list: Block[] = offered.map((routine) => ({
			key: `routine-${routine.id}`,
			title: routine.title[i18n.locale],
			why: whyOf(routine),
			// Every session plays on the session controller: one session length.
			duration: formatMinutes(SESSION_MS, words),
			...(onroutine && startable(routine.id) && { onselect: () => onroutine(routine.id) })
		}));
		for (const exercise of exercises ?? []) {
			list.push({
				key: `exercise-${exercise.id}`,
				title: t.exercises,
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
	<BlockList
		label={t.blocks}
		{blocks}
		current={offered[0] ? `routine-${offered[0].id}` : undefined}
	/>
	<footer>
		<p class="gap">
			<span class="label">{t.reactionLabel}</span>
			<span class="value">{reaction}</span>
			{#if trend}<span class="trend">{trend}</span>{/if}
		</p>
		<Button onclick={onstart}>{t.start}</Button>
	</footer>
	{#if importedProblems > 0}
		<p class="imported-problems">
			{t.importedProblems(importedProblems)}
			<a href={`${resolve('/settings')}#imported-files`}>{t.importedProblemsLink}</a>
		</p>
	{/if}
	{#if refused.length > 0}
		<section class="refused" aria-label={t.refusedTitle}>
			<h2>{t.refusedTitle}</h2>
			<ul>
				{#each refused as refusal, index (index)}
					<li>{refusalText(refusal, i18n.locale)}</li>
				{/each}
			</ul>
		</section>
	{/if}
</Page>

<style>
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--np-step-2);
		margin-top: var(--np-step-6);
	}

	.imported-problems {
		margin: var(--np-step-6) 0 0;
		color: var(--np-earth-text);
		font-size: var(--np-size-meta);
	}

	.imported-problems a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.imported-problems a:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	.refused {
		margin-top: var(--np-step-6);
		color: var(--np-earth-text);
		font-size: var(--np-size-meta);
	}

	.refused h2 {
		margin: 0 0 var(--np-step-1);
		font-size: var(--np-size-meta);
		font-weight: 600;
	}

	.refused ul {
		margin: 0;
		padding-left: var(--np-step-3);
		overflow-wrap: anywhere;
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
