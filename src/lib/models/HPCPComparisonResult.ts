export interface HPCPComparisonResult {
    /**
     * Indicates whether the two HPCP arrays match exactly
     */
    isExactMatch: boolean;
  
    /**
     * Indicates whether the profiles are similar within a tolerance
     */
    isSimilar: boolean;
  
    /**
     * Absolute differences between corresponding HPCP values
     */
    absoluteDifferences: number[];
  
    /**
     * Average difference between the two profiles
     */
    averageDifference: number;
  
    /**
     * Maximum difference between any two corresponding values
     */
    maxDifference: number;
  
    /**
     * Indices where the differences exceed a specified threshold
     */
    significantDifferenceIndices: number[];
  
    /**
     * Normalized cosine similarity between the two profiles
     */
    cosineSimilarity: number;
  
    /**
     * Root Mean Square (RMS) difference between profiles
     */
    rmsDifference: number;
  }