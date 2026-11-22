import type { DefinitionKind, Refusal } from '$lib/domain/definitions';
import type { Locale } from '$lib/domain/types';

const KIND_WORDS: Record<Locale, Record<DefinitionKind, string>> = {
	fr: {
		file: 'fichier',
		skill: 'capacité',
		exercise: 'exercice',
		grid: 'grille',
		routine: 'routine'
	},
	en: { file: 'file', skill: 'skill', exercise: 'exercise', grid: 'grid', routine: 'routine' }
};

/**
 * A refusal in words: where it lies (the file, its kind of object, its id when it has one), then
 * the reason. `file: false` leaves the file's name out, for a list that already names it.
 */
export function refusalText(
	refusal: Refusal,
	locale: Locale,
	options: { file?: boolean } = {}
): string {
	const { file, kind, id, reason } = refusal;
	const withFile = options.file !== false;
	const colon = locale === 'fr' ? ' :' : ':';
	const object =
		kind === 'file' ? '' : `${KIND_WORDS[locale][kind]}${id === null ? '' : ` \`${id}\``}`;
	const place = [withFile ? file : '', object].filter((part) => part !== '').join(', ');
	return place === '' ? reason : `${place}${colon} ${reason}`;
}
