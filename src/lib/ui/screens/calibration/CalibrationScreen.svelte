<script lang="ts">
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { isBuiltInInput } from './isBuiltInInput';
	import { calibrationMessages } from './messages';

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
		onretry
	}: {
		inputs: AudioInputDevice[];
		selectedDeviceId: string | null;
		listening: boolean;
		levelRms: number;
		phase: Phase;
		progress: CalibrationProgress | null;
		outcome: CalibrationOutcome | null;
		onselectdevice: (id: string | null) => void;
		onlisten: () => void;
		onstart: () => void;
		oncancel: () => void;
		onretry: () => void;
	} = $props();

	const m = $derived(calibrationMessages());
	const selected = $derived(inputs.find((device) => device.id === selectedDeviceId) ?? null);
	const showHeadphones = $derived(selected !== null && isBuiltInInput(selected));
	const levelPercent = $derived(Math.round(Math.min(1, Math.max(0, levelRms)) * 100));

	function onDeviceChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onselectdevice(value === '' ? null : value);
	}
</script>

<section class="calibration-screen" aria-labelledby="calibration-title">
	<!-- PixelText (H) does not forward id; wrap for aria-labelledby. -->
	<div id="calibration-title">
		<PixelText as="h1" scale={3}>{m.title}</PixelText>
	</div>

	<PixelBox variant="double">
		<label class="field" for="calibration-input">
			<PixelText scale={1}>{m.input}</PixelText>
		</label>
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

		{#if showHeadphones}
			<p class="hint"><PixelText scale={1}>{m.headphones}</PixelText></p>
		{/if}

		<div class="level-row">
			<span id="level-label"><PixelText scale={1}>{m.level}</PixelText></span>
			<div
				class="meter"
				role="meter"
				aria-labelledby="level-label"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={levelPercent}
			>
				<div class="meter-fill" style={`width: ${levelPercent}%`}></div>
			</div>
			{#if !listening}
				<PixelButton size="large" onclick={onlisten}>{m.listen}</PixelButton>
			{:else}
				<PixelText scale={1}>{m.listening}</PixelText>
			{/if}
		</div>
	</PixelBox>

	<p class="instruction"><PixelText scale={2}>{m.instruction}</PixelText></p>

	{#if phase === 'running' && progress}
		<p class="progress" aria-live="polite">
			<PixelText scale={2}>{m.progress(progress.hits, progress.needed)}</PixelText>
		</p>
		<PixelButton size="large" onclick={oncancel}>{m.cancel}</PixelButton>
	{:else if phase === 'done' && outcome}
		<p class="outcome" aria-live="polite">
			{#if outcome.ok}
				<PixelText scale={2}>{m.ok(outcome.offsetMs)}</PixelText>
			{:else}
				<PixelText scale={2}>{m[outcome.reason]}</PixelText>
			{/if}
		</p>
		<PixelButton size="huge" onclick={onretry}>{m.retry}</PixelButton>
	{:else}
		<PixelButton size="huge" disabled={!listening} onclick={onstart}>{m.start}</PixelButton>
	{/if}
</section>

<style>
	.calibration-screen {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
		padding: var(--np-space-2, 16px);
		min-height: 100%;
		box-sizing: border-box;
		background: var(--np-bg, #e99568);
		color: var(--np-ink, #451218);
	}

	.field {
		display: block;
		margin-bottom: var(--np-tile, 8px);
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		font: inherit;
		font-size: 1.25rem;
		padding: var(--np-tile, 8px);
		background: var(--np-mid, #be6754);
		color: var(--np-ink, #451218);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
	}

	.hint,
	.instruction,
	.progress,
	.outcome {
		margin: 0;
	}

	.level-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--np-tile, 8px);
		margin-top: var(--np-space-2, 16px);
	}

	.meter {
		flex: 1 1 12rem;
		height: calc(var(--np-tile, 8px) * 3);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		background: var(--np-bg, #e99568);
		image-rendering: pixelated;
	}

	.meter-fill {
		height: 100%;
		background: var(--np-ink, #451218);
	}
</style>
