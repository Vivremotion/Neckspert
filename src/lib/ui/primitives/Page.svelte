<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children, aside }: { title: string; children: Snippet; aside?: Snippet } = $props();

	const headingId = $props.id();
</script>

<section class="page" aria-labelledby={headingId}>
	<header>
		<h1 id={headingId}>{title}</h1>
		{#if aside}<div class="aside">{@render aside()}</div>{/if}
	</header>
	{@render children()}
</section>

<style>
	.page {
		box-sizing: border-box;
		max-width: 44rem;
		padding: var(--np-step-7) var(--np-step-7) 0;
		font-family: var(--np-font-text);
		color: var(--np-text);
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--np-step-3);
		border-bottom: 1px solid var(--np-text);
		padding-bottom: var(--np-step-3);
	}

	h1 {
		margin: 0;
		font-size: var(--np-size-prompt);
		font-weight: 300;
	}

	.aside {
		font-size: var(--np-size-title);
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	@container app (width < 720px) {
		.page {
			padding: var(--np-step-7) var(--np-step-3) 0;
		}
	}
</style>
