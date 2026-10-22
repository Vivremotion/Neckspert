<script lang="ts">
	import type { ResponseVerdict } from '$lib/domain/types';
	import { playMessages } from '$lib/ui/play/messages';

	let { verdict, size = 24 }: { verdict: ResponseVerdict; size?: number } = $props();

	const name = $derived(playMessages().verdict[verdict]);
</script>

<!-- Form before colour: the cell that carries the mark decides the tint (currentColor). -->
<svg
	role="img"
	aria-label={name}
	data-verdict={verdict}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
>
	{#if verdict === 'perfect'}
		<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
	{:else if verdict === 'early'}
		<path d="M16 5 L6 12 L16 19 Z" fill="currentColor" stroke="none" />
	{:else if verdict === 'late'}
		<path d="M8 5 L18 12 L8 19 Z" fill="currentColor" stroke="none" />
	{:else if verdict === 'offbeat'}
		<path d="M8 5 L18 12 L8 19 Z" stroke-width="2" stroke-linejoin="round" />
	{:else if verdict === 'corrected'}
		<path d="M3 8 L11 16 M11 8 L3 16" stroke-width="2.5" stroke-linecap="round" />
		<circle cx="18" cy="12" r="3.5" fill="currentColor" stroke="none" />
	{:else}
		<path d="M6 6 L18 18 M18 6 L6 18" stroke-width="2.5" stroke-linecap="round" />
	{/if}
</svg>
