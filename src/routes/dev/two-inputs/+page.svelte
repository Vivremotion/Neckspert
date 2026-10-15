<script lang="ts">
	// THROWAWAY (plan 1, task 14): can Chrome open the audio interface and the built-in mic at
	// once in one AudioContext, and does the mic hear the pluck of an unplugged electric guitar?
	// Deleted once the answer is recorded in the spec.
	import { onDestroy, onMount } from 'svelte';
	import { WebAudioAttackDetector } from '$lib/infrastructure/audio/attacks/WebAudioAttackDetector';
	import { WebAudioInput } from '$lib/infrastructure/audio/input/WebAudioInput';

	/** Attacks of the two inputs pair when they lie this close to the constant offset. */
	const PAIR_WINDOW_S = 0.05;
	/** Search radius of the constant offset (nearest neighbour of each interface attack). */
	const OFFSET_SEARCH_S = 0.5;
	const SHOWN_ATTACKS = 10;
	/** The level bar is full at this RMS. */
	const FULL_LEVEL = 0.3;
	/** Chrome's virtual entries: aliases of a real device, never a physical input of their own. */
	const ALIAS_IDS = new Set(['default', 'communications']);

	interface Device {
		id: string;
		groupId: string;
		label: string;
	}

	interface Opened {
		groupId: string;
		channels: number;
		sampleRate: number;
	}

	interface Side {
		label: string;
		deviceId: string;
		level: number;
		/** Every attack heard, in audio seconds (the panel shows the last ten). */
		attacks: number[];
		opened: Opened | null;
		input: WebAudioInput | null;
		stops: Array<() => void>;
	}

	function newSide(label: string): Side {
		return { label, deviceId: '', level: 0, attacks: [], opened: null, input: null, stops: [] };
	}

	let devices = $state<Device[]>([]);
	let iface = $state(newSide('Interface'));
	let mic = $state(newSide('Micro du Mac'));
	let status = $state('Autorise le micro pour lister les entrées.');
	let opened = $state(false);
	let opening = $state(false);
	let context: AudioContext | null = null;
	/** Bumped by every opening and closing: a stale opening sees it changed and gives up. */
	let token = 0;

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
				.filter((d) => d.kind === 'audioinput' && d.deviceId !== '' && !ALIAS_IDS.has(d.deviceId))
				.map((d) => ({ id: d.deviceId, groupId: d.groupId, label: d.label || d.deviceId }));
			const builtIn = devices.find((d) => /macbook|built-?in|intégr|interne/i.test(d.label));
			const other = devices.find((d) => d.groupId !== builtIn?.groupId);
			if (!mic.deviceId && builtIn) mic.deviceId = builtIn.id;
			if (!iface.deviceId && other) iface.deviceId = other.id;
			status = `${devices.length} entrées physiques trouvées.`;
		} catch (error) {
			status = `Impossible de lister les entrées : ${String(error)}`;
		}
	}

	/** What Chrome really opens for a device: its group (one physical device), channels, rate. */
	async function probeDevice(deviceId: string): Promise<Opened> {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: deviceId },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});
		try {
			const settings = stream.getAudioTracks()[0].getSettings();
			return {
				groupId: settings.groupId ?? '',
				channels: settings.channelCount ?? 0,
				sampleRate: settings.sampleRate ?? 0
			};
		} finally {
			stream.getTracks().forEach((track) => track.stop());
		}
	}

	/** A refusal the page decides itself, shown as is. */
	class Refusal extends Error {}

	async function openBoth() {
		if (opening) return;
		close();
		const mine = ++token;
		opening = true;
		try {
			if (!iface.deviceId || !mic.deviceId) {
				throw new Refusal('Choisis une entrée précise de chaque côté (pas de « défaut »).');
			}
			const groups = new Map(devices.map((d) => [d.id, d.groupId]));
			if (
				iface.deviceId === mic.deviceId ||
				(groups.get(iface.deviceId) ?? 'a') === (groups.get(mic.deviceId) ?? 'b')
			) {
				throw new Refusal('Refusé : les deux côtés sont le même appareil physique.');
			}
			const ifaceInfo = await probeDevice(iface.deviceId);
			const micInfo = await probeDevice(mic.deviceId);
			if (mine !== token) return;
			if (!ifaceInfo.groupId || ifaceInfo.groupId === micInfo.groupId) {
				throw new Refusal(
					'Refusé : Chrome ouvre le même appareil physique des deux côtés (ou n’en donne pas le groupe).'
				);
			}
			context = new AudioContext();
			const ctx = context;
			await ctx.resume();
			if (mine !== token) return;
			await wire(iface, ctx, mine);
			if (mine !== token) return;
			await wire(mic, ctx, mine);
			if (mine !== token) return;
			iface.opened = ifaceInfo;
			mic.opened = micInfo;
			opened = true;
			status = `Ouvertes dans un seul contexte (${ctx.sampleRate} Hz). Joue des notes.`;
		} catch (error) {
			if (mine === token) {
				const message = error instanceof Refusal ? error.message : `Échec : ${String(error)}`;
				close();
				status = message;
			}
		} finally {
			if (mine === token) opening = false;
		}
	}

	async function wire(side: Side, ctx: AudioContext, mine: number) {
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
		await input.start(side.deviceId);
		// Closed while the input was opening: do not leave its stream running.
		if (mine !== token) input.stop();
	}

	function close() {
		token++;
		opening = false;
		for (const side of [iface, mic]) {
			side.stops.forEach((stop) => stop());
			side.stops = [];
			side.input?.stop();
			side.input = null;
			side.level = 0;
			side.opened = null;
			side.attacks = [];
		}
		void context?.close();
		context = null;
		opened = false;
	}

	function median(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = sorted.length >> 1;
		return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}

	/**
	 * The constant offset t_interface - t_micro (ms): median, over the interface attacks that have
	 * a mic attack within the search radius, of the difference to the nearest one. Null if none.
	 */
	function estimateOffset(a: number[], b: number[]): number | null {
		const diffs: number[] = [];
		for (const t of a) {
			let best: number | null = null;
			for (const m of b) {
				if (
					Math.abs(t - m) <= OFFSET_SEARCH_S &&
					(best === null || Math.abs(t - m) < Math.abs(t - best))
				) {
					best = m;
				}
			}
			if (best !== null) diffs.push((t - best) * 1000);
		}
		return diffs.length ? median(diffs) : null;
	}

	/** One-to-one pairing within the window around the offset, closest residuals first. */
	const analysis = $derived.by(() => {
		const a = iface.attacks;
		const b = mic.attacks;
		const offset = estimateOffset(a, b);
		if (offset === null) {
			return {
				offset,
				residuals: [] as number[],
				unpairedInterface: a.length,
				unpairedMic: b.length
			};
		}
		const candidates: Array<{ i: number; j: number; residual: number }> = [];
		for (let i = 0; i < a.length; i++) {
			for (let j = 0; j < b.length; j++) {
				const residual = (a[i] - b[j]) * 1000 - offset;
				if (Math.abs(residual) <= PAIR_WINDOW_S * 1000) candidates.push({ i, j, residual });
			}
		}
		candidates.sort((x, y) => Math.abs(x.residual) - Math.abs(y.residual));
		const usedI = new Set<number>();
		const usedJ = new Set<number>();
		const residuals: number[] = [];
		for (const c of candidates) {
			if (usedI.has(c.i) || usedJ.has(c.j)) continue;
			usedI.add(c.i);
			usedJ.add(c.j);
			residuals.push(c.residual);
		}
		return {
			offset,
			residuals,
			unpairedInterface: a.length - residuals.length,
			unpairedMic: b.length - residuals.length
		};
	});

	const residualMedian = $derived(analysis.residuals.length ? median(analysis.residuals) : null);
	/** Median absolute deviation of the residuals around their median. */
	const residualMad = $derived(
		residualMedian === null
			? null
			: median(analysis.residuals.map((r) => Math.abs(r - residualMedian)))
	);
	/** Largest absolute deviation from the median: outliers show here. */
	const residualMax = $derived(
		residualMedian === null
			? null
			: Math.max(...analysis.residuals.map((r) => Math.abs(r - residualMedian)))
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
				<select bind:value={side.deviceId} disabled={opened || opening}>
					<option value="">(choisir)</option>
					{#each devices as device (device.id)}
						<option value={device.id}>{device.label}</option>
					{/each}
				</select>
				<div class="bar"><div class="fill" style:width="{side.level * 100}%"></div></div>
				<p>
					{#if side.opened}
						{side.opened.channels} canal(aux), {side.opened.sampleRate} Hz
					{:else}
						fermée
					{/if}
				</p>
				<p>{side.attacks.length} attaques</p>
				<ol>
					{#each side.attacks.slice(-SHOWN_ATTACKS) as time (time)}
						<li>{time.toFixed(4)} s</li>
					{/each}
				</ol>
			</section>
		{/each}
	</div>

	<button onclick={openBoth} disabled={opening}>Ouvrir les deux</button>
	<button onclick={close} disabled={!opened && !opening}>Fermer</button>
	<button onclick={refreshDevices} disabled={opened || opening}>Relister</button>

	<h2>Appariement un à un (t_interface − t_micro)</h2>
	<p>
		Attaques : interface {iface.attacks.length}, micro {mic.attacks.length}. Paires :
		{analysis.residuals.length}. Sans pair : interface {analysis.unpairedInterface}, micro
		{analysis.unpairedMic}.
	</p>
	<p>
		Décalage constant estimé : {fmt(analysis.offset)} (fenêtre ±{PAIR_WINDOW_S * 1000} ms autour)
	</p>
	<p>Résidus : médiane {fmt(residualMedian)}</p>
	<p>Dispersion (écart absolu médian) : {fmt(residualMad)}</p>
	<p>Écart maximal à la médiane : {fmt(residualMax)}</p>
	<p>{analysis.residuals.map((r) => r.toFixed(1)).join(' · ')}</p>
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
