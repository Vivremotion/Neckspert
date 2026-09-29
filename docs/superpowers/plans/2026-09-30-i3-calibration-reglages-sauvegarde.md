# I3 — Calibration, réglages, sauvegarde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'écran de calibration (entrée, niveau, run, enregistrement de l'offset) et l'écran de réglages (langue, tempo 60..140, entrée, lien calibration, export/import avec confirmation), en composants de présentation plus routes minces et pages de démonstration, dans l'univers Game Boy Bonfire.

**Architecture:** Chaque écran a un composant de présentation sous `src/lib/ui/screens/…` alimenté par props, une route mince sous `src/routes/…` qui lit `useAppServices()`, et une page `src/routes/dev/…` avec des données de démonstration. Les tests de composants construisent un faux `AppServices` à partir des doublures de P0 (`FakeNoteDetector`, `InMemorySettingsRepository`) plus des doublures locales `FakeCalibration` et `FakeBackup`. La logique pure (bornes de tempo, détection du micro intégré) vit dans des modules Node testés. L'univers visuel est celui de H : surfaces entières dans un monde établi (Impeccable `reference/new-work.md` §3), sans réécriture de `DESIGN.md`.

**Tech Stack:** Svelte 5 (runes), SvelteKit, TypeScript, Vitest (`*.spec.ts` Node, `*.svelte.spec.ts` jsdom), `@testing-library/svelte`, CSS natif, primitives H (`PixelBox`, `PixelButton`, `PixelText`), Impeccable (`context`, `concept-seed --scope surface`, `detect`).

## Global Constraints

- Svelte 5, runes uniquement : `$state`, `$derived`, `$effect`, `$props`. Pas de stores Svelte 4 (`writable`), pas de `export let`.
- SvelteKit en site statique : adapter-static avec `fallback: 'index.html'`, `ssr = false` dans `src/routes/+layout.ts`.
- Toute la temporisation audio est calée sur `AudioContext.currentTime` (secondes). Jamais `setInterval`, jamais `performance.now()` pour mesurer un temps musical. Les horodatages de stockage sont en millisecondes epoch (`Date.now()` ou `AudioClockPort.toEpochMs`).
- CSS natif avec variables ; pas de bibliothèque de composants ni de Tailwind.
- Tests Vitest : fichiers `*.spec.ts` (Node) ; tests de composants dans `*.svelte.spec.ts` (jsdom).
- Noms de notes toujours en lettres (C, D, E…), dièses canoniques en interne (`C#`), bémols seulement à l'affichage.
- Interface bilingue français et anglais ; français par défaut.
- Données uniquement en local (IndexedDB), sans compte.
- Prettier : tabulations, guillemets simples, pas de virgule finale, largeur 100 (configuration générée par `sv`).
- Node : version de `.nvmrc` (22.23.3).

### Contraintes propres à ce plan

- **Chemins possédés** (README, ligne I3) : `src/routes/calibration/**`, `src/routes/settings/**`, `src/lib/ui/screens/calibration/**`, `src/lib/ui/screens/settings/**`, `src/routes/dev/calibration/**`, `src/routes/dev/settings/**`, plus les briefs, maquettes et captures de ces deux écrans sous `.impeccable/surfaces/`, `.impeccable/mocks/` et `.impeccable/review/`, dans des fichiers nommés `calibration` ou `settings`. Rien d'autre : ni `package.json`, ni `DESIGN.md`, ni le brief de session, ni `comp-4-full-bleed-lane.png`, ni primitive de H, ni infrastructure audio ou stockage. Ne pas lancer `build-phase` en même temps qu'un autre plan.
- **Vague 2** : la branche `plan/i3-calibration-reglages-sauvegarde` part de `main` après la fusion de la vague 1. Ce plan consomme, exactement comme le README les signe :
  - **H** : `PixelBox.svelte ({ variant: 'plain' | 'double' | 'inverted'; children })`, `PixelButton.svelte ({ onclick; disabled?; size?: 'large' | 'huge'; children })`, `PixelText.svelte ({ as?: string; scale?: 1 | 2 | 3 | 4 | 8; children })`, `tokens.css`.
  - **D** : `downloadBackup(file: BackupFile): void`, `readBackupFile(file: File): Promise<unknown>`, `validateBackup(file: unknown): BackupFile` depuis `$lib/infrastructure/storage`.
  - **G** : `CalibrationPort` tel que signé (`run(onProgress): Promise<CalibrationOutcome>`, `cancel(): void`) ; `CalibrationProgress`, `CalibrationOutcome`.
  - **P0** : `AppServices`, `provideAppServices`, `useAppServices`, `Settings`, `DEFAULT_SETTINGS`, `Locale`, `BackupFile`, `AudioInputDevice`, `NoteDetectorPort`, `i18n`, `defineMessages`, doublures `FakeNoteDetector`, `InMemorySettingsRepository`.
- **Tempo UI** : stepper borné à `MIN_TEMPO_BPM = 60` et `MAX_TEMPO_BPM = 140` (bornes utilisateur du README ; distinctes des bornes techniques du métronome 20..300).
- **Entrée audio** : I3 appelle `detector.start(deviceId)` / `detector.stop()` / `detector.onLevel` / `detector.listInputs()`. L'ouverture réelle avec `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` appartient au détecteur (F) ; I3 ne touche pas `getUserMedia`.
- **Casque** : quand l'entrée choisie est le micro intégré (`isBuiltInInput`), l'écran de calibration affiche la recommandation de porter un casque.
- **Calibration** : le niveau démarre sur un geste utilisateur et s'arrête à la sortie de la page ; les instructions disent de jouer une corde étouffée à chaque clic ; la progression montre `hits` / `needed` ; les issues sont `ok` / `no-sound` / `inconsistent` / `cancelled` ; en succès on enregistre `calibrationOffsetMs` et `inputDeviceId` ; un bouton réessaie.
- **Réglages** : langue FR/EN appliquée immédiatement à `settings.update({ locale })` et à `i18n.locale` ; tempo stepper ; entrée ; lien vers `/calibration` ; export `downloadBackup(await backup.exportAll())` ; import `validateBackup` puis confirmation (« les données actuelles seront remplacées ») puis `backup.importAll(await readBackupFile(file))` ; erreur lisible (traduite) si le fichier est invalide. Grands contrôles, opérables au clavier.
- **Tests** : P0 n'installe ni `@testing-library/jest-dom` ni `@testing-library/user-event`, et la configuration n'active ni les globales Vitest ni le plugin `svelteTesting`. Les tests utilisent `fireEvent`, lisent les propriétés du DOM et appellent `cleanup()` dans `afterEach`. Chaque test contient au moins une assertion (`requireAssertions: true`).
- **Univers** : surface entière dans un monde établi (`reference/new-work.md` §3 « Create a whole surface inside an established world ») : `concept-seed --scope surface --mode operate` par écran, construction dans les fichiers possédés, une ronde d'inspection bureau et téléphone, puis une passe `detect` finale. Pas de modification de `DESIGN.md`. Les briefs et comps de la calibration et des réglages sont commités, dans des fichiers à leur nom.
- **Craft floor** : lire `~/.cursor/skills/impeccable/reference/craft-floor.md` juste avant chaque tâche Impeccable qui édite l'UI.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/ui/screens/calibration/isBuiltInInput.ts` | Heuristique « micro intégré » sur le libellé |
| `src/lib/ui/screens/calibration/isBuiltInInput.spec.ts` | Tests Node |
| `src/lib/ui/screens/calibration/fakeServices.ts` | `FakeCalibration`, `FakeBackup`, `createFakeAppServices` |
| `src/lib/ui/screens/calibration/fakeServices.spec.ts` | Tests Node des doublures |
| `src/lib/ui/screens/calibration/messages.ts` | Messages FR/EN de la calibration |
| `src/lib/ui/screens/calibration/CalibrationScreen.svelte` | Présentation : entrée, niveau, instructions, progrès, issues, retry |
| `src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts` | Tests jsdom |
| `src/routes/calibration/+page.svelte` | Route mince : services, mètre, run, enregistrement |
| `src/routes/calibration/page.svelte.spec.ts` | Tests jsdom de la route (doublures) |
| `src/routes/dev/calibration/+page.svelte` | Démonstration visuelle sans audio réel |
| `src/lib/ui/screens/settings/tempo.ts` | `MIN_TEMPO_BPM`, `MAX_TEMPO_BPM`, `clampTempo` |
| `src/lib/ui/screens/settings/tempo.spec.ts` | Tests Node |
| `src/lib/ui/screens/settings/messages.ts` | Messages FR/EN des réglages |
| `src/lib/ui/screens/settings/SettingsScreen.svelte` | Présentation : langue, tempo, entrée, lien, export/import |
| `src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts` | Tests jsdom |
| `src/routes/settings/+page.svelte` | Route mince : services, export/import |
| `src/routes/settings/page.svelte.spec.ts` | Tests jsdom de la route |
| `src/routes/dev/settings/+page.svelte` | Démonstration visuelle |

