import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: '404.html' })
		})
	],
	test: {
		expect: { requireAssertions: true },
		// A shared CI runner takes several times longer than a developer's machine for the same
		// work (5.3 s there for a test of 1.7 s here): a test gets more time on it before it is
		// called timed out. The limits tests hold on measured time are widened likewise
		// (`wallClockMs`, `src/lib/testing/wallClock.ts`).
		testTimeout: process.env.CI ? 30_000 : 5_000,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.spec.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['src/lib/testing/setup.ts']
				}
			},
			{
				extends: './vite.config.ts',
				resolve: { conditions: ['browser'] },
				test: {
					name: 'client',
					environment: 'jsdom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['src/lib/testing/setup.ts']
				}
			}
		]
	}
});
