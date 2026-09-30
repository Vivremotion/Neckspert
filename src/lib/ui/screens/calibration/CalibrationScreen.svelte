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
	<header class="top">
		<div id="calibration-title">
			<PixelText as="h1" scale={4}>{m.title}</PixelText>
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
		</PixelBox>
	</header>

	<div class="center">
		<div class="level-block">
			<span id="level-label"><PixelText scale={1}>{m.level}</PixelText></span>
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
				<PixelButton size="huge" onclick={onlisten}>{m.listen}</PixelButton>
			{:else}
				<p class="listening"><PixelText scale={2}>{m.listening}</PixelText></p>
			{/if}

			{#if phase === 'running' && progress}
				<PixelButton size="large" onclick={oncancel}>{m.cancel}</PixelButton>
			{:else if phase === 'done' && outcome}
				<PixelButton size="huge" onclick={onretry}>{m.retry}</PixelButton>
			{:else}
				<PixelButton size="huge" disabled={!listening} onclick={onstart}>{m.start}</PixelButton>
			{/if}
		</div>
	</div>

	<footer class="bottom">
		<p class="instruction"><PixelText scale={2}>{m.instruction}</PixelText></p>

		{#if phase === 'running' && progress}
			<PixelBox variant="inverted">
				<p class="progress" aria-live="polite">
					<PixelText scale={2}>{m.progress(progress.hits, progress.needed)}</PixelText>
				</p>
			</PixelBox>
		{:else if phase === 'done' && outcome}
			<PixelBox variant="inverted">
				<p class="outcome" aria-live="polite">
					{#if outcome.ok}
						<PixelText scale={2}>{m.ok(outcome.offsetMs)}</PixelText>
					{:else}
						<PixelText scale={2}>{m[outcome.reason]}</PixelText>
					{/if}
				</p>
			</PixelBox>
		{/if}
	</footer>
</section>

<style>
	.calibration-screen {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-3, 24px);
		padding: var(--np-space-2, 16px);
		min-height: 100dvh;
		box-sizing: border-box;
		background: var(--np-bg, #e99568);
		color: var(--np-ink, #451218);
		caret-color: var(--np-ink, #451218);
	}

	.calibration-screen ::selection {
		background: var(--np-ink, #451218);
		color: var(--np-bg, #e99568);
	}

	.top,
	.center,
	.bottom {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-2, 16px);
	}

	.top {
		gap: var(--np-space-3, 24px);
	}

	#calibration-title {
		margin-block-end: var(--np-tile, 8px);
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
		font-family: var(--np-font-pixel, inherit);
		font-size: 1.25rem;
		text-transform: uppercase;
		padding: var(--np-tile, 8px);
		background: var(--np-mid, #be6754);
		color: var(--np-ink, #451218);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		border-radius: 0;
		caret-color: var(--np-ink, #451218);
	}

	.device-select:focus-visible {
		outline: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		outline-offset: calc(var(--np-tile, 8px) / 2);
	}

	.hint,
	.instruction,
	.progress,
	.outcome,
	.listening {
		margin: 0;
	}

	.level-block {
		display: flex;
		flex-direction: column;
		gap: var(--np-tile, 8px);
	}

	.meter {
		width: 100%;
		height: calc(var(--np-tile, 8px) * 6);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		background: var(--np-mid, #be6754);
		image-rendering: pixelated;
		overflow: hidden;
	}

	.meter-fill {
		width: 100%;
		height: 100%;
		transform-origin: left center;
		/* Fifth tone = checkerboard tramage of ink on shade (DESIGN.md). */
		background-color: var(--np-shade, #813b2a);
		background-image:
			linear-gradient(45deg, var(--np-ink, #451218) 25%, transparent 25%),
			linear-gradient(-45deg, var(--np-ink, #451218) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--np-ink, #451218) 75%),
			linear-gradient(-45deg, transparent 75%, var(--np-ink, #451218) 75%);
		background-size: calc(var(--np-tile, 8px) * 2) calc(var(--np-tile, 8px) * 2);
		background-position:
			0 0,
			0 calc(var(--np-tile, 8px)),
			calc(var(--np-tile, 8px)) calc(var(--np-tile, 8px) * -1),
			calc(var(--np-tile, 8px) * -1) 0;
		transition: transform 80ms cubic-bezier(0.16, 1, 0.3, 1);
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
		gap: var(--np-space-2, 16px);
	}
</style>