---

### Task 1: Aides pures et faux `AppServices`

**Files:**
- Create: `src/lib/ui/screens/settings/tempo.ts`
- Create: `src/lib/ui/screens/calibration/isBuiltInInput.ts`
- Create: `src/lib/ui/screens/calibration/fakeServices.ts`
- Test: `src/lib/ui/screens/settings/tempo.spec.ts`, `src/lib/ui/screens/calibration/isBuiltInInput.spec.ts`, `src/lib/ui/screens/calibration/fakeServices.spec.ts`

**Interfaces:**
- Consumes: `AppServices` (P0) ; `CalibrationPort`, `CalibrationOutcome`, `CalibrationProgress`, `BackupPort`, `AudioInputDevice` (P0 ports) ; `BackupFile`, `Settings`, `DEFAULT_SETTINGS`, `HomeStats`, `SessionSummary`, `NeckMapCell` (P0 types) ; `FakeNoteDetector`, `InMemorySettingsRepository` (P0 fakes) ; `validateBackup` (D, pour `FakeBackup.importAll`).
- Produces:
  - `MIN_TEMPO_BPM = 60`, `MAX_TEMPO_BPM = 140`, `clampTempo(bpm: number): number`.
  - `isBuiltInInput(device: Pick<AudioInputDevice, 'label'>): boolean` — vrai si le libellé correspond à `/built-?in|internal|integrated|macbook|default/i` (heuristique documentée ; pas d'API standard).
  - `class FakeCalibration implements CalibrationPort` : `nextOutcome`, `progressSteps`, `runCalls`, `cancelled`.
  - `class FakeBackup implements BackupPort` : mémoire locale, `importAll` appelle `validateBackup`.
  - `createFakeAppServices(overrides?: Partial<AppServices>): AppServices & { detector: FakeNoteDetector; calibration: FakeCalibration; backup: FakeBackup; settings: InMemorySettingsRepository }`.

- [ ] **Step 1: Vérifier que la vague 1 est fusionnée**

```bash
ls \
	src/lib/ui/primitives/PixelBox.svelte \
	src/lib/ui/primitives/PixelButton.svelte \
	src/lib/ui/primitives/PixelText.svelte \
	src/lib/ui/tokens.css \
	src/lib/infrastructure/storage/index.ts \
	src/lib/application/ports/CalibrationPort.ts \
	src/lib/testing/fakes.ts
rg -n "export function (downloadBackup|readBackupFile|validateBackup)" src/lib/infrastructure/storage
rg -n "export (interface|type) CalibrationPort|CalibrationOutcome" src/lib/application/ports
rg -n "<button" src/lib/ui/primitives/PixelButton.svelte
```

Expected: les sept chemins sont listés ; trois lignes pour D ; des lignes pour G/P0 ; au moins une ligne `<button` dans `PixelButton`. Si un chemin manque, arrêter : la vague 1 n'est pas fusionnée.

- [ ] **Step 2: Écrire les tests**

Créer `src/lib/ui/screens/settings/tempo.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, clampTempo } from './tempo';

describe('clampTempo', () => {
	it('keeps values inside 60..140', () => {
		expect(MIN_TEMPO_BPM).toBe(60);
		expect(MAX_TEMPO_BPM).toBe(140);
		expect(clampTempo(80)).toBe(80);
		expect(clampTempo(60)).toBe(60);
		expect(clampTempo(140)).toBe(140);
	});

	it('clamps below and above the user bounds', () => {
		expect(clampTempo(59)).toBe(60);
		expect(clampTempo(20)).toBe(60);
		expect(clampTempo(141)).toBe(140);
		expect(clampTempo(300)).toBe(140);
	});

	it('rounds to the nearest integer', () => {
		expect(clampTempo(80.4)).toBe(80);
		expect(clampTempo(80.6)).toBe(81);
	});
});
```

Créer `src/lib/ui/screens/calibration/isBuiltInInput.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { isBuiltInInput } from './isBuiltInInput';

describe('isBuiltInInput', () => {
	it('recognises common built-in microphone labels', () => {
		expect(isBuiltInInput({ label: 'Built-in Microphone' })).toBe(true);
		expect(isBuiltInInput({ label: 'MacBook Pro Microphone (Built-in)' })).toBe(true);
		expect(isBuiltInInput({ label: 'Internal Microphone' })).toBe(true);
		expect(isBuiltInInput({ label: 'default (Built-in Microphone)' })).toBe(true);
	});

	it('rejects external interfaces', () => {
		expect(isBuiltInInput({ label: 'Scarlett 2i2 USB' })).toBe(false);
		expect(isBuiltInInput({ label: 'Focusrite USB' })).toBe(false);
		expect(isBuiltInInput({ label: '' })).toBe(false);
	});
});
```

Créer `src/lib/ui/screens/calibration/fakeServices.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createFakeAppServices } from './fakeServices';

describe('createFakeAppServices', () => {
	it('exposes P0 settings defaults and a controllable calibration', async () => {
		const services = createFakeAppServices();
		expect(await services.settings.get()).toEqual(DEFAULT_SETTINGS);
		services.calibration.nextOutcome = { ok: true, offsetMs: 42, spreadMs: 5 };
		const progress: number[] = [];
		const outcome = await services.calibration.run((p) => progress.push(p.hits));
		expect(outcome).toEqual({ ok: true, offsetMs: 42, spreadMs: 5 });
		expect(progress.length).toBeGreaterThan(0);
	});

	it('rejects an invalid backup on import', async () => {
		const services = createFakeAppServices();
		await expect(services.backup.importAll({ app: 'other' })).rejects.toThrow(
			'Not a Neckspert Play backup'
		);
	});
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/ui/screens/settings/tempo.spec.ts src/lib/ui/screens/calibration/isBuiltInInput.spec.ts src/lib/ui/screens/calibration/fakeServices.spec.ts`
Expected: FAIL, imports introuvables.

- [ ] **Step 4: Écrire les implémentations**

Créer `src/lib/ui/screens/settings/tempo.ts` :

```ts
/** User-facing tempo bounds (README). Metronome technical bounds stay 20..300. */
export const MIN_TEMPO_BPM = 60;
export const MAX_TEMPO_BPM = 140;

export function clampTempo(bpm: number): number {
	const rounded = Math.round(bpm);
	if (rounded < MIN_TEMPO_BPM) return MIN_TEMPO_BPM;
	if (rounded > MAX_TEMPO_BPM) return MAX_TEMPO_BPM;
	return rounded;
}
```

Créer `src/lib/ui/screens/calibration/isBuiltInInput.ts` :

```ts
import type { AudioInputDevice } from '$lib/application/ports';

const BUILT_IN = /built-?in|internal|integrated|macbook|default/i;

/** Heuristic: browsers expose no standard built-in flag, only a label. */
export function isBuiltInInput(device: Pick<AudioInputDevice, 'label'>): boolean {
	return BUILT_IN.test(device.label);
}
```

Créer `src/lib/ui/screens/calibration/fakeServices.ts` :

```ts
import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress
} from '$lib/application/ports';
import type { BackupFile, HomeStats, NeckMapCell, SessionSummary } from '$lib/domain/types';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { validateBackup } from '$lib/infrastructure/storage';
import { FakeNoteDetector, InMemorySettingsRepository } from '$lib/testing/fakes';

export class FakeCalibration implements CalibrationPort {
	nextOutcome: CalibrationOutcome = { ok: true, offsetMs: 35, spreadMs: 8 };
	progressSteps: CalibrationProgress[] = [
		{ hits: 1, needed: 10, lastOffsetMs: 40 },
		{ hits: 5, needed: 10, lastOffsetMs: 30 },
		{ hits: 10, needed: 10, lastOffsetMs: 35 }
	];
	runCalls = 0;
	cancelled = false;

	async run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		this.runCalls += 1;
		this.cancelled = false;
		for (const step of this.progressSteps) {
			if (this.cancelled) return { ok: false, reason: 'cancelled' };
			onProgress(step);
		}
		return this.nextOutcome;
	}

	cancel(): void {
		this.cancelled = true;
	}
}

export class FakeBackup implements BackupPort {
	private file: BackupFile = {
		app: 'neckspert-play',
		version: 1,
		exportedAt: 1,
		settings: { ...DEFAULT_SETTINGS },
		cards: [],
		attempts: [],
		sessions: []
	};

	constructor(private readonly settingsRepo: InMemorySettingsRepository) {}

	async exportAll(): Promise<BackupFile> {
		const settings = await this.settingsRepo.get();
		return { ...structuredClone(this.file), settings };
	}

	async importAll(raw: unknown): Promise<void> {
		this.file = structuredClone(validateBackup(raw));
		await this.settingsRepo.update(this.file.settings);
	}

	/** Test helper: seed the in-memory backup. */
	seed(file: BackupFile): void {
		this.file = structuredClone(file);
	}
}

const EMPTY_HOME: HomeStats = {
	nextAction: 'wait',
	nextReviewAt: null,
	medianColdReactionMs: null,
	trend: null
};

const EMPTY_SUMMARY: SessionSummary = {
	sessionId: 'none',
	coldCount: 0,
	coldCorrect: 0,
	medianColdReactionMs: null,
	learnedCount: 0,
	fatigueDetected: false,
	nextSuggestedAt: null
};

export function createFakeAppServices(
	overrides: Partial<AppServices> = {}
): AppServices & {
	detector: FakeNoteDetector;
	calibration: FakeCalibration;
	backup: FakeBackup;
	settings: InMemorySettingsRepository;
} {
	const settings = new InMemorySettingsRepository();
	const detector = new FakeNoteDetector();
	const calibration = new FakeCalibration();
	const backup = new FakeBackup(settings);

	return {
		settings,
		backup,
		detector,
		calibration,
		homeStats: async () => EMPTY_HOME,
		sessionSummary: async () => EMPTY_SUMMARY,
		neckMap: async (): Promise<NeckMapCell[]> => [],
		startSession: async () => {
			throw new Error('startSession is not used by I3 screens');
		},
		...overrides,
		settings,
		detector,
		calibration,
		backup
	};
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/ui/screens/settings/tempo.spec.ts src/lib/ui/screens/calibration/isBuiltInInput.spec.ts src/lib/ui/screens/calibration/fakeServices.spec.ts`
Expected: PASS.

- [ ] **Step 6: Formater et vérifier les types**

Run: `npx prettier --write src/lib/ui/screens && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 7: Commit**

```bash
git add \
	src/lib/ui/screens/settings/tempo.ts \
	src/lib/ui/screens/settings/tempo.spec.ts \
	src/lib/ui/screens/calibration/isBuiltInInput.ts \
	src/lib/ui/screens/calibration/isBuiltInInput.spec.ts \
	src/lib/ui/screens/calibration/fakeServices.ts \
	src/lib/ui/screens/calibration/fakeServices.spec.ts
git commit -m "$(cat <<'EOF'
feat: add I3 tempo helpers and fake AppServices

EOF
)"
```

---

### Task 2: Écran de présentation `CalibrationScreen`

**Files:**
- Create: `src/lib/ui/screens/calibration/messages.ts`
- Create: `src/lib/ui/screens/calibration/CalibrationScreen.svelte`
- Test: `src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `isBuiltInInput` (Task 1) ; primitives H ; `defineMessages`, `i18n` (P0) ; `AudioInputDevice`, `CalibrationProgress`, `CalibrationOutcome` (P0).
- Produces: `CalibrationScreen.svelte` avec props :
  - `inputs: AudioInputDevice[]`
  - `selectedDeviceId: string | null`
  - `listening: boolean`
  - `levelRms: number` (0..1)
  - `phase: 'idle' | 'running' | 'done'`
  - `progress: CalibrationProgress | null`
  - `outcome: CalibrationOutcome | null`
  - `onselectdevice: (id: string | null) => void`
  - `onlisten: () => void`
  - `onstart: () => void`
  - `oncancel: () => void`
  - `onretry: () => void`
  - Affiche la recommandation casque quand l'entrée sélectionnée (ou son libellé) est un micro intégré.
  - Grands `PixelButton`, liste d'entrées en `<select>` natif (clavier), barre de niveau `role="meter"`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice } from '$lib/application/ports';
