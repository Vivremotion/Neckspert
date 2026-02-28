/**
 * Composition root: wires application (TrainerManager) with infrastructure adapters.
 * Only this file should import concrete stores, Metronome, and HPCPDetector.
 */
import { TrainerManager } from '$lib/services/TrainerManager';
import {
	createChordsStateAdapter,
	createGameStateAdapter,
	createRhythmDisplayAdapter,
	createMetronomeAdapter,
	createChordDetectionAdapter
} from '$lib/infrastructure/adapters';
import { Metronome } from '$lib/services/Metronome';
import { hpcpDetector } from '$lib/services/HPCPDetector/HPCPDetector';

const metronome = new Metronome();

export const trainerManager = new TrainerManager({
	chordsState: createChordsStateAdapter(),
	gameState: createGameStateAdapter(),
	rhythmDisplay: createRhythmDisplayAdapter(),
	beatSource: createMetronomeAdapter(metronome),
	chordDetection: createChordDetectionAdapter(hpcpDetector)
});
