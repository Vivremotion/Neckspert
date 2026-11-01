import { RHYTHM_SENSOR } from '$lib/domain/time';

/**
 * The sensors the click, heard on the playing input, would fool: it is a sharp onset for the
 * attack sensor, and over a note that rings it reads as that note played again.
 */
const FOOLED_SENSORS: readonly string[] = [RHYTHM_SENSOR, 'note'];

/**
 * Whether the start screen asks for headphones (`PlayView.audioError: 'bleed'`): the calibration
 * heard the click on the playing input (`Settings.clickBleed`), and the rounds listen with a
 * sensor it would fool. The series is not refused.
 */
export function asksForHeadphones(clickBleed: boolean, sensor: string | null): boolean {
	return clickBleed && sensor !== null && FOOLED_SENSORS.includes(sensor);
}
