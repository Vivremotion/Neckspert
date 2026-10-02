<script lang="ts">
	import type { AudioInputDevice, NoteOnset } from '$lib/application/ports';
	import { WebAudioNoteDetector, frequencyToMidi } from '$lib/infrastructure/audio/detection';

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

	function formatNote(midi: number): string {
		const name = NOTE_NAMES[((midi % 12) + 12) % 12];
		const octave = Math.floor(midi / 12) - 1;
		return `${name}${octave}`;
	}

	function centsOff(frequencyHz: number, midi: number): number {
		return 100 * (frequencyToMidi(frequencyHz) - midi);
	}

	let devices = $state<AudioInputDevice[]>([]);
	let selectedId = $state<string | null>(null);
	let running = $state(false);
	let level = $state(0);
	let last = $state<NoteOnset | null>(null);
	let log = $state<NoteOnset[]>([]);
	let error = $state<string | null>(null);

	let context: AudioContext | null = null;
	let detector: WebAudioNoteDetector | null = null;
	let unsubNote: (() => void) | null = null;
	let unsubLevel: (() => void) | null = null;

	async function refreshDevices() {
		if (!detector) {
			context ??= new AudioContext();
			detector = new WebAudioNoteDetector(() => context!);
		}
		devices = await detector.listInputs();
		if (!selectedId && devices[0]) selectedId = devices[0].id;
	}

	async function start() {
		error = null;
		context ??= new AudioContext();
		if (context.state === 'suspended') await context.resume();
		detector ??= new WebAudioNoteDetector(() => context!);
		unsubNote?.();
		unsubLevel?.();
		unsubNote = detector.onNote((onset) => {
			last = onset;
			log = [onset, ...log].slice(0, 20);
		});
		unsubLevel = detector.onLevel((rms) => {
			level = rms;
		});
		await detector.start(selectedId);
		running = true;
		await refreshDevices();
	}

	function stop() {
		detector?.stop();
		unsubNote?.();
		unsubLevel?.();
		unsubNote = null;
		unsubLevel = null;
		running = false;
		level = 0;
	}

	$effect(() => {
		refreshDevices().catch((e) => {
			error = e instanceof Error ? e.message : String(e);
		});
		return () => stop();
	});
</script>

<main class="diag">
	<h1>Diagnostic détection</h1>
	<p class="hint">
		Entrée brute (echo / noise / AGC désactivés). Brancher une interface si possible.
	</p>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<label class="row">
		<span>Entrée</span>
		<select bind:value={selectedId} disabled={running}>
			<option value={null}>Par défaut</option>
			{#each devices as device (device.id)}
				<option value={device.id}>{device.label || device.id}</option>
			{/each}
		</select>
	</label>

	<div class="row actions">
		{#if running}
			<button type="button" onclick={stop}>Arrêter</button>
		{:else}
			<button type="button" onclick={() => start().catch((e) => (error = e.message))}>
				Démarrer
			</button>
		{/if}
		<button type="button" onclick={() => refreshDevices()} disabled={running}>Rafraîchir</button>
	</div>

	<label class="meter">
		<span>Niveau</span>
		<progress max="1" value={Math.min(1, level * 4)}></progress>
		<code>{level.toFixed(3)}</code>
	</label>

	<section class="last">
		<h2>Dernière note</h2>
		{#if last}
			<p>
				<strong>{formatNote(last.midi)}</strong>
				(MIDI {last.midi}) · {last.frequencyHz.toFixed(2)} Hz ·
				{centsOff(last.frequencyHz, last.midi).toFixed(1)} cents · clarté
				{last.clarity.toFixed(3)} · t={last.time.toFixed(3)} s
			</p>
		{:else}
			<p>—</p>
		{/if}
	</section>

	<section>
		<h2>Journal (20)</h2>
		<ol>
			{#each log as onset, i (onset.time + ':' + i)}
				<li>
					{formatNote(onset.midi)} · {onset.frequencyHz.toFixed(1)} Hz ·
					{centsOff(onset.frequencyHz, onset.midi).toFixed(1)} ¢ · t={onset.time.toFixed(3)}
				</li>
			{/each}
		</ol>
	</section>
</main>

<style>
	.diag {
		--ink: #1a1a1a;
		--muted: #666;
		--line: #ccc;
		--bg: #f7f7f5;
		--accent: #813b2a;
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
		color: var(--ink);
		background: var(--bg);
		min-height: 100vh;
		margin: 0;
		padding: 1.5rem;
		line-height: 1.45;
		max-width: 40rem;
	}
	h1 {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}
	h2 {
		font-size: 1rem;
		margin: 1.25rem 0 0.5rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.error {
		color: #8b0000;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin: 0.75rem 0;
	}
	select,
	button {
		font: inherit;
		padding: 0.4rem 0.6rem;
	}
	button {
		background: var(--accent);
		color: #fff;
		border: none;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.meter {
		display: grid;
		grid-template-columns: 4rem 1fr 4rem;
		gap: 0.5rem;
		align-items: center;
	}
	progress {
		width: 100%;
		height: 0.75rem;
	}
	ol {
		padding-left: 1.25rem;
		border-top: 1px solid var(--line);
	}
	li {
		font-size: 0.85rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
</style>
