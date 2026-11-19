<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LibraryEntry } from '$lib/application/app';
	import { SESSION_MS } from '$lib/domain/session/policy';
	import { i18n } from '$lib/i18n/index.svelte';
	import BlockList from '$lib/ui/primitives/BlockList.svelte';
	import type { Block } from '$lib/ui/primitives/BlockList.svelte';
	import Page from '$lib/ui/primitives/Page.svelte';
	import { formatMinutes } from '../home/duration';
	import { homeMessages } from '../home/messages';
	import { libraryMessages } from './messages';

	let {
		entries
	}: {
		/** Every exercise of the registry, in the order registered: shown as given (D5). */
		entries: readonly LibraryEntry[];
	} = $props();

	const t = $derived(libraryMessages());
	// The minutes in the home's words: one source.
	const home = $derived(homeMessages());
	const words = $derived({ short: home.minutes, spoken: home.minutesSpoken });

	/** The routines that list it, its rest, and that it has nothing to play now. */
	function whyOf(entry: LibraryEntry): string | undefined {
		const routines = entry.routines.map((title) => title[i18n.locale]).join(', ');
		const lines = [
			routines === '' ? null : routines,
			entry.resting ? t.resting : null,
			entry.playable ? null : t.nothingToPlay
		].filter((line) => line !== null);
		return lines.length > 0 ? lines.join(' · ') : undefined;
	}

	const blocks = $derived(
		entries.map((entry): Block => ({
			key: entry.exerciseId,
			title: entry.title[i18n.locale],
			why: whyOf(entry),
			// Played alone, as every session, for one session length.
			...(entry.playable && {
				duration: formatMinutes(SESSION_MS, words),
				href: `${resolve('/session')}?exercise=${encodeURIComponent(entry.exerciseId)}`
			})
		}))
	);
</script>

<Page title={t.title}>
	<BlockList label={t.exercises} {blocks} />
</Page>
