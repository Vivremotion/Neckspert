<script lang="ts">
	import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
	import { GLOSSARY, termOfFailure, termOfMeasure } from '$lib/domain/glossary';
	import type { MeasureId } from '$lib/domain/time';
	import Term from '$lib/ui/primitives/Term.svelte';
	import { provideGlossaryScope } from '$lib/ui/primitives/glossaryScope';
	import { GRIDS } from '$lib/domain/grid';
	import { i18n } from '$lib/i18n/index.svelte';
	import { rhythmReportView } from './rhythmReport';
	import { isTriadsKind, type ExerciseSummary, type SessionSummary } from '$lib/domain/types';
	import PlayedCycle, { CYCLE_COLUMN_PX } from '$lib/ui/play/views/PlayedCycle.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { coldAccuracyRatio } from '$lib/ui/screens/home/coldAccuracy';
	import { formatRelativeDelay } from '$lib/ui/screens/home/relativeTime';
	import { summaryMessages } from './messages';

	let {
		summary,
		now,
		onhome,
		onmap,
		oncontest,
		onreplay,
		onstopreplay,
		development = false
	}: {
		summary: SessionSummary;
		now: number;
		onhome: () => void;
		onmap: () => void;
		/**
		 * « Joué juste » on a missed gesture change, « C’était en place » with its reason on a
		 * failed cycle (development builds); without it, misses are listed only.
		 */
		oncontest?: (attemptId: number, reason?: string) => Promise<void>;
		/** Plays a run of the series again (its segment id). */
		onreplay?: (runId: number) => Promise<void>;
		onstopreplay?: () => void;
		/** A development build: the judge's full report and the contest of cycles. */
		development?: boolean;
	} = $props();

	provideGlossaryScope();

	/** The run being heard again, if any. */
	let replaying = $state<number | null>(null);

	async function replay(runId: number) {
		if (!onreplay) return;
		replaying = runId;
		try {
			await onreplay(runId);
		} finally {
			if (replaying === runId) replaying = null;
		}
	}

	function stopReplay() {
		onstopreplay?.();
		replaying = null;
	}

	/** A run's mean measure as the screen writes it. */
	function measureText(value: number, unit: string): string {
		if (unit === 'ratio') return `${Math.round(value * 100)} %`;
		if (unit === 'ms/bar') return `${Math.round(value)} ${t.perBar}`;
		return `${Math.round(value)} ms`;
	}

	/** Cycles contested by reason on this screen: `${attemptId}:${reason}`. */
	let contestedReasons = $state<string[]>([]);

	async function contestReason(attemptId: number, reason: string) {
		const key = `${attemptId}:${reason}`;
		if (!oncontest || contestedReasons.includes(key)) return;
		contestedReasons = [...contestedReasons, key];
		await oncontest(attemptId, reason);
	}

	/** The width the played cycle may take (its box, measured). */
	let playedWidth = $state(0);
	/** Width assumed before the box is measured. */
	const FALLBACK_WIDTH = 640;

	/** The exercise, and the grid its tempo belongs to when it has one. */
	function exerciseLabel(exerciseId: string, scope: string | undefined): string {
		const name = t.exercise[exerciseId] ?? exerciseId;
		if (scope === undefined) return name;
		const grid = GRIDS.find((candidate) => candidate.id === scope);
		return `${name} · ${grid?.title ?? scope}`;
	}

	/** The level a rhythm session ended on, an aid level named as the play header names it. */
	function rhythmLevel(level: ExerciseSummary['levelReached']): string {
		return level.aid ? t.aidLevelReached : t.levelReached(level.shown, level.of);
	}

	/** A rhythm exercise by its name in the current language. */
	function rhythmTitle(exerciseId: string): string {
		const exercise = RHYTHM_EXERCISES.find((candidate) => candidate.id === exerciseId);
		return exercise?.title?.[i18n.locale] ?? exerciseId;
	}

	/** Misses contested on this screen, on top of those stored contested. */
	let contestedHere = $state<number[]>([]);

	async function contest(attemptId: number) {
		if (!oncontest || contestedHere.includes(attemptId)) return;
		contestedHere = [...contestedHere, attemptId];
		await oncontest(attemptId);
	}

	const triads = $derived(isTriadsKind(summary.kind));

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

