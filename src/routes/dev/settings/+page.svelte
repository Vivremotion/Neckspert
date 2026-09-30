<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { Locale } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';
	import { clampTempo } from '$lib/ui/screens/settings/tempo';

	const inputs: AudioInputDevice[] = [
		{ id: 'usb', label: 'Scarlett 2i2 USB' },
		{ id: 'built', label: 'Built-in Microphone' }
	];

	let locale = $state<Locale>('fr');
	let tempoBpm = $state(80);
	let inputDeviceId = $state<string | null>('usb');
	let calibrationOffsetMs = $state<number | null>(42);
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);

	function onlocale(next: Locale) {
		locale = next;
		i18n.locale = next;
	}
</script>

<SettingsScreen
	{locale}
	{tempoBpm}
	{inputs}
	{inputDeviceId}
	{calibrationOffsetMs}
	{importError}
	{confirmingImport}
	{onlocale}
	ontempo={(bpm) => (tempoBpm = clampTempo(bpm))}
	oninput={(id) => (inputDeviceId = id)}
	onexport={() => undefined}
	onimportfile={() => {
		confirmingImport = true;
		importError = null;
	}}
	onimportconfirm={() => (confirmingImport = false)}
	onimportcancel={() => (confirmingImport = false)}
/>