import { i18n } from '$lib/i18n/index.svelte';
import CalibrationScreen from './CalibrationScreen.svelte';

const INPUTS: AudioInputDevice[] = [
	{ id: 'built', label: 'Built-in Microphone' },
	{ id: 'usb', label: 'Scarlett 2i2 USB' }
];

function renderScreen(
	overrides: Partial<{
		selectedDeviceId: string | null;
		listening: boolean;
		levelRms: number;
		phase: 'idle' | 'running' | 'done';
		progress: { hits: number; needed: number; lastOffsetMs: number | null } | null;
		outcome:
			| { ok: true; offsetMs: number; spreadMs: number }
			| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' }
			| null;
		onselectdevice: (id: string | null) => void;
		onlisten: () => void;
		onstart: () => void;
		oncancel: () => void;
		onretry: () => void;
	}> = {}
) {
	const props = {
		inputs: INPUTS,
		selectedDeviceId: 'usb' as string | null,
		listening: false,
		levelRms: 0,
		phase: 'idle' as const,
		progress: null,
		outcome: null,
		onselectdevice: vi.fn(),
		onlisten: vi.fn(),
		onstart: vi.fn(),
		oncancel: vi.fn(),
		onretry: vi.fn(),
		...overrides
	};
	return { ...render(CalibrationScreen, { props }), props };
}

