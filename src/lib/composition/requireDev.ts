import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/** Testable gate: throws a 404 HttpError when `isDev` is false. */
export function refuseUnlessDev(isDev: boolean): void {
	if (!isDev) error(404);
}

/** Production gate for /dev and /diagnostic. Uses SvelteKit's `dev` flag. */
export function requireDev(): void {
	refuseUnlessDev(dev);
}
