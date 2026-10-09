import { describe, expect, it } from 'vitest';
import {
	makeAttempt,
	makeBackup,
	makeBackupV2,
	makeCard,
	makeProgression,
	makeSession
} from './testing/fixtures';
import {
	validateBackup,
	validateBackupV1,
	validateBackupV2,
	validateBackupV3
} from './validateBackup';

const NOW = 9000;

/** A version 1 export: targets, answers with their kind, a session tempo, a settings tempo. */
function makeV1Backup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		app: 'neckspert-play',
		version: 1,
		exportedAt: 5000,
		settings: {
			locale: 'fr',
			tempoBpm: 96,
			calibrationOffsetMs: null,
			inputDeviceId: null,
			builtInInputGain: 8
		},
		cards: [
			{
				key: 'locate:2:F',
				target: { direction: 'locate', string: 2, pitch: 'F' },
				introducedAt: 1000,
				introducedInSession: 's1',
				leadBeats: 1,
				scheduling: { due: 3_601_000, state: 0 },
				learnedAt: 1000,
				acquiredAt: null,
				masteredAt: null
			}
		],
		attempts: [
			{
				id: 1,
				sessionId: 's1',
				cardKey: 'locate:2:F',
				target: { direction: 'locate', string: 2, pitch: 'F' },
				phase: 'review',
				temperature: 'cold',
				aid: 'none',
				leadBeats: 2,
				promptedAt: 1000,
				answer: { kind: 'note', midi: 65 },
				correct: true,
				verdict: 'perfect',
				timingOffsetMs: 10,
				reactionMs: 900,
				confusion: null
			}
		],
		sessions: [
			{
				id: 's1',
				kind: 'learn',
				startedAt: 1000,
				endedAt: 2000,
				fatigueDetected: false,
				tempoBpm: 100
			}
		],
		...overrides
	};
}

