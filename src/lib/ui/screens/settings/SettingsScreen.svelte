<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { Locale } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, clampTempo } from './tempo';
	import { settingsMessages } from './messages';

	let {
		locale,
		tempoBpm,
		inputs,
		inputDeviceId,
		calibrationOffsetMs,
		importError,
		confirmingImport,
		onlocale,
		ontempo,
		oninput,
		onexport,
		onimportfile,
		onimportconfirm,
		onimportcancel
	}: {
		locale: Locale;
		tempoBpm: number;
		inputs: AudioInputDevice[];
		inputDeviceId: string | null;
		calibrationOffsetMs: number | null;
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: Locale) => void;
		ontempo: (bpm: number) => void;
		oninput: (id: string | null) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
	} = $props();

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
		<p class="label"><PixelText scale={1}>{m.tempo}</PixelText></p>
		<div class="row tempo" role="group" aria-label={m.tempo}>
			<PixelButton
				size="huge"
				disabled={tempoBpm <= MIN_TEMPO_BPM}
				onclick={() => ontempo(clampTempo(tempoBpm - 1))}>{m.decrease}</PixelButton
			>
			<span class="tempo-value" aria-live="polite">
				<PixelText scale={4}>{tempoBpm}</PixelText>
			</span>
			<PixelButton
				size="huge"
				disabled={tempoBpm >= MAX_TEMPO_BPM}
				onclick={() => ontempo(clampTempo(tempoBpm + 1))}>{m.increase}</PixelButton
			>
		</div>
	</PixelBox>

	<PixelBox variant="double">
		<label class="label" for="settings-input">
			<PixelText scale={1}>{m.input}</PixelText>
		</label>
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
	</PixelBox>

	<PixelBox variant="plain">
		<p class="label"><PixelText scale={1}>{m.calibration}</PixelText></p>
		<p><PixelText scale={1}>{m.offset(calibrationOffsetMs)}</PixelText></p>
		<a class="calibration-link" href="/calibration">
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
		min-height: 100dvh;
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

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-tile, 8px);
		align-items: center;
	}

	.tempo {
		justify-content: space-between;
	}

	.tempo-value {
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
		font-size: 1.25rem;
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
</style>
