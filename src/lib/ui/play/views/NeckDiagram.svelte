<script lang="ts" module>
	/** A note on the neck: `tone` tells the shape played from the one to come. */
	export interface NeckDiagramNote {
		string: number;
		fret: number;
		name: string;
		tone: 'now' | 'next';
	}
</script>

<script lang="ts">
	let {
		notes,
		strings
	}: {
		notes: readonly NeckDiagramNote[];
		/** The strings drawn, top row first, with their names. */
		strings: readonly { string: number; name: string }[];
	} = $props();

	const frets = $derived.by(() => {
		const played = notes.map((note) => note.fret);
		const low = Math.max(0, Math.min(...played) - 1);
		const high = Math.max(...played) + 1;
		return Array.from({ length: high - low + 1 }, (_, i) => low + i);
	});
	const col = (fret: number) => frets.indexOf(fret) + 2;
	const row = (string: number) => strings.findIndex((s) => s.string === string) + 1;
</script>

<div
	class="neck"
	data-testid="aid-neck"
	style:grid-template-columns={`auto repeat(${frets.length}, minmax(0, 1fr))`}
	style:grid-template-rows={`repeat(${strings.length}, var(--row)) auto`}
>
	{#each strings as s (s.string)}
		<span class="name" style:grid-row={row(s.string)} style:grid-column="1">{s.name}</span>
		<span
			class="string"
			style:grid-row={row(s.string)}
			style:grid-column={`2 / ${frets.length + 2}`}
		></span>
	{/each}
	{#each notes as note (`${note.tone}-${note.string}-${note.fret}`)}
		<span
			class="note {note.tone}"
			data-testid="aid-note"
			data-shape={note.tone}
			style:grid-column={col(note.fret)}
			style:grid-row={row(note.string)}>{note.name}</span
		>
	{/each}
	{#each frets as fret (fret)}
		<span class="fret" style:grid-column={col(fret)} style:grid-row={strings.length + 1}
			>{fret}</span
		>
	{/each}
</div>

<style>
	.neck {
		--row: calc(var(--np-tile) * 6);
		display: grid;
		align-items: center;
		min-width: 0;
	}

	.name,
	.fret {
		font-size: var(--np-type-meta);
		line-height: 1;
		text-align: center;
	}

	.name {
		padding-inline-end: var(--np-space-1, 8px);
	}

	.fret {
		color: var(--np-shade);
		padding-block-start: 4px;
	}

	.string {
		block-size: calc(var(--np-tile) / 2);
		background: var(--np-shade);
	}

	/* The one exception to the square world: a note is a circle, the colour of its tile. */
	.note {
		justify-self: center;
		z-index: 1;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		inline-size: min(calc(var(--np-tile) * 5), 90%);
		aspect-ratio: 1;
		border-radius: 50%;
		font-size: var(--np-type-meta);
		line-height: 1;
	}

	.note.now {
		background: var(--np-ink);
		color: var(--np-bg);
	}

	.note.next {
		background: var(--np-mid);
		color: var(--np-ink);
	}
</style>
