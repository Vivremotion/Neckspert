import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PlayScreen from './PlayScreen.svelte';
import { DemoPlaySession, ManualDemoClock } from './demo/DemoPlaySession.svelte';

describe('PlayScreen', () => {
	it('renders the prompt and unlabeled past tiles', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		clock.setBeat(12.25);
		demo.tick();
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getAllByText('F').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de B/i)).toBeTruthy();
	});

	it('shows a start control while idle', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('button', { name: /commencer/i })).toBeTruthy();
	});
});
