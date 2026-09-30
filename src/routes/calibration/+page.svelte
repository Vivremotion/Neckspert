<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useAppServices } from '$lib/application/app';
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import CalibrationScreen from '$lib/ui/screens/calibration/CalibrationScreen.svelte';

	const services = useAppServices();

	let inputs = $state<AudioInputDevice[]>([]);
	let selectedDeviceId = $state<string | null>(null);
	let listening = $state(false);
	let levelRms = $state(0);
	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let progress = $state<CalibrationProgress | null>(null);
	let outcome = $state<CalibrationOutcome | null>(null);

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
		await stopMeter();
		await services.detector.start(selectedDeviceId);
		stopLevel = services.detector.onLevel((rms) => {
			levelRms = rms;
		});
		listening = true;
	}

	async function onstart() {
		if (phase === 'running') return;
		phase = 'running';
		progress = null;
		outcome = null;
		if (!listening) await onlisten();
		const result = await services.calibration.run((next) => {
			progress = next;
		});
		outcome = result;
		phase = 'done';
		if (result.ok) {
			await services.settings.update({
				calibrationOffsetMs: result.offsetMs,
				inputDeviceId: selectedDeviceId
			});
		}
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
/>
