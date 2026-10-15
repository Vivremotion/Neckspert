<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import {
		DEFAULT_BUILT_IN_INPUT_GAIN,
		clampBuiltInInputGain,
		type ChordDiagramStyle,
		type Locale,
		type Settings
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
	let latency = $state<Settings['latency']>({ note: { ms: 42, provenance: 'player' } });
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);
	let diagnosticsEnabled = $state(true);
	let diagnosticsBudgetMb = $state(300);
	let diagnosticsNativeRate = $state(false);
	let diagnosticsUsedBytes = $state(42 * 1024 * 1024);
	let chordDiagram = $state<ChordDiagramStyle>('strings');

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
	{latency}
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
	{diagnosticsNativeRate}
	ondiagnosticsnativerate={(on) => (diagnosticsNativeRate = on)}
	ondiagnosticsexport={() => undefined}
	ondiagnosticsclear={() => (diagnosticsUsedBytes = 0)}
	{chordDiagram}
	onchorddiagram={(style) => (chordDiagram = style)}
/>
