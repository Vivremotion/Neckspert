# H — Écran de jeu et système visuel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'écran de jeu mode 1 (consigne, piste de tuiles, verdict) et le système visuel Game Boy Bonfire de la famille Neckspert, à partir de la maquette approuvée et du contrat de direction, jusqu'à `DESIGN.md`.

**Architecture:** Logique pure de piste et de libellé de mesure sous `src/lib/ui/play/` (testée en Node) ; `DemoPlaySession` comme `PlaySessionController` scripté sans audio, horloge injectable ; primitives et jetons réutilisables sous `src/lib/ui/` ; `PlayScreen` lit `controller.view` et `timeline.nowBeat()` chaque image ; routes minces sous `src/routes/session/` ; construction comp-led Impeccable (spec → plates → hero → sections → motion → responsive → review → documenter). Aucun import depuis les plans A–G de la même vague.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), CSS natif avec variables, Vitest (`*.spec.ts` Node, `*.svelte.spec.ts` jsdom), Impeccable (`build-phase`, `comp-spec`, `font-match`, `detect`, finish reviewer, documenter).

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

Contraintes propres à ce plan :

- Branche `plan/h-ecran-de-jeu`, dans son propre worktree, créée depuis `main` une fois P0 fusionné.
- Chemins possédés uniquement (README, ligne H) : `src/lib/ui/**` sauf `src/lib/ui/screens/**`, `src/routes/session/**`, `src/routes/+layout.svelte`, `static/fonts/**`, `DESIGN.md`, `.impeccable/**`. Ne touche ni `package.json`, ni `package-lock.json`, ni `vite.config.ts`, ni les fichiers du socle.
- Imports autorisés : contrats et utilitaires du socle P0 uniquement (`$lib/domain/types`, `$lib/domain/music/types` pour les types seuls, `$lib/application/session/contract`, `$lib/application/app`, `$lib/i18n`). Aucun import depuis les plans A–G de la même vague.
- Avant toute tâche visuelle (Task 4 et suivantes) : charger le skill Impeccable (`~/.cursor/skills/impeccable/SKILL.md`), puis `reference/new-work.md` §§5–7 et `reference/craft-floor.md` juste avant la première édition d'UI.
- La maquette approuvée est `.impeccable/mocks/comp-4-full-bleed-lane.png`. Les trois corrections obligatoires du contrat de direction prévalent sur l'encre résiduelle de la PNG (chiffres au-dessus des cibles jouées, « 10 » / « 14 » / « 15 »).
- Palette figée : `#E99568` (fond), `#BE6754` (moyen), `#813B2A` (ombre), `#451218` (encre). Tout cinquième ton = tramage en damier des deux tons adjacents.
- Phases Impeccable mesurées (régions, police) : exécuter les commandes exactes et juger sur la sortie du gate ; ne jamais inventer de coordonnées de grille ni de nom de police.
- État actuel (`.impeccable/build/state.json`) : phase `comps` fermée, phase `spec` ouverte. Ne pas relancer `build-phase start`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/ui/play/lane.ts` | `LaneTile`, `laneTiles` — géométrie pure de la piste |
| `src/lib/ui/play/lane.spec.ts` | Tests Node des trois corrections et de la fenêtre visible |
| `src/lib/ui/play/barLabel.ts` | `barLabel` — « MESURE a/b TEMPS c/d » |
| `src/lib/ui/play/barLabel.spec.ts` | Tests Node du libellé de mesure |
| `src/lib/ui/play/demo/DemoPlaySession.svelte.ts` | Contrôleur scripté mode 1, horloge injectable |
| `src/lib/ui/play/demo/DemoPlaySession.spec.ts` | Tests Node du scénario |
| `src/lib/ui/tokens.css` | Quatre tons, grille 8 px, police, espacements |
| `src/lib/ui/primitives/PixelBox.svelte` | Cadre plain / double / inverted |
| `src/lib/ui/primitives/PixelButton.svelte` | Grand bouton tactile |
| `src/lib/ui/primitives/VerdictSprite.svelte` | Sprites des quatre verdicts |
| `src/lib/ui/primitives/PixelText.svelte` | Texte pixel à échelle 1\|2\|3\|4\|8 |
| `src/lib/ui/play/PlayScreen.svelte` | Écran de jeu alimenté par `PlaySessionController` |
| `src/lib/ui/play/PlayScreen.svelte.spec.ts` | Tests jsdom (piste, i18n, reduced-motion) |
| `src/lib/ui/play/messages.ts` | `defineMessages` de l'écran de jeu |
| `src/routes/+layout.svelte` | Importe `tokens.css` et la police ; rend `children` |
| `src/routes/session/+page.svelte` | `?kind=` → `useAppServices().startSession` → `PlayScreen` |
| `src/routes/session/demo/+page.svelte` | `PlayScreen` + `DemoPlaySession` |
| `static/fonts/**` | Police pixel choisie par `font-match` (Task 4) |
| `.impeccable/build/**`, `.impeccable/review/**` | Spec, plates, diffs, captures |
| `DESIGN.md`, `.impeccable/design.json` | Système documenté par le documenter |

---

### Task 1: `laneTiles` (TDD, trois corrections)

**Files:**
- Create: `src/lib/ui/play/lane.ts`
- Test: `src/lib/ui/play/lane.spec.ts`

**Interfaces:**
- Consumes: `LaneEntry`, `Verdict` de `$lib/application/session/contract` et `$lib/domain/types` (P0).
- Produces:
  - `export type LaneTileKind = 'empty' | 'target' | 'history'`
  - `export interface LaneTile { beatIndex: number; offset: number; label: number | null; kind: LaneTileKind; verdict: Verdict | null; justPlayed: boolean; current: boolean }`
  - `export function laneTiles(input: { nowBeat: number; beatsPerBar: number; promptBeatIndex: number | null; targetBeatIndex: number | null; history: readonly LaneEntry[]; beatsBefore: number; beatsAfter: number }): LaneTile[]`

Géométrie (corrections obligatoires) :

1. `offset = beatIndex - nowBeat` : négatif = passé (gauche), positif = à venir (droite).
2. **Temps en cours** = premier entier strictement à droite de la ligne : `currentBeatIndex = Math.floor(nowBeat) + 1`.
3. **Tuile juste jouée** = entrée d'`history` de `beatIndex` maximal parmi celles avec `offset <= 0` ; elle porte `justPlayed: true` (immédiatement à gauche de la ligne quand elle vient de passer).
4. **Numéros** : seuls les `beatsAfter` temps à venir (`currentBeatIndex` … `currentBeatIndex + beatsAfter - 1`) portent `label = (beatIndex % beatsPerBar) + 1` (cycle 1 2 3 4). Toutes les autres tuiles : `label: null` (pas de chiffre sur l'historique, pas de « 10 » / « 14 » / « 15 »).
5. Fenêtre : de `currentBeatIndex - beatsBefore` à `currentBeatIndex + beatsAfter - 1` inclus (défaut d'appel : `beatsBefore: 4`, `beatsAfter: 8`).
6. `kind` : `'history'` si une entrée d'`history` a ce `beatIndex` ; sinon `'target'` si `beatIndex === targetBeatIndex` ; sinon `'empty'`. `verdict` recopié depuis l'historique, sinon `null`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/lane.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { laneTiles, type LaneTile } from './lane';

const base = {
	beatsPerBar: 4 as const,
	promptBeatIndex: 8,
	targetBeatIndex: 16,
	beatsBefore: 4,
	beatsAfter: 8,
	history: [
		{ beatIndex: 4, verdict: 'perfect' as const },
		{ beatIndex: 5, verdict: 'perfect' as const },
		{ beatIndex: 6, verdict: 'early' as const },
		{ beatIndex: 7, verdict: 'wrong' as const },
		{ beatIndex: 10, verdict: 'late' as const }
	]
};

function byIndex(tiles: LaneTile[]): Map<number, LaneTile> {
	return new Map(tiles.map((t) => [t.beatIndex, t]));
}

describe('laneTiles', () => {
	it('places the current beat as the first tile right of the hit line', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const current = tiles.find((t) => t.current);
		expect(current?.beatIndex).toBe(11);
		expect(current!.offset).toBeGreaterThan(0);
		expect(tiles.filter((t) => t.current)).toHaveLength(1);
	});

	it('marks the latest history tile at or left of the line as justPlayed', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const just = tiles.find((t) => t.justPlayed);
		expect(just?.beatIndex).toBe(10);
		expect(just!.offset).toBeLessThanOrEqual(0);
		expect(just!.verdict).toBe('late');
		expect(tiles.filter((t) => t.justPlayed)).toHaveLength(1);
	});

	it('numbers only the eight upcoming beats 1–4 cycling; past and far tiles stay unlabeled', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const upcoming = tiles.filter((t) => t.offset > 0);
		expect(upcoming).toHaveLength(8);
		expect(upcoming.map((t) => t.label)).toEqual([4, 1, 2, 3, 4, 1, 2, 3]);
		expect(tiles.filter((t) => t.offset <= 0).every((t) => t.label === null)).toBe(true);
		expect(tiles.every((t) => t.label === null || (t.label >= 1 && t.label <= 4))).toBe(true);
	});

	it('exposes beatsBefore past slots and beatsAfter upcoming slots', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		expect(tiles.map((t) => t.beatIndex)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
		expect(tiles).toHaveLength(12);
	});

	it('tags the target beat and history kinds', () => {
		const map = byIndex(laneTiles({ ...base, nowBeat: 10.25 }));
		expect(map.get(16)?.kind).toBe('target');
		expect(map.get(10)?.kind).toBe('history');
		expect(map.get(11)?.kind).toBe('empty');
		expect(map.get(11)?.current).toBe(true);
	});

	it('has no justPlayed when no history has crossed the line', () => {
		const tiles = laneTiles({
			...base,
			nowBeat: 3.1,
			history: [{ beatIndex: 8, verdict: 'perfect' }],
			targetBeatIndex: 8,
			promptBeatIndex: 0
		});
		expect(tiles.every((t) => !t.justPlayed)).toBe(true);
		expect(tiles.find((t) => t.current)?.beatIndex).toBe(4);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/lane.spec.ts`

Expected: FAIL, « Failed to resolve import "./lane" ».

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/lib/ui/play/lane.ts` :

```ts
import type { LaneEntry } from '$lib/application/session/contract';
import type { Verdict } from '$lib/domain/types';

export type LaneTileKind = 'empty' | 'target' | 'history';

export interface LaneTile {
	beatIndex: number;
	/** Beat units relative to the hit line: negative = past (left), positive = upcoming (right). */
	offset: number;
	/** Beat-in-bar 1..beatsPerBar for the upcoming window only; null otherwise. */
	label: number | null;
	kind: LaneTileKind;
	verdict: Verdict | null;
	justPlayed: boolean;
	current: boolean;
}

