import { describe, expect, it } from 'vitest';
import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationPort } from '$lib/application/ports';
import { NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { createAppServices } from '$lib/application/services/createAppServices';
import { TRIADS_ANCHOR } from '$lib/domain/exercise';
import { rootPosition } from '$lib/domain/mechanics';
import { acceptableMidis, parseVoicingKey, voicingKey } from '$lib/domain/music';
import {
	occurrenceOfId,
	occurrencePosition,
	triadIntroductionOrder,
	triadParams
} from '$lib/domain/triads';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnostics,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import type { PlaySessionController } from './contract';
import { chordSensor, noteSensor, tapSensor } from './sensors';
import type { SessionDeps } from './SessionDeps';

const C = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).map(voicingKey)[0];
const DAY_S = 24 * 60 * 60;

function harness() {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const chords = new FakeChordVerifier();
	let ids = 0;
	const deps: SessionDeps = {
		clock,
		metronome,
		detector,
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		progressions: new InMemoryProgressionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => `session-${++ids}`,
		mechanics: { ...NECK_PRESENTERS, ...TRIAD_PRESENTERS },
		sensors: { note: noteSensor(detector), tap: tapSensor(), chord: chordSensor(chords) }
	};
	const services: AppServices = createAppServices({
		...deps,
		backup: {} as BackupPort,
		calibration: {} as CalibrationPort,
		diagnostics: new FakeDiagnostics()
	});
	return { services, deps, clock, metronome, detector, chords };
}

type Harness = ReturnType<typeof harness>;

async function drain() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

interface Played {
	mechanic: string;
	voicingKey: string;
	position?: number | 'open';
	phase: string;
	expected: readonly string[];
}

/**
 * Plays a triads series beat by beat: each prompt is answered right (the root on beat 1, the
 * chord on beat 3 for an anchor; the chord on the target for a zone), except those `skip` says.
 * Stops when `done` holds, then quits.
 */
async function playSeries(
	h: Harness,
	controller: PlaySessionController,
	skip: (played: Played, index: number) => boolean,
	done: (played: Played[]) => Promise<boolean>
): Promise<Played[]> {
	await controller.start();
	const played: Played[] = [];
	let answered: number | null = null;
	for (let guard = 0; guard < 5000; guard++) {
		const { status, promptBeatIndex, targetBeatIndex } = controller.view;
		if (status === 'finished') break;
		if (status === 'awaiting' && targetBeatIndex !== null && promptBeatIndex !== answered) {
			answered = promptBeatIndex;
			const expectation = h.chords.expectations.at(-1);
			const current = (await currentPrompt(h, controller)) as Played;
			const entry = { ...current, expected: expectation?.expected ?? [] };
			played.push(entry);
			if (!skip(entry, played.length - 1)) answer(h, entry, targetBeatIndex);
			await drain();
			if (await done(played)) break;
		}
		h.clock.advance(0.1);
		h.metronome.flush();
		await drain();
	}
	controller.quit();
	await drain();
	return played;
}

/**
 * The prompt being played, as the screen and the chord sensor see it: the screen names a root
 * string (anchor) or a position (zone); the chord expectation names the voicing.
 */
async function currentPrompt(h: Harness, controller: PlaySessionController) {
	const expected = h.chords.expectations.at(-1)?.expected ?? [];
	const [key] = (expected[0] ?? '').split('@');
	const secondary = controller.view.prompt?.secondary ?? '';
	const zone = secondary.startsWith('position') || secondary === 'à vide';
	const position = secondary === 'à vide' ? 'open' : Number(secondary.replace('position ', ''));
	return {
		mechanic: zone ? 'triad-zone' : 'triad-anchor',
		voicingKey: key,
		position: zone ? position : undefined,
		phase: controller.view.prompt?.aid ? 'aided' : 'unaided'
	};
}

function answer(h: Harness, played: Played, target: number) {
	const voicing = parseVoicingKey(played.voicingKey);
	const decided = played.expected[0];
	if (played.mechanic === 'triad-anchor') {
		const midi = acceptableMidis(rootPosition(voicing))[0];
		h.detector.emitNote({ time: h.metronome.beatTime(target), midi, frequencyHz: 0, clarity: 0.9 });
		h.chords.emit({
			time: h.metronome.beatTime(target + 2),
			windowMs: 250,
			decided,
			final: true,
			variants: []
		});
	} else {
		h.chords.emit({
			time: h.metronome.beatTime(target),
			windowMs: 250,
			decided,
			final: true,
			variants: []
		});
	}
}

async function cardOf(h: Harness, mechanic: string, key: string) {
	return h.deps.cards.get(`${mechanic}:${key}`);
}

describe('a triads session, from the probe to the position', () => {
	it('learns C in anchor, acquires it cold, then asks it in a position', async () => {
		const h = harness();

		// First session: C's probe is missed; its aided presentation follows, then its ladder.
		const first = await playSeries(
			h,
			await h.services.startSession('triads'),
			(played, index) => index === 0,
			async () => (await cardOf(h, 'triad-anchor', C))?.learnedAt != null
		);
		expect(first[0]).toMatchObject({ mechanic: 'triad-anchor', voicingKey: C, phase: 'unaided' });
		const cPrompts = first.filter((p) => p.voicingKey === C && p.mechanic === 'triad-anchor');
		expect(cPrompts[1]).toMatchObject({ phase: 'aided' });
		expect(cPrompts.length).toBeGreaterThanOrEqual(5);
		const learned = await cardOf(h, 'triad-anchor', C);
		expect(learned?.learnedAt).not.toBeNull();
		expect(learned?.acquiredAt).toBeNull();
		expect(first.some((p) => p.mechanic === 'triad-zone' && p.voicingKey === C)).toBe(false);

		// A later session, past the cold delay: C is reviewed cold, acquired, then asked in a position.
		h.clock.advance(3 * DAY_S);
		const second = await playSeries(
			h,
			await h.services.startSession('triads'),
			() => false,
			async (played) => played.at(-1)?.mechanic === 'triad-zone' && played.at(-1)?.voicingKey === C
		);
		const review = second.find((p) => p.voicingKey === C && p.mechanic === 'triad-anchor');
		expect(review).toBeDefined();
		expect((await cardOf(h, 'triad-anchor', C))?.acquiredAt).not.toBeNull();
		const zone = second.at(-1)!;
		expect(zone).toMatchObject({ mechanic: 'triad-zone', voicingKey: C });
		// The sensor listens for the shape at the position asked, and that shape only.
		expect(zone.expected).toHaveLength(1);
		const shape = occurrenceOfId(zone.expected[0]);
		expect(shape && voicingKey(shape.voicing)).toBe(C);
		expect(shape && occurrencePosition(shape)).toBe(zone.position);
		const attempts = await h.deps.attempts.all();
		const cold = attempts.find(
			(a) => a.cardKey === `triad-anchor:${C}` && a.phase === 'review' && a.temperature === 'cold'
		);
		expect(cold?.correct).toBe(true);
	});
});
