import { describe, expect, it } from 'vitest';
import { playOriginOf } from './playOrigin';

describe('playOriginOf', () => {
	it('names a routine by its title and tells its how-to', () => {
		expect(playOriginOf({ routine: 'chords' })).toEqual({
			title: { fr: 'Triades', en: 'Triads' },
			howTo: {
				fr: '« C · fondamentale sur sol » : quand la case atteint le trait, joue la fondamentale seule sur cette corde, puis plaque l’accord sur les trois cordes indiquées pendant la bande qui suit. Le clic sort des enceintes de l’ordinateur.',
				en: '“C · root on G”: when its tile reaches the line, play the root alone on that string, then strum the chord on the three strings shown during the band that follows. The click comes from the computer speakers.'
			},
			free: false
		});
		expect(playOriginOf({ routine: 'notes', free: true })).toMatchObject({
			title: { fr: 'Apprentissage', en: 'Learn' },
			free: true
		});
	});

	it('names an exercise played alone by its own title, with no how-to of a routine', () => {
		expect(playOriginOf({ exercise: 'rhythm-two-four' })).toEqual({
			title: { fr: 'Métronome sur 2 et 4', en: 'Click on 2 and 4' },
			howTo: null,
			free: false
		});
		expect(playOriginOf({ exercise: 'locate-note-string', free: true }).free).toBe(true);
	});

	it('names what no file defines any more by its id', () => {
		expect(playOriginOf({ routine: 'kazoo' })).toEqual({
			title: { fr: 'kazoo', en: 'kazoo' },
			howTo: null,
			free: false
		});
		expect(playOriginOf({ exercise: 'kazoo' }).title).toEqual({ fr: 'kazoo', en: 'kazoo' });
	});
});
