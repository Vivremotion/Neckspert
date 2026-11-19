<script lang="ts">
	import type { ImportedFile } from '$lib/application/definitions/service';
	import type { Refusal } from '$lib/domain/definitions';
	import { i18n } from '$lib/i18n/index.svelte';
	import { refusalText } from '$lib/ui/definitions/refusalMessages';
	import Button from '$lib/ui/primitives/Button.svelte';
	import { settingsMessages } from './messages';

	let {
		files,
		refused,
		problems = [],
		onimport,
		onremove
	}: {
		files: readonly ImportedFile[];
		/** The files of the last import that were not stored, with the reason. */
		refused: readonly Refusal[];
		/** The refusals of the imported files that point to no stored file: what kept them all from loading. */
		problems?: readonly Refusal[];
		onimport: (files: File[]) => void;
		onremove: (name: string) => void;
	} = $props();
	const uid = $props.id();

	const m = $derived(settingsMessages());
	let fileInput: HTMLInputElement | undefined = $state();
	/** The file whose removal waits for a confirmation. */
	let confirming = $state<string | null>(null);

	const dateFormat = $derived(new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'long' }));

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const chosen = Array.from(input.files ?? []);
		input.value = '';
		if (chosen.length > 0) onimport(chosen);
	}

	function remove(name: string) {
		confirming = null;
		onremove(name);
	}
</script>

<section id="imported-files" class="group" aria-labelledby="{uid}-title">
	<h2 id="{uid}-title">{m.importedFiles}</h2>
	<p class="hint">{m.importedFilesHelp}</p>
	<div class="row">
		<Button variant="quiet" onclick={() => fileInput?.click()}>{m.importFiles}</Button>
		<input
			bind:this={fileInput}
			class="file"
			type="file"
			multiple
			accept="application/json,.json"
			onchange={onFileChange}
		/>
	</div>

	{#each refused as refusal, index (index)}
		<p class="refused">
			{m.notImported(refusal.file, refusalText(refusal, i18n.locale, { file: false }))}
		</p>
	{/each}

	{#each problems as problem, index (index)}
		<p class="refusal">{refusalText(problem, i18n.locale)}</p>
	{/each}

	{#if files.length === 0}
		<p>{m.importedFilesEmpty}</p>
	{:else}
		<ul>
			{#each files as file, index (file.name)}
				{@const counts = m.importedFileCounts(
					file.skills.length,
					file.grids.length,
					file.exercises.length
				)}
				<li>
					<p class="name">{file.name}</p>
					<p class="hint">{dateFormat.format(file.importedAt)}</p>
					<p>{counts === '' ? m.importedFileNothing : counts}</p>
					{#each file.refusals as refusal, index (index)}
						<p class="refusal">{refusalText(refusal, i18n.locale, { file: false })}</p>
					{/each}
					{#if confirming === file.name}
						<div class="row" role="group" aria-labelledby="{uid}-confirm-{index}">
							<span id="{uid}-confirm-{index}">{m.removeFileConfirm}</span>
							<Button variant="choice" onclick={() => remove(file.name)}>{m.removeFile}</Button>
							<Button variant="quiet" onclick={() => (confirming = null)}>{m.cancel}</Button>
						</div>
					{:else}
						<div class="row">
							<Button
								variant="quiet"
								label={m.removeFileNamed(file.name)}
								onclick={() => (confirming = file.name)}>{m.removeFile}</Button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

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

	p {
		margin: var(--np-step-2) 0 0;
		overflow-wrap: anywhere;
	}

	.hint {
		color: var(--np-muted-text);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--np-step-2);
		align-items: center;
		margin-top: var(--np-step-2);
	}

	ul {
		list-style: none;
		margin: var(--np-step-2) 0 0;
		padding: 0;
	}

	li {
		padding: var(--np-step-3) 0;
		border-bottom: 1px solid var(--np-rule);
	}

	li > p:first-child {
		margin-top: 0;
	}

	.name {
		font-weight: 700;
	}

	.refused,
	.refusal {
		padding-left: var(--np-step-2);
		border-left: 4px solid var(--np-text);
	}

	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
