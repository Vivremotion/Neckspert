import type { AudioInputDevice } from '$lib/application/ports';

const BUILT_IN = /built-?in|internal|integrated|macbook|default/i;

/** Heuristic: browsers expose no standard built-in flag, only a label. */
export function isBuiltInInput(device: Pick<AudioInputDevice, 'label'>): boolean {
	return BUILT_IN.test(device.label);
}