describe('CalibrationScreen', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('lists inputs and recommends headphones for the built-in mic', async () => {
		const { props } = renderScreen({ selectedDeviceId: 'built' });
		expect(screen.getByRole('combobox')).toBeTruthy();
		expect(screen.getByText(/casque/i)).toBeTruthy();
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'usb' } });
		expect(props.onselectdevice).toHaveBeenCalledWith('usb');
	});

	it('starts the level meter on a user gesture', async () => {
		const { props } = renderScreen();
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		expect(props.onlisten).toHaveBeenCalledTimes(1);
	});

	it('shows progress while running and the muted-string instruction', () => {
		renderScreen({
			phase: 'running',
			progress: { hits: 3, needed: 10, lastOffsetMs: 20 }
		});
		expect(screen.getByText(/corde étouffée/i)).toBeTruthy();
		expect(screen.getByText(/3\s*\/\s*10/)).toBeTruthy();
	});

	it('shows success offset and offers retry after failure', async () => {
		const ok = renderScreen({
			phase: 'done',
			outcome: { ok: true, offsetMs: 42, spreadMs: 5 }
		});
		expect(screen.getByText(/42/)).toBeTruthy();
		cleanup();

		const { props } = renderScreen({
			phase: 'done',
			outcome: { ok: false, reason: 'no-sound' }
		});
		expect(screen.getByText(/aucun son/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
		expect(props.onretry).toHaveBeenCalledTimes(1);
	});

	it('exposes a keyboard-operable meter and large start control', () => {
		renderScreen({ listening: true, levelRms: 0.4 });
		const meter = screen.getByRole('meter');
		expect(meter.getAttribute('aria-valuenow')).toBe('40');
		const start = screen.getByRole('button', { name: /calibrer/i });
		expect(start.tagName).toBe('BUTTON');
		start.focus();
		expect(document.activeElement).toBe(start);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts`
Expected: FAIL, import introuvable.

- [ ] **Step 3: Écrire messages et composant**

Créer `src/lib/ui/screens/calibration/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';

export const calibrationMessages = defineMessages({
	fr: {
		title: 'Calibration',
		input: 'Entrée audio',
		listen: 'Écouter le niveau',
		listening: 'Écoute en cours',
		start: 'Calibrer',
		cancel: 'Annuler',
		retry: 'Réessayer',
		instruction: 'Joue une corde étouffée sur chaque clic du métronome.',
		headphones: 'Micro intégré détecté : porte un casque pour éviter le larsen.',
		progress: (hits: number, needed: number) => `${hits} / ${needed}`,
		level: 'Niveau',
		ok: (ms: number) => `Latence mesurée : ${ms} ms`,
		'no-sound': 'Aucun son détecté. Réessaie plus fort, ou change d’entrée.',
		inconsistent: 'Mesures trop dispersées. Réessaie en jouant pile sur le clic.',
		cancelled: 'Calibration annulée.'
	},
	en: {
		title: 'Calibration',
		input: 'Audio input',
		listen: 'Listen to level',
		listening: 'Listening',
		start: 'Calibrate',
		cancel: 'Cancel',
		retry: 'Retry',
		instruction: 'Play a muted string on every metronome click.',
		headphones: 'Built-in mic detected: wear headphones to avoid feedback.',
		progress: (hits: number, needed: number) => `${hits} / ${needed}`,
		level: 'Level',
		ok: (ms: number) => `Measured latency: ${ms} ms`,
		'no-sound': 'No sound detected. Try louder, or pick another input.',
		inconsistent: 'Hits too scattered. Retry, playing right on the click.',
		cancelled: 'Calibration cancelled.'
	}
});
```

Créer `src/lib/ui/screens/calibration/CalibrationScreen.svelte` :

```svelte
<script lang="ts">
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { isBuiltInInput } from './isBuiltInInput';
	import { calibrationMessages } from './messages';

	type Phase = 'idle' | 'running' | 'done';

	let {
		inputs,
		selectedDeviceId,
		listening,
		levelRms,
		phase,
		progress,
		outcome,
		onselectdevice,
		onlisten,
		onstart,
		oncancel,
		onretry
	}: {
		inputs: AudioInputDevice[];
		selectedDeviceId: string | null;
		listening: boolean;
		levelRms: number;
		phase: Phase;
		progress: CalibrationProgress | null;
		outcome: CalibrationOutcome | null;
		onselectdevice: (id: string | null) => void;
		onlisten: () => void;
		onstart: () => void;
		oncancel: () => void;
		onretry: () => void;
	} = $props();

	const m = $derived(calibrationMessages());
	const selected = $derived(inputs.find((device) => device.id === selectedDeviceId) ?? null);
	const showHeadphones = $derived(selected !== null && isBuiltInInput(selected));
	const levelPercent = $derived(Math.round(Math.min(1, Math.max(0, levelRms)) * 100));

	function onDeviceChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onselectdevice(value === '' ? null : value);
	}
</script>

<section class="calibration-screen" aria-labelledby="calibration-title">
	<PixelText as="h1" scale={3} id="calibration-title">{m.title}</PixelText>

	<PixelBox variant="double">
		<label class="field" for="calibration-input">
			<PixelText scale={1}>{m.input}</PixelText>
		</label>
		<select
			id="calibration-input"
			class="device-select"
			value={selectedDeviceId ?? ''}
			onchange={onDeviceChange}
			disabled={phase === 'running'}
		>
			{#each inputs as device (device.id)}
				<option value={device.id}>{device.label}</option>
			{/each}
		</select>

		{#if showHeadphones}
			<p class="hint"><PixelText scale={1}>{m.headphones}</PixelText></p>
		{/if}

		<div class="level-row">
			<span id="level-label"><PixelText scale={1}>{m.level}</PixelText></span>
			<div
				class="meter"
				role="meter"
				aria-labelledby="level-label"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={levelPercent}
			>
				<div class="meter-fill" style={`width: ${levelPercent}%`}></div>
			</div>
			{#if !listening}
				<PixelButton size="large" onclick={onlisten}>{m.listen}</PixelButton>
			{:else}
				<PixelText scale={1}>{m.listening}</PixelText>
			{/if}
		</div>
	</PixelBox>

	<p class="instruction"><PixelText scale={2}>{m.instruction}</PixelText></p>

	{#if phase === 'running' && progress}
		<p class="progress" aria-live="polite">
			<PixelText scale={2}>{m.progress(progress.hits, progress.needed)}</PixelText>
		</p>
		<PixelButton size="large" onclick={oncancel}>{m.cancel}</PixelButton>
	{:else if phase === 'done' && outcome}
		<p class="outcome" aria-live="polite">
			{#if outcome.ok}
				<PixelText scale={2}>{m.ok(outcome.offsetMs)}</PixelText>
			{:else}
				<PixelText scale={2}>{m[outcome.reason]}</PixelText>
			{/if}
		</p>
		<PixelButton size="huge" onclick={onretry}>{m.retry}</PixelButton>
	{:else}
		<PixelButton size="huge" disabled={!listening} onclick={onstart}>{m.start}</PixelButton>
	{/if}
</section>

<style>
	.calibration-screen {
		display: flex;
		flex-direction: column;
		gap: calc(var(--tile, 8px) * 2);
		padding: calc(var(--tile, 8px) * 2);
		min-height: 100%;
		box-sizing: border-box;
		background: var(--color-bg, #e99568);
		color: var(--color-ink, #451218);
	}

	.field {
		display: block;
		margin-bottom: var(--tile, 8px);
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		font: inherit;
		font-size: 1.25rem;
		padding: var(--tile, 8px);
		background: var(--color-mid, #be6754);
		color: var(--color-ink, #451218);
		border: calc(var(--tile, 8px) / 2) solid var(--color-ink, #451218);
	}

	.hint,
	.instruction,
	.progress,
	.outcome {
		margin: 0;
	}

	.level-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--tile, 8px);
		margin-top: calc(var(--tile, 8px) * 2);
	}

	.meter {
		flex: 1 1 12rem;
		height: calc(var(--tile, 8px) * 3);
		border: calc(var(--tile, 8px) / 2) solid var(--color-ink, #451218);
		background: var(--color-bg, #e99568);
		image-rendering: pixelated;
	}

	.meter-fill {
		height: 100%;
		background: var(--color-ink, #451218);
	}
</style>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/lib/ui/screens/calibration && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/screens/calibration
git commit -m "$(cat <<'EOF'
feat: add CalibrationScreen presentation component

EOF
)"
```

---

### Task 3: Route `/calibration`

**Files:**
- Create: `src/routes/calibration/+page.svelte`
- Create: `src/routes/calibration/TestHarness.svelte`
- Test: `src/routes/calibration/page.svelte.spec.ts`

**Interfaces:**
- Consumes: `CalibrationScreen` (Task 2) ; `useAppServices` / `provideAppServices` (P0) ; `createFakeAppServices` (Task 1) ; `CalibrationPort` (G, via services).
- Produces: route qui :
  1. charge `listInputs()` et les réglages au montage ;
  2. démarre le mètre (`detector.start` + `onLevel`) uniquement sur `onlisten` (geste) ;
  3. arrête le détecteur et se désabonne dans `onDestroy` ;
  4. lance `calibration.run` sur `onstart`, met à jour `progress` ;
  5. en succès : `settings.update({ calibrationOffsetMs, inputDeviceId })` ;
  6. sur annulation / sortie : `calibration.cancel()` puis stop du détecteur ;
  7. `onretry` remet `phase` à `idle` et efface `outcome`.

- [ ] **Step 1: Écrire le test**

Créer le wrapper `src/routes/calibration/TestHarness.svelte` (chemin possédé) :

```svelte
<script lang="ts">
	import type { AppServices } from '$lib/application/app';
	import { provideAppServices } from '$lib/application/app';
	import Page from './+page.svelte';

	let { services }: { services: AppServices } = $props();
	provideAppServices(services);
</script>

<Page />
```

Créer `src/routes/calibration/page.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

describe('/calibration page', () => {
	afterEach(() => {
		cleanup();
	});

	it('starts the meter on listen and stops the detector on unmount', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [
			{ id: 'usb', label: 'Scarlett 2i2 USB' },
			{ id: 'built', label: 'Built-in Microphone' }
		];
		const view = render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await waitFor(() => expect(services.detector.running).toBe(true));

		services.detector.emitLevel(0.5);
		await waitFor(() =>
			expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('50')
		);

		view.unmount();
		expect(services.detector.running).toBe(false);
	});

	it('saves offset and device id on a successful run', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		services.calibration.nextOutcome = { ok: true, offsetMs: 42, spreadMs: 4 };
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));

		await waitFor(async () => {
			const settings = await services.settings.get();
			expect(settings.calibrationOffsetMs).toBe(42);
			expect(settings.inputDeviceId).toBe('usb');
		});
		expect(services.calibration.runCalls).toBe(1);
		expect(screen.getByText(/42/)).toBeTruthy();
	});

	it('cancels an in-flight run when the user presses cancel', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		let release!: (outcome: { ok: false; reason: 'cancelled' }) => void;
		services.calibration.run = async (onProgress) => {
			onProgress({ hits: 1, needed: 10, lastOffsetMs: 10 });
			return new Promise((resolve) => {
				release = resolve;
				services.calibration.cancel = () => {
					services.calibration.cancelled = true;
					resolve({ ok: false, reason: 'cancelled' });
				};
			});
		};
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));
		await waitFor(() => expect(screen.getByRole('button', { name: /annuler/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
		await waitFor(() => expect(screen.getByText(/annul/i)).toBeTruthy());
		expect(services.calibration.cancelled).toBe(true);
		release?.({ ok: false, reason: 'cancelled' });
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/routes/calibration/page.svelte.spec.ts`
Expected: FAIL, imports introuvables.

- [ ] **Step 3: Écrire la route et le harness**

Créer `src/routes/calibration/+page.svelte` :

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useAppServices } from '$lib/application/app';
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import CalibrationScreen from '$lib/ui/screens/calibration/CalibrationScreen.svelte';

	const services = useAppServices();

	let inputs = $state<AudioInputDevice[]>([]);
	let selectedDeviceId = $state<string | null>(null);
	let listening = $state(false);
	let levelRms = $state(0);
	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let progress = $state<CalibrationProgress | null>(null);
	let outcome = $state<CalibrationOutcome | null>(null);

	let stopLevel: (() => void) | null = null;

	async function load() {
		const [devices, settings] = await Promise.all([
			services.detector.listInputs(),
			services.settings.get()
		]);
		inputs = devices;
		selectedDeviceId = settings.inputDeviceId ?? devices[0]?.id ?? null;
	}

	void load();

	async function stopMeter() {
		stopLevel?.();
		stopLevel = null;
		services.detector.stop();
		listening = false;
		levelRms = 0;
	}

	async function onlisten() {
		await stopMeter();
		await services.detector.start(selectedDeviceId);
		stopLevel = services.detector.onLevel((rms) => {
			levelRms = rms;
		});
		listening = true;
	}

	async function onstart() {
		if (phase === 'running') return;
		phase = 'running';
		progress = null;
		outcome = null;
		if (!listening) await onlisten();
		const result = await services.calibration.run((next) => {
			progress = next;
		});
		outcome = result;
		phase = 'done';
		if (result.ok) {
			await services.settings.update({
				calibrationOffsetMs: result.offsetMs,
				inputDeviceId: selectedDeviceId
			});
		}
	}

	function oncancel() {
		services.calibration.cancel();
	}

	function onretry() {
		phase = 'idle';
		progress = null;
		outcome = null;
	}

	function onselectdevice(id: string | null) {
		selectedDeviceId = id;
		if (listening) void onlisten();
	}

	onDestroy(() => {
		services.calibration.cancel();
		void stopMeter();
	});
</script>

<CalibrationScreen
	{inputs}
	{selectedDeviceId}
	{listening}
	{levelRms}
	{phase}
	{progress}
	{outcome}
	{onselectdevice}
	{onlisten}
	{onstart}
	{oncancel}
	{onretry}
/>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/routes/calibration/page.svelte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/routes/calibration src/lib/ui/screens/calibration && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/calibration
git commit -m "$(cat <<'EOF'
feat: wire /calibration route to detector and CalibrationPort

EOF
)"
```

---

### Task 4: Surface Impeccable — Calibration

**Files:**
- Modify: `src/lib/ui/screens/calibration/CalibrationScreen.svelte` (composition visuelle)
- Create: `src/routes/dev/calibration/+page.svelte`
- Test: inchangés (doivent rester verts)

**Interfaces:**
- Consumes: contrat de direction de la session (lecture) `.impeccable/surfaces/src-routes-session-page-svelte.md`, maquette `.impeccable/mocks/comp-4-full-bleed-lane.png`, `DESIGN.md` / `tokens.css` (H) ; `reference/new-work.md` §3 ; `craft-floor.md`.
- Produces: composition Operate de `/calibration` dans le monde Bonfire ; page `/dev/calibration` pour inspection ; brief, maquettes et captures nommés `calibration` sous `.impeccable/`.

Cadre Impeccable : **surface entière dans un monde établi**. Lancer `concept-seed --scope surface --mode operate`, présenter les trois structures tirées, verrouiller une carte. Construire dans les fichiers possédés. Une seule ronde d'inspection bureau + téléphone. Ne pas réécrire `DESIGN.md`. Si le seed ne peut pas s'ouvrir de façon interactive, prendre la structure assignée et documenter l'hypothèse dans le message de commit.

Composition de repli (si seed indisponible) — FIRST VIEWPORT Operate :
- Plein cadre Bonfire, pas de carte flottante.
- Haut : titre pixel « CALIBRATION », sélecteur d'entrée pleine largeur, recommandation casque sous le sélecteur si besoin.
- Centre : barre de niveau full-bleed (tramage / inversion), boutons Écouter / Calibrer en `huge`.
- Bas : instruction corde étouffée, puis progrès ou issue en `PixelText` scale 2.
- Hiérarchie par cadres doubles et inversion uniquement ; quatre tons stricts.

- [ ] **Step 1: Charger le contexte**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/calibration/+page.svelte
```

Lire ensuite, dans cet ordre : `DESIGN.md`, `.impeccable/surfaces/src-routes-session-page-svelte.md`, `.impeccable/mocks/comp-4-full-bleed-lane.png`, `src/lib/ui/tokens.css`, les trois primitives, puis `~/.cursor/skills/impeccable/reference/new-work.md` §3. Lire `craft-floor.md` juste avant l'étape 3.

- [ ] **Step 2: Tirer les structures de surface**

```bash
~/.cursor/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode operate
```

Suivre la sortie du script (cartes, re-roll, verrouillage). Écrire le brief sous `.impeccable/surfaces/` avec `calibration` dans le nom, et les maquettes sous `.impeccable/mocks/` de la même façon. Ne pas modifier le brief de session ni `comp-4`.

- [ ] **Step 3: Appliquer la composition et créer la page de démo**

Ajuster `CalibrationScreen.svelte` pour coller à la structure verrouillée (espacements en tuiles 8 px, cadres, inversion, pas de cinquième ton hors damier). Créer `src/routes/dev/calibration/+page.svelte` :

```svelte
<script lang="ts">
	import type {
		AudioInputDevice,
		CalibrationOutcome,
		CalibrationProgress
	} from '$lib/application/ports';
	import CalibrationScreen from '$lib/ui/screens/calibration/CalibrationScreen.svelte';

	const inputs: AudioInputDevice[] = [
		{ id: 'built', label: 'Built-in Microphone' },
		{ id: 'usb', label: 'Scarlett 2i2 USB' }
	];

	let selectedDeviceId = $state<string | null>('built');
	let listening = $state(true);
	let levelRms = $state(0.35);
	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let progress = $state<CalibrationProgress | null>(null);
	let outcome = $state<CalibrationOutcome | null>(null);

	function onlisten() {
		listening = true;
		levelRms = 0.45;
	}

	function onstart() {
		phase = 'running';
		progress = { hits: 4, needed: 10, lastOffsetMs: 28 };
		outcome = null;
	}

	function oncancel() {
		phase = 'done';
		outcome = { ok: false, reason: 'cancelled' };
	}

	function onretry() {
		phase = 'idle';
		progress = null;
		outcome = null;
	}
</script>

<CalibrationScreen
	{inputs}
	{selectedDeviceId}
	{listening}
	{levelRms}
	{phase}
	{progress}
	{outcome}
	onselectdevice={(id) => (selectedDeviceId = id)}
	{onlisten}
	{onstart}
	{oncancel}
	{onretry}
/>
```

- [ ] **Step 4: Inspection bureau + téléphone (une ronde)**

```bash
npm run dev -- --port 5180
```

Ouvrir `/dev/calibration` à 1280×720 et ~390×844. Vérifier craft-floor (contraste, focus, états, grands contrôles). Corriger en un lot dans les fichiers possédés uniquement.

- [ ] **Step 5: Relancer les tests de calibration**

Run: `npx vitest run src/lib/ui/screens/calibration src/routes/calibration && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/screens/calibration src/routes/dev/calibration .impeccable/surfaces .impeccable/mocks .impeccable/review
git commit -m "$(cat <<'EOF'
feat: compose calibration screen in Bonfire world

EOF
)"
```

---

### Task 5: Écran de présentation `SettingsScreen`

**Files:**
- Create: `src/lib/ui/screens/settings/messages.ts`
- Create: `src/lib/ui/screens/settings/SettingsScreen.svelte`
- Test: `src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `clampTempo`, `MIN_TEMPO_BPM`, `MAX_TEMPO_BPM` (Task 1) ; primitives H ; `defineMessages`, `i18n` ; `AudioInputDevice`, `Locale`.
- Produces: `SettingsScreen.svelte` avec props :
  - `locale: Locale`, `tempoBpm: number`, `inputs: AudioInputDevice[]`, `inputDeviceId: string | null`
  - `calibrationOffsetMs: number | null`
  - `importError: string | null`, `confirmingImport: boolean`
  - `onlocale`, `ontempo`, `oninput`, `onexport`, `onimportfile`, `onimportconfirm`, `onimportcancel`
  - Lien `<a href="/calibration">` grand et focalisable
  - Stepper tempo − / + (désactivé aux bornes), boutons FR / EN, confirmation d'import visible avec deux grands boutons

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice } from '$lib/application/ports';
import { i18n } from '$lib/i18n/index.svelte';
import SettingsScreen from './SettingsScreen.svelte';

const INPUTS: AudioInputDevice[] = [
	{ id: 'usb', label: 'Scarlett 2i2 USB' },
	{ id: 'built', label: 'Built-in Microphone' }
];

function renderScreen(
	overrides: Partial<{
		locale: 'fr' | 'en';
		tempoBpm: number;
		inputDeviceId: string | null;
		calibrationOffsetMs: number | null;
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: 'fr' | 'en') => void;
		ontempo: (bpm: number) => void;
		oninput: (id: string | null) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
	}> = {}
) {
	const props = {
		locale: 'fr' as const,
		tempoBpm: 80,
		inputs: INPUTS,
		inputDeviceId: 'usb' as string | null,
		calibrationOffsetMs: 42 as number | null,
		importError: null as string | null,
		confirmingImport: false,
		onlocale: vi.fn(),
		ontempo: vi.fn(),
		oninput: vi.fn(),
		onexport: vi.fn(),
		onimportfile: vi.fn(),
		onimportconfirm: vi.fn(),
		onimportcancel: vi.fn(),
		...overrides
	};
	return { ...render(SettingsScreen, { props }), props };
}

describe('SettingsScreen', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('switches language with large buttons', async () => {
		const { props } = renderScreen();
		await fireEvent.click(screen.getByRole('button', { name: 'EN' }));
		expect(props.onlocale).toHaveBeenCalledWith('en');
	});

	it('steps tempo within 60..140 and disables at the edges', async () => {
		const low = renderScreen({ tempoBpm: 60 });
		expect(screen.getByRole('button', { name: '−' })).toHaveProperty('disabled', true);
		await fireEvent.click(screen.getByRole('button', { name: '+' }));
		expect(low.props.ontempo).toHaveBeenCalledWith(61);
		cleanup();

		const high = renderScreen({ tempoBpm: 140 });
		expect(screen.getByRole('button', { name: '+' })).toHaveProperty('disabled', true);
		await fireEvent.click(screen.getByRole('button', { name: '−' }));
		expect(high.props.ontempo).toHaveBeenCalledWith(139);
	});

	it('links to calibration and exports on click', async () => {
		const { props } = renderScreen();
		const link = screen.getByRole('link', { name: /calibration/i });
		expect(link.getAttribute('href')).toBe('/calibration');
		await fireEvent.click(screen.getByRole('button', { name: /exporter/i }));
		expect(props.onexport).toHaveBeenCalledTimes(1);
	});

	it('shows import confirmation and a readable error', async () => {
		const confirming = renderScreen({ confirmingImport: true });
		expect(screen.getByText(/remplac/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));
		expect(confirming.props.onimportconfirm).toHaveBeenCalledTimes(1);
		cleanup();

		renderScreen({ importError: 'Not a Neckspert Play backup' });
		expect(screen.getByText(/Not a Neckspert Play backup/)).toBeTruthy();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts`
Expected: FAIL, import introuvable.

- [ ] **Step 3: Écrire messages et composant**

Créer `src/lib/ui/screens/settings/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';

export const settingsMessages = defineMessages({
	fr: {
		title: 'Réglages',
		language: 'Langue',
		tempo: 'Tempo',
		input: 'Entrée audio',
		calibration: 'Calibration',
		calibrationLink: 'Ouvrir la calibration',
		offset: (ms: number | null) =>
			ms === null ? 'Pas encore calibré' : `Offset : ${ms} ms`,
		export: 'Exporter',
		import: 'Importer',
		confirmTitle: 'Remplacer les données actuelles ?',
		confirmBody: 'L’import écrase réglages, cartes, tentatives et sessions.',
		confirm: 'Confirmer',
		cancel: 'Annuler',
		decrease: '−',
		increase: '+'
	},
	en: {
		title: 'Settings',
		language: 'Language',
		tempo: 'Tempo',
		input: 'Audio input',
		calibration: 'Calibration',
		calibrationLink: 'Open calibration',
		offset: (ms: number | null) =>
			ms === null ? 'Not calibrated yet' : `Offset: ${ms} ms`,
		export: 'Export',
		import: 'Import',
		confirmTitle: 'Replace current data?',
		confirmBody: 'Import overwrites settings, cards, attempts and sessions.',
		confirm: 'Confirm',
		cancel: 'Cancel',
		decrease: '−',
		increase: '+'
	}
});
```

Créer `src/lib/ui/screens/settings/SettingsScreen.svelte` :

```svelte
<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { Locale } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, clampTempo } from './tempo';
	import { settingsMessages } from './messages';

	let {
		locale,
		tempoBpm,
		inputs,
		inputDeviceId,
		calibrationOffsetMs,
		importError,
		confirmingImport,
		onlocale,
		ontempo,
		oninput,
		onexport,
		onimportfile,
		onimportconfirm,
		onimportcancel
	}: {
		locale: Locale;
		tempoBpm: number;
		inputs: AudioInputDevice[];
		inputDeviceId: string | null;
		calibrationOffsetMs: number | null;
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: Locale) => void;
		ontempo: (bpm: number) => void;
		oninput: (id: string | null) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
	} = $props();

	const m = $derived(settingsMessages());
	let fileInput: HTMLInputElement | undefined = $state();

	function onDeviceChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		oninput(value === '' ? null : value);
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) onimportfile(file);
		(event.currentTarget as HTMLInputElement).value = '';
	}
</script>

<section class="settings-screen" aria-labelledby="settings-title">
	<PixelText as="h1" scale={3} id="settings-title">{m.title}</PixelText>

	<PixelBox variant="double">
		<p class="label"><PixelText scale={1}>{m.language}</PixelText></p>
		<div class="row" role="group" aria-label={m.language}>
			<PixelButton
				size="large"
				disabled={locale === 'fr'}
				onclick={() => onlocale('fr')}>FR</PixelButton
			>
			<PixelButton
				size="large"
				disabled={locale === 'en'}
				onclick={() => onlocale('en')}>EN</PixelButton
			>
		</div>
	</PixelBox>

	<PixelBox variant="double">
		<p class="label"><PixelText scale={1}>{m.tempo}</PixelText></p>
		<div class="row tempo" role="group" aria-label={m.tempo}>
			<PixelButton
				size="huge"
				disabled={tempoBpm <= MIN_TEMPO_BPM}
				onclick={() => ontempo(clampTempo(tempoBpm - 1))}>{m.decrease}</PixelButton
			>
			<span class="tempo-value" aria-live="polite">
				<PixelText scale={4}>{tempoBpm}</PixelText>
			</span>
			<PixelButton
				size="huge"
				disabled={tempoBpm >= MAX_TEMPO_BPM}
				onclick={() => ontempo(clampTempo(tempoBpm + 1))}>{m.increase}</PixelButton
			>
		</div>
	</PixelBox>

	<PixelBox variant="double">
		<label class="label" for="settings-input">
			<PixelText scale={1}>{m.input}</PixelText>
		</label>
		<select
			id="settings-input"
			class="device-select"
			value={inputDeviceId ?? ''}
			onchange={onDeviceChange}
		>
			{#each inputs as device (device.id)}
				<option value={device.id}>{device.label}</option>
			{/each}
		</select>
	</PixelBox>

	<PixelBox variant="plain">
		<p class="label"><PixelText scale={1}>{m.calibration}</PixelText></p>
		<p><PixelText scale={1}>{m.offset(calibrationOffsetMs)}</PixelText></p>
		<a class="calibration-link" href="/calibration">
			<PixelText scale={2}>{m.calibrationLink}</PixelText>
		</a>
	</PixelBox>

	<div class="row">
		<PixelButton size="huge" onclick={onexport}>{m.export}</PixelButton>
		<PixelButton size="huge" onclick={() => fileInput?.click()}>{m.import}</PixelButton>
		<input
			bind:this={fileInput}
			class="file"
			type="file"
			accept="application/json,.json"
			onchange={onFileChange}
		/>
	</div>

	{#if importError}
		<p class="error" role="alert"><PixelText scale={1}>{importError}</PixelText></p>
	{/if}

	{#if confirmingImport}
		<PixelBox variant="inverted">
			<p><PixelText scale={2}>{m.confirmTitle}</PixelText></p>
			<p><PixelText scale={1}>{m.confirmBody}</PixelText></p>
			<div class="row">
				<PixelButton size="huge" onclick={onimportconfirm}>{m.confirm}</PixelButton>
				<PixelButton size="large" onclick={onimportcancel}>{m.cancel}</PixelButton>
			</div>
		</PixelBox>
	{/if}
</section>

<style>
	.settings-screen {
		display: flex;
		flex-direction: column;
		gap: calc(var(--tile, 8px) * 2);
		padding: calc(var(--tile, 8px) * 2);
		min-height: 100%;
		box-sizing: border-box;
		background: var(--color-bg, #e99568);
		color: var(--color-ink, #451218);
	}

	.label {
		margin: 0 0 var(--tile, 8px);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--tile, 8px);
		align-items: center;
	}

	.tempo {
		justify-content: space-between;
	}

	.tempo-value {
		min-width: 4ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.device-select {
		display: block;
		width: 100%;
		min-height: 48px;
		font: inherit;
		font-size: 1.25rem;
		padding: var(--tile, 8px);
		background: var(--color-mid, #be6754);
		color: var(--color-ink, #451218);
		border: calc(var(--tile, 8px) / 2) solid var(--color-ink, #451218);
	}

	.calibration-link {
		display: inline-flex;
		min-height: 48px;
		align-items: center;
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.error {
		margin: 0;
		color: var(--color-ink, #451218);
	}
</style>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/lib/ui/screens/settings && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/screens/settings
git commit -m "$(cat <<'EOF'
feat: add SettingsScreen presentation component

EOF
)"
```

---

### Task 6: Route `/settings`

**Files:**
- Create: `src/routes/settings/+page.svelte`
- Create: `src/routes/settings/TestHarness.svelte`
- Test: `src/routes/settings/page.svelte.spec.ts`

**Interfaces:**
- Consumes: `SettingsScreen` (Task 5) ; `downloadBackup`, `readBackupFile`, `validateBackup` (D) ; `useAppServices` ; `i18n` ; `clampTempo` ; `createFakeAppServices`.
- Produces: route qui :
  1. charge réglages + `listInputs` ;
  2. applique la langue immédiatement (`settings.update` + `i18n.locale = locale`) ;
  3. borne le tempo via `clampTempo` avant `settings.update({ tempoBpm })` ;
  4. enregistre `inputDeviceId` immédiatement ;
  5. exporte via `downloadBackup(await backup.exportAll())` ;
  6. à la sélection d'un fichier : `readBackupFile` puis `validateBackup` ; en échec, affiche `error.message` ; en succès, ouvre la confirmation ;
  7. à la confirmation : `backup.importAll(pending)` puis recharge les réglages et synchronise `i18n.locale`.

- [ ] **Step 1: Écrire le test**

Créer `src/routes/settings/page.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

vi.mock('$lib/infrastructure/storage', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/infrastructure/storage')>();
	return {
		...actual,
		downloadBackup: vi.fn()
	};
});

import { downloadBackup } from '$lib/infrastructure/storage';

describe('/settings page', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
		vi.clearAllMocks();
	});

	it('applies language immediately to settings and i18n', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: 'EN' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'EN' }));
		await waitFor(async () => {
			expect(i18n.locale).toBe('en');
			expect((await services.settings.get()).locale).toBe('en');
		});
	});

	it('clamps tempo to 60..140 when stepping', async () => {
		const services = createFakeAppServices();
		await services.settings.update({ tempoBpm: 60 });
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByText('60')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: '+' }));
		await waitFor(async () => expect((await services.settings.get()).tempoBpm).toBe(61));
	});

	it('exports through downloadBackup', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: /exporter/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /exporter/i }));
		await waitFor(() => expect(downloadBackup).toHaveBeenCalledTimes(1));
	});

	it('shows a readable error for an invalid file and imports after confirm', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: /importer/i })).toBeTruthy());

		const bad = new File(['{"app":"nope"}'], 'bad.json', { type: 'application/json' });
		const hidden = document.querySelector('input[type="file"]') as HTMLInputElement;
		await fireEvent.change(hidden, { target: { files: [bad] } });
		await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Neckspert Play/i));

		const good = new File(
			[
				JSON.stringify({
					app: 'neckspert-play',
					version: 1,
					exportedAt: 9,
					settings: { ...DEFAULT_SETTINGS, locale: 'en', tempoBpm: 100 },
					cards: [],
					attempts: [],
					sessions: []
				})
			],
			'good.json',
			{ type: 'application/json' }
		);
		await fireEvent.change(hidden, { target: { files: [good] } });
		await waitFor(() => expect(screen.getByText(/remplac/i)).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));
		await waitFor(async () => {
			expect((await services.settings.get()).tempoBpm).toBe(100);
			expect(i18n.locale).toBe('en');
		});
	});
});
```

Créer `src/routes/settings/TestHarness.svelte` :

```svelte
<script lang="ts">
	import type { AppServices } from '$lib/application/app';
	import { provideAppServices } from '$lib/application/app';
	import Page from './+page.svelte';

	let { services }: { services: AppServices } = $props();
	provideAppServices(services);
