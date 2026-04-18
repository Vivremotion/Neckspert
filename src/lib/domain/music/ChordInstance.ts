import type { Voicing } from './Voicing';
import type { NoteDuration } from '../rhythm/Duration';

/**
 * A concrete occurrence of a Voicing inside a Progression.
 * Carries rhythmic information (how long to hold this chord).
 */
export interface ChordInstance {
	id: string;
	voicing: Voicing;
	duration: NoteDuration;
}
