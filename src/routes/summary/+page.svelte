<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { SessionSummary } from '$lib/domain/types';
	import SummaryScreen from '$lib/ui/screens/summary/SummaryScreen.svelte';

	const services = useAppServices();

	let summary = $state<SessionSummary | null>(null);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	const sessionId = $derived(page.url.searchParams.get('sessionId'));

	$effect(() => {
		const id = sessionId;
		if (!id) {
			error = 'Missing sessionId';
			summary = null;
			return;
		}
		let cancelled = false;
		error = null;
		void services.sessionSummary(id).then(
			(value) => {
				if (!cancelled) {
					summary = value;
					now = Date.now();
				}
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
{:else if summary}
	<SummaryScreen
		{summary}
		{now}
		onhome={() => void goto('/')}
		onmap={() => void goto('/map')}
		oncontest={(attemptId) => services.contest(attemptId)}
	/>
{/if}
