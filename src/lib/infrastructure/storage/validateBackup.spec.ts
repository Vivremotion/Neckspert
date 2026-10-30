import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Attempt, type BackupFile } from '$lib/domain/types';
import {
	makeAttempt,
	makeBackup,
	makeBackupV2,
	makeBackupV3,
	makeBackupV4,
	makeBackupV5,
	makeBackupV6,
	makeBackupV7,
	makeCard,
	makeCycleAttemptV11,
	makeCardV5,
	makeLevelState,
	makeProgressionV6,
	makeSession
} from './testing/fixtures';
import {
	validateBackup,
	validateBackupV1,
	validateBackupV2,
	validateBackupV3,
	validateBackupV5,
	validateBackupV6,
	validateBackupV7,
	validateBackupV8
} from './validateBackup';
import { RHYTHM_FIGURE_MECHANIC_V11, attemptToV12 } from './migrations/v12';

/** The level states of a converted file: one per neck card, none of the exercises. */
function expectNeckLevelStates(file: BackupFile): void {
	const neck = file.cards.filter((card) => ['locate', 'identify'].includes(card.mechanic));
	expect(neck.length).toBeGreaterThan(0);
	expect(file.levelStates).toHaveLength(neck.length);
	expect(file.levelStates.map((state) => state.exerciseId).sort()).toEqual(
		neck.map((card) => `${card.mechanic}-neck`).sort()
	);
}

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
			cards: [makeCard({ mechanic: 'identify' })],
			attempts: [makeAttempt({ mechanic: 'identify' })]
		});
		expect(validateBackup(file)).toBe(file);
	});

	it('accepts an export whose cards or attempts still hold the one-beat lead', () => {
		const file = makeBackupV5({
			cards: [makeCardV5({ leadBeats: 1 })],
			attempts: [makeAttempt({ leadBeats: 1 })]
		});
		expect(() => validateBackup(file)).not.toThrow();
		expect(() =>
			validateBackup(makeBackup({ attempts: [makeAttempt({ leadBeats: 1 })] }))
		).not.toThrow();
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
		const file = makeBackup({
			attempts: [
				makeAttempt({
					verdict: { relation: 'beat', version: 1, value: 'offbeat' },
					correct: true,
					success: false
				})
			]
		});
		expect(() => validateBackup(file)).not.toThrow();
	});

	it('accepts a corrected attempt', () => {
		const file = makeBackup({
			attempts: [
				makeAttempt({
					verdict: { relation: 'anchor', version: 1, value: 'corrected' },
					correct: false,
					success: false
				})
			]
		});
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
		expect(() => validateBackup({ ...makeBackup(), version: 9 })).toThrow(
			'Unsupported backup version: 9'
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

	it('accepts settings with or without a chord diagram, and rejects an unknown one', () => {
		const file = makeBackup();
		const { chordDiagram: _diagram, ...without } = file.settings as typeof file.settings & {
			chordDiagram?: string;
		};
		expect(() => validateBackup({ ...file, settings: without })).not.toThrow();
		for (const chordDiagram of ['strings', 'grid']) {
			expect(() =>
				validateBackup({ ...file, settings: { ...file.settings, chordDiagram } })
			).not.toThrow();
		}
		expect(() =>
			validateBackup({ ...file, settings: { ...file.settings, chordDiagram: 'tab' } })
		).toThrow('Invalid backup settings: chordDiagram must be "strings" or "grid"');
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

	it('accepts settings with diagnostics.nativeRate and without it', () => {
		const file = makeBackup();
		const withDiagnostics = (diagnostics: unknown) => ({
			...file,
			settings: { ...file.settings, diagnostics }
		});
		expect(() => validateBackup(withDiagnostics({ enabled: true, budgetMb: 300 }))).not.toThrow();
		expect(() =>
			validateBackup(withDiagnostics({ enabled: true, budgetMb: 300, nativeRate: true }))
		).not.toThrow();
		expect(() =>
			validateBackup(withDiagnostics({ enabled: null, budgetMb: 300, nativeRate: false }))
		).not.toThrow();
		expect(() =>
			validateBackup(withDiagnostics({ enabled: true, budgetMb: 300, nativeRate: 'yes' }))
		).toThrow('Invalid backup settings: diagnostics.nativeRate must be true or false');
	});

	it('rejects a table that is not an array', () => {
		expect(() => validateBackup({ ...makeBackup(), cards: {} })).toThrow(
			'Backup field "cards" must be an array'
		);
		expect(() => validateBackup({ ...makeBackup(), sessions: undefined })).toThrow(
			'Backup field "sessions" must be an array'
		);
		expect(() => validateBackup({ ...makeBackupV6(), progressions: undefined })).toThrow(
			'Backup field "progressions" must be an array'
		);
	});

	it('rejects an invalid card and names its index', () => {
		expect(() =>
			validateBackup(makeBackupV5({ cards: [makeCardV5(), makeCardV5({ leadBeats: 3 })] }))
		).toThrow('Invalid cards entry at index 1: leadBeats must be 8, 4, 2 or 1');
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [makeCard(), { ...makeCard(), learnedAt: 'x' }] })
		).toThrow('Invalid cards entry at index 1: learnedAt must be a number or null');
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
		).toThrow('Invalid attempts entry at index 0: verdict must be { relation, version, value }');
		expect(() =>
			validateBackup({ ...makeBackupV3(), attempts: [{ ...makeAttempt(), verdict: 'great' }] })
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

	it('checks the progressions of a version 6 file', () => {
		const withProgression = (progression: unknown) =>
			validateBackup({ ...makeBackupV6(), progressions: [progression] });
		expect(() => withProgression(makeProgressionV6())).not.toThrow();
		expect(() => withProgression({ ...makeProgressionV6(), exerciseId: '' })).toThrow(
			'Invalid progressions entry at index 0: exerciseId must be a non-empty string'
		);
		expect(() => withProgression({ ...makeProgressionV6(), mechanic: 'chords' })).toThrow(
			'Invalid progressions entry at index 0: mechanic must be one of locate, identify'
		);
		expect(() => withProgression({ ...makeProgressionV6(), tempoBpm: 0 })).toThrow(
			'Invalid progressions entry at index 0: tempoBpm must be a positive number'
		);
		expect(() => withProgression({ ...makeProgressionV6(), tempoBpm: null })).toThrow(
			'Invalid progressions entry at index 0: tempoBpm must be a positive number'
		);
		expect(() => withProgression({ ...makeProgressionV6(), updatedAt: undefined })).toThrow(
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
		it('converts it, then checks it as version 8', () => {
			const file = validateBackup(makeV1Backup());
			expect(file.version).toBe(8);
			expect(file.app).toBe('neckspert-play');
			expect(file.exportedAt).toBe(5000);
			expect(file.settings).toEqual({
				locale: 'fr',
				inputDeviceId: null,
				builtInInputGain: 8,
				latency: {},
				clickBleed: false
			});
			// Its tempo went to a locate progression, dropped at version 7: locate plays at 80 bpm.
			expect(file).not.toHaveProperty('progressions');
			expect(file.cards[0]).toMatchObject({
				key: 'locate:2:F',
				mechanic: 'locate',
				item: { string: 2, pitch: 'F' }
			});
			expect(Object.hasOwn(file.cards[0], 'leadBeats')).toBe(false);
			expect(file.attempts[0]).toMatchObject({
				exerciseId: 'locate-neck',
				tempoBpm: 100,
				data: { item: { string: 2, pitch: 'F' }, answer: { midi: 65 }, confusion: null }
			});
			expect(file.sessions[0].executions).toEqual([
				{ exerciseId: 'locate-neck', tempoBpm: 100 },
				{ exerciseId: 'identify-neck', tempoBpm: null }
			]);
			expect(() => validateBackupV8(file)).not.toThrow();
			expect(file.attempts[0]).toMatchObject({
				success: true,
				verdict: { relation: 'beat', version: 1, value: 'perfect' },
				aids: []
			});
			expectNeckLevelStates(file);
			expect(file.attempts[0].observations).toBeNull();
			expect(file.sessions[0].latencyMs).toBeNull();
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

/** `attempt` as stored before the target model: a bare verdict, the planned aid, no success. */
function beforeTarget(attempt: Attempt, fields: Record<string, unknown>): Record<string, unknown> {
	const { success, verdict, aids, measures, plan, ...rest } = attempt;
	void [success, verdict, aids, measures, plan];
	return { ...rest, aid: 'none', ...fields };
}

describe('attempts stored before the target model', () => {
	it('derive success, the verdict of their relation and their aids', () => {
		const locate = makeAttempt({ id: 1 });
		const identify = makeAttempt({ id: 2, mechanic: 'identify' });
		const file = makeBackupV3({
			attempts: [
				beforeTarget(locate, { correct: true, verdict: 'offbeat', aid: 'show-position' }),
				beforeTarget(identify, { correct: true, verdict: 'late' })
			]
		});
		const [first, second] = validateBackup(file).attempts;
		expect(first).toEqual({
			...locate,
			correct: true,
			success: false,
			verdict: { relation: 'beat', version: 1, value: 'offbeat' },
			aids: ['show-position']
		});
		expect(first).not.toHaveProperty('aid');
		expect(second).toEqual({
			...identify,
			success: true,
			verdict: { relation: 'free', version: 1, value: 'late' },
			aids: []
		});
	});

	it('are checked as before', () => {
		const old = beforeTarget(makeAttempt(), { correct: 'yes', verdict: 'perfect' });
		expect(() => validateBackup(makeBackupV3({ attempts: [old] }))).toThrow(
			'Invalid attempts entry at index 0: correct must be a boolean'
		);
	});

	it('are refused in a version 4 file, which holds none', () => {
		const old = beforeTarget(makeAttempt(), { correct: true, verdict: 'perfect' });
		expect(() => validateBackup(makeBackup({ attempts: [old] as never }))).toThrow(
			'Invalid attempts entry at index 0: verdict must be { relation, version, value }'
		);
	});
});

describe('target attempts', () => {
	const invalid = (fields: Record<string, unknown>) =>
		validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), ...fields }] });

	it('accept a null correct and an envelope of a relation they do not know', () => {
		expect(() =>
			invalid({ correct: null, verdict: { relation: 'cycle', version: 1, value: {} } })
		).not.toThrow();
	});

	it('accept a response envelope holding a response value', () => {
		const value = {
			verdict: 'perfect',
			timingOffsetMs: 12,
			reactionMs: 1212,
			leadMs: 1200,
			expectations: []
		};
		expect(() => invalid({ verdict: { relation: 'response', version: 1, value } })).not.toThrow();
	});

	it('reject a response envelope whose value names an unknown verdict', () => {
		const value = { verdict: 'great', timingOffsetMs: null, reactionMs: null, leadMs: null };
		expect(() => invalid({ verdict: { relation: 'response', version: 1, value } })).toThrow(
			'Invalid attempts entry at index 0: verdict.value must be perfect, early, late, offbeat, corrected or wrong'
		);
	});

	it('reject a bad success, verdict, aids, measures or plan', () => {
		const problem = (fields: Record<string, unknown>) => () => invalid(fields);
		expect(problem({ success: 'yes' })).toThrow(
			'Invalid attempts entry at index 0: success must be a boolean'
		);
		expect(problem({ correct: 'yes' })).toThrow(
			'Invalid attempts entry at index 0: correct must be a boolean or null'
		);
		expect(problem({ verdict: { relation: '', version: 1, value: 'perfect' } })).toThrow(
			'Invalid attempts entry at index 0: verdict must be { relation, version, value }'
		);
		expect(problem({ verdict: { relation: 'beat', version: 1, value: 'great' } })).toThrow(
			'Invalid attempts entry at index 0: verdict.value must be perfect, early, late, offbeat, corrected or wrong'
		);
		expect(problem({ aids: ['magic'] })).toThrow(
			'Invalid attempts entry at index 0: aids must be a list of show-position, string-aid, cursor, listen, play-along, aid-level'
		);
		expect(problem({ measures: null })).toThrow(
			'Invalid attempts entry at index 0: measures must be an object'
		);
		expect(problem({ plan: undefined })).toThrow(
			'Invalid attempts entry at index 0: plan is required (null without one)'
		);
	});
});

describe('with a version 2 file', () => {
	it('lands on version 8 with no observations and no latency', () => {
		const file = validateBackup(makeBackupV2());
		expect(file.version).toBe(8);
		expect(file.attempts.map((attempt) => attempt.observations)).toEqual([null]);
		expect(file.sessions.map((session) => session.latencyMs)).toEqual([null]);
	});

	it('is checked on its own by validateBackupV2, which does not ask for the new fields', () => {
		expect(() => validateBackupV2(makeBackupV2())).not.toThrow();
		expect(() => validateBackupV2(makeBackupV3())).toThrow('Unsupported backup version: 3');
		expect(() => validateBackupV3(makeBackupV2())).toThrow('Unsupported backup version: 2');
	});

	it('keeps the version 2 checks and their messages', () => {
		const v2 = makeBackupV2();
		expect(() => validateBackup({ ...v2, sessions: [{ id: '' }] })).toThrow(
			'Invalid sessions entry at index 0: id must be a non-empty string'
		);
	});
});

describe('validateBackupV8', () => {
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
		expect(validateBackupV8(file)).toBe(file);
	});

	it('refuses a file of another version', () => {
		expect(() => validateBackupV8({ ...makeBackup(), version: 2 })).toThrow(
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
		expect(() => validateBackupV8(withObservations(observations))).toThrow(
			`Invalid attempts entry at index 0: ${message}`
		);
	});

	it('rejects an attempt without the observations field', () => {
		const { observations: _dropped, ...attempt } = makeAttempt({ id: 1 });
		expect(() => validateBackupV8({ ...makeBackup(), attempts: [attempt] })).toThrow(
			'observations must be null or an array'
		);
	});

	it('rejects a latency that is not a number or null', () => {
		const sessions = [{ ...makeSession(), latencyMs: 'x' }];
		expect(() => validateBackupV8({ ...makeBackup(), sessions })).toThrow(
			'Invalid sessions entry at index 0: latencyMs must be a number or null'
		);
	});

	it('keeps the version 2 checks', () => {
		expect(() =>
			validateBackupV8({ ...makeBackup(), attempts: [{ ...makeAttempt({ id: 1 }), phase: 'x' }] })
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
		expect(validateBackupV8(file)).toBe(file);
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
		expect(validateBackupV8(file)).toBe(file);
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
		expect(() => validateBackupV8(file)).toThrow(/data.item does not match cardKey/);
	});
});

describe('the triads session and the contest of an attempt', () => {
	it('accepts a triads session and a contested attempt', () => {
		const file = makeBackup({
			attempts: [makeAttempt({ id: 1, contested: true }), makeAttempt({ id: 2 })],
			sessions: [
				makeSession({ kind: 'triads' }),
				makeSession({ id: 's-zone', kind: 'triads-zone' })
			]
		});
		expect(validateBackupV8(file)).toBe(file);
	});

	it('rejects a contest that is not a boolean', () => {
		const file = makeBackup({ attempts: [makeAttempt({ id: 1, contested: 'yes' as never })] });
		expect(() => validateBackupV8(file)).toThrow(/contested must be a boolean/);
	});

	it('accepts the reason of a contest, a string, and refuses another type', () => {
		const ok = makeBackup({
			attempts: [makeAttempt({ id: 1, contested: true, contestReason: 'regularity' })]
		});
		expect(validateBackupV8(ok).attempts[0].contestReason).toBe('regularity');
		const bad = makeBackup({
			attempts: [makeAttempt({ id: 1, contested: true, contestReason: 3 as never })]
		});
		expect(() => validateBackupV8(bad)).toThrow(/contestReason must be a string/);
	});
});

describe('the exercise session', () => {
	it('accepts an exercise session with its exercise', () => {
		const file = makeBackup({
			sessions: [makeSession({ kind: 'exercise', exerciseId: 'rhythm-offbeats' })]
		});
		expect(validateBackupV8(file)).toBe(file);
	});

	it('rejects an exercise session without a usable exercise id', () => {
		const withId = (exerciseId: unknown) =>
			makeBackup({ sessions: [{ ...makeSession({ kind: 'exercise' }), exerciseId } as never] });
		expect(() => validateBackupV8(withId(undefined))).toThrow(/exerciseId must be a non-empty/);
		expect(() => validateBackupV8(withId(''))).toThrow(/exerciseId must be a non-empty/);
		expect(() => validateBackupV8(withId(3))).toThrow(/exerciseId must be a non-empty/);
	});

	it('rejects an exercise id that is not a string on any session', () => {
		const file = makeBackup({
			sessions: [{ ...makeSession({ kind: 'learn' }), exerciseId: 3 } as never]
		});
		expect(() => validateBackupV8(file)).toThrow(/exerciseId must be a non-empty/);
	});
});

describe('the level held by an exercise session', () => {
	it('accepts a session that ended on a level, an aid level included', () => {
		const file = makeBackup({
			sessions: [
				makeSession({ kind: 'exercise', exerciseId: 'rhythm-offbeats', levelReached: 2 }),
				makeSession({ id: 's2', kind: 'exercise', exerciseId: 'rhythm-offbeats', levelReached: -1 })
			]
		});
		expect(validateBackupV8(file)).toBe(file);
	});

	it('rejects a level that is not a whole number', () => {
		const withLevel = (levelReached: unknown) =>
			makeBackup({
				sessions: [
					{
						...makeSession({ kind: 'exercise', exerciseId: 'rhythm-offbeats' }),
						levelReached
					} as never
				]
			});
		expect(() => validateBackupV8(withLevel('3'))).toThrow(/levelReached must be a whole number/);
		expect(() => validateBackupV8(withLevel(1.5))).toThrow(/levelReached must be a whole number/);
		expect(() => validateBackupV8(withLevel(null))).toThrow(/levelReached must be a whole number/);
	});
});

describe('with chord-grid attempts', () => {
	it('takes a gesture attempt through an export and an import, its whole change kept', () => {
		const item = {
			rule: 'climb',
			element: 'climb:iohefy-a:3,2,1',
			passageId: 's1:0',
			index: 2,
			changes: [
				{ at: 0, length: 4, symbol: 'Dm7' },
				{ at: 4, length: 4, symbol: 'G7' },
				{ at: 8, length: 4, symbol: 'Dm7' }
			],
			symbol: 'Dm7',
			chord: 'D|min',
			sets: [[3, 2, 1]],
			direction: 'up',
			previous: 'G|maj|3:1,2:3,1:5@12-12-10'
		};
		const attempt = makeAttempt({
			id: 1,
			exerciseId: 'gesture-climb',
			mechanic: 'chord-grid',
			cardKey: 'chord-grid:climb:iohefy-a:3,2,1#2',
			phase: 'free',
			temperature: 'hot',
			leadBeats: null,
			correct: false,
			success: false,
			verdict: { relation: 'grid-change', version: 1, value: 'wrong' },
			data: {
				item,
				answer: { decided: 'D|min|3:5,2:1,1:b3@7-6-5' },
				confusion: { kind: 'not-higher', part: 'chord' }
			}
		});
		const exported = JSON.parse(JSON.stringify(makeBackup({ attempts: [attempt] })));
		expect(validateBackupV8(exported)).toEqual(exported);
		expect(exported.attempts[0].data.item).toEqual(item);
	});

	it('accepts a gesture session', () => {
		const file = makeBackup({ sessions: [makeSession({ kind: 'gesture' })] });
		expect(validateBackupV8(file)).toBe(file);
	});

	it('names every confusion of a chord change', () => {
		const kinds = [
			'other-chord',
			'other-set',
			'other-shape',
			'not-higher',
			'not-lower',
			'out-of-zone'
		];
		const attempts = kinds.map((kind, i) =>
			makeAttempt({
				id: i + 1,
				exerciseId: 'gesture-jam',
				mechanic: 'chord-grid',
				cardKey: 'chord-grid:jam:blues-f#0',
				data: {
					item: { element: 'jam:blues-f', index: 0 },
					answer: null,
					confusion: { kind, part: 'chord' }
				}
			})
		);
		const file = makeBackup({ attempts });
		expect(validateBackupV8(file)).toBe(file);
	});
});

describe('scopes', () => {
	it('accepts a scope on the progressions and the attempt tempo scope of a version 6 file', () => {
		const file = makeBackupV6({
			progressions: [
				makeProgressionV6(),
				makeProgressionV6({ exerciseId: 'gesture-climb', mechanic: 'chord-grid', scope: 'blues-f' })
			],
			attempts: [{ ...makeAttempt({ id: 1 }), tempoScope: 'blues-f' }]
		});
		expect(validateBackupV6(file)).toBe(file);
	});

	it('accepts a scope on executions and attempts', () => {
		const file = makeBackup({
			sessions: [
				makeSession({
					kind: 'gesture',
					executions: [{ exerciseId: 'gesture-climb', scope: 'blues-f', tempoBpm: 80 }]
				})
			],
			attempts: [makeAttempt({ id: 1, scope: 'blues-f' })]
		});
		expect(validateBackupV8(file)).toBe(file);
	});

	it('refuses an empty scope', () => {
		expect(() =>
			validateBackupV6(makeBackupV6({ progressions: [makeProgressionV6({ scope: '' })] }))
		).toThrow(/scope/);
		expect(() =>
			validateBackupV6(makeBackupV6({ attempts: [{ ...makeAttempt({ id: 1 }), tempoScope: '' }] }))
		).toThrow(/tempoScope/);
		expect(() =>
			validateBackupV8(
				makeBackup({
					sessions: [makeSession({ executions: [{ exerciseId: 'x', scope: '', tempoBpm: 80 }] })]
				})
			)
		).toThrow(/scope/);
		expect(() =>
			validateBackupV8(makeBackup({ attempts: [makeAttempt({ id: 1, scope: '' })] }))
		).toThrow(/scope/);
	});
});

describe('with a version 3 file', () => {
	it('is checked on its own by validateBackupV3, and returned unchanged', () => {
		const v3 = makeBackupV3();
		expect(validateBackupV3(v3)).toBe(v3);
		expect(() => validateBackupV3(makeBackup())).toThrow('Unsupported backup version: 8');
		expect(() => validateBackupV8(v3)).toThrow('Unsupported backup version: 3');
		expect(() => validateBackupV5(v3)).toThrow('Unsupported backup version: 3');
	});

	it('lands on version 8: the offset as the played latency of notes and chords, a level per neck card', () => {
		const v3 = makeBackupV3();
		const file = validateBackup({
			...v3,
			settings: { ...(v3.settings as object), calibrationOffsetMs: 30 }
		});
		expect(file.version).toBe(8);
		expect(file.settings).toEqual({
			...DEFAULT_SETTINGS,
			latency: {
				note: { ms: 30, provenance: 'player' },
				chord: { ms: 30, provenance: 'player' }
			}
		});
		expectNeckLevelStates(file);
	});

	it('keeps the version 3 settings checks', () => {
		const v3 = makeBackupV3();
		expect(() =>
			validateBackup({ ...v3, settings: { ...(v3.settings as object), calibrationOffsetMs: 'x' } })
		).toThrow('Invalid backup settings: calibrationOffsetMs must be a number or null');
	});
});

describe('version 4 settings and level states', () => {
	const withSettings = (fields: Record<string, unknown>) =>
		validateBackupV8({ ...makeBackup(), settings: { ...DEFAULT_SETTINGS, ...fields } });

	it('accept a latency per sensor of either provenance, and the click bleed', () => {
		expect(() =>
			withSettings({
				latency: {
					attack: { ms: 12, provenance: 'system' },
					note: { ms: 40.5, provenance: 'player' }
				},
				clickBleed: true
			})
		).not.toThrow();
	});

	it('reject a bad latency, a missing click bleed, or the old offset', () => {
		expect(() => withSettings({ latency: null })).toThrow(
			'Invalid backup settings: latency must be an object'
		);
		expect(() => withSettings({ latency: { note: { ms: 'x', provenance: 'player' } } })).toThrow(
			'Invalid backup settings: latency.note must be { ms, provenance: "system" or "player" }'
		);
		expect(() => withSettings({ latency: { note: { ms: 3, provenance: 'guess' } } })).toThrow(
			'latency.note must be'
		);
		expect(() => withSettings({ clickBleed: undefined })).toThrow(
			'Invalid backup settings: clickBleed must be true or false'
		);
		expect(() => withSettings({ calibrationOffsetMs: 12 })).toThrow(
			'Invalid backup settings: calibrationOffsetMs is replaced by latency'
		);
	});

	it('accept level states with or without scope and item, aid levels included', () => {
		const file = makeBackup({
			levelStates: [
				makeLevelState(),
				makeLevelState({ scope: 'iohefy-a', item: 'locate:2:F', level: -1, resumeAfter: 5 })
			]
		});
		expect(validateBackupV8(file)).toBe(file);
	});

	it('reject a missing table or a bad level state, and name its index', () => {
		const { levelStates: _dropped, ...withoutTable } = makeBackup();
		expect(() => validateBackupV8(withoutTable)).toThrow(
			'Backup field "levelStates" must be an array'
		);
		const bad = (fields: Record<string, unknown>) => () =>
			validateBackupV8({ ...makeBackup(), levelStates: [{ ...makeLevelState(), ...fields }] });
		expect(bad({ exerciseId: '' })).toThrow(
			'Invalid levelStates entry at index 0: exerciseId must be a non-empty string'
		);
		expect(bad({ scope: undefined })).toThrow('scope must be a string (empty without one)');
		expect(bad({ item: null })).toThrow('item must be a string (empty without one)');
		expect(bad({ level: 1.5 })).toThrow('level must be an integer');
		expect(bad({ successes: -1 })).toThrow('successes must be a whole number');
		expect(bad({ failures: 'x' })).toThrow('failures must be a whole number');
		expect(bad({ resumeAfter: 'later' })).toThrow('resumeAfter must be a number or null');
	});
});

describe('the chain of backups to version 8', () => {
	const neck = (overrides = {}) => makeCardV5({ leadBeats: 4, ...overrides });
	const KEY = 'D|maj|3:5,2:1,1:3';
	const anchor = (leadBeats: number) =>
		makeCardV5({
			key: `triad-anchor:${KEY}`,
			mechanic: 'triad-anchor',
			item: { voicingKey: KEY },
			leadBeats
		});
	const anchorLevel = (level: number) => ({
		exerciseId: 'triads-anchor',
		scope: '',
		item: KEY,
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	});
	const locateLevel = {
		exerciseId: 'locate-neck',
		scope: '',
		item: '2:F',
		level: 1,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
	const withoutLead = (card: Record<string, unknown>) => {
		const { leadBeats: _lead, ...rest } = card;
		return rest;
	};

	it('accepts a valid version 8 file as it is', () => {
		const file = makeBackup({ cards: [makeCard()], levelStates: [makeLevelState()] });
		expect(validateBackup(file)).toBe(file);
		expect(validateBackupV8(file)).toBe(file);
	});

	it('refuses a version 8 card that still carries a lead', () => {
		expect(() => validateBackup(makeBackup({ cards: [neck() as never] }))).toThrow(
			'Invalid cards entry at index 0: leadBeats is gone, a card has no lead (its level is a level state)'
		);
	});

	it('passes a version 5 file through backupV5ToV6 then backupV6ToV7, backupV7ToV8: each triad card gets its level, no card keeps a lead', () => {
		const v5 = makeBackupV5({
			cards: [neck(), anchor(4)],
			levelStates: [makeLevelState(), locateLevel]
		});
		const file = validateBackup(v5);
		expect(file.version).toBe(8);
		expect(file.cards).toEqual([withoutLead(neck()), withoutLead(anchor(4))]);
		expect(file.levelStates).toEqual([makeLevelState(), locateLevel, anchorLevel(1)]);
		expect(validateBackupV5(v5)).toBe(v5);
	});

	it('passes a version 4 file through backupV4ToV5, backupV5ToV6 then backupV6ToV7, backupV7ToV8', () => {
		const file = validateBackup(
			makeBackupV4({ cards: [neck(), anchor(2)], levelStates: [makeLevelState()] })
		);
		expect(file.version).toBe(8);
		expect(file.cards).toEqual([withoutLead(neck()), withoutLead(anchor(2))]);
		expect(file.levelStates).toEqual([makeLevelState(), locateLevel, anchorLevel(2)]);
	});

	it('passes a version 3 file through backupV3ToV4, backupV4ToV5, backupV5ToV6 then backupV6ToV7, backupV7ToV8', () => {
		const file = validateBackup(makeBackupV3({ cards: [neck(), anchor(1)] }));
		expect(file.version).toBe(8);
		expect(
			file.levelStates.map((state) => `${state.exerciseId}/${state.item}/${state.level}`)
		).toEqual(['locate-neck/2:F/1', `triads-anchor/${KEY}/2`]);
		expect(file.cards.some((card) => Object.hasOwn(card, 'leadBeats'))).toBe(false);
	});

	it('refuses a version 4 or 5 file that is not valid as one', () => {
		expect(() => validateBackup(makeBackupV4({ cards: 'x' }))).toThrow(/cards/);
		expect(() => validateBackup(makeBackupV5({ cards: [makeCard()] }))).toThrow(
			'Invalid cards entry at index 0: leadBeats must be 8, 4, 2 or 1'
		);
	});
});

describe('version 7', () => {
	it('refuses a backup 7 with progressions', () => {
		expect(() => validateBackup({ ...makeBackup(), progressions: [makeProgressionV6()] })).toThrow(
			'Backup field "progressions" is gone: a tempo is an exercise level'
		);
		expect(() => validateBackup({ ...makeBackup(), progressions: [] })).toThrow(/progressions/);
	});

	it('refuses a backup 7 attempt with tempoScope', () => {
		expect(() =>
			validateBackup(
				makeBackup({ attempts: [{ ...makeAttempt({ id: 1 }), tempoScope: 'blues-f' } as never] })
			)
		).toThrow('Invalid attempts entry at index 0: tempoScope is renamed scope');
		expect(() =>
			validateBackup(makeBackup({ attempts: [makeAttempt({ id: 1, scope: '' })] }))
		).toThrow('Invalid attempts entry at index 0: scope must be a non-empty string');
		const scoped = makeBackup({ attempts: [makeAttempt({ id: 1, scope: 'blues-f' })] });
		expect(validateBackup(scoped)).toBe(scoped);
	});

	it('imports a backup 6 to the same base as the upgrade', () => {
		const jam = makeLevelState({ exerciseId: 'gesture-jam', scope: 'iohefy-a', level: 2 });
		const v6 = makeBackupV6({
			progressions: [
				makeProgressionV6({
					exerciseId: 'gesture-climb',
					mechanic: 'chord-grid',
					scope: 'blues-f',
					tempoBpm: 112.5
				}),
				makeProgressionV6({ exerciseId: 'gesture-link', mechanic: 'chord-grid', tempoBpm: 95 }),
				makeProgressionV6({ tempoBpm: 120 }),
				makeProgressionV6({ exerciseId: 'gesture-zone', mechanic: 'chord-grid', tempoBpm: 100 }),
				makeProgressionV6({
					exerciseId: 'gesture-jam',
					mechanic: 'chord-grid',
					scope: 'iohefy-a',
					tempoBpm: 120
				})
			],
			attempts: [{ ...makeAttempt({ id: 1 }), tempoScope: 'blues-f' }, makeAttempt({ id: 2 })],
			levelStates: [jam]
		});
		const file = validateBackup(v6);
		expect(file.version).toBe(8);
		expect(Object.hasOwn(file, 'progressions')).toBe(false);
		expect(file.levelStates).toEqual([
			jam,
			makeLevelState({ exerciseId: 'gesture-climb', scope: 'blues-f', level: 6, successes: 0 }),
			makeLevelState({ exerciseId: 'gesture-link', level: 3, successes: 0 })
		]);
		expect(file.attempts).toEqual([
			makeAttempt({ id: 1, scope: 'blues-f' }),
			makeAttempt({ id: 2 })
		]);
		expect(validateBackupV6(v6)).toBe(v6);
	});
});

describe('version 8', () => {
	it('imports a version 7 file through v12: its rhythm attempts of the figure mechanic, with their round plan', () => {
		const rhythm = makeCycleAttemptV11({ id: 2 });
		const v7 = makeBackupV7({ attempts: [makeAttempt({ id: 1 }), rhythm] });
		expect(validateBackupV7(v7)).toBe(v7);
		const file = validateBackup(v7);
		expect(file.version).toBe(8);
		expect(file.attempts).toEqual([makeAttempt({ id: 1 }), attemptToV12(rhythm)]);
		expect(file.attempts[1]).toMatchObject({ mechanic: 'figure', cardKey: 'figure:offbeats-2@2' });
		expect(validateBackupV8(file)).toBe(file);
	});

	it('refuses the version-11 rhythm mechanic in a version 8 file', () => {
		const rhythm = attemptToV12(makeCycleAttemptV11({ id: 1 })) as Record<string, unknown>;
		const file = makeBackup({
			attempts: [{ ...rhythm, mechanic: RHYTHM_FIGURE_MECHANIC_V11 } as never]
		});
		expect(() => validateBackup(file)).toThrow(
			`Invalid attempts entry at index 0: mechanic ${RHYTHM_FIGURE_MECHANIC_V11} is renamed figure`
		);
		expect(validateBackup(makeBackup({ attempts: [rhythm as never] })).attempts).toEqual([rhythm]);
	});

	it('refuses a cycle plan in a version 8 file', () => {
		const rhythm = attemptToV12(makeCycleAttemptV11({ id: 1 })) as Record<string, unknown>;
		const file = makeBackup({
			attempts: [{ ...rhythm, plan: makeCycleAttemptV11().plan } as never]
		});
		expect(() => validateBackup(file)).toThrow(
			'Invalid attempts entry at index 0: plan holds a cycle plan (cycleBars), kept as a round plan from version 8'
		);
	});

	it('refuses figure in a version 7 file, where the rhythm had its version-11 mechanic', () => {
		const rhythm = attemptToV12(makeCycleAttemptV11({ id: 1 }));
		expect(() => validateBackupV7(makeBackupV7({ attempts: [rhythm] }))).toThrow(
			/Invalid attempts entry at index 0: mechanic must be one of/
		);
	});
});
