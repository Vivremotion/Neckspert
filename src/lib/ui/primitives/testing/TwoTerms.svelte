<script lang="ts">
	import type { TermId } from '$lib/domain/glossary';
	import Term from '../Term.svelte';
	import { provideGlossaryScope } from '../glossaryScope';

	let { id, inactive = false }: { id: TermId; inactive?: boolean } = $props();
	provideGlossaryScope();
</script>

<p><Term {id} locale="fr" {inactive}>premier</Term> puis <Term {id} locale="fr">second</Term></p>
