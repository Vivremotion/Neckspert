<script lang="ts">
	import { useAppServices } from '$lib/application/app';
	import type { AudioInputDevice, ChordReport, NoteOnset } from '$lib/application/ports';
	import { createDiagnosticJournal } from '$lib/composition/diagnostics';
	import {
		closeTriadVoicings,
		parseSpelledNote,
		qualityById,
		voicingCandidates,
		voicingOccurrences,
		type StringNumber,
		type VoicingOccurrence
	} from '$lib/domain/music';
	import { NnlsChordVerifier } from '$lib/infrastructure/audio/chords';
	import { WebAudioNoteDetector, frequencyToMidi } from '$lib/infrastructure/audio/detection';
	import { WebAudioInput } from '$lib/infrastructure/audio/input';

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

	/** This page's own input is journaled like the app's: each Start opens a take. */
	const journal = createDiagnosticJournal(useAppServices().settings);

	let context: AudioContext | null = null;
	let detector: WebAudioNoteDetector | null = null;
	let input: WebAudioInput | null = null;
	let verifier: NnlsChordVerifier | null = null;
	let unsubReport: (() => void) | null = null;

	/** One input for both detectors, created with the context. */
	function ensureDetectors() {
		context ??= new AudioContext();
		input ??= new WebAudioInput(() => context!, { diagnostics: journal });
		detector ??= new WebAudioNoteDetector(() => context!, { input });
		if (!verifier) {
			verifier = new NnlsChordVerifier(input, { diagnostics: journal });
			unsubReport = verifier.onReport((report) => {
				reports = [report, ...reports].slice(0, 20);
			});
		}
		return detector;
	}

	const CHORD_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
	const ROOT_STRINGS: { label: string; string: StringNumber }[] = [
		{ label: 'sol', string: 3 },
		{ label: 'si', string: 2 },
		{ label: 'mi', string: 1 }
	];
	/** closeTriadVoicings order: root on the lowest string, on the highest, on the middle one. */
	const INVERSION_OF: Partial<Record<StringNumber, number>> = { 3: 0, 1: 1, 2: 2 };

	let chordRoot = $state('D');
	let chordQuality = $state<'maj' | 'min'>('maj');
	let rootString = $state<StringNumber>(2);
	let occurrenceIndex = $state(0);
	let listening = $state<string | null>(null);
	let reports = $state<ChordReport[]>([]);

	const inversions = $derived(
		closeTriadVoicings(
			{ root: parseSpelledNote(chordRoot), quality: qualityById(chordQuality) },
			[3, 2, 1]
		)
	);
	const occurrences = $derived(voicingOccurrences(inversions[INVERSION_OF[rootString] ?? 0]));

	function fretsOf(occurrence: VoicingOccurrence): string {
		return occurrence.notes.map((n) => n.fret).join('-');
	}

	function listen() {
		if (!verifier || !context) return;
		const occurrence = occurrences[Math.min(occurrenceIndex, occurrences.length - 1)];
		const candidates = voicingCandidates(occurrence, inversions).map((c) => ({
			id: fretsOf(c.occurrence),
			kind: c.kind,
			notes: c.occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
		}));
		verifier.expect({
			opensAt: context.currentTime,
			expected: [fretsOf(occurrence)],
			candidates,
			style: 'unknown'
		});
		listening = `${chordRoot}${chordQuality === 'min' ? 'm' : ''} ${fretsOf(occurrence)}`;
	}
	let unsubNote: (() => void) | null = null;
	let unsubLevel: (() => void) | null = null;

	async function refreshDevices() {
		devices = await ensureDetectors().listInputs();
		if (!selectedId && devices[0]) selectedId = devices[0].id;
	}

	async function start() {
		error = null;
		context ??= new AudioContext();
		if (context.state === 'suspended') await context.resume();
		ensureDetectors();
		if (!detector) return;
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
		verifier?.expect(null);
		listening = null;
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
		return () => {
			stop();
			unsubReport?.();
		};
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

	<section>
		<h2>Accords (sol-si-mi)</h2>
		<div class="row">
			<select bind:value={chordRoot} aria-label="Fondamentale">
				{#each CHORD_ROOTS as root (root)}
					<option value={root}>{root}</option>
				{/each}
			</select>
			<select bind:value={chordQuality} aria-label="Qualité">
				<option value="maj">majeur</option>
				<option value="min">mineur</option>
			</select>
			<select bind:value={rootString} aria-label="Corde de la fondamentale">
				{#each ROOT_STRINGS as choice (choice.string)}
					<option value={choice.string}>fondamentale sur {choice.label}</option>
				{/each}
			</select>
			<select bind:value={occurrenceIndex} aria-label="Position">
				{#each occurrences as occurrence, i (fretsOf(occurrence))}
					<option value={i}>cases {fretsOf(occurrence)}</option>
				{/each}
			</select>
		</div>
		<div class="row actions">
			<button type="button" onclick={listen} disabled={!running}>Écouter</button>
			<span class="hint">{listening ? `Attendu : ${listening}` : 'Démarrer, puis écouter.'}</span>
		</div>
		<ol>
			{#each reports as report, i (report.time + ':' + report.windowMs + ':' + i)}
				<li>
					t={report.time.toFixed(3)} · {report.windowMs} ms
					{#each report.variants as variant (variant.id)}
						<div>
							{variant.id} : {variant.decided ?? '—'} ·
							{Object.entries(variant.scores)
								.map(([id, score]) => `${id} ${score.toFixed(2)}`)
								.join(' · ')}
						</div>
					{/each}
				</li>
			{/each}
		</ol>
	</section>

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