export function laneTiles(input: {
	nowBeat: number;
	beatsPerBar: number;
	promptBeatIndex: number | null;
	targetBeatIndex: number | null;
	history: readonly LaneEntry[];
	beatsBefore: number;
	beatsAfter: number;
}): LaneTile[] {
	const { nowBeat, beatsPerBar, targetBeatIndex, history, beatsBefore, beatsAfter } = input;
	const currentBeatIndex = Math.floor(nowBeat) + 1;
	const first = currentBeatIndex - beatsBefore;
	const last = currentBeatIndex + beatsAfter - 1;

	const historyByBeat = new Map<number, LaneEntry>();
	for (const entry of history) {
		historyByBeat.set(entry.beatIndex, entry);
	}

	let justPlayedBeat: number | null = null;
	for (const entry of history) {
		if (entry.beatIndex - nowBeat <= 0) {
			if (justPlayedBeat === null || entry.beatIndex > justPlayedBeat) {
				justPlayedBeat = entry.beatIndex;
			}
		}
	}

	const tiles: LaneTile[] = [];
	for (let beatIndex = first; beatIndex <= last; beatIndex++) {
		const offset = beatIndex - nowBeat;
		const entry = historyByBeat.get(beatIndex);
		const upcoming = beatIndex >= currentBeatIndex && beatIndex < currentBeatIndex + beatsAfter;
		const kind: LaneTileKind = entry
			? 'history'
			: beatIndex === targetBeatIndex
				? 'target'
				: 'empty';
		tiles.push({
			beatIndex,
			offset,
			label: upcoming ? (beatIndex % beatsPerBar) + 1 : null,
			kind,
			verdict: entry?.verdict ?? null,
			justPlayed: justPlayedBeat !== null && beatIndex === justPlayedBeat,
			current: beatIndex === currentBeatIndex
		});
	}
	return tiles;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/lane.spec.ts`

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/play/lane.ts src/lib/ui/play/lane.spec.ts
git commit -m "$(cat <<'EOF'
feat: add pure lane tile geometry with comp corrections

EOF
)"
```

---

### Task 2: `barLabel` (TDD)

**Files:**
- Create: `src/lib/ui/play/barLabel.ts`
- Test: `src/lib/ui/play/barLabel.spec.ts`

**Interfaces:**
- Consumes: rien hors types locaux.
- Produces: `export function barLabel(input: { nowBeat: number; promptBeatIndex: number; targetBeatIndex: number; beatsPerBar: number }): { bar: number; bars: number; beat: number }`

Règle : `bars` = nombre de mesures de l'annonce (`ceil((target − prompt) / beatsPerBar)`, au moins 1). La progression se mesure depuis `promptBeatIndex` jusqu'à `nowBeat`, bornée à l'annonce. `bar` et `beat` sont 1-indexés. Affichage prévu : `MESURE {bar}/{bars} TEMPS {beat}/{beatsPerBar}`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/barLabel.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { barLabel } from './barLabel';

describe('barLabel', () => {
	it('reports measure 2/2 beat 3/4 during an 8-beat lead', () => {
		expect(
			barLabel({
				nowBeat: 14,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 2, bars: 2, beat: 3 });
	});

	it('starts at measure 1 beat 1 when the prompt appears', () => {
		expect(
			barLabel({
				nowBeat: 8,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 1, bars: 2, beat: 1 });
	});

	it('clamps to the last beat of the lead', () => {
		expect(
			barLabel({
				nowBeat: 20,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 2, bars: 2, beat: 4 });
	});

	it('handles a one-bar lead', () => {
		expect(
			barLabel({
				nowBeat: 10.5,
				promptBeatIndex: 8,
				targetBeatIndex: 12,
				beatsPerBar: 4
			})
		).toEqual({ bar: 1, bars: 1, beat: 3 });
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/barLabel.spec.ts`

Expected: FAIL, « Failed to resolve import "./barLabel" ».

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/lib/ui/play/barLabel.ts` :

```ts
export function barLabel(input: {
	nowBeat: number;
	promptBeatIndex: number;
	targetBeatIndex: number;
	beatsPerBar: number;
}): { bar: number; bars: number; beat: number } {
	const { nowBeat, promptBeatIndex, targetBeatIndex, beatsPerBar } = input;
	const leadBeats = Math.max(1, targetBeatIndex - promptBeatIndex);
	const bars = Math.max(1, Math.ceil(leadBeats / beatsPerBar));
	const raw = Math.floor(nowBeat - promptBeatIndex);
	const progressBeat = Math.min(leadBeats - 1, Math.max(0, raw));
	const bar = Math.min(bars, Math.floor(progressBeat / beatsPerBar) + 1);
	const beat = (progressBeat % beatsPerBar) + 1;
	return { bar, bars, beat };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/barLabel.spec.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/play/barLabel.ts src/lib/ui/play/barLabel.spec.ts
git commit -m "$(cat <<'EOF'
feat: add pure bar and beat label for the lane

EOF
)"
```

---

### Task 3: `DemoPlaySession` (contrôleur scripté, horloge injectable)

**Files:**
- Create: `src/lib/ui/play/demo/DemoPlaySession.svelte.ts`
- Create: `src/lib/ui/play/messages.ts`
- Test: `src/lib/ui/play/demo/DemoPlaySession.spec.ts`

**Interfaces:**
- Consumes: `PlaySessionController`, `PlayView`, `PlayTimeline`, `LaneEntry`, `Verdict` (P0) ; `defineMessages` (P0) ; `lane` / `barLabel` non importés ici (réservés à l'écran).
- Produces:
  - `export interface DemoClock { nowBeat(): number; setBeat(beat: number): void; advance(beats: number): void }`
  - `export class ManualDemoClock implements DemoClock`
  - `export class DemoPlaySession implements PlaySessionController` — `constructor(options?: { clock?: DemoClock; tempoBpm?: number })`
  - Messages FR/EN de l'écran dans `messages.ts` (verdicts, pause, reprise, mesure).

Scénario mode 1 sans audio : `idle` → `start()` lance un count-in de 4 temps → `awaiting` avec consigne « F » / « corde de B », `promptBeatIndex` et `targetBeatIndex` espacés de 8 temps → à chaque `targetBeatIndex` franchi (via l'horloge), pousse une entrée d'`history` avec un verdict scripté (`perfect`, `perfect`, `early`, `wrong`, `late`), passe en `verdict`, puis enchaîne la consigne suivante. `pause` / `resume` / `quit` / `answer` (no-op en mode 1). `timeline.nowBeat()` délègue à l'horloge injectable.

- [ ] **Step 1: Écrire les messages**

Créer `src/lib/ui/play/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n';

export const playMessages = defineMessages({
	fr: {
		pause: 'Pause',
		resume: 'Reprendre',
		quit: 'Quitter',
		start: 'Commencer',
		measure: (bar: number, bars: number, beat: number, beatsPerBar: number) =>
			`MESURE ${bar}/${bars} TEMPS ${beat}/${beatsPerBar}`,
		verdict: {
			perfect: 'Parfait',
			early: 'En avance',
			late: 'En retard',
			wrong: 'Mauvaise note'
		} as const,
		stringOf: (name: string) => `corde de ${name}`,
		aidFret: (fret: number) => `case ${fret}`
	},
	en: {
		pause: 'Pause',
		resume: 'Resume',
		quit: 'Quit',
		start: 'Start',
		measure: (bar: number, bars: number, beat: number, beatsPerBar: number) =>
			`BAR ${bar}/${bars} BEAT ${beat}/${beatsPerBar}`,
		verdict: {
			perfect: 'Perfect',
			early: 'Early',
			late: 'Late',
			wrong: 'Wrong note'
		} as const,
		stringOf: (name: string) => `${name} string`,
		aidFret: (fret: number) => `fret ${fret}`
	}
});
```

- [ ] **Step 2: Écrire le test**

Créer `src/lib/ui/play/demo/DemoPlaySession.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { i18n } from '$lib/i18n';
import { DemoPlaySession, ManualDemoClock } from './DemoPlaySession.svelte';

describe('DemoPlaySession', () => {
	it('starts idle and enters count-in on start', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		expect(demo.view.status).toBe('idle');
		await demo.start();
		expect(demo.view.status).toBe('count-in');
		expect(demo.view.tempoBpm).toBe(80);
		expect(demo.view.beatsPerBar).toBe(4);
	});

	it('shows the prompt once the count-in elapses and tracks the timeline clock', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('F');
		expect(demo.view.prompt?.secondary).toBe('corde de B');
		expect(demo.view.promptBeatIndex).toBe(4);
		expect(demo.view.targetBeatIndex).toBe(12);
		expect(demo.timeline.nowBeat()).toBe(4);
	});

	it('records a scripted verdict when the target beat is reached', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		clock.setBeat(12);
		demo.tick();
		expect(demo.view.status).toBe('verdict');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.history.at(-1)).toEqual({ beatIndex: 12, verdict: 'perfect' });
	});

	it('pauses and resumes without advancing scripted judgements', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		demo.pause();
		expect(demo.view.status).toBe('paused');
		clock.setBeat(12);
		demo.tick();
		expect(demo.view.history).toHaveLength(0);
		demo.resume();
		expect(demo.view.status).toBe('awaiting');
		demo.tick();
		expect(demo.view.status).toBe('verdict');
	});

	it('localizes the prompt secondary through defineMessages', async () => {
		const clock = new ManualDemoClock();
		i18n.locale = 'fr';
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.prompt?.secondary).toBe('corde de B');
		i18n.locale = 'en';
		demo.quit();
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.prompt?.secondary).toBe('B string');
		i18n.locale = 'fr';
	});
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/demo/DemoPlaySession.spec.ts`

Expected: FAIL, « Failed to resolve import "./DemoPlaySession.svelte" ».

- [ ] **Step 4: Écrire `DemoPlaySession`**

Créer `src/lib/ui/play/demo/DemoPlaySession.svelte.ts` :

```ts
import type {
	LaneEntry,
	PlaySessionController,
	PlayTimeline,
	PlayView,
	VerdictView
} from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';
import { playMessages } from '../messages';

export interface DemoClock {
	nowBeat(): number;
	setBeat(beat: number): void;
	advance(beats: number): void;
}

export class ManualDemoClock implements DemoClock {
	#beat = 0;

	nowBeat(): number {
		return this.#beat;
	}

	setBeat(beat: number): void {
		this.#beat = beat;
	}

	advance(beats: number): void {
		this.#beat += beats;
	}
}

const SCRIPT: { primary: string; stringName: string; verdict: Verdict; offsetMs: number; reactionMs: number }[] = [
	{ primary: 'F', stringName: 'B', verdict: 'perfect', offsetMs: 12, reactionMs: 980 },
	{ primary: 'C', stringName: 'G', verdict: 'perfect', offsetMs: -8, reactionMs: 1100 },
	{ primary: 'A', stringName: 'D', verdict: 'early', offsetMs: -120, reactionMs: 900 },
	{ primary: 'E', stringName: 'A', verdict: 'wrong', offsetMs: 40, reactionMs: 1300 },
	{ primary: 'F', stringName: 'B', verdict: 'late', offsetMs: 95, reactionMs: 1210 }
];

const COUNT_IN = 4;
const LEAD = 8;

export class DemoPlaySession implements PlaySessionController {
	readonly sessionId = 'demo-play';
	readonly view: PlayView;
	readonly timeline: PlayTimeline;

	#clock: DemoClock;
	#step = 0;
	#promptBeat: number | null = null;
	#targetBeat: number | null = null;
	#pausedBeat: number | null = null;

	constructor(options: { clock?: DemoClock; tempoBpm?: number } = {}) {
		this.#clock = options.clock ?? new ManualDemoClock();
		this.view = $state({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: options.tempoBpm ?? 80,
			beatsPerBar: 4,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false
		});
		this.timeline = {
			nowBeat: () => this.#clock.nowBeat()
		};
	}

	async start(): Promise<void> {
		this.#step = 0;
		this.view.history = [];
		this.view.lastVerdict = null;
		this.view.prompt = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.#clock.setBeat(0);
		this.#promptBeat = null;
		this.#targetBeat = null;
		this.view.status = 'count-in';
	}

	/** Drive the script from the injectable clock. Call after advancing the clock. */
	tick(): void {
		if (this.view.status === 'idle' || this.view.status === 'finished' || this.view.status === 'paused') {
			return;
		}
		const now = this.#clock.nowBeat();
		if (this.view.status === 'count-in' && now >= COUNT_IN) {
			this.#openStep(COUNT_IN);
			return;
		}
		if (
			(this.view.status === 'awaiting' || this.view.status === 'verdict') &&
			this.#targetBeat !== null &&
			now >= this.#targetBeat &&
			this.view.history.every((h) => h.beatIndex !== this.#targetBeat)
		) {
			this.#judge();
		}
	}

	pause(): void {
		if (this.view.status !== 'awaiting' && this.view.status !== 'count-in' && this.view.status !== 'verdict') {
			return;
		}
		this.#pausedBeat = this.#clock.nowBeat();
		this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		if (this.#pausedBeat !== null) this.#clock.setBeat(this.#pausedBeat);
		this.view.status = this.#promptBeat === null ? 'count-in' : 'awaiting';
	}

	answer(_pitch: PitchName): void {
		/* mode 1: guitar only */
	}

	quit(): void {
		this.view.status = 'finished';
		this.view.prompt = null;
	}

	#openStep(promptBeat: number): void {
		if (this.#step >= SCRIPT.length) {
			this.view.status = 'finished';
			this.view.prompt = null;
			this.view.promptBeatIndex = null;
			this.view.targetBeatIndex = null;
			this.view.leadBeats = null;
			return;
		}
		const t = playMessages();
		const item = SCRIPT[this.#step];
		this.#promptBeat = promptBeat;
		this.#targetBeat = promptBeat + LEAD;
		this.view.promptBeatIndex = this.#promptBeat;
		this.view.targetBeatIndex = this.#targetBeat;
		this.view.leadBeats = 8;
		this.view.prompt = {
			direction: 'locate',
			primary: item.primary,
			secondary: t.stringOf(item.stringName),
			aid: null
		};
		this.view.lastVerdict = null;
		this.view.status = 'awaiting';
	}

	#judge(): void {
		const item = SCRIPT[this.#step];
		const target = this.#targetBeat!;
		const entry: LaneEntry = { beatIndex: target, verdict: item.verdict };
		this.view.history = [...this.view.history, entry];
		const verdictView: VerdictView = {
			verdict: item.verdict,
			offsetMs: item.offsetMs,
			reactionMs: item.reactionMs,
			answerLabel: item.primary
		};
		this.view.lastVerdict = verdictView;
		this.view.status = 'verdict';
		this.#step += 1;
		const nextPrompt = target;
		queueMicrotask(() => {
			if (this.view.status !== 'verdict') return;
			this.#openStep(nextPrompt);
		});
	}
}
```

Note : le `queueMicrotask` enchaîne la consigne suivante dès que la pile synchrone se vide. Les assertions sur `status === 'verdict'` doivent rester synchrones juste après `tick()` (comme dans les tests ci-dessus). Sur la page démo (Task 7), laisser le verdict à l'écran jusqu'au `tick` suivant si l'UX le demande en retardant `#openStep` d'un temps d'horloge plutôt que d'un microtask — dans ce cas, remplacer le `queueMicrotask` par un seuil `nowBeat >= target + 1` dans `tick()`.

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/demo/DemoPlaySession.spec.ts`

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/play/messages.ts src/lib/ui/play/demo
git commit -m "$(cat <<'EOF'
feat: add scripted DemoPlaySession with injectable clock

EOF
)"
```

---

### Task 4: Impeccable — phase `spec`

**Files:**
- Create: `.impeccable/build/regions.json` (puis `.impeccable/build/spec.json` via CLI)
- Modify: `.impeccable/build/state.json` (via `build-phase advance`)

**Interfaces:**
- Consumes: maquette `.impeccable/mocks/comp-4-full-bleed-lane.png`, contrat `.impeccable/surfaces/src-routes-session-page-svelte.md`.
- Produces: spec mesurée (boîtes, palette, faces) ; phase `spec` fermée.

**Prérequis :** lire `~/.cursor/skills/impeccable/SKILL.md`, puis `reference/new-work.md` §6 (phase spec), puis `reference/craft-floor.md`.

- [ ] **Step 1: Vérifier l'état**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase status
```

Expected: `spec open`, `NEXT` commence par « Measure the comp ». Ne pas appeler `build-phase start`.

- [ ] **Step 2: Grille**

```bash
~/.cursor/skills/impeccable/scripts/impeccable comp-spec \
  --comp .impeccable/mocks/comp-4-full-bleed-lane.png --grid
```

Expected: écrit `.impeccable/build/comp-grid.png`. Ouvrir cette image.

- [ ] **Step 3: Nommer les régions**

Écrire `.impeccable/build/regions.json` en ouvrant la grille : chaque masse d'encre visible a une région (`text` / `control` / `chrome` / `plate` / `texture`). S'inspirer de FIRST VIEWPORT (consigne « F », « corde de B », boîte verdict, sprite, bandeau, écart ms, temps de réaction, piste, ligne d'arrivée, cœur, tuiles, libellé de mesure) sans inventer de spans : les `grid` viennent de la lecture de `comp-grid.png`. Aucune région `text`/`control`/`chrome` ne dépasse un quart de la maquette. Toute matière peinte (tramage de fond, sprite non-iconique) est `plate` ou `texture`. Les sprites de verdict icon-sized pourront rester du SVG code en hero ; s'ils sont peints dans la maquette comme illustrations, les classer `plate`.

Ne pas coller de coordonnées inventées dans ce plan : la grille ouverte est la source.

- [ ] **Step 4: Mesurer**

```bash
~/.cursor/skills/impeccable/scripts/impeccable comp-spec \
  --comp .impeccable/mocks/comp-4-full-bleed-lane.png \
  --regions .impeccable/build/regions.json
```

Expected: écrit `.impeccable/build/spec.json`. Si le CLI refuse (encre non nommée, région trop large, note de matière peinte sous un kind code), corriger `regions.json` et relancer.

- [ ] **Step 5: Police**

Pour chaque région `text`, mesurer ; pour la consigne géante (lead), ranker :

```bash
~/.cursor/skills/impeccable/scripts/impeccable font-match --measure <id-région-texte>
~/.cursor/skills/impeccable/scripts/impeccable font-match --rank <id-lead> --text "F" --category display,mono
```

Expected: la ligne `USE` du rank est la CSS à appliquer ; le gate n'accepte que ce que `font-match` a écrit. Ne pas écrire à la main un `chosen` dans la spec. Télécharger ensuite la famille indiquée par `USE` dans `static/fonts/` (fichiers woff2 + `@font-face` dans `tokens.css` à la Task 6).

- [ ] **Step 6: Imprimer et avancer**

```bash
~/.cursor/skills/impeccable/scripts/impeccable comp-spec --print
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : `build-phase advance` exit 0 ; `build-phase status` montre `spec closed`, `plates open`. Si exit 2, lire le motif imprimé, corriger, relancer `advance`.

- [ ] **Step 7: Commit**

```bash
git add .impeccable/build static/fonts 2>/dev/null || true
git add .impeccable/build
git status --short
git commit -m "$(cat <<'EOF'
chore: measure play-screen comp spec and rank type

EOF
)"
```

Si `static/fonts` n'est pas encore peuplé (téléchargement reporté à hero), ne committer que `.impeccable/build`.

---

### Task 5: Impeccable — phase `plates`

**Files:**
- Create: rasters sous le chemin `plate` de chaque région plate/texture de la spec (typiquement `.impeccable/build/plates/` ou chemins indiqués par la spec)
- Modify: `.impeccable/build/state.json` (via advance)

**Interfaces:**
- Consumes: spec Task 4.
- Produces: chaque région `plate` / `image` / `texture` régénérée ≥ 1,5× la boîte ; phase `plates` fermée.

- [ ] **Step 1: Produire les plates**

Préférer le subagent `impeccable-asset-producer` avec le chemin de la spec. Sans subagent, pour chaque id plate/texture :

```bash
~/.cursor/skills/impeccable/scripts/impeccable comp-spec --crop <id>
~/.cursor/skills/impeccable/scripts/impeccable comp-spec --plate-prompt <id> --background transparent
# (opaque pour texture plein cadre)
mkdir -p "$(dirname <plate-path-from-spec>)"
# Générer via l'outil image du harness (crop + prompt), puis :
~/.cursor/skills/impeccable/scripts/impeccable embed-prompt <plate.png> --prompt-file <prompt.txt>
```

Un crop de la maquette n'est jamais un pixel de livraison. Vérifier l'alpha réel sur fond clair et sombre.

Si la spec n'a **aucune** région plate/texture (tout est chrome/text/SVG icon), documenter ce fait dans une note :

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase note "no raster plates: verdict sprites and dither are code"
```

puis avancer.

- [ ] **Step 2: Avancer**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : exit 0 ; `plates closed`, `hero open`. Exit 2 → corriger les assets signalés, relancer.

- [ ] **Step 3: Commit**

```bash
git add .impeccable/build
git commit -m "$(cat <<'EOF'
chore: produce play-screen plates from comp crops

EOF
)"
```

---

### Task 6: Impeccable — phase `hero` (premier viewport + primitives + jetons)

**Files:**
- Create: `src/lib/ui/tokens.css`
- Create: `src/lib/ui/primitives/PixelBox.svelte`
- Create: `src/lib/ui/primitives/PixelButton.svelte`
- Create: `src/lib/ui/primitives/VerdictSprite.svelte`
- Create: `src/lib/ui/primitives/PixelText.svelte`
- Create: `src/lib/ui/play/PlayScreen.svelte` (premier viewport seulement)
- Create: `src/routes/+layout.svelte` (import tokens + police)
- Create: `static/fonts/**` si pas encore fait
- Modify: `.impeccable/build/**`, captures `.impeccable/review/hero-repro.png`

**Interfaces:**
- Consumes: scaffold Impeccable, spec, `laneTiles`, `barLabel`, `playMessages`, `PlaySessionController`.
- Produces: primitives aux signatures README ; `PlayScreen({ controller })` au viewport 1280×720 de la maquette ; phase `hero` fermée au seuil de `comp-diff` (72 %, aucun veto dur).

- [ ] **Step 1: Scaffold**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase scaffold
```

Expected: `.impeccable/build/scaffold/layout.css` (`--r-<id>-x/y/w/h`) et `hero-reference.html`. Lier ces nombres à la structure sémantique ; la référence n'est pas la page.

- [ ] **Step 2: Jetons**

Créer `src/lib/ui/tokens.css` :

```css
:root {
	--np-bg: #e99568;
	--np-mid: #be6754;
	--np-shade: #813b2a;
	--np-ink: #451218;
	--np-tile: 8px;
	--np-font-pixel: 'NeckspertPixel', monospace;
	--np-space-1: calc(var(--np-tile) * 1);
	--np-space-2: calc(var(--np-tile) * 2);
	--np-space-3: calc(var(--np-tile) * 3);
	--np-space-4: calc(var(--np-tile) * 4);
	--np-space-6: calc(var(--np-tile) * 6);
	--np-space-8: calc(var(--np-tile) * 8);
}

@font-face {
	font-family: 'NeckspertPixel';
	src: url('/fonts/<fichier-woff2-choisi-par-font-match>') format('woff2');
	font-display: swap;
}

html,
body {
	margin: 0;
	background: var(--np-bg);
	color: var(--np-ink);
	font-family: var(--np-font-pixel);
	image-rendering: pixelated;
}

.np-dither {
	background-image: linear-gradient(
			45deg,
			var(--np-mid) 25%,
			transparent 25%,
			transparent 75%,
			var(--np-mid) 75%,
			var(--np-mid)
		),
		linear-gradient(
			45deg,
			var(--np-mid) 25%,
			transparent 25%,
			transparent 75%,
			var(--np-mid) 75%,
			var(--np-mid)
		);
	background-position:
		0 0,
		calc(var(--np-tile) / 2) calc(var(--np-tile) / 2);
	background-size: var(--np-tile) var(--np-tile);
}
```

Remplacer `<fichier-woff2-choisi-par-font-match>` par le fichier réellement téléchargé à la Task 4/6. Le `font-family` CSS suit la ligne `USE` de `font-match` (renommer l'alias si `USE` impose un autre nom).

- [ ] **Step 3: Primitives**

`PixelBox.svelte` :

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'plain',
		children
	}: {
		variant?: 'plain' | 'double' | 'inverted';
		children: Snippet;
	} = $props();
</script>

<div class="box" class:double={variant === 'double'} class:inverted={variant === 'inverted'}>
	{@render children()}
</div>

<style>
	.box {
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-bg);
		color: var(--np-ink);
		padding: var(--np-space-2);
	}
	.double {
		outline: calc(var(--np-tile) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile) / 2);
	}
	.inverted {
		background: var(--np-ink);
		color: var(--np-bg);
	}
</style>
```

`PixelButton.svelte` :

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onclick,
		disabled = false,
		size = 'large',
		children
	}: {
		onclick: (e: MouseEvent) => void;
		disabled?: boolean;
		size?: 'large' | 'huge';
		children: Snippet;
	} = $props();
</script>

<button type="button" class="btn" class:huge={size === 'huge'} {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.btn {
		font: inherit;
		text-transform: uppercase;
		border: calc(var(--np-tile) / 2) solid var(--np-ink);
		background: var(--np-mid);
		color: var(--np-ink);
		min-block-size: calc(var(--np-tile) * 6);
		min-inline-size: calc(var(--np-tile) * 12);
		padding: var(--np-space-2) var(--np-space-3);
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn:focus-visible {
		outline: calc(var(--np-tile) / 2) solid var(--np-ink);
		outline-offset: calc(var(--np-tile) / 2);
	}
	.huge {
		min-block-size: calc(var(--np-tile) * 10);
		min-inline-size: calc(var(--np-tile) * 20);
		font-size: 1.5em;
	}
</style>
```

`VerdictSprite.svelte` — SVG icon-sized (< 64 px), quatre formes (rond / flèche gauche / flèche droite / croix), inversion optionnelle ; compréhensible sans la couleur :

```svelte
<script lang="ts">
	import type { Verdict } from '$lib/domain/types';

	let {
		verdict,
		size = 32,
		inverted = false
	}: {
		verdict: Verdict;
		size?: number;
		inverted?: boolean;
	} = $props();
</script>

<svg
	class:inverted
	width={size}
	height={size}
	viewBox="0 0 16 16"
	aria-hidden="true"
	focusable="false"
>
	{#if verdict === 'perfect'}
		<circle cx="8" cy="8" r="5" fill="currentColor" />
	{:else if verdict === 'early'}
		<polygon points="11,3 5,8 11,13" fill="currentColor" />
	{:else if verdict === 'late'}
		<polygon points="5,3 11,8 5,13" fill="currentColor" />
	{:else}
		<path
			d="M4 4 L12 12 M12 4 L4 12"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="square"
		/>
	{/if}
</svg>

<style>
	svg {
		color: var(--np-ink);
		display: block;
	}
	.inverted {
		color: var(--np-bg);
	}
</style>
```

`PixelText.svelte` :

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		as = 'span',
		scale = 1,
		children
	}: {
		as?: string;
		scale?: 1 | 2 | 3 | 4 | 8;
		children: Snippet;
	} = $props();
</script>

<svelte:element this={as} class="px" style="--scale: {scale}">
	{@render children()}
</svelte:element>

<style>
	.px {
		font-family: var(--np-font-pixel);
		font-size: calc(var(--np-tile) * var(--scale));
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 0;
	}
</style>
```

- [ ] **Step 4: `+layout.svelte`**

```svelte
<script lang="ts">
	import '$lib/ui/tokens.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

- [ ] **Step 5: Premier viewport de `PlayScreen`**

Construire uniquement le premier viewport à 1280×720 : haut 65 % (consigne 60 % / verdict 40 %), bas 35 % (piste). Placer d'abord les plates aux boîtes de la spec (`object-fit: cover`), capturer, enregistrer, puis poser le calque sémantique.

Règles de contenu (mots de la maquette, corrections appliquées) :

- Consigne : `view.prompt.primary` en `PixelText` scale issu de `font-match` (cap height mesurée), `secondary` en dessous.
- Verdict : `PixelBox variant="double"` ; `VerdictSprite` ; bandeau inversé avec `playMessages().verdict[v]` ; écart `±N ms` seulement si `offsetMs !== null` ; temps de réaction formaté.
- Piste : chaque frame, `nowBeat = controller.timeline.nowBeat()`, `tiles = laneTiles({…, beatsBefore: 4, beatsAfter: 8})` ; position horizontale `left% = 25 + offset * tileWidth%` (ligne d'arrivée à 25 %) ; labels uniquement si `tile.label !== null` ; tuile `justPlayed` inversée ; tuile `current` pleine ; tuile `target` affiche `prompt.primary` ; historique → `VerdictSprite` ; cœur au-dessus de la ligne ; `barLabel` → `playMessages().measure(...)` en haut à droite de la piste.
- Aucune action à l'écran pendant `awaiting` (la guitare joue). Bouton pause hors série / sur `idle`/`paused`/`finished` seulement, plus barre d'espace (Task 7).

Structure minimale attendue (à caler sur les `--r-*` du scaffold) :

```svelte
<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import { laneTiles } from './lane';
	import { barLabel } from './barLabel';
	import { playMessages } from './messages';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import VerdictSprite from '$lib/ui/primitives/VerdictSprite.svelte';

	let { controller }: { controller: PlaySessionController } = $props();

	let nowBeat = $state(0);
	const t = $derived(playMessages());
	const view = $derived(controller.view);
	const tiles = $derived(
		laneTiles({
			nowBeat,
			beatsPerBar: view.beatsPerBar,
			promptBeatIndex: view.promptBeatIndex,
			targetBeatIndex: view.targetBeatIndex,
			history: view.history,
			beatsBefore: 4,
			beatsAfter: 8
		})
	);
	const measure = $derived(
		view.promptBeatIndex !== null && view.targetBeatIndex !== null
			? barLabel({
					nowBeat,
					promptBeatIndex: view.promptBeatIndex,
					targetBeatIndex: view.targetBeatIndex,
					beatsPerBar: view.beatsPerBar
				})
			: null
	);

	$effect(() => {
		let raf = 0;
		const loop = () => {
			nowBeat = controller.timeline.nowBeat();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<!-- markup: .play[data-status], .prompt, .verdict, .lane with hit-line + heart + tiles -->
```

Le markup exact doit coller aux boîtes mesurées ; recopier les mots de la maquette pour le hero (`F`, `corde de B`, `EN RETARD`, `+95 ms`, `1,21 s`, `MESURE 2/2 TEMPS 3/4`) via `DemoPlaySession` positionné sur l'étape late (dernier item du script) pour la capture hero.

- [ ] **Step 6: Capture plates seules, puis hero complet**

Servir la démo (route minimale temporaire OK si `session/demo` n'existe pas encore : créer un stub `src/routes/session/demo/+page.svelte` qui monte `PlayScreen` + `DemoPlaySession` avec horloge calée sur `nowBeat ≈ 14` et historique du script jusqu'à `late`). Capturer à 1280×720 dans `.impeccable/review/hero-repro.png`.

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase record hero --build .impeccable/review/hero-repro.png
```

Puis finaliser le calque texte/contrôles, recapturer, avancer :

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : exit 0 (score global ≥ 72 %, aucun veto `missing` / `contradicted` / illustration SVG hors budget / plate coupée / encre inventée). Si exit 2 : ouvrir les crops de `.impeccable/review/diff/hero/` **dans l'ordre listé**, corriger, recapturer, `advance` à nouveau. Un troisième essai qui ne fait que nudger la même région est refusé par le gate — dériver à nouveau depuis la boîte spec.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui src/routes/+layout.svelte src/routes/session/demo static/fonts .impeccable/build .impeccable/review
git commit -m "$(cat <<'EOF'
feat: build play-screen hero viewport and pixel primitives

EOF
)"
```

---

### Task 7: Impeccable — phase `sections`

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte` (états idle / count-in / paused / finished, pause clavier)
- Create: `src/routes/session/+page.svelte`
- Modify: `src/routes/session/demo/+page.svelte` (horloge animée)
- Test: `src/lib/ui/play/PlayScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: primitives, `DemoPlaySession`, `useAppServices`, `PlaySessionController`.
- Produces: surface complète dans le système de la spec ; phase `sections` fermée.

- [ ] **Step 1: Tests composants**

Créer `src/lib/ui/play/PlayScreen.svelte.spec.ts` :

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
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
		expect(screen.getByText('F')).toBeTruthy();
		expect(screen.getByText(/corde de B/i)).toBeTruthy();
	});

	it('shows a start control while idle', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('button', { name: /commencer/i })).toBeTruthy();
	});
});
```

Run: `npx vitest run src/lib/ui/play/PlayScreen.svelte.spec.ts`

Expected: FAIL jusqu'à ce que le markup expose ces textes / rôles.

- [ ] **Step 2: Compléter `PlayScreen`**

- `idle` / `finished` : grand `PixelButton` « Commencer » / message de fin ; `onclick` → `controller.start()`.
- `count-in` : piste déjà visible, pas de consigne.
- `paused` : `PixelButton` Reprendre ; Espace reprend.
- `awaiting` / `verdict` : composition hero ; Espace met en pause **seulement** si la cible de l'événement n'est pas un bouton (prépare I2).
- `svelte:window` `keydown` : si `event.code === 'Space'`, `preventDefault`, toggle pause/resume hors champs texte.
- Ne pas implémenter le pavé mode 2 (plan I2).

- [ ] **Step 3: Routes**

`src/routes/session/+page.svelte` :

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { useAppServices } from '$lib/application/app';
	import type { PlaySessionController } from '$lib/application/session/contract';
	import type { SessionKind } from '$lib/domain/types';
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';

	let controller = $state<PlaySessionController | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		const kind = ($page.url.searchParams.get('kind') ?? 'daily') as SessionKind;
		try {
			controller = await useAppServices().startSession(kind);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unavailable';
		}
	});
</script>

{#if error}
	<p>{error}</p>
{:else if controller}
	<PlayScreen {controller} />
{/if}
```

Note : `$app/stores` / `page` — si le socle P0 expose déjà `page` via `$app/state` (SvelteKit récent), préférer l'API déjà utilisée par le projet généré ; ne pas ajouter de dépendance.

`src/routes/session/demo/+page.svelte` : `DemoPlaySession` + `ManualDemoClock` poussé par `requestAnimationFrame` à `tempoBpm` (avance de `beats = dtMs / (60000 / tempo)`). L'horloge démo compte des temps musicaux synthétiques ; elle ne mesure pas un onset réel — conforme à la contrainte audio (pas de scoring sur `performance.now()`).

- [ ] **Step 4: Tests + check**

```bash
npx vitest run src/lib/ui/play
npm run check
```

Expected: PASS, 0 erreur `svelte-check`.

- [ ] **Step 5: Avancer sections**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : exit 0 ; `sections closed`, `motion open`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/play src/routes/session src/routes/+layout.svelte
git commit -m "$(cat <<'EOF'
feat: complete play screen states and session routes

EOF
)"
```

---

### Task 8: Impeccable — phase `motion`

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte` (et éventuellement `VerdictSprite.svelte`)

**Interfaces:**
- Consumes: piste frame-driven déjà en place.
- Produces: interaction signature orchestrée ; `prefers-reduced-motion` respecté ; phase `motion` fermée.

- [ ] **Step 1: Orchestrer**

Moment mémorable du contrat : la piste défile, la note passe la ligne, le sprite de verdict s'imprime dans la tuile.

1. Défilement : déjà porté par `timeline.nowBeat()` chaque frame (pas de CSS `animation` de translation qui dérive du tempo).
2. À l'entrée en `verdict`, la tuile `justPlayed` reçoit une classe `imprint` (scale pop court, 120 ms, ease-out exponentiel).
3. `prefers-reduced-motion: reduce` : pas de pop ; la piste peut sauter aux positions sans interpoler visuellement au-delà du repositionnement par `nowBeat` ; le sprite apparaît sans scale.

```css
@media (prefers-reduced-motion: reduce) {
	.imprint {
		animation: none;
	}
}
```

- [ ] **Step 2: Avancer**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : exit 0 ; `motion closed`, `responsive open`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte src/lib/ui/primitives/VerdictSprite.svelte
git commit -m "$(cat <<'EOF'
feat: add lane imprint motion with reduced-motion safe path

EOF
)"
```

---

### Task 9: Impeccable — phase `responsive`

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte`, `src/lib/ui/tokens.css` si besoin
- Create: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`

**Interfaces:**
- Consumes: composition 16:9.
- Produces: premier viewport fluide 1280–1600 ; portrait téléphone (piste sous la consigne, verdict superposé ou réduit — contrat Unresolved : trancher ici et noter dans le compte rendu) ; phase `responsive` fermée.

- [ ] **Step 1: Adapter**

- Desktop : colonnes fluides, pas de grille figée en px qui casse à −100 px.
- Portrait (~390×844) : empiler consigne → verdict compact → piste pleine largeur ; consigne toujours lisible à distance (ne pas descendre sous le palier `scale` immédiatement inférieur au hero desktop).
- Hit line reste au quart gauche de la piste.

- [ ] **Step 2: Captures**

Capturer plein cadre :

- `.impeccable/review/desktop.png` à **1440** de large (full page)
- `.impeccable/review/mobile.png` à **390** de large

Valider les fichiers (pas de zone noire, pas de mauvais écran, motion d'entrée arrêtée).

- [ ] **Step 3: Avancer**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase advance
```

Acceptance : exit 0 (le gate diff la capture desktop contre la maquette et refuse un hero qui ne tient qu'à la largeur exacte de la comp). `responsive closed`, `review open`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui .impeccable/review
git commit -m "$(cat <<'EOF'
feat: adapt play screen for desktop fluid and phone portrait

EOF
)"
```

---

### Task 10: `detect`, finish reviewer, documenter

**Files:**
- Modify: fichiers UI signalés par detect / reviewer
- Create: `DESIGN.md`, `.impeccable/design.json`
- Modify: `.impeccable/build/state.json` (`build-phase finish`), `.impeccable/review/diff/final/**`

**Interfaces:**
- Consumes: captures desktop/mobile, contrat de direction, QUALITY BAR / maquette approuvée, craft-floor.
- Produces: verdict de finish (`ship` / `fix` / `rebuild` / `recapture`) traité ; `DESIGN.md` + sidecar ; FINISH du brief quasiment déchargé.

- [ ] **Step 1: Diff final + detect**

```bash
~/.cursor/skills/impeccable/scripts/impeccable comp-diff \
  --comp .impeccable/mocks/comp-4-full-bleed-lane.png \
  --build .impeccable/review/desktop.png \
  --spec .impeccable/build/spec.json \
  --out-dir .impeccable/review/diff/final

~/.cursor/skills/impeccable/scripts/impeccable detect --json \
  src/lib/ui \
  src/routes/session \
  src/routes/+layout.svelte
```

Corriger tout constat mécanique `detect` dans les chemins de H. Relancer jusqu'à absence de findings primaires (exit 0) ou ne garder que ce qui doit aller au reviewer.

- [ ] **Step 2: Finish reviewer**

Spawner le subagent `impeccable-finish-reviewer` **frais** (sans héritage de transcript), avec le paquet :

- demande d'origine (écran de jeu Neckspert Play, mode Operate)
- artefact : `src/routes/session/+page.svelte` / `src/lib/ui/play/PlayScreen.svelte`
- captures : `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`
- contrat : blocs THESIS…FINISH de `.impeccable/surfaces/src-routes-session-page-svelte.md`
- maquette approuvée : `.impeccable/mocks/comp-4-full-bleed-lane.png` + les **trois corrections** du sidecar JSON
- état : `.impeccable/build/state.json`, spec, diffs `hero` et `final`
- findings `detect` restants
- chemin craft-floor : `~/.cursor/skills/impeccable/reference/craft-floor.md`

Agir sur le mot de disposition exactement comme `new-work.md` §7 (`recapture` / `rebuild` / `fix` / `ship`). Budget : deux rondes max en non-assisté. Après assets touchés :

```bash
~/.cursor/skills/impeccable/scripts/impeccable embed-prompt --scan static .impeccable/build
```

- [ ] **Step 3: Documenter**

Spawner `impeccable-documenter` avec : racine du projet, artefact, contrat de direction, `PRODUCT.md`, `~/.cursor/skills/impeccable/reference/document.md`, borne d'écriture = chemins de H.

Vérifier :

```bash
test -f DESIGN.md && test -f .impeccable/design.json
```

Expected: les deux fichiers existent et portent les jetons (quatre tons, grille, police, primitives).

- [ ] **Step 4: Fermer le build**

```bash
~/.cursor/skills/impeccable/scripts/impeccable build-phase finish --disposition <ship|fix>
```

Utiliser le disposition réel renvoyé par le reviewer (`ship` si rien n'est dû après la dernière ronde).

- [ ] **Step 5: Vérification finale**

```bash
npm test && npm run check
```

Expected: tous les tests PASS, `svelte-check found 0 errors`. `git status --short` ne liste que des chemins possédés par H.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md .impeccable src/lib/ui src/routes/session src/routes/+layout.svelte static/fonts
git commit -m "$(cat <<'EOF'
docs: finish play-screen review and write DESIGN.md

EOF
)"
```

---

## Fin du plan

À la fin de ce plan, la branche `plan/h-ecran-de-jeu` porte l'écran de jeu mode 1, les primitives Bonfire, les routes `/session` et `/session/demo`, et le système documenté (`DESIGN.md` + `.impeccable/design.json`). Elle se fusionne dans `main` en fin de vague 1 (`npm test && npm run check` après fusion). Le pavé mode 2, l'accueil, le bilan et la carte du manche restent hors scope (I1 / I2).

## Écarts constatés à l'écriture

1. **Maquette vs corrections :** `.impeccable/mocks/comp-4-full-bleed-lane.png` montre encore des chiffres sur l'historique et des labels « 10 » / « 14 » / « 15 ». Le plan (et le sidecar `corrections`) impose les trois corrections obligatoires ; le finish reviewer doit les traiter comme la vérité spatiale, pas l'encre défectueuse.
2. **Portrait non tranché :** le brief marque l'adaptation téléphone comme Unresolved ; la Task 9 doit trancher (piste sous consigne, verdict compact) et le documenter dans `DESIGN.md`.
3. **`/session` sans J/K :** `useAppServices().startSession` lèvera tant que l'orchestration n'est pas branchée ; la vérification visuelle passe par `/session/demo`.
4. **Sons de verdict :** hors scope H (ports E / orchestration J) ; H ne livre que sprites + mouvement.
