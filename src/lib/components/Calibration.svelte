<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CalibrationService, type CalibrationStatus } from '$lib/services/CalibrationService';
	import { calibrationDataStore } from '$lib/stores/calibration.store';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		oncomplete?: () => void;
	}

	let { oncomplete }: Props = $props();

	let peaksCount = $state(0);
	let status = $state<CalibrationStatus>('idle');
	let bounce = $state(false);

	let service = $state<CalibrationService | null>(null);
	let bounceTimeout: ReturnType<typeof setTimeout> | null = null;
	let closeTimeout: ReturnType<typeof setTimeout> | null = null;

	function createService(): CalibrationService {
		return new CalibrationService({}, {
			onStatusChange(newStatus) {
				status = newStatus;
				if (newStatus === 'calibrated') {
					const result = service?.getResult();
					if (result) {
						calibrationDataStore.set(result);
					}
					closeTimeout = setTimeout(() => oncomplete?.(), 2000);
				}
			},
			onPeakDetected(count) {
				peaksCount = count;
			},
			onBeat() {
				bounce = true;
				if (bounceTimeout) clearTimeout(bounceTimeout);
				bounceTimeout = setTimeout(() => { bounce = false; }, 120);
			}
		});
	}

	async function startCalibration() {
		peaksCount = 0;
		service?.destroy();
		service = createService();
		await service.start();
	}

	onMount(() => {
		startCalibration();
	});

	onDestroy(() => {
		if (bounceTimeout) clearTimeout(bounceTimeout);
		if (closeTimeout) clearTimeout(closeTimeout);
		service?.destroy();
	});
</script>

<div class="calibration text-slate-200">
	{#if status === 'calibrated'}
		<p class="calibrated-label">{m.calibration_calibrated()}</p>
		<p class="calibrated-hint">{m.calibration_closing()}</p>
	{:else}
		<p class="instruction">{m.calibration_instruction()}</p>
		<div class="counter-wrapper">
			<span class="counter" class:bounce>{peaksCount}</span>
		</div>
		<p class="hint">
			{m.calibration_hit_prompt()}
			{m.calibration_hits_needed({ count: String(service?.getConfig().hitsNeeded ?? 10) })}
		</p>

		{#if status === 'inconsistent'}
			<p class="message message-warn">{m.calibration_inconsistent()}</p>
		<button class="retry-button" type="button" onclick={startCalibration}>
			{m.calibration_retry()}
		</button>
		{/if}

		{#if status === 'no_sound'}
			<p class="message message-error">{m.calibration_no_sound_silent()}</p>
			<button class="retry-button" type="button" onclick={startCalibration}>
			{m.calibration_retry()}
		</button>
		{/if}
	{/if}
</div>

<style>
	.calibration {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1rem;
	}
	.instruction {
		font-size: 0.95rem;
		line-height: 1.5;
		max-width: 360px;
	}
	.counter-wrapper {
		min-height: 5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.counter {
		font-size: 4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		transition: transform 0.1s ease-out;
	}
	.counter.bounce {
		transform: scale(1.2);
	}
	.hint {
		font-size: 0.875rem;
		color: rgb(148 163 184);
	}
	.calibrated-label {
		font-size: 2rem;
		font-weight: 700;
		color: rgb(134 239 172);
	}
	.calibrated-hint {
		font-size: 0.875rem;
		color: rgb(148 163 184);
	}
	.message {
		font-size: 0.9rem;
		line-height: 1.4;
		max-width: 340px;
		padding: 0.75rem 1rem;
		border-radius: 8px;
	}
	.message-warn {
		background: rgba(251, 191, 36, 0.15);
		color: rgb(253 224 71);
	}
	.message-error {
		background: rgba(248, 113, 113, 0.15);
		color: rgb(252 165 165);
	}
	.retry-button {
		margin-top: 0.25rem;
		padding: 0.5rem 1.5rem;
		border: 1px solid rgb(148 163 184);
		border-radius: 8px;
		background: transparent;
		color: rgb(226 232 240);
		font-size: 0.9rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.retry-button:hover {
		background: rgba(148, 163, 184, 0.2);
		color: white;
	}
</style>
