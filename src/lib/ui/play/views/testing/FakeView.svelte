<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';

	let { model }: { controller: PlaySessionController; model: unknown } = $props();
</script>

<p data-testid="fake-view">{JSON.stringify(model)}</p>
