import type { Shape } from '../domain/music/Shape';
import type { ChordQuality } from '../domain/music/Chord';
export declare const shapesByQuality: Record<ChordQuality, Shape[]>;
/** All known quality suffixes in display order. */
export declare const knownQualities: ChordQuality[];
