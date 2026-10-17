import { getContext, setContext } from 'svelte';
import type { TermId } from '$lib/domain/glossary';

const GLOSSARY_SCOPE = Symbol('glossary-scope');

/** One per screen: only the first occurrence of a term on it is underlined. */
export interface GlossaryScope {
	/** True the first time a term asks, false after. */
	first(id: TermId): boolean;
}

function createScope(): GlossaryScope {
	const seen = new Set<TermId>();
	return {
		first(id) {
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		}
	};
}

export function provideGlossaryScope(): void {
	setContext(GLOSSARY_SCOPE, createScope());
}

/** The screen's scope; a term outside any screen scope is its own first occurrence. */
export function useGlossaryScope(): GlossaryScope {
	return getContext<GlossaryScope | undefined>(GLOSSARY_SCOPE) ?? createScope();
}
