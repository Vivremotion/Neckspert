import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ImportedFile } from '$lib/application/definitions/service';
import type { Refusal } from '$lib/domain/definitions';
import { i18n } from '$lib/i18n/index.svelte';
import ImportedFiles from './ImportedFiles.svelte';

const FILE: ImportedFile = {
	name: 'mes accords été.json',
	importedAt: Date.UTC(2026, 10, 19, 12),
	skills: ['a', 'b'],
	grids: ['g'],
	exercises: ['e1', 'e2', 'e3'],
	refusals: []
};

function setup(
	over: Partial<{
		files: ImportedFile[];
		refused: Refusal[];
		onimport: (files: File[]) => void;
		onremove: (name: string) => void;
	}> = {}
) {
	const props = {
		files: [] as ImportedFile[],
		refused: [] as Refusal[],
		onimport: vi.fn(),
		onremove: vi.fn(),
		...over
	};
	render(ImportedFiles, { props });
	return props;
}

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

describe('ImportedFiles', () => {
	it('says when no file is imported', () => {
		setup();
		expect(screen.getByRole('heading', { name: 'Fichiers importés' })).toBeTruthy();
		expect(screen.getByText('Aucun fichier importé.')).toBeTruthy();
		expect(screen.getByText('Un fichier du même nom remplace le précédent.')).toBeTruthy();
	});

	it('lists a file with its counts, its date and its name as text', () => {
		setup({ files: [FILE] });
		expect(screen.getByText('mes accords été.json')).toBeTruthy();
		expect(screen.getByText('2 capacités, 1 grille, 3 exercices')).toBeTruthy();
		expect(screen.getByText(/19 novembre 2026/)).toBeTruthy();
	});

	it('leaves out the kinds at zero, singular and plural, in English', () => {
		i18n.locale = 'en';
		setup({
			files: [{ ...FILE, skills: ['a'], grids: [], exercises: ['e'] }]
		});
		expect(screen.getByText('1 skill, 1 exercise')).toBeTruthy();
	});

	it('says nothing was read from an empty file', () => {
		setup({ files: [{ ...FILE, skills: [], grids: [], exercises: [] }] });
		expect(screen.getByText('Rien n’a été lu dans ce fichier.')).toBeTruthy();
	});

	it('shows the refusals of a file without repeating its name', () => {
		setup({
			files: [
				{
					...FILE,
					refusals: [
						{ file: FILE.name, kind: 'exercise', id: 'e9', reason: 'no round' },
						{ file: FILE.name, kind: 'file', id: null, reason: 'not an object' }
					]
				}
			]
		});
		expect(screen.getByText('exercice `e9` : no round')).toBeTruthy();
		expect(screen.getByText('not an object')).toBeTruthy();
	});

	it('asks before removing, then removes', async () => {
		const { onremove } = setup({ files: [FILE] });
		await fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
		expect(onremove).not.toHaveBeenCalled();
		expect(screen.getByText('Supprimer ce fichier ? Ta progression est gardée.')).toBeTruthy();
		await fireEvent.click(
			within(screen.getByRole('group')).getByRole('button', { name: 'Supprimer' })
		);
		expect(onremove).toHaveBeenCalledWith(FILE.name);
	});

	it('does not remove on cancel', async () => {
		const { onremove } = setup({ files: [FILE] });
		await fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
		expect(onremove).not.toHaveBeenCalled();
		expect(screen.queryByText('Supprimer ce fichier ? Ta progression est gardée.')).toBeNull();
	});

	it('hands every chosen file to onimport and clears the field', async () => {
		const { onimport } = setup();
		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(input.multiple).toBe(true);
		expect(input.accept).toContain('.json');
		const a = new File(['{}'], 'a.json');
		const b = new File(['{}'], 'b.json');
		await fireEvent.change(input, { target: { files: [a, b] } });
		expect(onimport).toHaveBeenCalledWith([a, b]);
		expect(input.value).toBe('');
	});

	it('lists the files not stored with their reason', () => {
		setup({
			refused: [{ file: 'cassé é.json', kind: 'file', id: null, reason: 'not JSON' }]
		});
		expect(screen.getByText('cassé é.json n’a pas été importé : not JSON')).toBeTruthy();
	});

	it('shows the not-stored line in English', () => {
		i18n.locale = 'en';
		setup({ refused: [{ file: 'x.json', kind: 'file', id: null, reason: 'not JSON' }] });
		expect(screen.getByText('x.json was not imported: not JSON')).toBeTruthy();
	});
});
