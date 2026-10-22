<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { ShapeView } from '$lib/application/session/contract';
	import {
		DIAGNOSTIC_BUDGETS_MB,
		MAX_BUILT_IN_INPUT_GAIN,
		MIN_BUILT_IN_INPUT_GAIN,
		clampBuiltInInputGain,
		type ChordDiagramStyle,
		type Locale,
		type Settings
	} from '$lib/domain/types';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import Button from '$lib/ui/primitives/Button.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { settingsMessages } from './messages';

	let {
		locale,
		inputs,
		inputDeviceId,
		builtInInputGain,
		latency,
		importError,
		confirmingImport,
		onlocale,
		oninput,
		onbuiltingain,
		onexport,
		onimportfile,
		onimportconfirm,
		onimportcancel,
		onunlock,
		notice = null,
		diagnosticsEnabled,
		diagnosticsBudgetMb,
		diagnosticsUsedBytes,
		diagnosticsNativeRate = false,
		ondiagnostics,
		ondiagnosticsbudget,
		ondiagnosticsnativerate = () => {},
		ondiagnosticsexport,
		ondiagnosticsclear,
		diagnosticsExporting = false,
		diagnosticsError = null,
		chordDiagram,
		onchorddiagram
	}: {
		locale: Locale;
		inputs: AudioInputDevice[];
		inputDeviceId: string | null;
		builtInInputGain: number;
		/** The calibrated latency by sensor; the note sensor's is shown. */
		latency: Settings['latency'];
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: Locale) => void;
		oninput: (id: string | null) => void;
		onbuiltingain: (gain: number) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
		onunlock?: () => void;
		notice?: string | null;
		/** The journal as it applies now: the build default already resolved. */
		diagnosticsEnabled: boolean;
		diagnosticsBudgetMb: number;
		diagnosticsUsedBytes: number;
		ondiagnostics: (enabled: boolean) => void;
		ondiagnosticsbudget: (budgetMb: number) => void;
		/** Development option: record the sound at the input's own rate (shown in development only). */
		diagnosticsNativeRate?: boolean;
		ondiagnosticsnativerate?: (nativeRate: boolean) => void;
		ondiagnosticsexport: () => void;
		ondiagnosticsclear: () => void;
		/** True while an archive is being built: the export button waits. */
		diagnosticsExporting?: boolean;
		diagnosticsError?: string | null;
		/** How chord shapes are drawn, unless an exercise says. */
		chordDiagram: ChordDiagramStyle;
		onchorddiagram: (style: ChordDiagramStyle) => void;
	} = $props();

	const BYTES_PER_MB = 1024 * 1024;

	/** D, root on B: the shape each chord drawing style shows as its example. */
	const SAMPLE_SHAPE = {
		notes: [
			{ string: 3, fret: 2 },
			{ string: 2, fret: 3 },
			{ string: 1, fret: 2 }
		]
	} satisfies ShapeView;

	const m = $derived(settingsMessages());
	let fileInput: HTMLInputElement | undefined = $state();

	function onDeviceChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		oninput(value === '' ? null : value);
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) onimportfile(file);
		(event.currentTarget as HTMLInputElement).value = '';
	}
</script>

