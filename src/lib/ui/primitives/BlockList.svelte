<script module lang="ts">
	export interface Block {
		key: string;
		title: string;
		subtitle?: string;
		why?: string;
		duration?: { text: string; spoken: string };
		href?: string;
		onselect?: () => void;
	}
</script>

<script lang="ts">
	let { label, blocks, current }: { label: string; blocks: readonly Block[]; current?: string } =
		$props();
</script>

<ul class="blocks" aria-label={label}>
	{#each blocks as block (block.key)}
		<li aria-current={block.key === current ? 'true' : undefined}>
			<div class="title">
				{#if block.href}
					<a href={block.href}>{@render heading(block)}</a>
				{:else if block.onselect}
					<button type="button" onclick={block.onselect}>{@render heading(block)}</button>
				{:else}
					<span>{@render heading(block)}</span>
				{/if}
			</div>
			{#if block.duration}
				<div class="duration">
					<span aria-hidden="true">{block.duration.text}</span>
					<span class="visually-hidden">{block.duration.spoken}</span>
				</div>
			{/if}
			{#if block.why}<p class="why">{block.why}</p>{/if}
		</li>
	{/each}
</ul>

{#snippet heading(block: Block)}
	<b>{block.title}</b>{#if block.subtitle}<span class="subtitle"
			><span class="sep" aria-hidden="true">{' · '}</span>{block.subtitle}</span
		>{/if}
{/snippet}

<style>
	.blocks {
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: var(--np-font-text);
		color: var(--np-text);
	}

	li {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		padding: var(--np-step-3) 0 var(--np-step-2);
		border-bottom: 1px solid var(--np-rule);
		font-size: var(--np-size-title);
	}

	li[aria-current='true'] {
		box-shadow: inset 4px 0 0 var(--np-now);
		padding-left: var(--np-step-2);
	}

	b {
		font-weight: 700;
	}

	.subtitle {
		font-weight: 400;
	}

	@container app (width < 720px) {
		.subtitle {
			display: block;
		}

		.sep {
			display: none;
		}
	}

	.title a,
	.title button {
		color: inherit;
		text-decoration: none;
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
	}

	.title a::after,
	.title button::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.title a:hover,
	.title a:focus-visible,
	.title button:hover,
	.title button:focus-visible {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.title a:focus-visible,
	.title button:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	.duration {
		font-weight: 300;
		font-variant-numeric: tabular-nums;
	}

	.why {
		grid-column: 1 / -1;
		margin: var(--np-step-1) 0 0;
		font-size: var(--np-size-meta);
		color: var(--np-earth-text);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
