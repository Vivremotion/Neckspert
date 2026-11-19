<script lang="ts">
	import { useAppServices } from '$lib/application/app';
	import type { LibraryEntry } from '$lib/application/app';
	import LibraryScreen from '$lib/ui/screens/library/LibraryScreen.svelte';

	const services = useAppServices();

	let entries = $state<LibraryEntry[] | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.library().then(
			(value) => {
				if (!cancelled) entries = value;
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		return () => {
			cancelled = true;
		};
	});
</script>

{#if error}
	<p role="alert">{error}</p>
{:else if entries}
	<LibraryScreen {entries} />
{/if}
