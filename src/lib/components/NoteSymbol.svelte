<!--
  Inline SVG note symbol. Renders whole/half/quarter/eighth/sixteenth notes
  with optional dot. Uses currentColor for theme compatibility.
-->
<script lang="ts">
	import type { NoteValue } from '$lib/models';

	export let value: NoteValue = 'quarter';
	export let dotted: boolean = false;
	export let size: number = 20;

	$: filled = value !== 'whole' && value !== 'half';
	$: hasStem = value !== 'whole';
	$: flagCount = value === 'eighth' ? 1 : value === 'sixteenth' ? 2 : 0;
</script>

<svg
	width={size}
	height={size * 1.6}
	viewBox="0 0 20 32"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class="note-symbol"
	aria-hidden="true"
>
	<!-- Note head -->
	{#if value === 'whole'}
		<ellipse cx="8" cy="22" rx="6" ry="4.5" stroke="currentColor" stroke-width="1.8" fill="none"
			transform="rotate(-15 8 22)" />
		<ellipse cx="8" cy="22" rx="3" ry="2.5" fill="currentColor"
			transform="rotate(-15 8 22)" />
	{:else}
		<ellipse
			cx="8" cy="22" rx="5" ry="3.8"
			fill={filled ? 'currentColor' : 'none'}
			stroke="currentColor" stroke-width="1.5"
			transform="rotate(-20 8 22)"
		/>
	{/if}

	<!-- Stem -->
	{#if hasStem}
		<line x1="12.5" y1="22" x2="12.5" y2="4" stroke="currentColor" stroke-width="1.5" />
	{/if}

	<!-- Flags -->
	{#if flagCount >= 1}
		<path d="M12.5 4 C15 6, 17 10, 14 14" stroke="currentColor" stroke-width="1.5" fill="none" />
	{/if}
	{#if flagCount >= 2}
		<path d="M12.5 8 C15 10, 17 14, 14 18" stroke="currentColor" stroke-width="1.5" fill="none" />
	{/if}

	<!-- Dot -->
	{#if dotted}
		<circle cx="16" cy="22" r="1.5" fill="currentColor" />
	{/if}
</svg>

<style>
	.note-symbol {
		display: inline-block;
		vertical-align: middle;
	}
</style>
