<script lang="ts">
	// THROWAWAY (plan 1, task 14): can Chrome open the audio interface and the built-in mic at
	// once in one AudioContext, and does the mic hear the pluck of an unplugged electric guitar?
	// Deleted once the answer is recorded in the spec.
	import { onDestroy, onMount } from 'svelte';
	import type { AudioInputDevice } from '$lib/application/ports';
	import { WebAudioAttackDetector } from '$lib/infrastructure/audio/attacks/WebAudioAttackDetector';
	import { WebAudioInput } from '$lib/infrastructure/audio/input/WebAudioInput';

	const PAIR_WINDOW_S = 0.05;
	const SHOWN_ATTACKS = 10;
	/** The level bar is full at this RMS. */
	const FULL_LEVEL = 0.3;

	interface Side {
		label: string;
		deviceId: string;
		level: number;
		/** Every attack heard, in audio seconds (the panel shows the last ten). */
		attacks: number[];
		input: WebAudioInput | null;
		stops: Array<() => void>;
	}

	function newSide(label: string): Side {
		return { label, deviceId: '', level: 0, attacks: [], input: null, stops: [] };
	}

	let devices = $state<AudioInputDevice[]>([]);
	let iface = $state(newSide('Interface'));
	let mic = $state(newSide('Micro du Mac'));
	let status = $state('Autorise le micro pour lister les entrées.');
	let opened = $state(false);
	let context: AudioContext | null = null;

	onMount(() => {
		void refreshDevices();
	});

	onDestroy(close);

	async function refreshDevices() {
		try {
			// Labels are empty until a permission was granted.
			const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
			probe.getTracks().forEach((track) => track.stop());
			const all = await navigator.mediaDevices.enumerateDevices();
			devices = all
				.filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
				.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
			const builtIn = devices.find((d) => /macbook|built-?in|intégr|interne/i.test(d.label));
			const other = devices.find((d) => d !== builtIn && d.id !== 'default');
			if (!mic.deviceId && builtIn) mic.deviceId = builtIn.id;
			if (!iface.deviceId && other) iface.deviceId = other.id;
			status = `${devices.length} entrées trouvées.`;
		} catch (error) {
			status = `Impossible de lister les entrées : ${String(error)}`;
		}
	}

	async function openBoth() {
		close();
		iface.attacks = [];
		mic.attacks = [];
		try {
			context = new AudioContext();
			const ctx = context;
			await ctx.resume();
			await wire(iface, ctx);
			await wire(mic, ctx);
			opened = true;
			status = `Ouvertes dans un seul contexte (${ctx.sampleRate} Hz). Joue des notes.`;
		} catch (error) {
			status = `Échec : ${String(error)}`;
			close();
		}
	}

	async function wire(side: Side, ctx: AudioContext) {
		const input = new WebAudioInput(() => ctx, { resume: () => ctx.resume() });
		side.input = input;
		const detector = new WebAudioAttackDetector(input);
		side.stops.push(
			input.onLevel((rms) => {
				side.level = Math.max(Math.min(1, rms / FULL_LEVEL), side.level * 0.9);
			}),
			detector.onAttack(({ time }) => {
				side.attacks = [...side.attacks, time];
			})
		);
		await input.start(side.deviceId || null);
	}

	function close() {
		for (const side of [iface, mic]) {
			side.stops.forEach((stop) => stop());
			side.stops = [];
			side.input?.stop();
			side.input = null;
			side.level = 0;
		}
		void context?.close();
		context = null;
		opened = false;
	}

	/** For each interface attack, the nearest mic attack within the window: t_interface - t_micro (ms). */
	const gaps = $derived.by(() => {
		const out: number[] = [];
		for (const t of iface.attacks) {
			let best: number | null = null;
			for (const m of mic.attacks) {
				if (
					Math.abs(t - m) <= PAIR_WINDOW_S &&
					(best === null || Math.abs(t - m) < Math.abs(t - best))
				) {
					best = m;
				}
			}
			if (best !== null) out.push((t - best) * 1000);
		}
		return out;
	});

	function median(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = sorted.length >> 1;
		return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}

	const gapMedian = $derived(gaps.length ? median(gaps) : null);
	/** Median absolute deviation around the median. */
	const gapSpread = $derived(
		gapMedian === null ? null : median(gaps.map((g) => Math.abs(g - gapMedian)))
	);

	const fmt = (ms: number | null) => (ms === null ? '–' : `${ms.toFixed(2)} ms`);
</script>

<main>
	<h1>Deux entrées en même temps (essai jetable)</h1>
	<p>{status}</p>

	<div class="columns">
		{#each [iface, mic] as side (side.label)}
			<section>
				<h2>{side.label}</h2>
				<select bind:value={side.deviceId} disabled={opened}>
					<option value="">(défaut)</option>
					{#each devices as device (device.id)}
						<option value={device.id}>{device.label}</option>
					{/each}
				</select>
				<div class="bar"><div class="fill" style:width="{side.level * 100}%"></div></div>
				<p>{side.attacks.length} attaques</p>
				<ol>
					{#each side.attacks.slice(-SHOWN_ATTACKS) as time (time)}
						<li>{time.toFixed(4)} s</li>
					{/each}
				</ol>
			</section>
		{/each}
	</div>

	<button onclick={openBoth}>Ouvrir les deux</button>
	<button onclick={close} disabled={!opened}>Fermer</button>
	<button onclick={refreshDevices} disabled={opened}>Relister</button>

	<h2>Écarts t_interface − t_micro (±50 ms)</h2>
	<p>Paires : {gaps.length} (interface {iface.attacks.length}, micro {mic.attacks.length})</p>
	<p>Médiane : {fmt(gapMedian)}</p>
	<p>Dispersion (écart absolu médian) : {fmt(gapSpread)}</p>
	<p>{gaps.map((g) => g.toFixed(1)).join(' · ')}</p>
</main>

<style>
	main {
		font-size: 16px;
		padding: 16px;
		font-family: system-ui, sans-serif;
	}
	.columns {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	section {
		flex: 1 1 320px;
	}
	select,
	button {
		font-size: 16px;
		padding: 4px 8px;
	}
	.bar {
		height: 20px;
		border: 1px solid currentColor;
		margin: 8px 0;
	}
	.fill {
		height: 100%;
		background: currentColor;
	}
</style>
