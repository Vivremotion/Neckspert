import { describe, expect, it } from 'vitest';
import { verdictTone } from './verdictTone';

describe('verdictTone', () => {
	it('calls perfect a hit', () => expect(verdictTone('perfect')).toBe('hit'));
	it('calls early a hit', () => expect(verdictTone('early')).toBe('hit'));
	it('calls late a hit', () => expect(verdictTone('late')).toBe('hit'));
	it('calls offbeat partial', () => expect(verdictTone('offbeat')).toBe('partial'));
	it('calls corrected a miss', () => expect(verdictTone('corrected')).toBe('miss'));
	it('calls wrong a miss', () => expect(verdictTone('wrong')).toBe('miss'));
});
