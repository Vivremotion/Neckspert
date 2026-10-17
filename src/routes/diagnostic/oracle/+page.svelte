<script lang="ts">
	// Dev only (the /diagnostic layout 404s in production): the oracle of the attack sensor
	// (spec 2026-10-14, section 11, « L’oracle, concrètement »).
	import { useAppServices } from '$lib/application/app';
	import type { OracleReport, SensorComparison } from '$lib/application/ports';
	import { ORACLE_TAKES } from '$lib/infrastructure/diagnostics';

	const services = useAppServices();

	let exporting = $state(false);
	let report = $state<OracleReport | null>(null);

	/** The annotated files dropped: `suites.json` and the corrected `suite-NN.txt`. */
	async function compare(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		error = null;
		try {
			const read = await Promise.all(
				files.map(async (file) => ({ name: file.name, text: await file.text() }))
			);
			report = services.diagnostics.oracleReport(read);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	const ms = (value: number | null) => (value === null ? '–' : `${value.toFixed(1)} ms`);
	const line = (s: SensorComparison) =>
		`${s.matched} appariées, ${s.missed} manquées, ${s.falseAttacks} fausses ; biais ${ms(s.biasMs)}, dispersion ${ms(s.spreadMs)}`;
	let error = $state<string | null>(null);

	async function exportSuites() {
		exporting = true;
		error = null;
		try {
			const archive = await services.diagnostics.oracleArchive();
			const url = URL.createObjectURL(archive);
			const link = document.createElement('a');
			link.href = url;
			link.download = `neckspert-oracle-${new Date().toISOString().slice(0, 10)}.zip`;
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			exporting = false;
		}
	}
</script>

<main class="oracle">
	<h1>Oracle du capteur d’attaques</h1>

	<section>
		<h2>1. Exporter</h2>
		<p>
			{ORACLE_TAKES} suites tirées du journal de diagnostic, les contestées d’abord, puis au hasard :
			pour chacune, le son (<code>suite-NN.wav</code>) et les attaques que le capteur a entendues (<code
				>suite-NN.txt</code
			>, étiquettes Audacity), et <code>suites.json</code>.
		</p>
		<button type="button" onclick={exportSuites} disabled={exporting}>
			{exporting ? 'Export en cours…' : 'Exporter les suites de l’oracle'}
		</button>
		{#if error}<p role="alert">{error}</p>{/if}
	</section>

	<section>
		<h2>2. Annoter dans Audacity</h2>
		<ol>
			<li><em>Fichier › Importer › Audio</em> : le WAV de la suite.</li>
			<li>
				<em>Fichier › Importer › Étiquettes</em> : son <code>.txt</code>. Une étiquette par attaque
				entendue.
			</li>
			<li>
				Parcourir la prise, zoomée, en regardant et en écoutant chaque attaque : supprimer une
				étiquette sans attaque réelle ; ajouter une étiquette sur une attaque oubliée (<em
					>Édition › Étiquettes › Ajouter une étiquette à la sélection</em
				>, ⌘ B) ; déplacer une étiquette mal placée.
			</li>
			<li>
				Convention : le début d’une attaque est le premier point où la forme d’onde monte nettement
				au-dessus du bruit. On ne note aucun verdict, aucun timecode à la main.
			</li>
			<li>
				<em>Fichier › Exporter › Exporter les étiquettes</em> : un <code>.txt</code> par suite, du même
				nom.
			</li>
		</ol>
	</section>

	<section>
		<h2>3. Comparer</h2>
		<p>Déposer <code>suites.json</code> et les <code>.txt</code> corrigés.</p>
		<input type="file" multiple accept=".json,.txt" onchange={compare} />
		{#if report}
			<p><strong>Total :</strong> {line(report.total)}</p>
			{#each report.suites as row (row.name)}
				<h3>{row.name}</h3>
				<p>{line(row.sensor)}</p>
				{#if row.changed.length === 0}
					<p>Aucun verdict ne change.</p>
				{:else}
					<ul>
						{#each row.changed as cycle (cycle.attemptId)}
							<li>
								Tentative {cycle.attemptId} :
								{cycle.before.passed ? 'réussi' : `raté (${cycle.before.reasons.join(', ')})`} →
								{cycle.after.passed ? 'réussi' : `raté (${cycle.after.reasons.join(', ')})`}
							</li>
						{/each}
					</ul>
				{/if}
			{/each}
			{#if report.unmatched.length > 0}
				<p>Étiquettes sans suite, ignorées : {report.unmatched.join(', ')}</p>
			{/if}
		{/if}
	</section>
</main>

<style>
	.oracle {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--np-space-3);
		font-family: system-ui, sans-serif;
		font-size: 16px;
		line-height: 1.5;
		color: var(--np-ink);
		background: var(--np-bg);
	}
</style>