<Page title={m.title}>
	<section class="group" aria-labelledby="g-language">
		<h2 id="g-language">{m.language}</h2>
		<div class="row" role="group" aria-label={m.language}>
			<Button
				variant="choice"
				pressed={locale === 'fr'}
				disabled={locale === 'fr'}
				onclick={() => onlocale('fr')}>FR</Button
			>
			<Button
				variant="choice"
				pressed={locale === 'en'}
				disabled={locale === 'en'}
				onclick={() => onlocale('en')}>EN</Button
			>
		</div>
	</section>

	<section class="group" aria-labelledby="g-diagram">
		<h2 id="g-diagram">{m.chordDiagram}</h2>
		<div class="row diagram-row" role="group" aria-label={m.chordDiagram}>
			<div class="diagram-choice">
				<Button
					variant="choice"
					pressed={chordDiagram === 'strings'}
					disabled={chordDiagram === 'strings'}
					onclick={() => onchorddiagram('strings')}>{m.chordDiagramStrings}</Button
				>
				<ChordShape shape={SAMPLE_SHAPE} style="strings" {locale} size="small" />
			</div>
			<div class="diagram-choice">
				<Button
					variant="choice"
					pressed={chordDiagram === 'grid'}
					disabled={chordDiagram === 'grid'}
					onclick={() => onchorddiagram('grid')}>{m.chordDiagramGrid}</Button
				>
				<ChordShape shape={SAMPLE_SHAPE} style="grid" {locale} size="small" />
			</div>
		</div>
	</section>

	<section class="group" aria-labelledby="g-input">
		<h2 id="g-input"><label for="settings-input">{m.input}</label></h2>
		{#if inputs.length === 0}
			<p>{m.emptyInputs}</p>
			<div class="row">
				<Button variant="quiet" onclick={() => onunlock?.()}>{m.unlock}</Button>
			</div>
			{#if notice}
				<p class="error" role="alert">{notice}</p>
			{/if}
		{:else}
			<select
				id="settings-input"
				class="device-select"
				value={inputDeviceId ?? ''}
				onchange={onDeviceChange}
			>
				{#each inputs as device (device.id)}
					<option value={device.id}>{device.label}</option>
				{/each}
			</select>
		{/if}
		<p class="sub">{m.builtInGain}</p>
		<div class="row stepper" role="group" aria-label={m.builtInGain}>
			<Button
				variant="choice"
				label={m.decreaseBuiltInGain}
				disabled={builtInInputGain <= MIN_BUILT_IN_INPUT_GAIN}
				onclick={() => onbuiltingain(clampBuiltInInputGain(builtInInputGain - 1))}
				>{m.decrease}</Button
			>
			<span class="stepper-value" aria-live="polite">{`×${builtInInputGain}`}</span>
			<Button
				variant="choice"
				label={m.increaseBuiltInGain}
				disabled={builtInInputGain >= MAX_BUILT_IN_INPUT_GAIN}
				onclick={() => onbuiltingain(clampBuiltInInputGain(builtInInputGain + 1))}
				>{m.increase}</Button
			>
		</div>
		<p class="hint">{m.builtInGainHint}</p>
	</section>

	<section class="group" aria-labelledby="g-calibration">
		<h2 id="g-calibration">{m.calibration}</h2>
		<p class="latency">{m.offset(latency.note?.ms ?? null)}</p>
		<a class="calibration-link" href={resolve('/calibration')}>{m.calibrationLink}</a>
	</section>

	<div class="group">
		<div class="row">
			<Button variant="quiet" onclick={onexport}>{m.export}</Button>
			<Button variant="quiet" onclick={() => fileInput?.click()}>{m.import}</Button>
			<input
				bind:this={fileInput}
				class="file"
				type="file"
				accept="application/json,.json"
				onchange={onFileChange}
			/>
		</div>

		{#if importError}
			<p class="error" role="alert">{importError}</p>
		{/if}
	</div>

	<section class="group" aria-labelledby="g-diagnostics">
		<h2 id="g-diagnostics">{m.diagnostics}</h2>
		<p class="sub">{m.diagnosticsRecord}</p>
		<div class="row">
			<Button
				variant="choice"
				pressed={diagnosticsEnabled}
				label={m.diagnosticsToggle(diagnosticsEnabled)}
				onclick={() => ondiagnostics(!diagnosticsEnabled)}
				>{m.diagnosticsState(diagnosticsEnabled)}</Button
			>
		</div>
		<p class="usage">
			{m.diagnosticsUsage(diagnosticsUsedBytes / BYTES_PER_MB, diagnosticsBudgetMb)}
		</p>
		<p class="sub">{m.diagnosticsBudget}</p>
		<div class="row" role="group" aria-label={m.diagnosticsBudget}>
			{#each DIAGNOSTIC_BUDGETS_MB as budget (budget)}
				<Button
					variant="choice"
					pressed={diagnosticsBudgetMb === budget}
					disabled={diagnosticsBudgetMb === budget}
					onclick={() => ondiagnosticsbudget(budget)}>{m.diagnosticsBudgetOption(budget)}</Button
				>
			{/each}
		</div>
		{#if import.meta.env.DEV}
			<p class="sub">{m.diagnosticsNativeRate}</p>
			<div class="row">
				<Button
					variant="choice"
					pressed={diagnosticsNativeRate}
					label={m.diagnosticsNativeRateToggle(diagnosticsNativeRate)}
					onclick={() => ondiagnosticsnativerate(!diagnosticsNativeRate)}
					>{m.diagnosticsState(diagnosticsNativeRate)}</Button
				>
			</div>
			<p class="usage">{m.diagnosticsNativeRateHint}</p>
		{/if}
		<div class="row actions">
			<Button variant="quiet" disabled={diagnosticsExporting} onclick={ondiagnosticsexport}
				>{m.diagnosticsExport}</Button
			>
			<Button variant="quiet" onclick={ondiagnosticsclear}>{m.diagnosticsClear}</Button>
		</div>
		{#if diagnosticsError}
			<p class="error" role="alert">{diagnosticsError}</p>
		{/if}
	</section>

	{#if confirmingImport}
		<section class="group confirm" aria-labelledby="g-confirm">
			<h2 id="g-confirm">{m.confirmTitle}</h2>
			<p>{m.confirmBody}</p>
			<div class="row">
				<Button variant="choice" onclick={onimportconfirm}>{m.confirm}</Button>
				<Button variant="quiet" onclick={onimportcancel}>{m.cancel}</Button>
			</div>
		</section>
	{/if}
</Page>

<style>
	.group {
		margin-top: var(--np-step-6);
		font-size: var(--np-size-body);
	}

	h2 {
		margin: 0 0 var(--np-step-2);
		padding-bottom: var(--np-step-1);
		border-bottom: 1px solid var(--np-rule);
		font-size: var(--np-size-body);
		font-weight: 700;
	}

	h2 label {
		font-weight: inherit;
	}

	p {
		margin: var(--np-step-2) 0 0;
	}

	.sub {
		font-weight: 700;
		margin-top: var(--np-step-4);
	}

	.hint,
	.usage {
		color: var(--np-muted);
	}

	.usage {
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-step-2);
		align-items: center;
		margin-top: var(--np-step-2);
	}

	.stepper {
		justify-content: space-between;
	}

	.stepper-value {
		min-width: 4ch;
		text-align: center;
		font-size: var(--np-size-title);
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
		font: inherit;
		font-size: var(--np-size-body);
		padding: var(--np-step-1) var(--np-step-2);
		background: var(--np-ground);
		color: var(--np-text);
		border: 1px solid var(--np-text);
		border-radius: 0;
	}

	.device-select:focus-visible {
		outline: 2px solid var(--np-text);
		outline-offset: 2px;
	}

	.calibration-link {
		display: inline-flex;
		min-height: 48px;
		align-items: center;
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.calibration-link:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.error {
		padding-left: var(--np-step-2);
		border-left: 4px solid var(--np-text);
		font-weight: 700;
	}

	.diagram-row {
		align-items: start;
	}

	.diagram-choice {
		display: grid;
		justify-items: center;
		gap: var(--np-step-2);
		--shape-ink: var(--np-text);
		--shape-ground: var(--np-ground);
		--shape-accent: var(--np-rule);
	}
</style>
