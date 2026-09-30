import { describe, expect, it } from 'vitest';
import { makeAttempt, makeBackup, makeCard, makeSession } from './testing/fixtures';
import { validateBackup } from './validateBackup';

describe('validateBackup', () => {
	it('returns a valid backup unchanged', () => {
		const file = makeBackup();
		expect(validateBackup(file)).toBe(file);
	});

	it('accepts a backup read back from JSON', () => {
		const file = makeBackup();
		expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
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
		expect(() => validateBackup({ ...makeBackup(), version: 2 })).toThrow(
			'Unsupported backup version: 2'
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
		expect(() => validateBackup({ ...file, settings: { ...file.settings, tempoBpm: 0 } })).toThrow(
			'Invalid backup settings: tempoBpm must be a positive number'
		);
		const { builtInInputGain: _gain, ...withoutGain } = file.settings;
		expect(() => validateBackup({ ...file, settings: withoutGain })).not.toThrow();
		expect(() =>
			validateBackup({ ...file, settings: { ...file.settings, builtInInputGain: 32 } })
		).toThrow('Invalid backup settings: builtInInputGain must be a number from 1 to 16');
	});

	it('rejects a table that is not an array', () => {
		expect(() => validateBackup({ ...makeBackup(), cards: {} })).toThrow(
			'Backup field "cards" must be an array'
		);
		expect(() => validateBackup({ ...makeBackup(), sessions: undefined })).toThrow(
			'Backup field "sessions" must be an array'
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

	it('rejects a card whose key is invalid or does not match its target', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [{ ...makeCard(), key: 'locate:7:F' }] })
		).toThrow('Invalid cards entry at index 0: key is not a valid card key');
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [{ ...makeCard(), key: 'locate:3:F' }] })
		).toThrow('Invalid cards entry at index 0: target does not match key');
	});

	it('rejects an invalid attempt', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), verdict: 'great' }] })
		).toThrow('Invalid attempts entry at index 0: verdict must be perfect, early, late or wrong');
		expect(() => validateBackup(makeBackup({ attempts: [makeAttempt({ id: 0 })] }))).toThrow(
			'Invalid attempts entry at index 0: id must be a positive integer'
		);
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), cardKey: 'locate:2:G' }] })
		).toThrow('Invalid attempts entry at index 0: target does not match cardKey');
	});

	it('rejects an invalid session', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), kind: 'weekly' }] })
		).toThrow('Invalid sessions entry at index 0: kind must be placement, daily or free');
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), fatigueDetected: 'no' }] })
		).toThrow('Invalid sessions entry at index 0: fatigueDetected must be a boolean');
	});
});
