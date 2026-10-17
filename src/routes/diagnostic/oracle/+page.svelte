<script lang="ts">
	// Dev only (the /diagnostic layout 404s in production): the oracle of the attack sensor
	// (spec 2026-10-14, section 11, « L’oracle, concrètement »).
	import { useAppServices } from '$lib/application/app';
	import { ORACLE_TAKES } from '$lib/infrastructure/diagnostics';

	const services = useAppServices();

	let exporting = $state(false);
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
