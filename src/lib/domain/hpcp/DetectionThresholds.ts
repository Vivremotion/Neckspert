/**
 * Value object for chord detection thresholds (domain config).
 */
export interface DetectionThresholds {
	readonly similarityThreshold: number;
	readonly differenceThreshold: number;
}

export const DEFAULT_DETECTION_THRESHOLDS: DetectionThresholds = {
	similarityThreshold: 0.75,
	differenceThreshold: 0.1
};
