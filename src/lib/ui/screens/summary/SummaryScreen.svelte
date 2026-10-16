<script lang="ts">
	import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
	import { GRIDS } from '$lib/domain/grid';
	import { i18n } from '$lib/i18n/index.svelte';
	import { rhythmReportView } from './rhythmReport';
	import { isTriadsKind, type RhythmSummary, type SessionSummary } from '$lib/domain/types';
	import PlayedCycle, { CYCLE_COLUMN_PX } from '$lib/ui/play/views/PlayedCycle.svelte';
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
		onmap,
		oncontest
	}: {
		summary: SessionSummary;
		now: number;
		onhome: () => void;
		onmap: () => void;
		/** « Joué juste » on a missed gesture change; without it, misses are listed only. */
		oncontest?: (attemptId: number) => Promise<void>;
	} = $props();

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
	function rhythmLevel(level: RhythmSummary['levelReached']): string {
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

<section class="summary">
	<div class="sheet">
		<header class="title">
			<PixelText scale={3}>{t.title}</PixelText>
		</header>
		{#if summary.grade}
			<p class="grade"><PixelText scale={4}>{summary.grade}</PixelText></p>
		{/if}
		{#if summary.rhythm}
			{@const rhythm = summary.rhythm}
			<PixelBox variant="double">
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
			</PixelBox>
			{#if rhythm.lastCycle}
				{@const report = rhythmReportView(rhythm.lastCycle, t.report, i18n.locale)}
				{@const played = rhythm.lastCycle.played}
				{#if played}
					<PixelBox variant="double">
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
					</PixelBox>
				{/if}
				<PixelBox variant="double">
					<div class="report">
						<strong>{report.headline}</strong>
						<span>{report.feedback}</span>
						{#if report.reasons}<span>{report.reasons}</span>{/if}
						<ul>
							{#each report.measures as line (line)}<li>{line}</li>{/each}
							<li>{report.latency}</li>
						</ul>
						<ul>
							{#each report.attacks as line, i (i)}<li>{line}</li>{/each}
						</ul>
					</div>
				</PixelBox>
			{/if}
		{:else if summary.gesture}
			<PixelBox variant="double">
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
			</PixelBox>
			{#if summary.gesture.misses.length > 0}
				<PixelBox variant="double">
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
									<PixelButton onclick={() => contest(miss.attemptId)}>
										{t.playedRight}
									</PixelButton>
								{/if}
							</li>
						{/each}
					</ul>
				</PixelBox>
			{/if}
		{:else}
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
							<span>{triads ? t.knownTriads(summary.knownCount) : t.known(summary.knownCount)}</span
							>
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
		{/if}
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

	.played-cycle {
		min-width: 0;
	}

	.report {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-1, 8px);
		padding: var(--np-space-3, 24px) var(--np-space-4, 32px);
		font-size: var(--np-type-body);
	}

	.report ul {
		list-style: none;
		margin: var(--np-space-1, 8px) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
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

	.rows li.exercise,
	.rows li.miss {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--np-space-1, 8px);
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
