# K — Intégration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Câbler les implémentations réelles en une seule racine de composition (`createApp`), fournir les services à l'interface via `+layout.svelte`, exclure les pages de développement et `/diagnostic` du build de production, puis vérifier le prototype (tests, check, build, detect, checklist guitare).

**Architecture:** `src/lib/composition/createApp.ts` est le seul endroit qui construit les adaptateurs d'infrastructure et les passe à `createAppServices` (plan J). Un seul `WebAudioClock` possède l'`AudioContext` ; métronome, sons et détecteur reçoivent `() => clock.context()`. Une seule base Dexie alimente les quatre dépôts et `DexieBackup`. Le layout crée l'app une fois, appelle `provideAppServices`, et applique la langue stockée, sans toucher aux jetons ni aux polices de H.

**Tech Stack:** SvelteKit 2 (statique, `ssr = false`), Svelte 5 (runes), Dexie, Web Audio API, Vitest (jsdom pour le smoke test), `fake-indexeddb`, `impeccable detect`.

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

### Contraintes propres au plan K

- Branche `plan/k-integration`, dans son propre worktree, créée depuis `main` après la fusion de la vague 2.
- Chemins possédés uniquement : `src/lib/composition/**`, modifications de `src/routes/+layout.svelte`, et les gardes de production sous `src/routes/dev/**` et `src/routes/diagnostic/**` (layouts minces qui appellent `requireDev`). Exception Task 5 : correctifs **mécaniques** issus de `impeccable detect` sur `src/lib/ui` et `src/routes` (autorisés par la fiche K du README et par la passe finale new-work.md §7). Aucun autre fichier : pas de `package.json`, pas de logique de domaine, pas de redesign.
- Imports autorisés : signatures des plans P0 et A–J déjà fusionnés (README), rien d'autre à inventer.
- **Un seul `AudioContext`** : créé paresseusement par `WebAudioClock.resume()` ; jamais un second `new AudioContext()` dans ce plan. Métronome, cues et détecteur reçoivent `() => clock.context()` (plan E, fin de plan).
- **Entrée audio brute** (README) : le détecteur (F) ouvre déjà l'entrée avec `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` ; K ne contourne pas ce comportement.
- **Clic sans hauteur** : le métronome (E) émet du bruit filtré ; K ne remplace pas le métronome ni n'ajoute d'oscillateur.
- `createApp()` n'appelle jamais `clock.resume()` : le premier geste utilisateur passe par `SessionController.start()` / l'écran de calibration (J, I3).
- Smoke test en jsdom (`*.svelte.spec.ts`) avec `fake-indexeddb/auto` et une usine `AudioContext` injectée ; la factory n'est pas appelée à la construction.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/composition/createApp.ts` | Racine de composition : horloge, audio, Dexie, calibration, `createAppServices` |
| `src/lib/composition/createApp.svelte.spec.ts` | Smoke test jsdom (IndexedDB faux, AudioContext stub) |
| `src/lib/composition/requireDev.ts` | Refuse les routes hors `dev` avec `error(404)` |
| `src/lib/composition/requireDev.spec.ts` | Tests Node de `refuseUnlessDev` |
| `src/lib/composition/index.ts` | Réexporte `createApp` et `requireDev` |
| `src/routes/+layout.svelte` | (modifié) crée l'app, `provideAppServices`, locale ; conserve imports H |
| `src/routes/dev/+layout.ts` | Garde production pour tout `/dev/*` |
| `src/routes/diagnostic/+layout.ts` | Garde production pour `/diagnostic` |

---

### Task 1: Racine de composition `createApp`

**Files:**
- Create: `src/lib/composition/createApp.ts`
- Create: `src/lib/composition/createApp.svelte.spec.ts`
- Create: `src/lib/composition/index.ts`