<Page title={t.title}>
	<div class="summary">
		{#if summary.grade}
			<p class="grade">{summary.grade}</p>
		{/if}
		{#if summary.exercise}
			{@const rhythm = summary.exercise}
			<ul class="rows">
				<li class="exercise">
					<strong>{rhythmTitle(rhythm.exerciseId)}</strong>
					<span>{rhythmLevel(rhythm.levelReached)}</span>
					<span>{t.cyclesSucceeded(rhythm.successes, rhythm.cycles)}</span>
					{#if rhythm.aided > 0}
						<span>{t.successesAided(rhythm.aided)}</span>
					{/if}
				</li>
			</ul>
			{#if rhythm.series}
				{@const series = rhythm.series}
				<ul class="rows series">
					<li class="exercise">
						<span>{series.levels.map((level) => t.levelName(level)).join(' → ')}</span>
						{#if series.listens > 0}<span>{t.listens(series.listens)}</span>{/if}
						<span>{t.playedShare(Math.round(series.playedShare * 100))}</span>
					</li>
					{#if series.ended === 'change-of-air'}
						<li class="exercise change-of-air">
							<strong>{t.changeOfAir}</strong>
							{#if series.breaking}
								{@const term = termOfFailure(series.breaking)}
								<span
									>{t.breaking}
									<Term id={term} locale={i18n.locale}>{GLOSSARY[term][i18n.locale].term}</Term
									></span
								>
							{/if}
							<span>{t.tryInstead}</span>
							{#each RHYTHM_EXERCISES.filter((e) => e.id !== rhythm.exerciseId) as other (other.id)}
								<a href={`/session?kind=exercise&exercise=${other.id}`}
									>{other.title?.[i18n.locale] ?? other.id}</a
								>
							{/each}
						</li>
					{/if}
					{#each series.runs as run, index (run.id)}
						<li class="exercise run">
							<strong>{t.run(index + 1)}</strong>
							<span>{t.levelName(run.level)}</span>
							<span>{t.runCycles(run.successes, run.rounds)}</span>
							{#if run.ended === 'interrupted'}<span>{t.runCut}</span>{/if}
							{#each Object.entries(run.measures) as [id, measure] (id)}
								{@const term = termOfMeasure(id as MeasureId)}
								<span
									><Term id={term} locale={i18n.locale}>{GLOSSARY[term][i18n.locale].term}</Term>
									<span>{measureText(measure.value, measure.unit)}</span></span
								>
							{/each}
							{#if onreplay && rhythm.replayable?.includes(run.id)}
								{#if replaying === run.id}
									<Button variant="quiet" onclick={stopReplay}>{t.stopReplay}</Button>
								{:else}
									<Button variant="quiet" onclick={() => replay(run.id)}>{t.replayRun}</Button>
								{/if}
							{/if}
							{#if development && oncontest}
								{#each run.failed as cycle (cycle.attemptId)}
									{#each cycle.reasons as reason (reason)}
										{@const term = termOfFailure(reason)}
										<Button
											variant="quiet"
											disabled={contestedReasons.includes(`${cycle.attemptId}:${reason}`)}
											onclick={() => contestReason(cycle.attemptId, reason)}
											>{`${t.inPlace} ${GLOSSARY[term][i18n.locale].term}`}</Button
										>
									{/each}
								{/each}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if development && rhythm.lastCycle}
				{@const report = rhythmReportView(rhythm.lastCycle, t.report, i18n.locale)}
				{@const played = rhythm.lastCycle.played}
				{#if played}
					<div class="played-cycle" bind:clientWidth={playedWidth}>
						<PlayedCycle
							figure={played.figure}
							cycleBars={played.cycleBars}
							reports={[rhythm.lastCycle.report]}
							feedback="every-cycle"
							beatMs={60000 / played.tempoBpm}
							maxWidth={playedWidth > CYCLE_COLUMN_PX
								? playedWidth - CYCLE_COLUMN_PX
								: FALLBACK_WIDTH}
						/>
					</div>
				{/if}
				<div class="report">
					<strong>{report.headline}</strong>
					<span>{report.feedback}</span>
					{#if report.reasons}<span>{report.reasons}</span>{/if}
					<ul>
						{#each report.measures as line (line)}<li>{line}</li>{/each}
						<li>{report.latency}</li>
					</ul>
				</div>
			{/if}
		{:else if summary.gesture}
			<ul class="rows">
				{#each summary.gesture.exercises as exercise (`${exercise.exerciseId}:${exercise.scope ?? ''}`)}
					<li class="exercise">
						<strong>{exerciseLabel(exercise.exerciseId, exercise.scope)}</strong>
						<span>{t.passages(exercise.passagesSucceeded, exercise.passagesPlayed)}</span>
						<span>{t.changes(Math.round(exercise.changeSuccessRate * 100))}</span>
						<span>{t.tempos(exercise.tempoBpm, exercise.nextTempoBpm)}</span>
					</li>
				{/each}
			</ul>
			{#if summary.gesture.misses.length > 0}
				<ul class="rows" aria-label={t.misses}>
					<li><span>{t.misses}</span></li>
					{#each summary.gesture.misses as miss (miss.attemptId)}
						<li class="miss">
							<strong>{miss.symbol}</strong>
							<span>{miss.heard === null ? t.nothingHeard : t.heard(miss.heard)}</span>
							{#if miss.expected !== null}
								<span>{t.expected(miss.expected)}</span>
							{/if}
							{#if miss.contested || contestedHere.includes(miss.attemptId)}
								<span>{t.contested}</span>
							{:else if oncontest}
								<Button variant="quiet" onclick={() => contest(miss.attemptId)}>
									{t.playedRight}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
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
				{#if summary.fatigueDetected}
					<li class="fatigue alert">
						<span>{t.fatigue}</span>
					</li>
				{/if}
				{#if summary.pool !== 'all'}
					<li>
						<span>{t.next}</span>
						<strong>{next}</strong>
					</li>
				{/if}
			</ul>
		{/if}
		<nav class="nav">
			<Button onclick={onhome}>{t.home}</Button>
			<Button variant="quiet" onclick={onmap}>{t.map}</Button>
		</nav>
	</div>
</Page>

<style>
	.summary {
		--term-ground: var(--np-ground);
		--term-text: var(--np-text);
		--term-rule: var(--np-rule);
		--term-gap: var(--np-step-1);
		--term-pad: var(--np-step-2);
		display: flex;
		flex-direction: column;
		gap: var(--np-step-4);
	}

	.grade {
		margin: var(--np-step-4) 0 0;
		font-size: var(--np-size-correction);
		font-weight: 300;
		line-height: 1;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--np-size-body);
	}

	.rows li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--np-step-3);
		padding-block: var(--np-step-2);
		border-block-end: 1px solid var(--np-rule);
	}

	.rows span {
		flex: 1 1 auto;
		min-width: 0;
	}

	.rows strong {
		flex: 0 0 auto;
	}

	.rows li:not(.exercise):not(.miss) strong {
		font-size: var(--np-size-title);
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	.rows li.exercise,
	.rows li.miss {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--np-step-1);
	}

	.rows li.exercise span,
	.rows li.miss span {
		flex: 0 0 auto;
		font-size: var(--np-size-meta);
		color: var(--np-earth-text);
	}

	.rows li.exercise strong,
	.rows li.miss strong {
		font-weight: 700;
	}

	.rows a {
		color: var(--np-text);
		font-size: var(--np-size-meta);
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.rows a:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	.fatigue.alert {
		font-weight: 700;
		border-inline-start: 4px solid var(--np-text);
		padding-inline-start: var(--np-step-2);
	}

	.played-cycle {
		min-width: 0;
		/* Bridge until plan 3: PlayedCycle still reads the old names. */
		--np-ink: var(--np-text);
		--np-shade: var(--np-muted);
		--np-bg: var(--np-ground);
		--np-type-body: var(--np-size-body);
		--np-type-meta: var(--np-size-meta);
	}

	.report {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-1);
		font-size: var(--np-size-body);
	}

	.report ul {
		list-style: none;
		margin: var(--np-step-1) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--np-step-1);
		font-size: var(--np-size-meta);
		color: var(--np-earth-text);
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--np-step-2);
	}
</style>
