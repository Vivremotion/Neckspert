import type { CycleFailure, MeasureId } from '$lib/domain/time';
import type { Locale } from '$lib/domain/types';

/**
 * The words of the application, one definition each, shared by every screen (spec 2026-10-14,
 * section 10, « Le lexique »). Addressed as `term:<id>`.
 */
export const TERM_IDS = [
	'fidelity',
	'placement',
	'precision',
	'regularity',
	'hold',
	'shift',
	'offbeat',
	'level',
	'aid-level',
	'listen-in',
	'count-in',
	'breath',
	'play-along'
] as const;
export type TermId = (typeof TERM_IDS)[number];

export interface Term {
	term: string;
	definition: string;
}

export const GLOSSARY: Record<TermId, Record<Locale, Term>> = {
	fidelity: {
		fr: {
			term: 'fidélité à la figure',
			definition:
				'La figure est-elle jouée : chaque note attendue entendue, aucune en trop, aucun temps perdu ou ajouté.'
		},
		en: {
			term: 'fidelity',
			definition:
				'Is the figure played: every expected note heard, none extra, no beat lost or added.'
		}
	},
	placement: {
		fr: {
			term: 'placement',
			definition:
				'Devant ou derrière le temps, en moyenne : l’écart signé, en millisecondes. Ne juge que si la latence a été mesurée sans toi.'
		},
		en: {
			term: 'placement',
			definition:
				'Ahead of or behind the beat, on average: the signed offset, in milliseconds. It judges only when the latency was measured without you.'
		}
	},
	precision: {
		fr: {
			term: 'précision',
			definition:
				'À quelle distance du temps, en moyenne, sans le signe. Ne juge que si la latence a été mesurée sans toi.'
		},
		en: {
			term: 'precision',
			definition:
				'How far from the beat, on average, whatever the side. It judges only when the latency was measured without you.'
		}
	},
	regularity: {
		fr: {
			term: 'régularité',
			definition: 'Ta constance : la dispersion de tes écarts. Elle ne dépend pas de la latence.'
		},
		en: {
			term: 'regularity',
			definition:
				'Your consistency: how spread your offsets are. It does not depend on the latency.'
		}
	},
	hold: {
		fr: {
			term: 'tenue',
			definition:
				'Ce que devient ton temps sans clic : un décalage (tu passes devant ou derrière) ou une dérive (tu accélères ou ralentis).'
		},
		en: {
			term: 'hold',
			definition:
				'What becomes of your time without the click: an offset (you move ahead or behind) or a drift (you speed up or slow down).'
		}
	},
	shift: {
		fr: {
			term: 'temps perdu ou ajouté',
			definition:
				'À partir d’une mesure, toute la suite est décalée d’un temps ou d’une subdivision : un temps a sauté, ou s’est glissé en plus.'
		},
		en: {
			term: 'lost or added beat',
			definition:
				'From one bar on, everything is moved by a beat or a subdivision: a beat was skipped, or one slipped in.'
		}
	},
	offbeat: {
		fr: {
			term: 'contretemps',
			definition: 'La partie du temps entre deux battues : le « et » de « 1 et 2 et ».'
		},
		en: {
			term: 'offbeat',
			definition: 'The part of the beat between two counts: the “and” of “1 and 2 and”.'
		}
	},
	level: {
		fr: {
			term: 'niveau',
			definition:
				'Le réglage de l’exercice que tu joues. Il monte après des cycles réussis sans aide, redescend après des échecs répétés.'
		},
		en: {
			term: 'level',
			definition:
				'The setting of the exercise you play. It goes up after cycles passed without help, down after repeated failures.'
		}
	},
	'aid-level': {
		fr: {
			term: 'niveau d’aide',
			definition:
				'Un niveau sous le niveau 1, plus facile au sens de l’exercice ; on y passe quand ça bloque, on en sort en réussissant.'
		},
		en: {
			term: 'aid level',
			definition:
				'A level below level 1, easier in the way the exercise means it; you get there when you are stuck, and leave it by succeeding.'
		}
	},
	'listen-in': {
		fr: {
			term: 'mise en oreille',
			definition: 'L’accompagnement seul avant de jouer : on écoute, on ne joue pas.'
		},
		en: {
			term: 'listen-in',
			definition: 'The accompaniment alone before playing: you listen, you do not play.'
		}
	},
	'count-in': {
		fr: {
			term: 'mesure comptée',
			definition: 'La mesure où chaque temps est cliqué et compté, juste avant de jouer.'
		},
		en: {
			term: 'count-in bar',
			definition: 'The bar where every beat is clicked and counted, just before playing.'
		}
	},
	breath: {
		fr: {
			term: 'respiration',
			definition: 'Les mesures entre deux suites : on ne joue pas, le retour s’affiche.'
		},
		en: {
			term: 'breath',
			definition: 'The bars between two runs: you do not play, the feedback shows.'
		}
	},
	'play-along': {
		fr: {
			term: 'jouer avec',
			definition:
				'La figure sonne en même temps que toi, dans un autre timbre. Un cycle joué ainsi est aidé.'
		},
		en: {
			term: 'play-along',
			definition: 'The figure sounds with you, in another timbre. A cycle played that way is aided.'
		}
	}
};

/** The term of a measure; both measures of the hold share one. */
export function termOfMeasure(id: MeasureId): TermId {
	return id === 'holdOffset' || id === 'holdDrift' ? 'hold' : id;
}

/** The term of a reason a cycle failed; a missed or an extra note is a matter of fidelity. */
export function termOfFailure(reason: CycleFailure): TermId {
	return reason === 'missed' || reason === 'extra' ? 'fidelity' : reason;
}
