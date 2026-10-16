import { describe, expect, it } from 'vitest';
import { FakeClock, FakeSoundScheduler } from './fakes';

function setup() {
	const clock = new FakeClock();
	return { clock, scheduler: new FakeSoundScheduler(clock) };
}

describe('FakeSoundScheduler', () => {
	it('logs what is played, in the order it was asked', () => {
		const { scheduler } = setup();
		scheduler.play(2, 'click');
		scheduler.play(1, 'click-accent');
		expect(scheduler.emitted()).toEqual([
			{ time: 2, sound: 'click' },
			{ time: 1, sound: 'click-accent' }
		]);
	});

	it('drops a sound whose time is past, like the real scheduler', () => {
		const { clock, scheduler } = setup();
		clock.time = 5;
		scheduler.play(4, 'click');
		scheduler.play(5, 'demo');
		expect(scheduler.emitted()).toEqual([{ time: 5, sound: 'demo' }]);
	});

	it('wakes up in time order on flush, never before the clock reaches the time', () => {
		const { clock, scheduler } = setup();
		const woken: string[] = [];
		scheduler.at(3, () => woken.push('c'));
		scheduler.at(1, () => woken.push('a'));
		scheduler.at(2, () => woken.push('b'));
		clock.time = 0.5;
		scheduler.flush();
		expect(woken).toEqual([]);
		clock.time = 2;
		scheduler.flush();
		expect(woken).toEqual(['a', 'b']);
		clock.time = 3;
		scheduler.flush();
		expect(woken).toEqual(['a', 'b', 'c']);
	});

	it('runs a wake-up once, and lets its cancel function withdraw it', () => {
		const { clock, scheduler } = setup();
		const woken: string[] = [];
		scheduler.at(1, () => woken.push('kept'));
		const cancel = scheduler.at(1, () => woken.push('cancelled'));
		cancel();
		clock.time = 1;
		scheduler.flush();
		scheduler.flush();
		expect(woken).toEqual(['kept']);
	});

	it('empties the wake-ups and the journal on cancelAll', () => {
		const { clock, scheduler } = setup();
		const woken: string[] = [];
		scheduler.play(1, 'click');
		scheduler.at(1, () => woken.push('x'));
		scheduler.cancelAll();
		clock.time = 2;
		scheduler.flush();
		expect(woken).toEqual([]);
		expect(scheduler.emitted()).toEqual([]);
	});
});
