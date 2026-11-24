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
		strings,
		span
	}: {
		notes: readonly NeckDiagramNote[];
		/** The strings drawn, top row first, with their names. */
		strings: readonly { string: number; name: string }[];
		/** The frets to span, whatever the notes; absent: those of the notes. */
		span?: { low: number; high: number };
	} = $props();

	const frets = $derived.by(() => {
		const played = notes.map((note) => note.fret);
		const low = Math.max(0, (span?.low ?? Math.min(...played)) - 1);
		const high = (span?.high ?? Math.max(...played)) + 1;
		return Array.from({ length: high - low + 1 }, (_, i) => low + i);
	});
	const col = (fret: number) => frets.indexOf(fret) + 2;
	const row = (string: number) => strings.findIndex((s) => s.string === string) + 1;
</script>

<div
	class="neck"
	data-testid="aid-neck"
	style:grid-template-columns={`auto repeat(${frets.length}, minmax(var(--fret-min), 1fr))`}
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
	/* On the field: mist notes, the strings and the frets stepped back. */
	.neck {
		--row: calc(var(--np-step-1) * 6);
		/* A fret never narrower than its note and its number (two digits at the meta size): the
		numbers never run into each other, a wide span takes room instead. */
		--fret-min: calc(var(--np-step-1) * 4);
		display: grid;
		align-items: center;
		min-width: 0;
	}

	.name,
	.fret {
		font-family: var(--np-font-text);
		font-size: var(--np-size-meta);
		line-height: 1;
		text-align: center;
	}

	.name {
		padding-inline-end: var(--np-step-1);
	}

	.fret {
		color: var(--np-on-field);
		padding-block-start: 4px;
	}

	.string {
		block-size: calc(var(--np-step-1) / 2);
		background: var(--np-cell-band);
	}

	/* The one exception to the square world: a note is a circle, the colour of its tile. */
	.note {
		justify-self: center;
		z-index: 1;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		inline-size: min(calc(var(--np-step-1) * 5), 90%);
		aspect-ratio: 1;
		border-radius: 50%;
		font-family: var(--np-font-text);
		font-size: var(--np-size-meta);
		line-height: 1;
	}

	.note.now {
		background: var(--np-on-field);
		color: var(--np-text);
	}

	.note.next {
		background: var(--np-cell-band);
		color: var(--np-text);
	}
</style>
