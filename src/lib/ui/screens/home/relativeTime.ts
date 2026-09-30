export interface RelativeTimeMessages {
	soon: string;
	inMinutes: (n: number) => string;
	inHours: (n: number) => string;
	inDays: (n: number) => string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Human delay from `now` to `targetAt` (epoch ms). Past or < 1 min → soon. */
export function formatRelativeDelay(
	targetAt: number,
	now: number,
	t: RelativeTimeMessages
): string {
	const delta = targetAt - now;
	if (delta < MINUTE) return t.soon;
	if (delta < HOUR) return t.inMinutes(Math.ceil(delta / MINUTE));
	if (delta < DAY) return t.inHours(Math.ceil(delta / HOUR));
	return t.inDays(Math.ceil(delta / DAY));
}
