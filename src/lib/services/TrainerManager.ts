import { getContext } from 'svelte';
import type { HPCPComparisonResult } from '$lib/models';
import { chordStore, type ChordsState } from '$lib/stores/chords.store.ts';
import { HPCPDetector } from '$lib/services/HPCPDetector/HPCPDetector.ts';

const SIMILARITY_THRESHOLD = .85;
const DIFFERENCE_THRESHOLD = .1;

export class TrainerManager {
  private hpcpDetector: HPCPDetector;
  private expectedHPCP: Array<number> = Array(12);

  constructor() {
    this.hpcpDetector = getContext('hpcpDetector');
    chordStore.subscribe((update: ChordsState) => {
      this.expectedHPCP = update?.currentChord?.hpcp;;
    });
    this.hpcpDetector.subscribe(this.onDetectedHPCP.bind(this));
  }

  async start() {
    await this.hpcpDetector.start();
  }

  pause() {
    this.hpcpDetector.pause();
  }

  private onDetectedHPCP(detectedHPCP: Array<number>) {
    const hpcpComparisonResult = this.compareHPCP(this.expectedHPCP, detectedHPCP);
    console.log(hpcpComparisonResult);
  }

  private compareHPCP(
    p1: number[],
    p2: number[],
    options: {
      similarityThreshold?: number;
      differenceThreshold?: number;
    } = {}
  ): HPCPComparisonResult {
    // Validate input
    console.log(p1, p2)
    if (p1.length !== p2.length) {
      throw new Error('HPCP profiles must have the same length');
    }

    // Default options
    const {
      similarityThreshold = SIMILARITY_THRESHOLD,
      differenceThreshold = DIFFERENCE_THRESHOLD
    } = options;

    // Calculate absolute differences
    const absoluteDifferences = p1.map((val1, index) =>
      Math.abs(val1 - p2[index])
    );

    // Calculate average difference
    const averageDifference =
      absoluteDifferences.reduce((sum, diff) => sum + diff, 0) / p1.length;

    // Maximum difference
    const maxDifference = Math.max(...absoluteDifferences);

    // Identify significant difference indices
    const significantDifferenceIndices = absoluteDifferences
      .map((diff, index) => diff > differenceThreshold ? index : -1)
      .filter(index => index !== -1);

    // Cosine similarity calculation
    const dotProduct = p1.reduce((sum, val1, index) =>
      sum + val1 * p2[index], 0);

    const magnitude1 = Math.sqrt(
      p1.reduce((sum, val) => sum + val * val, 0)
    );

    const magnitude2 = Math.sqrt(
      p2.reduce((sum, val) => sum + val * val, 0)
    );

    const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);

    // RMS difference
    const rmsDifference = Math.sqrt(
      absoluteDifferences.reduce((sum, diff) => sum + diff * diff, 0) / p1.length
    );

    return {
      isExactMatch: absoluteDifferences.every(diff => diff === 0),
      isSimilar: cosineSimilarity >= similarityThreshold,
      absoluteDifferences,
      averageDifference,
      maxDifference,
      significantDifferenceIndices,
      cosineSimilarity,
      rmsDifference
    };
  }
}
