import { parseSpelledNote, qualityById, type Chord, type SpelledNote } from '$lib/domain/music';

/** A chord symbol as a grid writes it: Dm7, G7/F, Bb7#11. */
export interface ChordSymbol {
	root: SpelledNote;
	/** The quality id the suffix names; not every one has a chord table entry ('9', 'sus4'). */
	quality: string;
	/** Tensions beyond the quality, kept as data ('b9', '#11'): played with more degrees later. */
	extensions: string[];
	/** The bass after a slash, or null. */
	bass: SpelledNote | null;
}

/** What a suffix written after the root means. Data: a new way of writing is one more entry. */
export interface SymbolSuffix {
	suffix: string;
	quality: string;
	extensions: readonly string[];
}

/** Every suffix the reader knows, searched longest first. */
export const SUFFIXES: readonly SymbolSuffix[] = [
	{ suffix: '', quality: 'maj', extensions: [] },
	{ suffix: 'm', quality: 'min', extensions: [] },
	{ suffix: '-', quality: 'min', extensions: [] },
	{ suffix: '7', quality: '7', extensions: [] },
	{ suffix: 'maj7', quality: 'maj7', extensions: [] },
	{ suffix: 'M7', quality: 'maj7', extensions: [] },
	{ suffix: 'Δ7', quality: 'maj7', extensions: [] },
	{ suffix: 'Δ', quality: 'maj7', extensions: [] },
	{ suffix: 'm7', quality: 'm7', extensions: [] },
	{ suffix: '-7', quality: 'm7', extensions: [] },
	{ suffix: '6', quality: '6', extensions: [] },
	{ suffix: 'm6', quality: 'm6', extensions: [] },
	{ suffix: 'ø', quality: 'm7b5', extensions: [] },
	{ suffix: 'ø7', quality: 'm7b5', extensions: [] },
	{ suffix: 'm7b5', quality: 'm7b5', extensions: [] },
	{ suffix: 'dim', quality: 'dim', extensions: [] },
	{ suffix: 'o', quality: 'dim', extensions: [] },
	{ suffix: 'aug', quality: 'aug', extensions: [] },
	{ suffix: '+', quality: 'aug', extensions: [] },
	{ suffix: '7#5', quality: '7#5', extensions: [] },
	{ suffix: '7+5', quality: '7#5', extensions: [] },
	{ suffix: '7b9', quality: '7', extensions: ['b9'] },
	{ suffix: '7#9', quality: '7', extensions: ['#9'] },
	{ suffix: '7#11', quality: '7', extensions: ['#11'] },
	{ suffix: '7b13', quality: '7', extensions: ['b13'] },
	{ suffix: '9', quality: '9', extensions: [] },
	{ suffix: 'sus2', quality: 'sus2', extensions: [] },
	{ suffix: 'sus4', quality: 'sus4', extensions: [] }
];

/** The triad a quality is played as in a triads exercise. Data, like the suffixes. */
export const TRIAD_OF_QUALITY: Readonly<Record<string, string>> = {
	maj: 'maj',
	'7': 'maj',
	maj7: 'maj',
	'6': 'maj',
	'9': 'maj',
	min: 'min',
	m7: 'min',
	m6: 'min',
	m7b5: 'dim',
	dim: 'dim',
	aug: 'aug',
	'7#5': 'aug'
};

const BY_LENGTH = [...SUFFIXES].sort((a, b) => b.suffix.length - a.suffix.length);

/** A letter with one sharp or flat at most, as a chord symbol writes its root and bass. */
const NOTE = /^[A-G][#b]?/;

function unknown(symbol: string): RangeError {
	return new RangeError(`Unknown chord symbol: "${symbol}"`);
}

/** Reads a chord symbol. Throws a RangeError naming it when it cannot be read. */
export function parseChordSymbol(symbol: string): ChordSymbol {
	const [head, bassText, ...rest] = symbol.split('/');
	const root = NOTE.exec(head)?.[0];
	if (!root || rest.length > 0) throw unknown(symbol);
	const written = head.slice(root.length);
	const found = BY_LENGTH.find((entry) => entry.suffix === written);
	if (!found) throw unknown(symbol);
	let bass: SpelledNote | null = null;
	if (bassText !== undefined) {
		if (NOTE.exec(bassText)?.[0] !== bassText) throw unknown(symbol);
		bass = parseSpelledNote(bassText);
	}
	return {
		root: parseSpelledNote(root),
		quality: found.quality,
		extensions: [...found.extensions],
		bass
	};
}

/** The triad played for a symbol: G7/F is played G. Throws for a symbol without one (sus). */
export function triadOf(symbol: string): Chord {
	const { root, quality } = parseChordSymbol(symbol);
	const triad = TRIAD_OF_QUALITY[quality];
	if (!triad) throw new RangeError(`No triad for the chord symbol "${symbol}"`);
	return { root, quality: qualityById(triad) };
}
