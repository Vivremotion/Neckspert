import { describe, expect, it } from 'vitest';
import { findExercise } from '$lib/domain/exercise/registry';
import { routines } from '$lib/domain/routine/registry';
import { hasCards } from '$lib/domain/skill/registry';
import { activeDestination, libraryHref, showsRail } from './navigation';

describe('showsRail', () => {
	it.each([
		'/session',
		'/session/demo',
		'/dev/identify',
		'/dev/gesture',
		'/dev/rhythm',
		'/diagnostic',
		'/diagnostic/oracle'
	])('hides the rail on %s', (path) => {
		expect(showsRail(path)).toBe(false);
	});

	it.each([
		'/',
		'/map',
		'/settings',
		'/calibration',
		'/summary',
		'/dev/home',
		'/dev/summary',
		'/dev/map',
		'/dev/settings',
		'/dev/calibration'
	])('shows the rail on %s', (path) => {
		expect(showsRail(path)).toBe(true);
	});
});

describe('activeDestination', () => {
	it.each([
		['/', 'practice'],
		['/summary', 'practice'],
		['/map', 'progress'],
		['/settings', 'settings'],
		['/calibration', 'settings'],
		['/dev/home', 'practice'],
		['/dev/summary', 'practice'],
		['/dev/map', 'progress'],
		['/dev/settings', 'settings'],
		['/dev/calibration', 'settings'],
		['/session', null],
		['/elsewhere', null]
	])('%s is %s', (path, expected) => {
		expect(activeDestination(path)).toBe(expected);
	});
});

describe('libraryHref', () => {
	const memory = (id: string) => id.startsWith('m-');
	const routine = (id: string, exercises: string[]) => ({
		id,
		title: { fr: id, en: id },
		exercises
	});

	it('leads to the free play of the first routine whose exercises are all on memory skills', () => {
		expect(
			libraryHref(
				[
					routine('passages', ['p-1']),
					routine('mixed', ['m-1', 'p-1']),
					routine('mine', ['m-1', 'm-2'])
				],
				memory
			)
		).toBe('/session?routine=mine&free=1');
	});

	it('leads home when no routine is of memory', () => {
		expect(libraryHref([routine('passages', ['p-1'])], memory)).toBe('/');
		expect(libraryHref([], memory)).toBe('/');
	});

	it('leads to the catalog notes’ free play, as today', () => {
		expect(libraryHref(routines(), (id) => hasCards(findExercise(id)?.practices ?? ''))).toBe(
			'/session?routine=notes&free=1'
		);
	});
});