</script>

<Page />
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/routes/settings/page.svelte.spec.ts`
Expected: FAIL, import introuvable.

- [ ] **Step 3: Écrire la route**

Créer `src/routes/settings/+page.svelte` :

```svelte
<script lang="ts">
	import { useAppServices } from '$lib/application/app';
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { Locale } from '$lib/domain/types';
	import { downloadBackup, readBackupFile, validateBackup } from '$lib/infrastructure/storage';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';
	import { clampTempo } from '$lib/ui/screens/settings/tempo';

	const services = useAppServices();

	let locale = $state<Locale>('fr');
	let tempoBpm = $state(80);
	let inputs = $state<AudioInputDevice[]>([]);
	let inputDeviceId = $state<string | null>(null);
	let calibrationOffsetMs = $state<number | null>(null);
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);
	let pendingImport: unknown = null;

	async function load() {
		const [settings, devices] = await Promise.all([
			services.settings.get(),
			services.detector.listInputs()
		]);
		locale = settings.locale;
		tempoBpm = clampTempo(settings.tempoBpm);
		inputDeviceId = settings.inputDeviceId ?? devices[0]?.id ?? null;
		calibrationOffsetMs = settings.calibrationOffsetMs;
		inputs = devices;
		i18n.locale = settings.locale;
	}

	void load();

	async function onlocale(next: Locale) {
		locale = next;
		i18n.locale = next;
		await services.settings.update({ locale: next });
	}

	async function ontempo(next: number) {
		const bpm = clampTempo(next);
		tempoBpm = bpm;
		await services.settings.update({ tempoBpm: bpm });
	}

	async function oninput(id: string | null) {
		inputDeviceId = id;
		await services.settings.update({ inputDeviceId: id });
	}

	async function onexport() {
		downloadBackup(await services.backup.exportAll());
	}

	async function onimportfile(file: File) {
		importError = null;
		confirmingImport = false;
		pendingImport = null;
		try {
			const raw = await readBackupFile(file);
			pendingImport = validateBackup(raw);
			confirmingImport = true;
		} catch (error) {
			importError = error instanceof Error ? error.message : String(error);
		}
	}

	async function onimportconfirm() {
		if (pendingImport === null) return;
		try {
			await services.backup.importAll(pendingImport);
			confirmingImport = false;
			pendingImport = null;
			await load();
		} catch (error) {
			importError = error instanceof Error ? error.message : String(error);
			confirmingImport = false;
			pendingImport = null;
		}
	}

	function onimportcancel() {
		confirmingImport = false;
		pendingImport = null;
	}
