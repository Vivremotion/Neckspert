<script lang="ts">
	import type {
		AudioInputDevice,
		CalibrationMeasure,
		CalibrationProgress,
		ReferenceDetail
	} from '$lib/application/ports';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { isBuiltInInput } from './isBuiltInInput';
	import { calibrationMessages } from './messages';
	import type { CalibrationScreenOutcome } from './outcome';

	type Phase = 'idle' | 'running' | 'done';

	let {
		inputs,
		selectedDeviceId,
		listening,
		levelRms,
		phase,
		progress,
		outcome,
		onselectdevice,
		onlisten,
		onstart,
		oncancel,
		onretry,
		oncalibrateonclick,
		notice = null
	}: {
		inputs: AudioInputDevice[];
		selectedDeviceId: string | null;
		listening: boolean;
		levelRms: number;
		phase: Phase;
		progress: CalibrationProgress | null;
		outcome: CalibrationScreenOutcome | null;
		onselectdevice: (id: string | null) => void;
		onlisten: () => void;
		onstart: () => void;
		oncancel: () => void;
		onretry: () => void;
		/** The calibration on the click, the player's second choice when the reference failed. */
		oncalibrateonclick: () => void;
		notice?: string | null;
	} = $props();

	const m = $derived(calibrationMessages());
	const selected = $derived(inputs.find((device) => device.id === selectedDeviceId) ?? null);
	const showHeadphones = $derived(selected !== null && isBuiltInInput(selected));
	const levelPercent = $derived(Math.round(Math.min(1, Math.max(0, levelRms)) * 100));
	/** What to do now, once the run has started. */
	const instruction = $derived.by(() => {
		if (phase !== 'running' || !progress) return null;
		if (progress.phase === 'bleed') return m.bleedInstruction;
		if (progress.phase === 'compare') return m.compareInstruction(progress.needed);
		if (progress.phase === 'play') return m.playInstruction(progress.needed);
		return m.listenInstruction;
	});
	/** The latency the result names: the attacks', else the notes'. */
	const measured = $derived(
		outcome?.ok ? (outcome.latency.attack ?? outcome.latency.note ?? null) : null
	);

	/** The click is offered when the computer's mic could not serve as the reference. */
	const offerClick = $derived(
		outcome !== null &&
			!outcome.ok &&
			(outcome.reason === 'reference' || outcome.reason === 'second-input')
	);

	function referenceText(detail: ReferenceDetail): string {
		if (detail.mic === null) return m.referenceMissing;
		if (!detail.opened) return m.referenceClosed(detail.mic);
		return m.referenceHeard(
			detail.mic,
			detail.heard,
			detail.clicks,
			detail.delayMs,
			detail.spreadMs
		);
	}

	function onDeviceChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onselectdevice(value === '' ? null : value);
	}
</script>

