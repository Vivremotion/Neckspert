
import type { ChordPattern } from "./ChordPattern.js";

export interface ChordType {
    suffix: string;  // e.g., "", "m", "7", "maj7"
    patterns: ChordPattern[];
  }