<script lang="ts">
	import type { AppServices } from '$lib/application/app';
	import { provideAppServices } from '$lib/application/app';
	import Page from './+page.svelte';

	let { services }: { services: AppServices } = $props();
	provideAppServices(services);
</script>

<Page />
