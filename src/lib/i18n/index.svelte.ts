import type { Locale } from '$lib/domain/types';

export const i18n = $state<{ locale: Locale }>({ locale: 'fr' });

/** Declares one screen's messages; call the returned function to read them in the current locale. */
export function defineMessages<T>(messages: Record<Locale, T>): () => T {
	return () => messages[i18n.locale];
}
