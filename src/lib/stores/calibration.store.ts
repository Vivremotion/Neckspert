import { writable } from 'svelte/store';
import persistedStore from './persistedStore.js';

export interface CalibrationData {
	/** Average delay in ms between user hit and nearest beat (positive = app perceives hit late). */
	offsetMs: number;
}

const CALIBRATION_KEY = 'calibration';

function createCalibrationDataStore() {
	return persistedStore<CalibrationData | null>(CALIBRATION_KEY, null);
}

/** Persisted calibration result; null when not yet calibrated. */
export const calibrationDataStore = createCalibrationDataStore();

/** When true, the calibration modal is open. */
export const calibrationModalOpen = writable(false);
