<script lang="ts">
	import { resolve } from '$app/paths';
	import type { RoutineEntry } from '$lib/application/app';
	import type { Refusal } from '$lib/domain/definitions';
	import { SESSION_MS } from '$lib/domain/session/policy';
	import { i18n } from '$lib/i18n/index.svelte';
	import { refusalText } from '$lib/ui/definitions/refusalMessages';
	import BlockList from '$lib/ui/primitives/BlockList.svelte';
	import type { Block } from '$lib/ui/primitives/BlockList.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { formatMinutes } from './duration';
	import { formatRelativeDelay } from './relativeTime';
	import { homeMessages } from './messages';

	let {
		now,
		onstart,
		routines = [],
		onroutine,
		refused = [],
		importedProblems = 0,
		catalogRefused = false
	}: {
		now: number;
		/** « Commencer » (and Space, on the page): the first open routine. */
		onstart: () => void;
		/** Every routine, in the order registered; the open ones are shown. */
		routines?: readonly RoutineEntry[];
		/** Starts a session of the routine; without it, no routine block can be started. */
		onroutine?: (id: string) => void;
		/** What the definition files refused, with the reason; development builds pass them. */
		refused?: readonly Refusal[];
		/** How many imported files have a refusal; shown in every build. */
		importedProblems?: number;
		/** Whether the load refused a file or an object of the catalog; told in every build. */
		catalogRefused?: boolean;
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

	/** Its reviews. */
	function whyOf(routine: RoutineEntry): string | undefined {
		return reviewsOf(routine) ?? undefined;
	}

	const blocks = $derived(
		offered.map((routine): Block => ({
			key: `routine-${routine.id}`,
			title: routine.title[i18n.locale],
			why: whyOf(routine),
			// Every session plays on the session controller: one session length.
			duration: formatMinutes(SESSION_MS, words),
			...(onroutine && { onselect: () => onroutine(routine.id) })
		}))
	);
</script>

<Page title={t.title}>
	{#if offered.length > 0}
		<BlockList label={t.blocks} {blocks} current={`routine-${offered[0].id}`} />
		<footer>
			<Button onclick={onstart}>{t.start}</Button>
		</footer>
	{:else}
		<p class="nothing">
			{t.nothingToPlay}
			<a href={resolve('/library')}>{t.library}</a>
		</p>
	{/if}
	{#if catalogRefused}
		<p class="state">{t.catalogRefused}</p>
	{/if}
	{#if importedProblems > 0}
		<p class="state">
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
		gap: var(--np-step-2);
		margin-top: var(--np-step-6);
	}

	.nothing {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--np-step-1) var(--np-step-2);
	}

	.state {
		margin: var(--np-step-6) 0 0;
		color: var(--np-earth-text);
		font-size: var(--np-size-meta);
	}

	.state + .state {
		margin-top: var(--np-step-1);
	}

	a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	a:focus-visible {
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
</style>