</script>

<SettingsScreen
	{locale}
	{tempoBpm}
	{inputs}
	{inputDeviceId}
	{calibrationOffsetMs}
	{importError}
	{confirmingImport}
	{onlocale}
	{ontempo}
	{oninput}
	{onexport}
	{onimportfile}
	{onimportconfirm}
	{onimportcancel}
/>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/routes/settings/page.svelte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/routes/settings src/lib/ui/screens && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings
git commit -m "$(cat <<'EOF'
feat: wire /settings with locale, tempo, export and import

EOF
)"
```

---

### Task 7: Surface Impeccable — Réglages

**Files:**
- Modify: `src/lib/ui/screens/settings/SettingsScreen.svelte` (composition)
- Create: `src/routes/dev/settings/+page.svelte`

**Interfaces:**
- Consumes: même monde que Task 4 ; `craft-floor.md` ; `concept-seed --scope surface --mode operate`.
- Produces: composition Operate de `/settings` ; page `/dev/settings` ; brief, maquettes et captures nommés `settings` sous `.impeccable/`.

Composition de repli :
- Une colonne de cadres doubles empilés (langue, tempo, entrée, calibration, sauvegarde).
- Tempo comme signal dominant (chiffre scale 4, stepper huge).
- Pas de cartes décoratives ; confirmation d'import en cadre inversé.
- Lien calibration souligné, cible ≥ 48 px de haut.

- [ ] **Step 1: Charger le contexte**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/settings/+page.svelte
```

