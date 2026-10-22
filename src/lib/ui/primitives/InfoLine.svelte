<script lang="ts">
	import type { Snippet } from 'svelte';

	let { parts, end }: { parts: string[]; end?: Snippet } = $props();

	const shown = $derived(parts.filter((part) => part !== ''));
</script>

<div class="info-line">
	<p class="info-parts">
		{#each shown as part, i (i)}{#if i > 0}{' · '}{/if}{#if i === 0}<span class="first">{part}</span
				>{:else}{part}{/if}{/each}
	</p>
	{#if end}<div class="info-end">{@render end()}</div>{/if}
</div>

<style>
	.info-line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--np-space-2);
		font-family: var(--np-font-text);
		font-size: var(--np-type-meta);
		font-variant-numeric: tabular-nums;
		color: var(--np-text);
	}

	.info-parts {
		margin: 0;
		opacity: 0.7;
	}

	.first {
		font-weight: 500;
	}
</style>
