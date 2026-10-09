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
		type Locale
	} from '$lib/domain/types';
	import ChordShape from '$lib/ui/primitives/ChordShape.svelte';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { settingsMessages } from './messages';

	let {
		locale,
		inputs,
		inputDeviceId,
		builtInInputGain,
		calibrationOffsetMs,
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
		ondiagnostics,
		ondiagnosticsbudget,
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
		calibrationOffsetMs: number | null;
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

<section class="settings-screen" aria-labelledby="settings-title">
	<!-- PixelText (H) does not forward id; wrap for aria-labelledby. -->
	<header class="top">
		<div id="settings-title">
			<PixelText as="h1" scale={4}>{m.title}</PixelText>
		</div>
	</header>

	<PixelBox variant="double">
		<p class="label"><PixelText scale={1}>{m.language}</PixelText></p>
		<div class="row" role="group" aria-label={m.language}>
			<PixelButton size="large" disabled={locale === 'fr'} onclick={() => onlocale('fr')}
				>FR</PixelButton
			>
			<PixelButton size="large" disabled={locale === 'en'} onclick={() => onlocale('en')}
				>EN</PixelButton
			>
		</div>
	</PixelBox>

	<PixelBox variant="double">
		<p class="label"><PixelText scale={1}>{m.chordDiagram}</PixelText></p>
		<div class="row" role="group" aria-label={m.chordDiagram}>
			<div class="diagram-choice">
				<PixelButton
					size="large"
					disabled={chordDiagram === 'strings'}
					onclick={() => onchorddiagram('strings')}>{m.chordDiagramStrings}</PixelButton
				>
				<ChordShape shape={SAMPLE_SHAPE} style="strings" {locale} size="small" />
			</div>
			<div class="diagram-choice">
				<PixelButton
					size="large"
					disabled={chordDiagram === 'grid'}
					onclick={() => onchorddiagram('grid')}>{m.chordDiagramGrid}</PixelButton
				>
				<ChordShape shape={SAMPLE_SHAPE} style="grid" {locale} size="small" />
			</div>
		</div>
	</PixelBox>

	<PixelBox variant="double">
		<label class="label" for="settings-input">
			<PixelText scale={1}>{m.input}</PixelText>
		</label>
		{#if inputs.length === 0}
			<p><PixelText scale={1}>{m.emptyInputs}</PixelText></p>
			<PixelButton size="large" onclick={() => onunlock?.()}>{m.unlock}</PixelButton>
			{#if notice}
				<p class="error" role="alert"><PixelText scale={1}>{notice}</PixelText></p>
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
		<p class="label gain-label"><PixelText scale={1}>{m.builtInGain}</PixelText></p>
		<div class="row stepper" role="group" aria-label={m.builtInGain}>
			<PixelButton
				size="huge"
				label={m.decreaseBuiltInGain}
				disabled={builtInInputGain <= MIN_BUILT_IN_INPUT_GAIN}
				onclick={() => onbuiltingain(clampBuiltInInputGain(builtInInputGain - 1))}
				>{m.decrease}</PixelButton
			>
			<span class="stepper-value" aria-live="polite">
				<PixelText scale={4}>{`×${builtInInputGain}`}</PixelText>
			</span>
			<PixelButton
				size="huge"
				label={m.increaseBuiltInGain}
				disabled={builtInInputGain >= MAX_BUILT_IN_INPUT_GAIN}
				onclick={() => onbuiltingain(clampBuiltInInputGain(builtInInputGain + 1))}
				>{m.increase}</PixelButton
			>
		</div>
		<p class="hint"><PixelText scale={1}>{m.builtInGainHint}</PixelText></p>
	</PixelBox>

	<PixelBox variant="plain">
		<p class="label"><PixelText scale={1}>{m.calibration}</PixelText></p>
		<p><PixelText scale={1}>{m.offset(calibrationOffsetMs)}</PixelText></p>
		<a class="calibration-link" href={resolve('/calibration')}>
			<PixelText scale={2}>{m.calibrationLink}</PixelText>
		</a>
	</PixelBox>

	<PixelBox variant="double">
		<div class="row">
			<PixelButton size="huge" onclick={onexport}>{m.export}</PixelButton>
			<PixelButton size="huge" onclick={() => fileInput?.click()}>{m.import}</PixelButton>
			<input
				bind:this={fileInput}
				class="file"
				type="file"
				accept="application/json,.json"
				onchange={onFileChange}
			/>
		</div>

		{#if importError}
			<p class="error" role="alert"><PixelText scale={1}>{importError}</PixelText></p>
		{/if}
	</PixelBox>

	<PixelBox variant="double">
		<p class="label"><PixelText scale={1}>{m.diagnostics}</PixelText></p>
		<p class="label"><PixelText scale={1}>{m.diagnosticsRecord}</PixelText></p>
		<PixelButton
			size="large"
			pressed={diagnosticsEnabled}
			label={m.diagnosticsToggle(diagnosticsEnabled)}
			onclick={() => ondiagnostics(!diagnosticsEnabled)}
			>{m.diagnosticsState(diagnosticsEnabled)}</PixelButton
		>
		<p class="usage">
			<PixelText scale={1}
				>{m.diagnosticsUsage(diagnosticsUsedBytes / BYTES_PER_MB, diagnosticsBudgetMb)}</PixelText
			>
		</p>
		<p class="label"><PixelText scale={1}>{m.diagnosticsBudget}</PixelText></p>
		<div class="row" role="group" aria-label={m.diagnosticsBudget}>
			{#each DIAGNOSTIC_BUDGETS_MB as budget (budget)}
				<PixelButton
					size="large"
					disabled={diagnosticsBudgetMb === budget}
					onclick={() => ondiagnosticsbudget(budget)}
					>{m.diagnosticsBudgetOption(budget)}</PixelButton
				>
			{/each}
		</div>
		<div class="row actions">
			<PixelButton size="large" disabled={diagnosticsExporting} onclick={ondiagnosticsexport}
				>{m.diagnosticsExport}</PixelButton
			>
			<PixelButton size="large" onclick={ondiagnosticsclear}>{m.diagnosticsClear}</PixelButton>
		</div>
		{#if diagnosticsError}
			<p class="error" role="alert"><PixelText scale={1}>{diagnosticsError}</PixelText></p>
		{/if}
	</PixelBox>

	{#if confirmingImport}
		<PixelBox variant="inverted">
			<p><PixelText scale={2}>{m.confirmTitle}</PixelText></p>
			<p><PixelText scale={1}>{m.confirmBody}</PixelText></p>
			<div class="row">
				<PixelButton size="huge" onclick={onimportconfirm}>{m.confirm}</PixelButton>
				<PixelButton size="large" onclick={onimportcancel}>{m.cancel}</PixelButton>
			</div>
		</PixelBox>
	{/if}
</section>

<style>
	.settings-screen {
		display: flex;
		flex-direction: column;
		gap: var(--np-space-3, 24px);
		padding: var(--np-space-2, 16px);
		width: 100%;
		max-width: 40rem;
		min-width: 0;
		margin-inline: auto;
		box-sizing: border-box;
		background: var(--np-bg, #e99568);
		color: var(--np-ink, #451218);
		caret-color: var(--np-ink, #451218);
	}

	.settings-screen ::selection {
		background: var(--np-ink, #451218);
		color: var(--np-bg, #e99568);
	}

	.top {
		margin-block-end: var(--np-tile, 8px);
	}

	.label {
		margin: 0 0 var(--np-tile, 8px);
	}

	.gain-label {
		margin-top: var(--np-space-2, 16px);
	}

	.hint {
		margin: var(--np-tile, 8px) 0 0;
	}

	.usage {
		margin: var(--np-space-2, 16px) 0;
		font-variant-numeric: tabular-nums;
	}

	.actions {
		margin-top: var(--np-space-2, 16px);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-tile, 8px);
		align-items: center;
	}

	.stepper {
		justify-content: space-between;
	}

	.stepper-value {
		min-width: 4ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		font: inherit;
		font-family: var(--np-font-pixel, inherit);
		font-size: var(--np-type-body);
		text-transform: uppercase;
		padding: var(--np-tile, 8px);
		background: var(--np-mid, #be6754);
		color: var(--np-ink, #451218);
		border: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		border-radius: 0;
	}

	.device-select:focus-visible {
		outline: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		outline-offset: calc(var(--np-tile, 8px) / 2);
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
		outline: calc(var(--np-tile, 8px) / 2) solid var(--np-ink, #451218);
		outline-offset: calc(var(--np-tile, 8px) / 2);
	}

	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.error {
		margin: 0;
		color: var(--np-ink, #451218);
	}

	.diagram-choice {
		display: grid;
		justify-items: center;
		gap: var(--np-space-1, 8px);
	}
</style>