{#snippet measureLines(measure: CalibrationMeasure)}
	{#if measure.referenceMs !== null}
		<p class="detail">{m.referenceLine(measure.referenceMs, measure.referenceSpreadMs)}</p>
	{/if}
	{#if measure.offsetMs !== null}
		<p class="detail">{m.offsetLine(measure.offsetMs)}</p>
	{/if}
	<p class="detail">
		{measure.referenceMs === null
			? m.hitsLine(measure.pairs, measure.spreadMs)
			: m.pairsLine(measure.pairs, measure.played, measure.spreadMs)}
	</p>
{/snippet}

<Page title={m.title}>
	<div class="stack">
		<div class="block">
			<label class="field" for="calibration-input">{m.input}</label>
			{#if inputs.length === 0}
				<p>{m.emptyInputs}</p>
			{:else}
				<select
					id="calibration-input"
					class="device-select"
					value={selectedDeviceId ?? ''}
					onchange={onDeviceChange}
					disabled={phase === 'running'}
				>
					{#each inputs as device (device.id)}
						<option value={device.id}>{device.label}</option>
					{/each}
				</select>
			{/if}

			{#if showHeadphones}
				<p class="hint">{m.headphones}</p>
			{/if}
		</div>

		<div class="block">
			<span id="level-label">{m.level}</span>
			<div
				class="meter"
				role="meter"
				aria-labelledby="level-label"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={levelPercent}
			>
				<div class="meter-fill" style={`transform: scaleX(${levelPercent / 100})`}></div>
			</div>
		</div>

		<div class="actions">
			{#if !listening}
				<Button variant={phase === 'idle' ? 'primary' : 'quiet'} onclick={onlisten}
					>{m.listen}</Button
				>
			{:else}
				<p class="listening">{m.listening}</p>
			{/if}

			{#if phase === 'running' && progress}
				<Button variant="quiet" onclick={oncancel}>{m.cancel}</Button>
			{:else if phase === 'done' && outcome}
				<Button variant="primary" onclick={onretry}>{m.retry}</Button>
			{:else}
				<Button variant={listening ? 'primary' : 'quiet'} disabled={!listening} onclick={onstart}
					>{m.start}</Button
				>
			{/if}
		</div>

		<div class="block">
			<p class="instruction" aria-live="polite">
				{#if instruction}{instruction}{/if}
			</p>
			{#if notice}
				<p class="notice" role="alert">{notice}</p>
			{/if}

			{#if phase === 'running' && progress}
				<p class="progress" aria-live="polite">{m.progress(progress.done, progress.needed)}</p>
			{:else if phase === 'done' && outcome}
				<div class="result">
					{#if outcome.ok}
						{#if measured}
							<p class="outcome" aria-live="polite">{m.ok(measured.ms, measured.provenance)}</p>
						{/if}
						{@render measureLines(outcome.measure)}
						{#if outcome.clickBleed}
							<p class="outcome" role="status">{m.bleed}</p>
						{/if}
					{:else if outcome.reason === 'reference'}
						<p class="outcome" aria-live="polite">{referenceText(outcome.detail)}</p>
						{#if outcome.detail.mic !== null && outcome.detail.opened}
							<p class="detail">{m.referenceAdvice}</p>
						{/if}
					{:else}
						<p class="outcome" aria-live="polite">{m[outcome.reason]}</p>
						{#if outcome.reason === 'inconsistent' && outcome.measure}
							{@render measureLines(outcome.measure)}
						{/if}
					{/if}
				</div>
				{#if offerClick}
					<p class="detail">{m.clickChoiceNote}</p>
					<div class="actions">
						<Button variant="quiet" onclick={oncalibrateonclick}>{m.clickChoice}</Button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</Page>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-6);
		margin-top: var(--np-step-6);
		font-size: var(--np-size-body);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-2);
	}

	.field {
		display: block;
		font-weight: 700;
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
		font: inherit;
		font-size: var(--np-size-body);
		padding: var(--np-step-1) var(--np-step-2);
		background: var(--np-ground);
		color: var(--np-text);
		border: 1px solid var(--np-text);
		border-radius: 0;
	}

	.device-select:focus-visible {
		outline: 2px solid var(--np-text);
		outline-offset: 2px;
	}

	.hint,
	.detail,
	.instruction,
	.progress,
	.outcome,
	.listening,
	.notice {
		margin: 0;
	}

	.instruction {
		min-height: calc(var(--np-size-prompt) * 1.5);
		font-size: var(--np-size-prompt);
		font-weight: 400;
	}

	.progress {
		font-size: var(--np-size-title);
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	.notice {
		padding-left: var(--np-step-2);
		border-left: 4px solid var(--np-text);
		font-weight: 700;
	}

	.result {
		display: flex;
		flex-direction: column;
		gap: var(--np-step-2);
		border-top: 1px solid var(--np-text);
		padding-top: var(--np-step-3);
	}

	.meter {
		width: 100%;
		height: var(--np-step-1);
		background: var(--np-rule);
		overflow: hidden;
	}

	.meter-fill {
		width: 100%;
		height: 100%;
		transform-origin: left center;
		background: var(--np-text);
		transition: transform var(--np-motion-imprint) var(--np-motion-ease);
	}

	@media (prefers-reduced-motion: reduce) {
		.meter-fill {
			transition: none;
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--np-step-4);
	}
</style>
