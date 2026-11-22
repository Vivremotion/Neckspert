/**
 * How many times wider a limit on measured time is on a CI machine: a shared runner runs the
 * test files side by side on a few cores, and the same work has taken six times longer there
 * than on the machine the limits were measured on.
 */
export const CI_SLOWDOWN = 10;

/**
 * The limit a duration measured in a test is held to. `ms` is written for a developer's machine,
 * where it tells work done before a refusal (seconds) from a refusal before the work
 * (milliseconds); on CI the limit is `CI_SLOWDOWN` times wider, so that a busy runner does not
 * fail a test whose code is right. The local run keeps the strict limit.
 */
export function wallClockMs(ms: number): number {
	// Read off the global: the tests run in Node, and the app's types do not declare `process`.
	const { process } = globalThis as { process?: { env: Record<string, string | undefined> } };
	return process?.env.CI ? ms * CI_SLOWDOWN : ms;
}