**Interfaces:**
- Consumes:
  - `WebAudioClock`, `WebAudioMetronome` (`$lib/infrastructure/audio/clock`, E)
  - `WebAudioCues` (`$lib/infrastructure/audio/cues`, E)
  - `WebAudioNoteDetector` (`$lib/infrastructure/audio/detection`, F)
  - `CalibrationService` (`$lib/infrastructure/audio/calibration`, G)
  - `createDatabase`, `DexieAttemptRepository`, `DexieCardStateRepository`, `DexieSessionRepository`, `DexieSettingsRepository`, `DexieBackup` (`$lib/infrastructure/storage`, D)
  - `buildCurriculum` (`$lib/domain/music`, A)
  - `createAppServices` (`$lib/application/services/createAppServices`, J)
  - `AppServices` (`$lib/application/app`, P0)
- Produces: `createApp(options?: CreateAppOptions): AppServices` ; `CreateAppOptions` avec `createContext?: () => AudioContext` et `databaseName?: string` (injection de test uniquement ; l'appel de production est `createApp()`).

- [ ] **Step 1: Écrire le smoke test jsdom**

Créer `src/lib/composition/createApp.svelte.spec.ts` (projet Vitest `client` / jsdom) :

```ts
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './createApp';

class StubAudioContext {
	currentTime = 0;
	state: AudioContextState = 'suspended';
	destination = {} as AudioDestinationNode;

	async resume(): Promise<void> {
		this.state = 'running';
	}

	createGain(): GainNode {
		return {
			gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {}
		} as unknown as GainNode;
	}

	createOscillator(): OscillatorNode {
		return {
			frequency: { value: 440, setValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {},
			start: () => {},
			stop: () => {}
		} as unknown as OscillatorNode;
	}

	createBuffer(): AudioBuffer {
		return {
			getChannelData: () => new Float32Array(128),
			length: 128,
			numberOfChannels: 1,
			sampleRate: 48000,
			duration: 128 / 48000
		} as unknown as AudioBuffer;
	}

	createBufferSource(): AudioBufferSourceNode {
		return {
			buffer: null,
			connect: () => ({}),
			disconnect: () => {},
			start: () => {},
			stop: () => {}
		} as unknown as AudioBufferSourceNode;
	}

	createBiquadFilter(): BiquadFilterNode {
		return {
			type: 'bandpass',
			frequency: { value: 2000, setValueAtTime: () => {} },
			Q: { value: 1, setValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {}
		} as unknown as BiquadFilterNode;
	}

	close(): Promise<void> {
		this.state = 'closed';
		return Promise.resolve();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createApp', () => {
	it('wires AppServices without creating an AudioContext at construction', async () => {
		const factory = vi.fn(() => new StubAudioContext() as unknown as AudioContext);
		const services = createApp({
			createContext: factory,
			databaseName: crypto.randomUUID()
		});

		expect(factory).not.toHaveBeenCalled();
		expect(services.settings).toBeDefined();
		expect(services.backup).toBeDefined();
		expect(services.detector).toBeDefined();
		expect(services.calibration).toBeDefined();
		expect(typeof services.homeStats).toBe('function');
		expect(typeof services.sessionSummary).toBe('function');
		expect(typeof services.neckMap).toBe('function');
		expect(typeof services.startSession).toBe('function');

		const settings = await services.settings.get();
		expect(settings.locale).toBe('fr');
		expect(settings.tempoBpm).toBe(80);
		expect(settings.inputDeviceId).toBeNull();
		expect(settings.calibrationOffsetMs).toBeNull();

		const stats = await services.homeStats();
		expect(stats.nextAction).toBe('placement');
		expect(factory).not.toHaveBeenCalled();
	});

	it('reads the calibration device id from settings', async () => {
		const factory = vi.fn(() => new StubAudioContext() as unknown as AudioContext);
		const services = createApp({
			createContext: factory,
			databaseName: crypto.randomUUID()
		});

		await services.settings.update({ inputDeviceId: 'usb-interface-1' });
		const again = await services.settings.get();
		expect(again.inputDeviceId).toBe('usb-interface-1');
		expect(factory).not.toHaveBeenCalled();
	});

	it('keeps repositories and backup on one database', async () => {
		const name = crypto.randomUUID();
		const services = createApp({
			createContext: () => new StubAudioContext() as unknown as AudioContext,
			databaseName: name
		});

		await services.settings.update({ locale: 'en', tempoBpm: 96 });
		const file = await services.backup.exportAll();
		expect(file.settings.locale).toBe('en');
		expect(file.settings.tempoBpm).toBe(96);
		expect(file.attempts).toEqual([]);
		expect(file.cards).toEqual([]);
		expect(file.sessions).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run --project client src/lib/composition/createApp.svelte.spec.ts`

Expected: FAIL, « Failed to resolve import "./createApp" » (ou équivalent module introuvable).

- [ ] **Step 3: Écrire `createApp.ts`**

Créer `src/lib/composition/createApp.ts` :

```ts
import { createAppServices } from '$lib/application/services/createAppServices';
import type { AppServices } from '$lib/application/app';
import { buildCurriculum } from '$lib/domain/music';
import { WebAudioClock, WebAudioMetronome } from '$lib/infrastructure/audio/clock';
import { WebAudioCues } from '$lib/infrastructure/audio/cues';
import { CalibrationService } from '$lib/infrastructure/audio/calibration';
import { WebAudioNoteDetector } from '$lib/infrastructure/audio/detection';
import {
	createDatabase,
	DexieAttemptRepository,
	DexieBackup,
	DexieCardStateRepository,
	DexieSessionRepository,
	DexieSettingsRepository
} from '$lib/infrastructure/storage';

export interface CreateAppOptions {
	/** Injected in tests. Production uses the browser AudioContext via WebAudioClock. */
	createContext?: () => AudioContext;
	/** Injected in tests. Production uses the default Dexie name `neckspert-play`. */
	databaseName?: string;
}

/**
 * Composition root. One WebAudioClock owns the single AudioContext (lazy on resume).
 * Metronome, cues and detector share () => clock.context(). One Dexie database feeds
 * every repository and DexieBackup. Calibration reads inputDeviceId from settings.
 */
export function createApp(options: CreateAppOptions = {}): AppServices {
	const clock = new WebAudioClock(options.createContext);
	const context = () => clock.context();
	const metronome = new WebAudioMetronome(context);
	const cues = new WebAudioCues(context);
	const detector = new WebAudioNoteDetector(context);

	const db = createDatabase(options.databaseName);
	const attempts = new DexieAttemptRepository(db);
	const cards = new DexieCardStateRepository(db);
	const sessions = new DexieSessionRepository(db);
	const settings = new DexieSettingsRepository(db);
	const backup = new DexieBackup(db);

	const calibration = new CalibrationService({
		clock,
		metronome,
		detector,
		deviceId: async () => (await settings.get()).inputDeviceId
	});

	return createAppServices({
		clock,
		metronome,
		detector,
		cues,
		attempts,
		cards,
		sessions,
		settings,
		backup,
		calibration,
		curriculum: buildCurriculum(),
		now: () => Date.now(),
		random: () => Math.random(),
		newId: () => crypto.randomUUID()
	});
}
```

Créer `src/lib/composition/index.ts` (sans `requireDev` : ajouté à la Task 3) :

```ts
export { createApp, type CreateAppOptions } from './createApp';
```

- [ ] **Step 4: Lancer le smoke test pour vérifier qu'il passe**

Run: `npx vitest run --project client src/lib/composition/createApp.svelte.spec.ts`

Expected: PASS (3 tests). Si un import d'infrastructure échoue au chargement (worklet, etc.), ne pas mocker massivement : corriger uniquement un éventuel effet de bord de constructeur hors contrat F/E (les constructeurs ne doivent pas toucher le contexte). Ne pas modifier les fichiers hors `src/lib/composition/**`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composition/createApp.ts src/lib/composition/createApp.svelte.spec.ts src/lib/composition/index.ts
git commit -m "$(cat <<'EOF'
feat: wire real adapters in createApp composition root

EOF
)"
```

---

### Task 2: Fournir les services et la langue dans le layout

**Files:**
- Modify: `src/routes/+layout.svelte`

**Interfaces:**
- Consumes: `createApp` (Task 1) ; `provideAppServices` (`$lib/application/app`, P0) ; `i18n` (`$lib/i18n/index.svelte`, P0) ; imports jetons/polices déjà présents (H).
- Produces: une instance d'app par chargement du layout, contexte Svelte rempli, `i18n.locale` aligné sur `settings.locale`.

- [ ] **Step 1: Lire le layout laissé par H**

Run: `cat src/routes/+layout.svelte`

Expected: le fichier importe `$lib/ui/tokens.css` et la police (lien `@font-face` / fichier sous `static/fonts/` / import CSS), et rend `{@render children()}`. Noter la liste exacte des imports à conserver.

- [ ] **Step 2: Remplacer le layout en conservant les imports H**

Réécrire `src/routes/+layout.svelte` en **gardant mot pour mot** chaque import de jeton et de police déjà présent, puis en ajoutant le câblage K. Squelette (les lignes `KEEP` sont remplacées par les imports H réels lus à l'étape 1) :

```svelte
<script lang="ts">
	import { provideAppServices } from '$lib/application/app';
	import { createApp } from '$lib/composition/createApp';
	import { i18n } from '$lib/i18n/index.svelte';
	// KEEP: tous les imports tokens.css / polices déjà présents (H) — ne pas les supprimer ni les réordonner hors de ce bloc

	let { children } = $props();

	const services = createApp();
	provideAppServices(services);

	$effect(() => {
		let cancelled = false;
		void services.settings.get().then((settings) => {
			if (!cancelled) i18n.locale = settings.locale;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{@render children()}
```

Règles :
- `createApp()` et `provideAppServices(services)` s'exécutent de façon synchrone pendant l'init du composant (`setContext` interdit dans un `$effect` ou après un `await`).
- Ne pas appeler `clock.resume()` ici.
- Ne pas ajouter de balise `<nav>`, ni de chrome, ni de styles : H possède le système visuel.

- [ ] **Step 3: Vérifier les types**

Run: `npm run check`

Expected: `svelte-check found 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "$(cat <<'EOF'
feat: provide app services and stored locale from layout

EOF
)"
```

---

### Task 3: Exclure `/dev` et `/diagnostic` en production

**Files:**
- Create: `src/lib/composition/requireDev.ts`
- Create: `src/lib/composition/requireDev.spec.ts`
- Modify: `src/lib/composition/index.ts`
- Create: `src/routes/dev/+layout.ts`
- Create: `src/routes/diagnostic/+layout.ts`

**Interfaces:**
- Consumes: `dev` de `$app/environment` ; `error` de `@sveltejs/kit`.
- Produces: `refuseUnlessDev(isDev: boolean): void`, `requireDev(): void` ; layouts qui appellent `requireDev()` pour tout enfant sous `/dev` et `/diagnostic`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/composition/requireDev.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { refuseUnlessDev } from './requireDev';

describe('refuseUnlessDev', () => {
	it('allows access in development', () => {
		expect(() => refuseUnlessDev(true)).not.toThrow();
	});

	it('returns 404 outside development', () => {
		try {
			refuseUnlessDev(false);
			expect.unreachable('expected error(404)');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (isHttpError(err)) {
				expect(err.status).toBe(404);
			}
		}
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run --project server src/lib/composition/requireDev.spec.ts`

Expected: FAIL, « Failed to resolve import "./requireDev" ».

- [ ] **Step 3: Implémenter la garde et les layouts**

Créer `src/lib/composition/requireDev.ts` :

```ts
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/** Testable gate: throws a 404 HttpError when `isDev` is false. */
export function refuseUnlessDev(isDev: boolean): void {
	if (!isDev) error(404);
}

/** Production gate for /dev and /diagnostic. Uses SvelteKit's `dev` flag. */
export function requireDev(): void {
	refuseUnlessDev(dev);
}
```

Créer `src/routes/dev/+layout.ts` :

```ts
import { requireDev } from '$lib/composition/requireDev';

export function load() {
	requireDev();
}
```

Créer `src/routes/diagnostic/+layout.ts` :

```ts
import { requireDev } from '$lib/composition/requireDev';

export function load() {
	requireDev();
}
```

Mettre à jour `src/lib/composition/index.ts` :

```ts
export { createApp, type CreateAppOptions } from './createApp';
export { refuseUnlessDev, requireDev } from './requireDev';
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run --project server src/lib/composition/requireDev.spec.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/composition/requireDev.ts src/lib/composition/requireDev.spec.ts src/lib/composition/index.ts src/routes/dev/+layout.ts src/routes/diagnostic/+layout.ts
git commit -m "$(cat <<'EOF'
feat: 404 /dev and /diagnostic outside the development server

EOF
)"
```

---

### Task 4: Vérification automatisée et preview

**Files:**
- Modify: uniquement des fichiers sous `src/lib/composition/**` ou `src/routes/+layout.svelte` / gardes de Task 3, si un échec y trouve sa cause. Ne pas « réparer » A–J en modifiant leurs chemins.

**Interfaces:**
- Consumes: toute la suite déjà fusionnée.
- Produces: `npm test`, `npm run check`, `npm run build` verts ; `npm run preview` sert `build/`.

- [ ] **Step 1: Lancer toute la suite de tests**

Run: `npm test`

Expected: tous les projets Vitest PASS (server + client), y compris les smoke tests de composition.

- [ ] **Step 2: Vérifier les types**

Run: `npm run check`

Expected: `svelte-check found 0 errors`.

- [ ] **Step 3: Build statique**

Run: `npm run build`

Expected: se termine sans erreur ; `build/index.html` existe ; pas d'échec d'adaptation static.

- [ ] **Step 4: Preview**

Dans un terminal :

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

Puis, dans un autre :

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/dev/home
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/diagnostic
```

Expected:
- `/` → `200` (ou `200` via `index.html` + route client).
- `/dev/home` et `/diagnostic` : en preview (production), la navigation client doit aboutir à une 404 SvelteKit (`error(404)`). Si `curl` ne voit que le `fallback: 'index.html'` (200 HTML), ouvrir Chrome sur ces URL après preview et confirmer la page d'erreur 404 — c'est le critère qui compte pour une SPA.

Arrêter le preview (`Ctrl+C`) ensuite.

- [ ] **Step 5: Commit (seulement s'il y a eu un correctif K)**

S'il n'y a aucun changement :

```bash
git status --porcelain
```

Expected: vide (rien à committer). Ne pas créer de commit vide.

S'il y a eu un correctif dans les chemins K :

```bash
git add src/lib/composition src/routes/+layout.svelte src/routes/dev/+layout.ts src/routes/diagnostic/+layout.ts
git commit -m "$(cat <<'EOF'
fix: harden composition wiring after full verification

EOF
)"
```

---

### Task 5: `impeccable detect` (passe finale, correctifs mécaniques seulement)

Référence : `~/.cursor/skills/impeccable/reference/new-work.md` §7 — sur le web, sans hook design, lancer une fois `impeccable detect --json` sur les cibles d'interface, corriger ce qui est **mécanique**, et ne pas ouvrir une seconde chasse aux défauts. Ne pas lancer le finish-reviewer ici (hors périmètre K) ; la détection et les correctifs mécaniques suffisent pour clôturer le prototype câblé.

**Files:**
- Modify: uniquement des correctifs mécaniques dans `src/lib/ui/**` et `src/routes/**` signalés par le détecteur (contraste trivial, attribut manquant évident, etc.). Si un finding exige un redesign, le noter dans le message de commit ou le laisser ouvert — K ne redesign pas.

**Interfaces:**
- Consumes: surfaces déjà livrées par H / I1 / I2 / I3.
- Produces: un rapport detect traité ; correctifs mécaniques commités s'il y en a.

- [ ] **Step 1: Lancer le détecteur**

Run:

```bash
~/.cursor/skills/impeccable/scripts/impeccable detect --json src/lib/ui src/routes
```

Expected: JSON de findings (éventuellement vide). Sauvegarder la sortie dans le terminal ; ne pas inventer de findings.

- [ ] **Step 2: Appliquer les correctifs mécaniques seulement**

Pour chaque finding :
- **Mécanique** (typo CSS évidente, variable manquante déjà définie ailleurs, `alt` vide sur un décoratif déjà marqué, import cassé) → corriger sur place.
- **Non mécanique** (refonte visuelle, changement de hiérarchie, nouveau sprite) → ne pas toucher ; laisser le finding tel quel.

Ne pas relancer `detect` une deuxième fois après correctifs (new-work.md §7 : « Do not run a second detector »).

- [ ] **Step 3: Recheck types et tests touchés**

Run: `npm test && npm run check`

Expected: PASS, 0 erreur.

- [ ] **Step 4: Commit**

S'il y a des correctifs :

```bash
git add src/lib/ui src/routes
git commit -m "$(cat <<'EOF'
fix: apply mechanical impeccable detect findings on UI routes

EOF
)"
```

Si le JSON était vide ou sans correctif mécanique :

```bash
git status --porcelain
```

Expected: vide ; pas de commit vide.

---

### Task 6: Checklist manuelle — vraie guitare

Cette tâche ne produit pas de code. Elle valide le prototype câblé avec une guitare réelle, **interface audio** puis **micro intégré**. Chaque item a l'observation attendue. Cocher au fur et à mesure.

Préalable : `npm run dev`, Chrome, casque recommandé pour le micro appareil (README, entrée brute).

- [ ] **Step 1: Calibration — interface audio**

1. Brancher la guitare sur l'interface, ouvrir `/calibration`, choisir l'entrée interface dans la liste.
2. Lancer la calibration (frappes étouffées sur le clic).
3. **Attendu :** la procédure se termine avec un écart affiché et enregistré (`calibrationOffsetMs` non null dans les réglages) ; le niveau RMS réagit au jeu ; le clic reste un bruit bref sans note.

- [ ] **Step 2: Calibration — micro intégré**

1. Choisir le micro de l'appareil, casque aux oreilles, même procédure.
2. **Attendu :** la calibration peut réussir ou échouer selon le bruit ambiant ; si elle réussit, l'écart est enregistré ; l'écran recommande le casque ; la détection est moins stable qu'avec l'interface (acceptable).

- [ ] **Step 3: Positionnement (première session)**

1. Depuis l'accueil, lancer le positionnement (bouton principal = placement si `placementDoneAt` est null).
2. Jouer quelques consignes mode 1 juste et sous le seuil, d'autres fausses ou lentes.
3. **Attendu :** consignes lisibles à distance ; piste de tuiles et verdicts (sprites + sons) ; fin de session → bilan ; les réussites en rappel direct apparaissent ensuite comme cartes en révision ; `placementDoneAt` renseigné après la fin.

- [ ] **Step 4: Session du jour**

1. Avancer l'horloge système ou attendre qu'une révision soit due (ou utiliser des données déjà dues).
2. Lancer la session du jour depuis l'accueil.
3. **Attendu :** d'abord révisions à froid (au plus ~20), puis apprentissage à chaud de nouvelles cibles avec aide si pas de fatigue ; mode 1 avant mode 2 dans la même session ; bilan à la fin.

- [ ] **Step 5: Mode 2**

1. Atteindre un ensemble acquis en mode 1 pour ouvrir le mode 2 correspondant (ou session qui en contient).
2. Répondre au pavé de 12 boutons (premier toucher retenu).
3. **Attendu :** plus de piste de tuiles ; grands boutons ; F# / Gb sur le même bouton ; verdict `perfect` / `late` / `wrong` sans `early` ; la guitare n'est pas requise.

- [ ] **Step 6: Pause**

1. Pendant une série mode 1, mettre en pause (contrôle prévu par l'UI / `controller.pause()`).
2. Reprendre.
3. **Attendu :** métronome et détection s'arrêtent en pause ; à la reprise, pas de rafale de clics en retard ; la série continue proprement.

- [ ] **Step 7: Fatigue**

1. Enchaîner assez de réponses (≥ 12 avec réponse) en dégradant volontairement précision ou temps (surtout mode 2 pour le temps de réaction).
2. **Attendu :** `fatigueDetected` passe à true ; l'apprentissage à chaud est sauté si la fatigue apparaît avant ; le bilan signale la fatigue.

- [ ] **Step 8: Bilan (summary)**

1. Ouvrir `/summary` pour la session venant de finir.
2. **Attendu :** précision et temps médian à froid, positions apprises, fatigue le cas échéant, heure conseillée de la prochaine session (~2 h plus tard si modèle par défaut).

- [ ] **Step 9: Carte du manche**

1. Ouvrir `/map`.
2. **Attendu :** grille 6×12, statuts par sens (locate / identify) cohérents avec les cartes jouées ; pas de manche dessiné comme surface de réponse.

- [ ] **Step 10: Langue**

1. Dans `/settings`, passer en anglais, revenir à l'accueil et à une consigne.
2. Repasser en français.
3. **Attendu :** libellés d'interface et de cordes suivent la langue ; les noms de notes restent en lettres (C, D, E…) ; après rechargement, la langue stockée est réappliquée par le layout.

- [ ] **Step 11: Export puis import**

1. `/settings` → exporter ; vérifier le téléchargement `neckspert-play-YYYY-MM-DD.json`.
2. Modifier un réglage (tempo), puis importer le fichier exporté (confirmation de remplacement).
3. **Attendu :** après import, tempo et cartes restaurés comme à l'export ; un JSON invalide est refusé avec un message lisible.

- [ ] **Step 12: Rechargement**

1. Recharger la page (F5) sur l'accueil.
2. **Attendu :** pas d'erreur console bloquante ; `AppServices` refourni ; locale et stats toujours là (IndexedDB) ; pas de second clic métronome fantôme.

- [ ] **Step 13: Téléphone portrait**

1. DevTools device mode ou vrai téléphone, viewport portrait étroit.
2. Parcourir accueil, session (consigne), mode 2 (pavé), calibration.
3. **Attendu :** consignes lisibles ; cibles tactiles larges ; pas de contrôle fin requis pendant une série ; pas de débordement horizontal bloquant.

- [ ] **Step 14: Non-régression audio (micro vs clic)**

1. Micro appareil actif sur `/diagnostic` en **dev** seulement ; jouer ; laisser le métronome tourner.
2. **Attendu :** le clic (bruit) ne produit pas de fondamentale stable prise pour une note de façon systématique ; noter tout faux positif éventuel (rapport E → K). Avec l'interface, les notes jouées apparaissent avec octave et cents cohérents.

- [ ] **Step 15: Clôture**

Aucun fichier à ajouter pour la checklist. Si un défaut relève de K (câblage, layout, garde) : corriger, retester le cas, committer :

```bash
git add src/lib/composition src/routes/+layout.svelte src/routes/dev/+layout.ts src/routes/diagnostic/+layout.ts
git commit -m "$(cat <<'EOF'
fix: address integration issues found in manual guitar checklist

EOF
)"
```

Sinon : `git status --porcelain` vide sur les chemins K.

---

## Fin du plan

À la fin de ce plan, `main` (via `plan/k-integration`) expose un prototype modes 1–2 câblé de bout en bout : une composition, un layout fournisseur, pas de pages `dev`/`diagnostic` en production, build statique vérifié, detect mécanique traité, checklist guitare exécutée.

Câblage de référence (ne pas dupliquer d'`AudioContext`) :

```ts
const clock = new WebAudioClock();
const metronome = new WebAudioMetronome(() => clock.context());
const cues = new WebAudioCues(() => clock.context());
const detector = new WebAudioNoteDetector(() => clock.context());
// resume() uniquement depuis un geste utilisateur (session / calibration)
```