Lire `DESIGN.md`, le brief de session, la maquette, `tokens.css`, primitives, `new-work.md` §3. Lire `craft-floor.md` juste avant l'étape 3.

- [ ] **Step 2: Tirer les structures**

```bash
~/.cursor/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode operate
```

Verrouiller une structure. Écrire le brief et les maquettes sous `.impeccable/`, avec `settings` dans le nom du fichier.

- [ ] **Step 3: Appliquer et créer la démo**

Créer `src/routes/dev/settings/+page.svelte` :

```svelte
<script lang="ts">
	import type { AudioInputDevice } from '$lib/application/ports';
	import type { Locale } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import SettingsScreen from '$lib/ui/screens/settings/SettingsScreen.svelte';
	import { clampTempo } from '$lib/ui/screens/settings/tempo';

	const inputs: AudioInputDevice[] = [
		{ id: 'usb', label: 'Scarlett 2i2 USB' },
		{ id: 'built', label: 'Built-in Microphone' }
	];

	let locale = $state<Locale>('fr');
	let tempoBpm = $state(80);
	let inputDeviceId = $state<string | null>('usb');
	let calibrationOffsetMs = $state<number | null>(42);
	let importError = $state<string | null>(null);
	let confirmingImport = $state(false);

	function onlocale(next: Locale) {
		locale = next;
		i18n.locale = next;
	}
</script>

<SettingsScreen
	{locale}
	{tempoBpm}
	{inputs}
	{inputDeviceId}
	{calibrationOffsetMs}
	{importError}
	{confirmingImport}
	{onlocale}
	ontempo={(bpm) => (tempoBpm = clampTempo(bpm))}
	oninput={(id) => (inputDeviceId = id)}
	onexport={() => undefined}
	onimportfile={() => {
		confirmingImport = true;
		importError = null;
	}}
	onimportconfirm={() => (confirmingImport = false)}
	onimportcancel={() => (confirmingImport = false)}
/>
```

