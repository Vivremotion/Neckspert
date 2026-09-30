<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { NeckMapCell } from '$lib/domain/types';
	import NeckMapScreen from '$lib/ui/screens/map/NeckMapScreen.svelte';

	const services = useAppServices();

	let cells = $state<NeckMapCell[] | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.neckMap().then(
			(value) => {
				if (!cancelled) cells = value;
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
{:else if cells}
	<NeckMapScreen {cells} onhome={() => void goto('/')} />
{/if}
