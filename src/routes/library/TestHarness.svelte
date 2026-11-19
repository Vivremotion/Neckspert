<script lang="ts">
	import type { AppServices } from '$lib/application/app';
	import { provideAppServices } from '$lib/application/app';
	import Page from './+page.svelte';

	const { services }: { services: AppServices } = $props();
	// Test harness: context is provided once at mount with the injected fakes.
	// svelte-ignore state_referenced_locally
	provideAppServices(services);
</script>

<Page />
