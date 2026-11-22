<script lang="ts">
	import { useAppServices } from '$lib/application/app';
	import type { AudioInputDevice } from '$lib/application/ports';
	import {
		DEFAULT_BUILT_IN_INPUT_GAIN,
		DEFAULT_SETTINGS,
		clampBuiltInInputGain,
		resolveDiagnosticsEnabled,
		type ChordDiagramStyle,
		type DiagnosticsSettings,
		type Locale,
		type Settings
	} from '$lib/domain/types';
	import type { ImportedFile } from '$lib/application/definitions/service';
	import { MAX_DEFINITION_FILE_CHARS, type Refusal } from '$lib/domain/definitions';
	import { downloadDiagnosticArchive } from '$lib/infrastructure/diagnostics';
	import { downloadBackup, readBackupFile, validateBackup } from '$lib/infrastructure/storage';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';

	const services = useAppServices();

	let locale = $state<Locale>('fr');
	let inputs = $state<AudioInputDevice[]>([]);
	let inputDeviceId = $state<string | null>(null);
	let builtInInputGain = $state(DEFAULT_BUILT_IN_INPUT_GAIN);
	let latency = $state<Settings['latency']>({});
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);
	let pendingImport: unknown = null;
	let unlocking = $state(false);
	let notice = $state<string | null>(null);
	let chordDiagram = $state<ChordDiagramStyle>(DEFAULT_SETTINGS.chordDiagram);
	let diagnostics = $state<DiagnosticsSettings>({ ...DEFAULT_SETTINGS.diagnostics });
	let diagnosticsUsedBytes = $state(0);
	let diagnosticsExporting = $state(false);
	let diagnosticsError = $state<string | null>(null);
	const diagnosticsEnabled = $derived(resolveDiagnosticsEnabled(diagnostics, import.meta.env.DEV));
	/** Bumped by user edits so a late initial load cannot overwrite them. */
	let loadSeq = 0;
	/** Bumped by every read of the list, so a late read cannot overwrite a newer one. */
	let filesSeq = 0;
	let importedFiles = $state<ImportedFile[]>([]);
	let notStored = $state<Refusal[]>([]);
	/** The refusals of the imported files that no stored file carries: what kept them from loading. */
	let definitionsProblems = $state<Refusal[]>([]);
	let definitionsError = $state<string | null>(null);

	async function load() {
		const seq = ++loadSeq;
		const [settings, devices] = await Promise.all([
			services.settings.get(),
			services.detector.listInputs()
		]);
		if (seq !== loadSeq) return;
		locale = settings.locale;
		inputDeviceId = settings.inputDeviceId ?? devices[0]?.id ?? null;
		builtInInputGain = clampBuiltInInputGain(settings.builtInInputGain);
		latency = settings.latency;
		diagnostics = settings.diagnostics;
		chordDiagram = settings.chordDiagram;
		inputs = devices;
		i18n.locale = settings.locale;
	}

	async function loadUsage() {
		diagnosticsUsedBytes = (await services.diagnostics.usage()).bytes;
	}

	void load();
	void loadUsage();
	void reloadFiles();

	async function onlocale(next: Locale) {
		loadSeq += 1;
		locale = next;
		i18n.locale = next;
		await services.settings.update({ locale: next });
	}

	async function onchorddiagram(next: ChordDiagramStyle) {
		loadSeq += 1;
		chordDiagram = next;
		await services.settings.update({ chordDiagram: next });
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

	const refusalKey = ({ file, kind, id, reason }: Refusal) =>
		JSON.stringify([file, kind, id, reason]);

	async function reloadFiles() {
		const seq = ++filesSeq;
		try {
			const files = await services.definitions.files();
			if (seq !== filesSeq) return;
			importedFiles = files;
			// What no stored file already tells under its name (a file may bear any name).
			const told = new Set(files.flatMap((file) => file.refusals.map(refusalKey)));
			definitionsProblems = services.definitions
				.refusals()
				.filter((refusal) => !told.has(refusalKey(refusal)));
		} catch (error) {
			definitionsError = error instanceof Error ? error.message : String(error);
		}
	}

	/** A file's text, or why it is not imported: unread, or so big that no text of it could pass. */
	async function readFile(file: File): Promise<{ name: string; text: string } | Refusal> {
		const refused = (reason: string): Refusal => ({
			file: file.name,
			kind: 'file',
			id: null,
			reason
		});
		// A character takes at most 3 bytes in UTF-8 (4 for two characters): a file of more bytes
		// than that holds more characters than the service keeps, and is not read at all.
		if (file.size > 3 * MAX_DEFINITION_FILE_CHARS) {
			return refused(`the file is longer than ${MAX_DEFINITION_FILE_CHARS} characters`);
		}
		try {
			return { name: file.name, text: await file.text() };
		} catch {
			return refused('the file could not be read');
		}
	}

	async function onimportfiles(chosen: File[]) {
		definitionsError = null;
		const read = await Promise.all(chosen.map(readFile));
		const unreadable = read.filter((file): file is Refusal => 'reason' in file);
		const texts = read.filter((file) => 'text' in file);
		try {
			const result = await services.definitions.import(texts);
			notStored = [...unreadable, ...result.refused];
		} catch (error) {
			notStored = unreadable;
			definitionsError = error instanceof Error ? error.message : String(error);
		}
		await reloadFiles();
	}

	async function onremovefile(name: string) {
		definitionsError = null;
		notStored = [];
		try {
			await services.definitions.remove(name);
		} catch (error) {
			definitionsError = error instanceof Error ? error.message : String(error);
		}
		await reloadFiles();
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
			await reloadFiles();
		} catch (error) {
			importError = error instanceof Error ? error.message : String(error);
			confirmingImport = false;
			pendingImport = null;
		}
	}

	async function saveDiagnostics(next: DiagnosticsSettings) {
		loadSeq += 1;
		diagnostics = next;
		await services.settings.update({ diagnostics: next });
	}

	function ondiagnostics(enabled: boolean) {
		return saveDiagnostics({ ...diagnostics, enabled });
	}

	function ondiagnosticsbudget(budgetMb: number) {
		return saveDiagnostics({ ...diagnostics, budgetMb });
	}

	function ondiagnosticsnativerate(nativeRate: boolean) {
		return saveDiagnostics({ ...diagnostics, nativeRate });
	}

	async function ondiagnosticsexport() {
		if (diagnosticsExporting) return;
		diagnosticsExporting = true;
		diagnosticsError = null;
		try {
			downloadDiagnosticArchive(await services.diagnostics.exportArchive());
		} catch (error) {
			diagnosticsError = error instanceof Error ? error.message : String(error);
		} finally {
			diagnosticsExporting = false;
		}
	}

	async function ondiagnosticsclear() {
		await services.diagnostics.clear();
		await loadUsage();
	}

	function onimportcancel() {
		confirmingImport = false;
		pendingImport = null;
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
	{chordDiagram}
	{onchorddiagram}
	{oninput}
	{onbuiltingain}
	{onexport}
	{onimportfile}
	{onimportconfirm}
	{onimportcancel}
	{onunlock}
	{notice}
	{diagnosticsEnabled}
	diagnosticsBudgetMb={diagnostics.budgetMb}
	{diagnosticsUsedBytes}
	{ondiagnostics}
	{ondiagnosticsbudget}
	diagnosticsNativeRate={diagnostics.nativeRate === true}
	{ondiagnosticsnativerate}
	{ondiagnosticsexport}
	{ondiagnosticsclear}
	{importedFiles}
	{notStored}
	{definitionsProblems}
	{definitionsError}
	{onimportfiles}
	{onremovefile}
	{diagnosticsExporting}
	{diagnosticsError}
/>