describe('validateBackup', () => {
	it('returns a valid backup unchanged', () => {
		const file = makeBackup();
		expect(validateBackup(file)).toBe(file);
	});

	it('accepts a backup read back from JSON', () => {
		const file = makeBackup();
		expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
	});

	it('accepts an identify card and attempt without tempo', () => {
		const file = makeBackup({
			cards: [makeCard({ mechanic: 'identify', leadBeats: 2 })],
			attempts: [makeAttempt({ mechanic: 'identify' })]
		});
		expect(validateBackup(file)).toBe(file);
	});

	it('accepts an export whose cards or attempts still hold the one-beat lead', () => {
		const file = makeBackup({
			cards: [makeCard({ leadBeats: 1 as never })],
			attempts: [makeAttempt({ leadBeats: 1 })]
		});
		expect(() => validateBackup(file)).not.toThrow();
	});

	it('checks the confusion of an attempt, string-name included', () => {
		const withConfusion = (confusion: unknown) =>
			makeBackup({
				attempts: [makeAttempt({ data: { item: { string: 2, pitch: 'F' }, confusion } })]
			});
		expect(() => validateBackup(withConfusion({ kind: 'string-name' }))).not.toThrow();
		expect(() => validateBackup(withConfusion({ kind: 'semitone', delta: 1 }))).not.toThrow();
		expect(() => validateBackup(withConfusion({ kind: 'reading' }))).toThrow(
			'Invalid attempts entry at index 0: data.confusion must be null or a semitone, octave, string-name or other confusion'
		);
	});

	it('accepts an off-beat attempt', () => {
		const file = makeBackup({ attempts: [makeAttempt({ verdict: 'offbeat', correct: true })] });
		expect(() => validateBackup(file)).not.toThrow();
	});

	it('accepts a corrected attempt', () => {
		const file = makeBackup({ attempts: [makeAttempt({ verdict: 'corrected', correct: false })] });
		expect(() => validateBackup(file)).not.toThrow();
	});

	it('accepts attempts without an id', () => {
		expect(() => validateBackup(makeBackup({ attempts: [makeAttempt()] }))).not.toThrow();
	});

	it('rejects values that are not objects', () => {
		for (const value of [null, [], 'backup', 42]) {
			expect(() => validateBackup(value)).toThrow('Backup file is not a JSON object');
		}
	});

	it('rejects files from another app', () => {
		expect(() => validateBackup({ ...makeBackup(), app: 'neckspert' })).toThrow(
			'Not a Neckspert Play backup'
		);
	});

	it('rejects unsupported versions', () => {
		expect(() => validateBackup({ ...makeBackup(), version: 4 })).toThrow(
			'Unsupported backup version: 4'
		);
		expect(() => validateBackup({ ...makeBackup(), version: undefined })).toThrow(
			'Unsupported backup version: undefined'
		);
	});

	it('rejects a missing export date', () => {
		expect(() => validateBackup({ ...makeBackup(), exportedAt: 'today' })).toThrow(
			'Backup exportedAt must be a number'
		);
	});

	it('rejects missing or invalid settings', () => {
		const file = makeBackup();
		expect(() => validateBackup({ ...file, settings: undefined })).toThrow(
			'Backup settings must be an object'
		);
		expect(() => validateBackup({ ...file, settings: { ...file.settings, locale: 'de' } })).toThrow(
			'Invalid backup settings: locale must be "fr" or "en"'
		);
		const { builtInInputGain: _gain, ...withoutGain } = file.settings;
		expect(() => validateBackup({ ...file, settings: withoutGain })).not.toThrow();
		expect(() =>
			validateBackup({ ...file, settings: { ...file.settings, builtInInputGain: 32 } })
		).toThrow('Invalid backup settings: builtInInputGain must be a number from 1 to 16');
	});

	it('accepts settings with or without the diagnostics field, and rejects a bad one', () => {
		const file = makeBackup();
		const { diagnostics: _diagnostics, ...withoutDiagnostics } = file.settings;
		expect(() => validateBackup({ ...file, settings: withoutDiagnostics })).not.toThrow();
		const withDiagnostics = (diagnostics: unknown) => ({
			...file,
			settings: { ...file.settings, diagnostics }
		});
		expect(() => validateBackup(withDiagnostics({ enabled: true, budgetMb: 300 }))).not.toThrow();
		expect(() => validateBackup(withDiagnostics({ enabled: null, budgetMb: 100 }))).not.toThrow();
		expect(() => validateBackup(withDiagnostics({ enabled: true, budgetMb: 0 }))).toThrow(
			'Invalid backup settings: diagnostics.budgetMb must be a positive number'
		);
		expect(() => validateBackup(withDiagnostics({ enabled: true, budgetMb: 'x' }))).toThrow(
			'Invalid backup settings: diagnostics.budgetMb must be a positive number'
		);
		expect(() => validateBackup(withDiagnostics({ enabled: 'yes', budgetMb: 300 }))).toThrow(
			'Invalid backup settings: diagnostics.enabled must be true, false or null'
		);
		expect(() => validateBackup(withDiagnostics('on'))).toThrow(
			'Invalid backup settings: diagnostics must be an object'
		);
	});

	it('rejects a table that is not an array', () => {
		expect(() => validateBackup({ ...makeBackup(), cards: {} })).toThrow(
			'Backup field "cards" must be an array'
		);
		expect(() => validateBackup({ ...makeBackup(), sessions: undefined })).toThrow(
			'Backup field "sessions" must be an array'
		);
		expect(() => validateBackup({ ...makeBackup(), progressions: undefined })).toThrow(
			'Backup field "progressions" must be an array'
		);
	});

	it('rejects an invalid card and names its index', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [makeCard(), { ...makeCard(), leadBeats: 3 }] })
		).toThrow('Invalid cards entry at index 1: leadBeats must be 8, 4, 2 or 1');
		expect(() => validateBackup({ ...makeBackup(), cards: ['card'] })).toThrow(
			'Invalid cards entry at index 0: not an object'
		);
	});

	it('rejects a card of an unknown mechanic', () => {
		expect(() =>
			validateBackup({
				...makeBackup(),
				cards: [{ ...makeCard(), mechanic: 'chords', key: 'chords:C' }]
			})
		).toThrow('Invalid cards entry at index 0: mechanic must be one of locate, identify');
	});

	it('rejects a card whose key does not match its mechanic and item', () => {
		const card = makeCard();
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [{ ...card, key: 'locate:7:F' }] })
		).toThrow('Invalid cards entry at index 0: key is not a valid card key');
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [{ ...card, key: 'locate:02:F' }] })
		).toThrow('Invalid cards entry at index 0: key is not a valid card key');
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [{ ...card, key: 'identify:2:6' }] })
		).toThrow('Invalid cards entry at index 0: key does not match mechanic');
		expect(() =>
			validateBackup({
				...makeBackup(),
				cards: [{ ...card, key: 'locate:6:F', item: { string: 5, pitch: 'F' } }]
			})
		).toThrow('Invalid cards entry at index 0: item does not match key');
		expect(() =>
			validateBackup({
				...makeBackup(),
				cards: [{ ...card, item: { string: 2, pitch: 'F', fret: 6 } }]
			})
		).toThrow('Invalid cards entry at index 0: item does not match key');
	});

	it('rejects an invalid attempt', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), verdict: 'great' }] })
		).toThrow(
			'Invalid attempts entry at index 0: verdict must be perfect, early, late, offbeat, corrected or wrong'
		);
		expect(() => validateBackup(makeBackup({ attempts: [makeAttempt({ id: 0 })] }))).toThrow(
			'Invalid attempts entry at index 0: id must be a positive integer'
		);
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), cardKey: 'locate:2:G' }] })
		).toThrow('Invalid attempts entry at index 0: data.item does not match cardKey');
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), mechanic: 'chords' }] })
		).toThrow('Invalid attempts entry at index 0: mechanic must be one of locate, identify');
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), exerciseId: '' }] })
		).toThrow('Invalid attempts entry at index 0: exerciseId must be a non-empty string');
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), data: null }] })
		).toThrow('Invalid attempts entry at index 0: data must be an object with an item');
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), data: {} }] })
		).toThrow('Invalid attempts entry at index 0: data must be an object with an item');
	});

	it('requires a positive tempo or null on every attempt', () => {
		for (const tempoBpm of [0, -80, undefined, '80']) {
			expect(() =>
				validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), tempoBpm }] })
			).toThrow('Invalid attempts entry at index 0: tempoBpm must be a positive number or null');
		}
		expect(() =>
			validateBackup(makeBackup({ attempts: [makeAttempt({ tempoBpm: null })] }))
		).not.toThrow();
	});

	it('rejects an invalid session', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), kind: 'weekly' }] })
		).toThrow('Invalid sessions entry at index 0: kind must be learn, free or triads');
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), kind: 'placement' }] })
		).toThrow('Invalid sessions entry at index 0: kind must be learn, free or triads');
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), phase: 'placement' }] })
		).toThrow(
			'Invalid attempts entry at index 0: phase must be probe, review, learning, consolidation or free'
		);
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), fatigueDetected: 'no' }] })
		).toThrow('Invalid sessions entry at index 0: fatigueDetected must be a boolean');
	});

	it('checks the executions of a session', () => {
		const withExecutions = (executions: unknown) =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), executions }] });
		expect(() => withExecutions([])).not.toThrow();
		expect(() => withExecutions(undefined)).toThrow(
			'Invalid sessions entry at index 0: executions must be an array'
		);
		expect(() => withExecutions(['locate-neck'])).toThrow(
			'Invalid sessions entry at index 0: executions[0] must be an object'
		);
		expect(() =>
			withExecutions([{ exerciseId: 'locate-neck', tempoBpm: 80 }, { tempoBpm: null }])
		).toThrow(
			'Invalid sessions entry at index 0: executions[1].exerciseId must be a non-empty string'
		);
		expect(() => withExecutions([{ exerciseId: 'locate-neck', tempoBpm: 0 }])).toThrow(
			'Invalid sessions entry at index 0: executions[0].tempoBpm must be a positive number or null'
		);
		expect(() => withExecutions([{ exerciseId: 'locate-neck' }])).toThrow(
			'Invalid sessions entry at index 0: executions[0].tempoBpm must be a positive number or null'
		);
	});

	it('checks progressions', () => {
		const withProgression = (progression: unknown) =>
			validateBackup({ ...makeBackup(), progressions: [progression] });
		expect(() => withProgression(makeProgression())).not.toThrow();
		expect(() => withProgression({ ...makeProgression(), exerciseId: '' })).toThrow(
			'Invalid progressions entry at index 0: exerciseId must be a non-empty string'
		);
		expect(() => withProgression({ ...makeProgression(), mechanic: 'chords' })).toThrow(
			'Invalid progressions entry at index 0: mechanic must be one of locate, identify'
		);
		expect(() => withProgression({ ...makeProgression(), tempoBpm: 0 })).toThrow(
			'Invalid progressions entry at index 0: tempoBpm must be a positive number'
		);
		expect(() => withProgression({ ...makeProgression(), tempoBpm: null })).toThrow(
			'Invalid progressions entry at index 0: tempoBpm must be a positive number'
		);
		expect(() => withProgression({ ...makeProgression(), updatedAt: undefined })).toThrow(
			'Invalid progressions entry at index 0: updatedAt must be a number'
		);
	});

	it('accepts a learn session and a consolidation attempt', () => {
		expect(() =>
			validateBackup(
				makeBackup({
					sessions: [makeSession({ kind: 'learn' })],
					attempts: [makeAttempt({ phase: 'consolidation', temperature: 'hot' })]
				})
			)
		).not.toThrow();
		expect(() =>
			validateBackup(
				makeBackup({ attempts: [makeAttempt({ phase: 'probe', temperature: 'hot' })] })
			)
		).not.toThrow();
	});

	it('rejects a card without learnedAt', () => {
		const { learnedAt: _dropped, ...withoutLearned } = makeCard();
		expect(() => validateBackup({ ...makeBackup(), cards: [withoutLearned] })).toThrow(
			'Invalid cards entry at index 0: learnedAt must be a number or null'
		);
	});

	describe('with a version 1 file', () => {
		it('converts it, then checks it as version 3', () => {
			const file = validateBackup(makeV1Backup(), NOW);
			expect(file.version).toBe(3);
			expect(file.app).toBe('neckspert-play');
			expect(file.exportedAt).toBe(5000);
			expect(file.settings).toEqual({
				locale: 'fr',
				calibrationOffsetMs: null,
				inputDeviceId: null,
				builtInInputGain: 8
			});
			expect(file.progressions).toEqual([
				{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 96, updatedAt: NOW }
			]);
			expect(file.cards[0]).toMatchObject({
				key: 'locate:2:F',
				mechanic: 'locate',
				item: { string: 2, pitch: 'F' },
				leadBeats: 2
			});
			expect(file.attempts[0]).toMatchObject({
				exerciseId: 'locate-neck',
				tempoBpm: 100,
				data: { item: { string: 2, pitch: 'F' }, answer: { midi: 65 }, confusion: null }
			});
			expect(file.sessions[0].executions).toEqual([
				{ exerciseId: 'locate-neck', tempoBpm: 100 },
				{ exerciseId: 'identify-neck', tempoBpm: null }
			]);
			expect(() => validateBackupV3(file)).not.toThrow();
			expect(file.attempts[0].observations).toBeNull();
			expect(file.sessions[0].latencyMs).toBeNull();
		});

		it('stamps the conversion with the current time by default', () => {
			const before = Date.now();
			const file = validateBackup(makeV1Backup());
			expect(file.progressions[0].updatedAt).toBeGreaterThanOrEqual(before);
			expect(file.progressions[0].updatedAt).toBeLessThanOrEqual(Date.now());
		});

		it('keeps the version 1 checks and their messages', () => {
			const v1 = makeV1Backup();
			const [card] = v1.cards as Record<string, unknown>[];
			expect(() => validateBackup({ ...v1, cards: [{ ...card, key: 'locate:3:F' }] })).toThrow(
				'Invalid cards entry at index 0: target does not match key'
			);
			expect(() => validateBackup({ ...v1, cards: [{ ...card, key: 'chords:3:F' }] })).toThrow(
				'Invalid cards entry at index 0: key is not a valid card key'
			);
			expect(() =>
				validateBackup({ ...v1, settings: { ...(v1.settings as object), tempoBpm: 0 } })
			).toThrow('Invalid backup settings: tempoBpm must be a positive number');
			const [session] = v1.sessions as Record<string, unknown>[];
			expect(() => validateBackup({ ...v1, sessions: [{ ...session, tempoBpm: 0 }] })).toThrow(
				'Invalid sessions entry at index 0: tempoBpm must be a positive number or null'
			);
			const { tempoBpm: _dropped, ...withoutTempo } = session;
			expect(() => validateBackup({ ...v1, sessions: [withoutTempo] })).not.toThrow();
		});

		it('is checked on its own by validateBackupV1', () => {
			const v1 = makeV1Backup();
			expect(validateBackupV1(v1)).toBe(v1);
			expect(() => validateBackupV1(makeBackupV2())).toThrow('Unsupported backup version: 2');
			expect(() => validateBackupV2(v1)).toThrow('Unsupported backup version: 1');
			expect(() => validateBackupV3(v1)).toThrow('Unsupported backup version: 1');
		});
	});
});

