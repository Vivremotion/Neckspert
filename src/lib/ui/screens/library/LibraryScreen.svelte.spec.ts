import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { LibraryEntry } from '$lib/application/app';
import { i18n } from '$lib/i18n/index.svelte';
import LibraryScreen from './LibraryScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

function entry(exerciseId: string, over: Partial<LibraryEntry> = {}): LibraryEntry {
	return {
		exerciseId,
		title: { fr: `Titre ${exerciseId}`, en: `Title ${exerciseId}` },
		routines: [],
		playable: true,
		...over
	};
}

const rows = () => within(screen.getByRole('list', { name: 'Exercices' })).getAllByRole('listitem');

describe('LibraryScreen', () => {
	it('says there is no exercise when none is registered, in French and in English', () => {
		render(LibraryScreen, { props: { entries: [] } });
		expect(screen.getByText('Aucun exercice.')).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'Exercices' })).toBeNull();
		cleanup();
		i18n.locale = 'en';
		render(LibraryScreen, { props: { entries: [] } });
		expect(screen.getByText('No exercises.')).toBeTruthy();
	});

	it('is a page titled Bibliothèque, a row per exercise in the order given', () => {
		render(LibraryScreen, { props: { entries: [entry('b'), entry('a'), entry('c')] } });
		expect(screen.getByRole('heading', { level: 1, name: 'Bibliothèque' })).toBeTruthy();
		expect(rows().map((row) => row.querySelector('b')?.textContent)).toEqual([
			'Titre b',
			'Titre a',
			'Titre c'
		]);
	});

	it('leads a playable exercise to its session alone, with the session’s minutes', () => {
		render(LibraryScreen, { props: { entries: [entry('my exercise')] } });
		const link = screen.getByRole('link', { name: /Titre my exercise/ });
		expect(link.getAttribute('href')).toBe('/session?exercise=my%20exercise');
		expect(rows()[0].textContent).toContain('5 min');
	});

	it('tells the routines that list it, small under its title', () => {
		render(LibraryScreen, {
			props: {
				entries: [
					entry('a', {
						routines: [
							{ fr: 'Apprentissage', en: 'Learn' },
							{ fr: 'Triades', en: 'Triads' }
						]
					}),
					entry('b')
				]
			}
		});
		const [a, b] = rows();
		expect(a.querySelector('.why')?.textContent).toBe('Apprentissage, Triades');
		expect(b.querySelector('.why')).toBeNull();
	});

	it('lists an exercise with nothing to play without its link', () => {
		render(LibraryScreen, { props: { entries: [entry('a', { playable: false })] } });
		expect(screen.queryByRole('link')).toBeNull();
		expect(rows()[0].querySelector('.why')?.textContent).toBe('Rien à jouer pour l’instant');
		expect(rows()[0].querySelector('.duration')).toBeNull();
	});

	it('speaks the player’s language', () => {
		i18n.locale = 'en';
		render(LibraryScreen, {
			props: {
				entries: [
					entry('a', { routines: [{ fr: 'Triades', en: 'Triads' }] }),
					entry('b', { playable: false })
				]
			}
		});
		expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
		const list = within(screen.getByRole('list', { name: 'Exercises' })).getAllByRole('listitem');
		expect(list.map((row) => row.querySelector('.why')?.textContent)).toEqual([
			'Triads',
			'Nothing to play for now'
		]);
		expect(list[0].querySelector('b')?.textContent).toBe('Title a');
	});
});
