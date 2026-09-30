<script lang="ts">
	import { useAppServices } from '$lib/application/app';
	import type { AudioInputDevice } from '$lib/application/ports';
	import { DEFAULT_BUILT_IN_INPUT_GAIN, clampBuiltInInputGain, type Locale } from '$lib/domain/types';
	import { downloadBackup, readBackupFile, validateBackup } from '$lib/infrastructure/storage';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';
	import { clampTempo } from '$lib/ui/screens/settings/tempo';

	const services = useAppServices();

	let locale = $state<Locale>('fr');
	let tempoBpm = $state(80);
	let inputs = $state<AudioInputDevice[]>([]);
	let inputDeviceId = $state<string | null>(null);
	let builtInInputGain = $state(DEFAULT_BUILT_IN_INPUT_GAIN);
	let calibrationOffsetMs = $state<number | null>(null);
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);
	let pendingImport: unknown = null;
	let unlocking = $state(false);
	let notice = $state<string | null>(null);
	/** Bumped by user edits so a late initial load cannot overwrite them. */
	let loadSeq = 0;

	async function load() {
		const seq = ++loadSeq;
		const [settings, devices] = await Promise.all([
			services.settings.get(),
			services.detector.listInputs()
		]);
		if (seq !== loadSeq) return;
		locale = settings.locale;
		tempoBpm = clampTempo(settings.tempoBpm);
		inputDeviceId = settings.inputDeviceId ?? devices[0]?.id ?? null;
		builtInInputGain = clampBuiltInInputGain(settings.builtInInputGain);
		calibrationOffsetMs = settings.calibrationOffsetMs;
		inputs = devices;
		i18n.locale = settings.locale;
	}

	void load();

	async function onlocale(next: Locale) {
		loadSeq += 1;
		locale = next;
		i18n.locale = next;
		await services.settings.update({ locale: next });
	}

	async function ontempo(next: number) {
		loadSeq += 1;
		const bpm = clampTempo(next);
		tempoBpm = bpm;
		await services.settings.update({ tempoBpm: bpm });
	}

	async function onunlock() {
		if (unlocking) return;
		unlocking = true;
		notice = null;
		loadSeq += 1;
		try {
			await services.detector.start(null);
			const devices = await services.detector.listInputs();
			services.detector.stop();
			inputs = devices;
			const nextId = devices[0]?.id ?? null;
			inputDeviceId = nextId;
			if (nextId) await services.settings.update({ inputDeviceId: nextId });
		} catch (error) {
			notice = error instanceof Error ? error.message : String(error);
		} finally {
			unlocking = false;
		}
	}

	async function onbuiltingain(next: number) {
		loadSeq += 1;
		const gain = clampBuiltInInputGain(next);
		builtInInputGain = gain;
		services.detector.setBuiltInGain(gain);
		await services.settings.update({ builtInInputGain: gain });
	}

	async function oninput(id: string | null) {
		loadSeq += 1;
		inputDeviceId = id;
		await services.settings.update({ inputDeviceId: id });
	}

	async function onexport() {
		downloadBackup(await services.backup.exportAll());
	}

	async function onimportfile(file: File) {
		importError = null;
		confirmingImport = false;
		pendingImport = null;
		try {
			const raw = await readBackupFile(file);
			pendingImport = validateBackup(raw);
			confirmingImport = true;
		} catch (error) {
			importError = error instanceof Error ? error.message : String(error);
		}
	}

	async function onimportconfirm() {
		if (pendingImport === null) return;
		try {
			await services.backup.importAll(pendingImport);
			confirmingImport = false;
			pendingImport = null;
			await load();
		} catch (error) {
			importError = error instanceof Error ? error.message : String(error);
			confirmingImport = false;
			pendingImport = null;
		}
	}

	function onimportcancel() {
		confirmingImport = false;
		pendingImport = null;
	}
</script>

<SettingsScreen
	{locale}
	{tempoBpm}
	{inputs}
	{inputDeviceId}
	{builtInInputGain}
	{calibrationOffsetMs}
	{importError}
	{confirmingImport}
	{onlocale}
	{ontempo}
	{oninput}
	{onbuiltingain}
	{onexport}
	{onimportfile}
	{onimportconfirm}
	{onimportcancel}
	{onunlock}
	{notice}
/>
