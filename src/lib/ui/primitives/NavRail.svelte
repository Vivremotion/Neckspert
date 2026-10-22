<script lang="ts">
	type Item = { key: string; href: string; label: string };

	let {
		label,
		brand,
		items,
		current
	}: { label: string; brand: string; items: readonly Item[]; current: string | null } = $props();
</script>

<nav class="rail" aria-label={label}>
	<ul>
		{#each items as item (item.key)}
			<li>
				<a href={item.href} aria-current={item.key === current ? 'page' : undefined}>{item.label}</a
				>
			</li>
		{/each}
	</ul>
	<span class="brand" aria-hidden="true">{brand}</span>
</nav>

<style>
	.rail {
		box-sizing: border-box;
		position: sticky;
		top: 0;
		width: var(--rail-width);
		height: 100dvh;
		padding: var(--np-step-5) 0 0 var(--np-step-3);
		background: var(--np-text);
		color: var(--np-ground);
		font-family: var(--np-font-text);
	}

	ul {
		display: grid;
		gap: var(--np-step-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
	}

	a {
		display: inline-block;
		color: inherit;
		font-size: var(--np-size-meta);
		letter-spacing: 0.06em;
		text-decoration: none;
		text-transform: lowercase;
		opacity: 0.62;
	}

	a:hover,
	a:focus-visible,
	a[aria-current='page'] {
		opacity: 1;
	}

	a:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}

	a[aria-current='page']::before {
		content: '';
		position: absolute;
		left: calc(-1 * var(--np-step-3));
		top: -4px;
		bottom: -4px;
		width: 4px;
		background: var(--np-now);
	}

	.brand {
		position: absolute;
		left: 0;
		bottom: var(--np-step-5);
		padding-left: var(--np-step-3);
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-size: var(--np-size-title);
		font-weight: 300;
		letter-spacing: 0.4em;
		white-space: nowrap;
	}

	@container app (width < 720px) {
		.rail {
			display: flex;
			flex-direction: column;
			position: static;
			width: 100%;
			height: auto;
			padding: var(--np-step-2);
		}

		.brand {
			position: static;
			order: -1;
			display: block;
			padding-left: 0;
			writing-mode: horizontal-tb;
			transform: none;
			margin-bottom: var(--np-step-1);
			font-size: var(--np-size-meta);
			letter-spacing: 0.4em;
		}

		ul {
			display: flex;
			flex-wrap: wrap;
			justify-content: start;
			gap: var(--np-step-1) var(--np-step-2);
		}

		a {
			letter-spacing: 0;
		}

		a[aria-current='page']::before {
			left: 0;
			right: 0;
			top: auto;
			bottom: -4px;
			width: auto;
			height: 4px;
		}
	}
</style>
