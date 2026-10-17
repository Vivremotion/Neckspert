<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { GLOSSARY, type TermId } from '$lib/domain/glossary';
	import type { Locale } from '$lib/domain/types';
	import { useGlossaryScope } from './glossaryScope';

	let {
		id,
		locale,
		inactive = false,
		children
	}: {
		id: TermId;
		locale: Locale;
		/** During play: the word is shown plainly, its definition never opens. */
		inactive?: boolean;
		children: Snippet;
	} = $props();

	// Asked once, when the term is first shown on the screen.
	const scope = useGlossaryScope();
	const first = untrack(() => scope.first(id));
	const tipId = `term-${Math.random().toString(36).slice(2, 10)}`;
	let hovered = $state(false);
	let focused = $state(false);
	let touched = $state(false);
	const open = $derived(!inactive && (hovered || focused || touched));
</script>

<!-- Written without whitespace between its parts: the term sits inside running text. -->
{#if inactive}<span class="term" class:term-first={first}>{@render children()}</span>{:else}<span
		class="term"
		class:term-first={first}
		><button
			type="button"
			class="word"
			aria-describedby={open ? tipId : undefined}
			onmouseenter={() => (hovered = true)}
			onmouseleave={() => (hovered = false)}
			onfocus={() => (focused = true)}
			onblur={() => {
				focused = false;
				touched = false;
			}}
			onclick={() => (touched = !touched)}>{@render children()}</button
		>{#if open}<span class="definition" role="tooltip" id={tipId}
				>{GLOSSARY[id][locale].definition}</span
			>{/if}</span
	>{/if}

<style>
	.term {
		position: relative;
		display: inline;
	}

	.word {
		all: unset;
		cursor: help;
	}

	.term-first .word,
	.term-first:not(:has(.word)) {
		text-decoration: underline dotted;
		text-underline-offset: 0.2em;
	}

	.word:focus-visible {
		outline: 2px solid var(--np-ink);
		outline-offset: 2px;
	}

	.definition {
		position: absolute;
		left: 0;
		top: 100%;
		z-index: 2;
		width: max-content;
		max-width: min(22rem, 80vw);
		margin-top: var(--np-space-1);
		padding: var(--np-space-2);
		background: var(--np-bg);
		color: var(--np-ink);
		border: 1px solid var(--np-shade);
		font-size: max(16px, 1rem);
		line-height: 1.35;
	}
</style>
