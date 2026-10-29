import { RHYTHM_SENSOR } from '$lib/domain/time';

/**
 * The sensors that take any sharp onset for the player's attack: the click, heard on the playing
 * input, would be one. A sensor that reads pitches is not fooled by it.
 */
const ONSET_SENSORS: readonly string[] = [RHYTHM_SENSOR];

/**
 * Whether the start screen asks for headphones (`PlayView.audioError: 'bleed'`): the calibration
 * heard the click on the playing input (`Settings.clickBleed`), and the rounds listen with a
 * sensor it would fool. The series is not refused.
 */
export function asksForHeadphones(clickBleed: boolean, sensor: string | null): boolean {
	return clickBleed && sensor !== null && ONSET_SENSORS.includes(sensor);
}