Ajuster `SettingsScreen.svelte` pour la structure verrouillée.

- [ ] **Step 4: Inspection bureau + téléphone**

```bash
npm run dev -- --port 5180
```

Ouvrir `/dev/settings` en 1280×720 et ~390×844. Corriger en un lot.

- [ ] **Step 5: Tests**

Run: `npx vitest run src/lib/ui/screens/settings src/routes/settings && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/screens/settings src/routes/dev/settings .impeccable/surfaces .impeccable/mocks .impeccable/review
git commit -m "$(cat <<'EOF'
feat: compose settings screen in Bonfire world

EOF
)"
```

---

### Task 8: Passe `detect` et vérification finale

**Files:**
- Modify: uniquement des fichiers possédés I3 si `detect` signale un défaut corrigeable sans toucher H

**Interfaces:**
- Consumes: tous les écrans I3.
- Produces: branche verte ; compte rendu des constats `detect` laissés sur le code de H (s’il y en a, ne pas les « réparer » hors périmètre).

- [ ] **Step 1: Passe detect**

```bash
~/.cursor/skills/impeccable/scripts/impeccable detect --json \
	src/lib/ui/screens/calibration/CalibrationScreen.svelte \
	src/lib/ui/screens/settings/SettingsScreen.svelte \
	src/routes/calibration/+page.svelte \
	src/routes/settings/+page.svelte \
	src/routes/dev/calibration/+page.svelte \
	src/routes/dev/settings/+page.svelte
```

Corriger les findings sur les fichiers I3 (contraste, focus, mesure de texte, etc.). Ignorer / signaler ceux qui exigent une modification de primitive H.

- [ ] **Step 2: Suite complète du plan**

```bash
npx vitest run \
	src/lib/ui/screens/calibration \
	src/lib/ui/screens/settings \
	src/routes/calibration \
	src/routes/settings
npm run check
npm run format
```

Expected: tous PASS ; `svelte-check found 0 errors` ; `git status --short` ne liste que des fichiers sous les chemins I3.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/screens/calibration src/lib/ui/screens/settings src/routes/calibration src/routes/settings src/routes/dev/calibration src/routes/dev/settings
git commit -m "$(cat <<'EOF'
chore: finish I3 detect pass on calibration and settings

EOF
)"
```

---

## Fin du plan

À la fin de ce plan, la branche `plan/i3-calibration-reglages-sauvegarde` fournit `/calibration`, `/settings` et leurs pages `dev`. Elle se fusionne dans `main` en fin de vague 2, `npm test && npm run check` après la fusion.

Repères pour la suite :

- **K** : câbler `createApp()` pour que `useAppServices()` fournisse le vrai `CalibrationService`, le vrai `DexieBackup` et le détecteur qui ouvre l'entrée avec `echoCancellation` / `noiseSuppression` / `autoGainControl` à `false` ; appliquer la langue des réglages au layout ; retirer `/dev/**` du build de production.
- **I1** : lien depuis l'accueil vers `/settings` (hors périmètre I3).
- **J** : lit `calibrationOffsetMs` et `tempoBpm` depuis les réglages ; n'appelle pas l'UI I3.

### Écarts constatés à l'écriture du plan

1. **Briefs d'écran** : I3 commite les siens, nommés `calibration` et `settings`. `DESIGN.md`, le brief de session et `comp-4` restent à H. `.impeccable/build/state.json` est unique : ne pas lancer `build-phase` en même temps qu'un autre plan.
2. **P0 ne fournit pas `FakeCalibration`, `FakeBackup` ni `createFakeAppServices`** : doublures locales sous `src/lib/ui/screens/calibration/fakeServices.ts`.
3. **Contraintes `getUserMedia`** : documentées et assumées par F ; I3 ne fait qu'appeler `detector.start`.
4. **Micro intégré** : heuristique sur le libellé uniquement (pas d'API standard).
5. **Fichier plan G** : peut être absent du dépôt au moment de l'écriture ; le contrat utilisé est celui du README (`CalibrationPort` exact).
6. **Navigation vers `/settings`** : hors I3 (I1 / K).
