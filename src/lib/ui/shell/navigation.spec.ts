import { describe, expect, it } from 'vitest';
import { activeDestination, DESTINATION_PATHS, showsRail } from './navigation';

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
		'/library',
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
		['/library', 'library'],
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

describe('DESTINATION_PATHS', () => {
	it('leads each link of the rail to a page of its destination, the library to the Library', () => {
		expect(DESTINATION_PATHS.library).toBe('/library');
		for (const [destination, path] of Object.entries(DESTINATION_PATHS)) {
			expect(activeDestination(path), path).toBe(destination);
		}
	});
});
