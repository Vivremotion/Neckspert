import type { FigureParams } from '$lib/domain/exercise/figureParams';
import type { Aid, PlannedItem } from '$lib/domain/types';

/** The aids a planned prompt showed: the fret (`show-position`) and the drawn string. */
export function aidsOf(planned: PlannedItem): Aid[] {
	return [
		...(planned.aid === 'show-position' ? (['show-position'] as const) : []),
		...(planned.stringAid ? (['string-aid'] as const) : [])
	];
}

/**
 * The aids a round is played with beyond its item's: the cursor when the level gives it, a listen
 * to the content just before when the level counts listening as an aid (`listen: 'aid'`), the aid
 * level, and the content played along with it (the anti-blocking's remedy).
 */
export function cycleAids(input: {
	cursor: boolean;
	listen: FigureParams['listen'];
	aidLevel: boolean;
	listened: boolean;
	playAlong: boolean;
}): Aid[] {
	const { cursor, listen, aidLevel, listened, playAlong } = input;
	return [
		...(cursor ? (['cursor'] as const) : []),
		...(listened && listen === 'aid' ? (['listen'] as const) : []),
		...(aidLevel ? (['aid-level'] as const) : []),
		...(playAlong ? (['play-along'] as const) : [])
	];
}

/**
 * Whether a round had help beyond its level's own (`nextLevelState`'s `aided`): the cursor the
 * level gives (`cursor`) and the aid level are the level itself, so a round with them alone still
 * counts to move up; any other aid (a listen worth an aid, playing along) does not.
 */
export function levelAided(aids: readonly Aid[], cursor: boolean): boolean {
	return aids.some((aid) => !(aid === 'aid-level' || (aid === 'cursor' && cursor)));
}
