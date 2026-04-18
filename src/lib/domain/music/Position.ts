/** A single fingered position on the fretboard. */
export interface Position {
	/** Guitar string number: 1 (highest, e) to 6 (lowest, E). */
	string: number;
	/** Fret number: 0 = open. */
	fret: number;
	/** Fretting finger: 1 = index … 4 = pinky. Omit for open/muted strings. */
	finger?: number;
	/** True if the string is deliberately muted (x). */
	muted?: boolean;
}
