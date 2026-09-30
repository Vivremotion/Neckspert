import type { HomeStats } from '$lib/domain/types';

export interface TrendMessages {
	improving: string;
	stable: string;
	worsening: string;
}

/** Reaction-time trend label. Improving = faster (lower ms). */
export function formatTrend(trend: HomeStats['trend'], t: TrendMessages): string | null {
	if (trend === null) return null;
	return t[trend];
}