describe('with a version 2 file', () => {
	it('lands on version 3 with no observations and no latency', () => {
		const file = validateBackup(makeBackupV2());
		expect(file.version).toBe(3);
		expect(file.attempts.map((attempt) => attempt.observations)).toEqual([null]);
		expect(file.sessions.map((session) => session.latencyMs)).toEqual([null]);
	});

	it('is checked on its own by validateBackupV2, which does not ask for the new fields', () => {
		expect(() => validateBackupV2(makeBackupV2())).not.toThrow();
		expect(() => validateBackupV2(makeBackup())).toThrow('Unsupported backup version: 3');
		expect(() => validateBackupV3(makeBackupV2())).toThrow('Unsupported backup version: 2');
	});

	it('keeps the version 2 checks and their messages', () => {
		const v2 = makeBackupV2();
		expect(() => validateBackup({ ...v2, sessions: [{ id: '' }] })).toThrow(
			'Invalid sessions entry at index 0: id must be a non-empty string'
		);
	});
});

describe('validateBackupV3', () => {
	const observation = { atMs: 1200, sensor: 'note', fate: 'answer', correct: true, payload: {} };

	it('accepts observations of every fate, and a latency', () => {
		const fates = [
			'answer',
			'settled',
			'before-window',
			'after-capture',
			'other-sensor',
			'unreadable'
		];
		const file = makeBackup({
			attempts: [
				makeAttempt({ id: 1, observations: null }),
				makeAttempt({ id: 2, observations: [] }),
				makeAttempt({
					id: 3,
					observations: fates.map((fate) => ({ ...observation, fate, correct: null })) as never
				})
			],
			sessions: [makeSession({ latencyMs: 12 }), makeSession({ id: 's2', latencyMs: null })]
		});
		expect(validateBackupV3(file)).toBe(file);
	});

	it('refuses a file of another version', () => {
		expect(() => validateBackupV3({ ...makeBackup(), version: 2 })).toThrow(
			'Unsupported backup version: 2'
		);
	});

	function withObservations(observations: unknown): unknown {
		return { ...makeBackup(), attempts: [{ ...makeAttempt({ id: 1 }), observations }] };
	}

	it.each([
		[
			'observations that are neither null nor an array',
			'x',
			'observations must be null or an array'
		],
		['an observation that is not an object', [3], 'observations[0] must be an object'],
		[
			'an atMs that is not finite',
			[{ ...observation, atMs: Infinity }],
			'observations[0].atMs must be a number'
		],
		[
			'an empty sensor',
			[{ ...observation, sensor: '' }],
			'observations[0].sensor must be a non-empty string'
		],
		['an unknown fate', [{ ...observation, fate: 'maybe' }], 'observations[0].fate must be'],
		[
			'a correct that is not a boolean or null',
			[{ ...observation, correct: 'yes' }],
			'observations[0].correct must be a boolean or null'
		],
		[
			'a missing payload',
			[{ atMs: 1, sensor: 'note', fate: 'answer', correct: true }],
			'observations[0].payload is required'
		]
	])('rejects %s', (_name, observations, message) => {
		expect(() => validateBackupV3(withObservations(observations))).toThrow(
			`Invalid attempts entry at index 0: ${message}`
		);
	});

	it('rejects an attempt without the observations field', () => {
		const { observations: _dropped, ...attempt } = makeAttempt({ id: 1 });
		expect(() => validateBackupV3({ ...makeBackup(), attempts: [attempt] })).toThrow(
			'observations must be null or an array'
		);
	});

	it('rejects a latency that is not a number or null', () => {
		const sessions = [{ ...makeSession(), latencyMs: 'x' }];
		expect(() => validateBackupV3({ ...makeBackup(), sessions })).toThrow(
			'Invalid sessions entry at index 0: latencyMs must be a number or null'
		);
	});

	it('keeps the version 2 checks', () => {
		expect(() =>
			validateBackupV3({ ...makeBackup(), attempts: [{ ...makeAttempt({ id: 1 }), phase: 'x' }] })
		).toThrow('Invalid attempts entry at index 0: phase must be');
	});
});

