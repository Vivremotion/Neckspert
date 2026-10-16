<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useAppServices } from '$lib/application/app';
	import type { AudioInputDevice, CalibrationProgress } from '$lib/application/ports';
	import CalibrationScreen from '$lib/ui/screens/calibration/CalibrationScreen.svelte';
	import type { CalibrationScreenOutcome } from '$lib/ui/screens/calibration/outcome';

	const services = useAppServices();

	let inputs = $state<AudioInputDevice[]>([]);
	let selectedDeviceId = $state<string | null>(null);
	let listening = $state(false);
	let levelRms = $state(0);
	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let progress = $state<CalibrationProgress | null>(null);
	let outcome = $state<CalibrationScreenOutcome | null>(null);
	let notice = $state<string | null>(null);

	let stopLevel: (() => void) | null = null;

	async function load() {
		const [devices, settings] = await Promise.all([
			services.detector.listInputs(),
			services.settings.get()
		]);
		inputs = devices;
		selectedDeviceId = settings.inputDeviceId ?? devices[0]?.id ?? null;
	}

	void load();

	async function stopMeter() {
		stopLevel?.();
		stopLevel = null;
		services.detector.stop();
		listening = false;
		levelRms = 0;
	}

	async function onlisten() {
		notice = null;
		try {
			await stopMeter();
			services.detector.setBuiltInGain((await services.settings.get()).builtInInputGain);
			await services.detector.start(selectedDeviceId);
			inputs = await services.detector.listInputs();
			if (!inputs.some((device) => device.id === selectedDeviceId)) {
				selectedDeviceId = inputs[0]?.id ?? null;
			}
			stopLevel = services.detector.onLevel((rms) => {
				levelRms = rms;
			});
			listening = true;
		} catch (error) {
			listening = false;
			notice = error instanceof Error ? error.message : String(error);
		}
	}

	async function onstart() {
		if (phase === 'running') return;
		phase = 'running';
		progress = null;
		outcome = null;
		notice = null;
		const deviceId = selectedDeviceId;
		try {
			if (!listening) await onlisten();
			const result = await services.calibration.run(deviceId, (next) => {
				progress = next;
			});
			if (result.ok) {
				// Saved together, only on success: the device, its latency per sensor, its bleed.
				await services.settings.update({
					latency: { ...(await services.settings.get()).latency, ...result.latency },
					clickBleed: result.clickBleed,
					inputDeviceId: deviceId
				});
			}
			outcome = result;
		} catch (error) {
			outcome = { ok: false, reason: 'error' };
			notice = error instanceof Error ? error.message : String(error);
		}
		phase = 'done';
	}

	function oncancel() {
		services.calibration.cancel();
	}

	function onretry() {
		phase = 'idle';
		progress = null;
		outcome = null;
	}

	function onselectdevice(id: string | null) {
		selectedDeviceId = id;
		if (listening) void onlisten();
	}

	onDestroy(() => {
		services.calibration.cancel();
		void stopMeter();
	});
</script>

<CalibrationScreen
	{inputs}
	{selectedDeviceId}
	{listening}
	{levelRms}
	{phase}
	{progress}
	{outcome}
	{onselectdevice}
	{onlisten}
	{onstart}
	{oncancel}
	{onretry}
	{notice}
/>
