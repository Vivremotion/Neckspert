<script lang="ts">
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import CalibrationScreen from '$lib/ui/screens/calibration/CalibrationScreen.svelte';

	const inputs: AudioInputDevice[] = [
		{ id: 'built', label: 'Built-in Microphone' },
		{ id: 'usb', label: 'Scarlett 2i2 USB' }
	];

	let selectedDeviceId = $state<string | null>('built');
	let listening = $state(true);
	let levelRms = $state(0.35);
	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let progress = $state<CalibrationProgress | null>(null);
	let outcome = $state<CalibrationOutcome | null>(null);

	function onlisten() {
		listening = true;
		levelRms = 0.45;
	}

	function onstart() {
		phase = 'running';
		progress = { phase: 'compare', done: 4, needed: 16 };
		outcome = null;
	}

	function oncancel() {
		phase = 'done';
		outcome = { ok: false, reason: 'cancelled' };
	}

	function onretry() {
		phase = 'idle';
		progress = null;
		outcome = null;
	}
</script>

<CalibrationScreen
	{inputs}
	{selectedDeviceId}
	{listening}
	{levelRms}
	{phase}
	{progress}
	{outcome}
	onselectdevice={(id) => (selectedDeviceId = id)}
	{onlisten}
	{onstart}
	{oncancel}
	{onretry}
/>