describe('with triad cards and attempts', () => {
	const KEY = 'D|maj|3:5,2:1,1:3';
	const anchorCard = makeCard({
		key: `triad-anchor:${KEY}`,
		mechanic: 'triad-anchor',
		item: { voicingKey: KEY }
	});
	const zoneCard = makeCard({
		key: `triad-zone:${KEY}`,
		mechanic: 'triad-zone',
		item: { voicingKey: KEY }
	});

	it('accepts an anchor attempt with the confusion of its root or of its chord', () => {
		const attempt = (id: number, confusion: unknown) =>
			makeAttempt({
				id,
				exerciseId: 'triads-anchor',
				mechanic: 'triad-anchor',
				cardKey: `triad-anchor:${KEY}`,
				data: { item: { voicingKey: KEY }, answer: null, confusion }
			});
		const file = makeBackup({
			cards: [anchorCard],
			attempts: [
				attempt(1, { kind: 'semitone', delta: 1, part: 'root' }),
				attempt(2, { kind: 'no-chord', part: 'chord' }),
				attempt(3, { kind: 'other-inversion', part: 'chord' }),
				attempt(4, { kind: 'none', part: 'chord' })
			]
		});
		expect(validateBackupV3(file)).toBe(file);
	});

	it('accepts a zone attempt whose item holds the position asked, its card the voicing only', () => {
		const file = makeBackup({
			cards: [zoneCard],
			attempts: [
				makeAttempt({
					id: 1,
					exerciseId: 'triads-zone',
					mechanic: 'triad-zone',
					cardKey: `triad-zone:${KEY}`,
					data: {
						item: { voicingKey: KEY, position: 2 },
						answer: { decided: null },
						confusion: { kind: 'other-octave', part: 'chord' }
					}
				})
			]
		});
		expect(validateBackupV3(file)).toBe(file);
	});

	it('still refuses a zone attempt whose item names another voicing than its card', () => {
		const file = makeBackup({
			attempts: [
				makeAttempt({
					id: 1,
					mechanic: 'triad-zone',
					cardKey: `triad-zone:${KEY}`,
					data: {
						item: { voicingKey: 'C|maj|3:5,2:1,1:3', position: 2 },
						answer: null,
						confusion: null
					}
				})
			]
		});
		expect(() => validateBackupV3(file)).toThrow(/data.item does not match cardKey/);
	});
});

describe('the triads session and the contest of an attempt', () => {
	it('accepts a triads session and a contested attempt', () => {
		const file = makeBackup({
			attempts: [makeAttempt({ id: 1, contested: true }), makeAttempt({ id: 2 })],
			sessions: [makeSession({ kind: 'triads' })]
		});
		expect(validateBackupV3(file)).toBe(file);
	});

	it('rejects a contest that is not a boolean', () => {
		const file = makeBackup({ attempts: [makeAttempt({ id: 1, contested: 'yes' as never })] });
		expect(() => validateBackupV3(file)).toThrow(/contested must be a boolean/);
	});
});
