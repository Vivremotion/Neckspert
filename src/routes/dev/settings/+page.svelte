<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import {
		DEFAULT_BUILT_IN_INPUT_GAIN,
		clampBuiltInInputGain,
		type Locale
	} from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';

	const inputs: AudioInputDevice[] = [
		{ id: 'usb', label: 'Scarlett 2i2 USB' },
		{ id: 'built', label: 'Built-in Microphone' }
	];

	let locale = $state<Locale>('fr');
	let inputDeviceId = $state<string | null>('usb');
	let builtInInputGain = $state(DEFAULT_BUILT_IN_INPUT_GAIN);
	let calibrationOffsetMs = $state<number | null>(42);
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);
	let diagnosticsEnabled = $state(true);
	let diagnosticsBudgetMb = $state(300);
	let diagnosticsUsedBytes = $state(42 * 1024 * 1024);

	function onlocale(next: Locale) {
		locale = next;
		i18n.locale = next;
	}
</script>

<SettingsScreen
	{locale}
	{inputs}
	{inputDeviceId}
	{builtInInputGain}
	{calibrationOffsetMs}
	{importError}
	{confirmingImport}
	{onlocale}
	oninput={(id) => (inputDeviceId = id)}
	onbuiltingain={(gain) => (builtInInputGain = clampBuiltInInputGain(gain))}
	onexport={() => undefined}
	onimportfile={() => {
		confirmingImport = true;
		importError = null;
	}}
	onimportconfirm={() => (confirmingImport = false)}
	onimportcancel={() => (confirmingImport = false)}
	{diagnosticsEnabled}
	{diagnosticsBudgetMb}
	{diagnosticsUsedBytes}
	ondiagnostics={(enabled) => (diagnosticsEnabled = enabled)}
	ondiagnosticsbudget={(mb) => (diagnosticsBudgetMb = mb)}
	ondiagnosticsexport={() => undefined}
	ondiagnosticsclear={() => (diagnosticsUsedBytes = 0)}
/>
