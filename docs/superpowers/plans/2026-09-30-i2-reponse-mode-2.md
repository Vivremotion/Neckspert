# I2 — Réponse du mode 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au mode 2 (position vers nom) son moyen de réponse : un pavé de douze grands boutons, dans l'ordre chromatique de C à B, où le premier toucher est la réponse, affiché par l'écran de jeu à la place de la piste de tuiles, avec un contrôleur scripté du mode 2 pour la démonstration et les tests.

**Architecture:** Tout le code neuf vit dans `src/lib/ui/play/answer/`. Deux fonctions pures (ordre des choix, choix du pavé ou de la piste), un composant de présentation `AnswerPad` alimenté par props (contrat du README), un adaptateur mince `AnswerPanel` qui branche le pavé sur un `PlaySessionController`, et `DemoIdentifySession`, un contrôleur scripté sans audio qui juge avec la règle du plan B. `PlayScreen` (plan H, fusionné en vague 1) ne reçoit qu'une bascule : pavé si la consigne est du mode 2, piste sinon. Le rendu s'aligne ensuite sur l'univers Game Boy Bonfire par une extension Impeccable (on hérite du monde et de la composition, sans tour de concepts).

**Tech Stack:** Svelte 5 (runes), SvelteKit, TypeScript, Vitest (projet `server` en Node pour `*.spec.ts`, projet `client` en jsdom pour `*.svelte.spec.ts`), `@testing-library/svelte`, CSS natif, Impeccable (`context`, `detect`).

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

- **Chemins possédés** (README, ligne I2) : `src/lib/ui/play/answer/**` et les modifications de `src/lib/ui/play/PlayScreen.svelte`. Rien d'autre n'est commité : ni route, ni `.impeccable/**`, ni `DESIGN.md`, ni primitive de H, ni `package.json`.
- **Vague 2** : la branche `plan/i2-reponse-mode-2` part de `main` après la fusion de la vague 1. Ce plan consomme, exactement comme le README les signe : de H, `PlayScreen.svelte ({ controller: PlaySessionController })`, `PixelButton.svelte ({ onclick; disabled?; size?: 'large' | 'huge'; children })`, `tokens.css` ; de A (`$lib/domain/music`), `answerChoiceLabel`, `pitchOnString`, `stringLabel`, `fretLabel` ; de B (`$lib/domain/scoring`), `judgeIdentify`. De P0 : `PlayView`, `PromptView`, `AnswerChoice`, `PlaySessionController`, `PlayTimeline`, `IdentifyTarget`, `CHROMATIC_NOTES`, `PitchName`, `i18n`, `defineMessages`.
- **Douze boutons, les mêmes sur tous les appareils**, dans l'ordre chromatique C, C#, D … B quel que soit l'ordre reçu du contrôleur. Libellés : `answerChoiceLabel` (« F », « F# / Gb »). Le bémol reste en minuscule (« Gb », jamais « GB »), même si la police pixel est en capitales.
- **Disposition** : 6 colonnes × 2 rangées quand le pavé dispose d'au moins 560 px de large (bureau 16:9, tablette, téléphone en paysage) ; 3 colonnes × 4 rangées en dessous (téléphone en portrait). Chaque bouton mesure au moins 64 × 64 px. Gouttière d'une tuile (8 px).
- **Premier toucher retenu** : un verrou local au pavé ignore tout toucher après le premier, jusqu'à la consigne suivante. Un double toucher ne peut pas envoyer deux réponses.
- **Actif seulement quand `view.status === 'awaiting'`** ; désactivé dans tous les autres statuts.
- **Clavier** : boutons natifs (`<button>` rendu par `PixelButton`), focalisables, ordre de tabulation chromatique. Pas de raccourcis par lettre.
- **Pendant le jeu : consigne, temps et verdict, rien d'autre.** Le pavé n'ajoute aucun texte d'aide ; son seul texte non visible est le nom accessible du groupe.
- **Verdicts du mode 2** (README) : nom juste et temps de réaction ≤ `RECALL_THRESHOLD_MS` → `perfect` ; nom juste mais plus lent → `late` ; nom faux → `wrong`. `early` n'existe pas en mode 2. Le temps court de l'affichage de la consigne au toucher.
- **Univers** : extension d'une surface existante (Impeccable, `reference/new-work.md` §3) : quatre tons stricts, grille 8 px, cadres et inversion ; pas de tour de concepts, pas de `concept-seed`, pas de `build-phase`, pas de modification de `DESIGN.md`, du brief de surface ni du contrat de direction.
- **Tests** : P0 n'installe ni `@testing-library/jest-dom` ni `@testing-library/user-event`, et la configuration n'active ni les globales Vitest ni le plugin `svelteTesting`. Les tests utilisent donc `fireEvent`, lisent les propriétés du DOM (`disabled`, `classList`, `document.activeElement`) et appellent `cleanup()` dans `afterEach`. Chaque test contient au moins une assertion (`requireAssertions: true`).
- **Démonstration** : `DemoIdentifySession` n'a pas d'audio ; le mode 2 n'a pas de temps musical, le temps de réaction de la démonstration se mesure donc avec `Date.now()`, que les tests contrôlent par `vi.useFakeTimers()` et `vi.setSystemTime(0)`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/ui/play/answer/choices.ts` | `identifyChoices()` : les douze choix de C à B ; `orderChoices()` : ordre chromatique d'une liste reçue |
| `src/lib/ui/play/answer/choices.spec.ts` | Tests Node des deux fonctions |
| `src/lib/ui/play/answer/showsAnswerPad.ts` | `showsAnswerPad(view)` : pavé ou piste, à partir de la consigne et des choix |
| `src/lib/ui/play/answer/showsAnswerPad.spec.ts` | Tests Node |
| `src/lib/ui/play/answer/messages.ts` | Messages du pavé (`defineMessages`) : nom accessible du groupe |
| `src/lib/ui/play/answer/AnswerPad.svelte` | Pavé de douze `PixelButton`, verrou du premier toucher, disposition 6×2 / 3×4 |
| `src/lib/ui/play/answer/AnswerPad.svelte.spec.ts` | Tests jsdom du pavé |
| `src/lib/ui/play/answer/DemoIdentifySession.svelte.ts` | Contrôleur scripté du mode 2 (`$state`), sans audio |
| `src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts` | Tests jsdom (module à runes, donc projet `client`) |
| `src/lib/ui/play/answer/AnswerPanel.svelte` | Branche `AnswerPad` sur un `PlaySessionController` |
| `src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts` | Tests jsdom avec `DemoIdentifySession` |
| `src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts` | Tests jsdom de l'intégration dans `PlayScreen` (placé ici parce qu'I2 ne possède que ce dossier) |
| `src/lib/ui/play/PlayScreen.svelte` | Modifié : bascule pavé / piste, garde de la barre d'espace si besoin |

---

### Task 1: Ordre des choix et bascule pavé / piste

**Files:**
- Create: `src/lib/ui/play/answer/choices.ts`
- Create: `src/lib/ui/play/answer/showsAnswerPad.ts`
- Test: `src/lib/ui/play/answer/choices.spec.ts`, `src/lib/ui/play/answer/showsAnswerPad.spec.ts`

**Interfaces:**
- Consumes: `answerChoiceLabel(pitch: PitchName): string` (A, `$lib/domain/music`) ; `CHROMATIC_NOTES`, `PitchName` (P0, `$lib/domain/music/types`) ; `AnswerChoice`, `PlayView`, `PromptView` (P0, `$lib/application/session/contract`).
- Produces:
  - `identifyChoices(): AnswerChoice[]` — douze choix, C à B.
  - `orderChoices(choices: readonly AnswerChoice[]): AnswerChoice[]` — copie triée de C à B.
  - `showsAnswerPad(view: Pick<PlayView, 'prompt' | 'answerChoices'>): boolean` — vrai pour une consigne `identify`, ou sans consigne quand des choix du mode 2 sont proposés ; faux pour une consigne `locate`.

- [ ] **Step 1: Vérifier que la vague 1 est fusionnée**

```bash
ls src/lib/ui/primitives/PixelButton.svelte src/lib/ui/play/PlayScreen.svelte src/lib/domain/music/index.ts src/lib/domain/scoring/index.ts
rg -n "export function (answerChoiceLabel|pitchOnString|stringLabel|fretLabel)" src/lib/domain/music
rg -n "export function judgeIdentify" src/lib/domain/scoring
rg -n "<button" src/lib/ui/primitives/PixelButton.svelte
```

Expected: les quatre chemins sont listés ; quatre lignes pour A ; une ligne pour B ; au moins une ligne `<button` dans `PixelButton`. Si un chemin manque, arrêter : la vague 1 n'est pas fusionnée. Si `PixelButton` ne rend pas un `<button>` natif, arrêter et le signaler (l'accessibilité clavier du pavé en dépend, et la primitive appartient à H).

- [ ] **Step 2: Écrire les tests**

Créer `src/lib/ui/play/answer/choices.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';
import { identifyChoices, orderChoices } from './choices';

describe('identifyChoices', () => {
	it('lists the twelve pitches from C to B, altered notes with both spellings', () => {
		expect(identifyChoices()).toEqual([
			{ pitch: 'C', label: 'C' },
			{ pitch: 'C#', label: 'C# / Db' },
			{ pitch: 'D', label: 'D' },
			{ pitch: 'D#', label: 'D# / Eb' },
			{ pitch: 'E', label: 'E' },
			{ pitch: 'F', label: 'F' },
			{ pitch: 'F#', label: 'F# / Gb' },
			{ pitch: 'G', label: 'G' },
			{ pitch: 'G#', label: 'G# / Ab' },
			{ pitch: 'A', label: 'A' },
			{ pitch: 'A#', label: 'A# / Bb' },
			{ pitch: 'B', label: 'B' }
		]);
	});
});

describe('orderChoices', () => {
	it('sorts choices from C to B without mutating the input', () => {
		const shuffled = [...identifyChoices()].reverse();
		const before = [...shuffled];
		expect(orderChoices(shuffled).map((choice) => choice.pitch)).toEqual([...CHROMATIC_NOTES]);
		expect(shuffled).toEqual(before);
	});
});
```

Créer `src/lib/ui/play/answer/showsAnswerPad.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { PromptView } from '$lib/application/session/contract';
import { identifyChoices } from './choices';
import { showsAnswerPad } from './showsAnswerPad';

const identify: PromptView = {
	direction: 'identify',
	primary: 'case 8',
	secondary: 'corde de A',
	aid: null
};
const locate: PromptView = { direction: 'locate', primary: 'F', secondary: 'corde de B', aid: null };

describe('showsAnswerPad', () => {
	it('shows the pad for an identify prompt', () => {
		expect(showsAnswerPad({ prompt: identify, answerChoices: identifyChoices() })).toBe(true);
	});

	it('keeps the lane for a locate prompt, even when choices are present', () => {
		expect(showsAnswerPad({ prompt: locate, answerChoices: identifyChoices() })).toBe(false);
	});

	it('keeps the pad between identify prompts while mode 2 choices are on offer', () => {
		expect(showsAnswerPad({ prompt: null, answerChoices: identifyChoices() })).toBe(true);
	});

	it('keeps the lane with neither a prompt nor choices', () => {
		expect(showsAnswerPad({ prompt: null, answerChoices: null })).toBe(false);
	});
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/ui/play/answer/choices.spec.ts src/lib/ui/play/answer/showsAnswerPad.spec.ts`
Expected: FAIL, « Failed to resolve import "./choices" » et « Failed to resolve import "./showsAnswerPad" ».

- [ ] **Step 4: Écrire les fonctions**

Créer `src/lib/ui/play/answer/choices.ts` :

```ts
import type { AnswerChoice } from '$lib/application/session/contract';
import { answerChoiceLabel } from '$lib/domain/music';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';

/** The twelve mode 2 answers, C to B; altered notes carry both spellings ("F# / Gb"). */
export function identifyChoices(): AnswerChoice[] {
	return CHROMATIC_NOTES.map((pitch) => ({ pitch, label: answerChoiceLabel(pitch) }));
}

/** Chromatic order, C to B, whatever order the controller sent. Returns a copy. */
export function orderChoices(choices: readonly AnswerChoice[]): AnswerChoice[] {
	return [...choices].sort(
		(a, b) => CHROMATIC_NOTES.indexOf(a.pitch) - CHROMATIC_NOTES.indexOf(b.pitch)
	);
}
```

Créer `src/lib/ui/play/answer/showsAnswerPad.ts` :

```ts
import type { PlayView } from '$lib/application/session/contract';

/**
 * The play screen shows the answer pad instead of the tile lane for an identify prompt,
 * and between prompts while mode 2 choices are on offer.
 */
export function showsAnswerPad(view: Pick<PlayView, 'prompt' | 'answerChoices'>): boolean {
	if (view.prompt !== null) return view.prompt.direction === 'identify';
	return view.answerChoices !== null;
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/ui/play/answer/choices.spec.ts src/lib/ui/play/answer/showsAnswerPad.spec.ts && npm run check`
Expected: PASS (6 tests), `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/play/answer/choices.ts src/lib/ui/play/answer/choices.spec.ts src/lib/ui/play/answer/showsAnswerPad.ts src/lib/ui/play/answer/showsAnswerPad.spec.ts
git commit -m "feat: add mode 2 answer choices and pad/lane switch"
```

---

### Task 2: Pavé de réponse `AnswerPad`

**Files:**
- Create: `src/lib/ui/play/answer/messages.ts`
- Create: `src/lib/ui/play/answer/AnswerPad.svelte`
- Test: `src/lib/ui/play/answer/AnswerPad.svelte.spec.ts`

**Interfaces:**
- Consumes: `orderChoices`, `identifyChoices` (Task 1) ; `PixelButton.svelte ({ onclick; disabled?; size?: 'large' | 'huge'; children })` (H) ; `defineMessages`, `i18n` (P0).
- Produces:
  - `AnswerPad.svelte ({ choices: AnswerChoice[]; disabled: boolean; onanswer: (pitch: PitchName) => void })` — signature du README. Racine `div.answer-pad` de rôle `group`, nom accessible « Nom de la note » / « Note name » ; une cellule `div.cell` par choix, portant la classe `picked` pour le bouton touché jusqu'à la consigne suivante.
  - `answerMessages(): { group: string }`.

Comportement du verrou : le premier toucher accepté mémorise la hauteur (`picked`) et désactive les douze boutons ; `picked` s'efface quand `disabled` repasse à `false`, c'est-à-dire à la consigne suivante. Le contrat garantit un statut autre que `awaiting` (au moins `verdict`) entre deux consignes.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/answer/AnswerPad.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { AnswerChoice } from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import { i18n } from '$lib/i18n/index.svelte';
import AnswerPad from './AnswerPad.svelte';
import { identifyChoices } from './choices';

const LABELS = [
	'C',
	'C# / Db',
	'D',
	'D# / Eb',
	'E',
	'F',
	'F# / Gb',
	'G',
	'G# / Ab',
	'A',
	'A# / Bb',
	'B'
];

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

function renderPad(disabled: boolean, choices: AnswerChoice[] = identifyChoices()) {
	const onanswer = vi.fn<(pitch: PitchName) => void>();
	const result = render(AnswerPad, { props: { choices, disabled, onanswer } });
	const pad = () => within(screen.getByRole('group', { name: 'Nom de la note' }));
	const setDisabled = (value: boolean) => result.rerender({ choices, disabled: value, onanswer });
	return { onanswer, pad, setDisabled };
}

describe('AnswerPad', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('renders the twelve choices from C to B, whatever the input order', () => {
		const { pad } = renderPad(false, [...identifyChoices()].reverse());
		const labels = pad()
			.getAllByRole('button')
			.map((button) => button.textContent?.trim());
		expect(labels).toEqual(LABELS);
	});

	it('answers with the first tapped pitch only', async () => {
		const { onanswer, pad } = renderPad(false);
		void fireEvent.click(pad().getByRole('button', { name: 'F' }));
		void fireEvent.click(pad().getByRole('button', { name: 'G' }));
		await tick();
		expect(onanswer).toHaveBeenCalledTimes(1);
		expect(onanswer).toHaveBeenCalledWith('F');
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('keeps the tapped button marked until the pad is enabled again', async () => {
		const { onanswer, pad, setDisabled } = renderPad(false);
		const cellOf = (name: string) => pad().getByRole('button', { name }).closest('.cell');

		await fireEvent.click(pad().getByRole('button', { name: 'F# / Gb' }));
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(true);

		await setDisabled(true);
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(true);

		await setDisabled(false);
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(false);
		expect(pad().getAllByRole('button').some(isDisabled)).toBe(false);

		await fireEvent.click(pad().getByRole('button', { name: 'A' }));
		expect(onanswer.mock.calls).toEqual([['F#'], ['A']]);
	});

	it('ignores taps while disabled', async () => {
		const { onanswer, pad } = renderPad(true);
		await fireEvent.click(pad().getByRole('button', { name: 'C' }));
		expect(onanswer).not.toHaveBeenCalled();
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('uses native focusable buttons in chromatic tab order', () => {
		const { pad } = renderPad(false);
		const buttons = pad().getAllByRole('button');
		expect(buttons.every((button) => button.tagName === 'BUTTON')).toBe(true);
		expect(buttons.every((button) => button.tabIndex === 0)).toBe(true);
		buttons[0].focus();
		expect(document.activeElement).toBe(buttons[0]);
	});

	it('names the group in the current locale', () => {
		i18n.locale = 'en';
		render(AnswerPad, { props: { choices: identifyChoices(), disabled: false, onanswer: vi.fn() } });
		expect(screen.getByRole('group', { name: 'Note name' })).toBeTruthy();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/answer/AnswerPad.svelte.spec.ts`
Expected: FAIL, « Failed to resolve import "./AnswerPad.svelte" ».

- [ ] **Step 3: Écrire les messages**

Créer `src/lib/ui/play/answer/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';

export const answerMessages = defineMessages({
	fr: { group: 'Nom de la note' },
	en: { group: 'Note name' }
});
```

- [ ] **Step 4: Écrire le pavé**

Créer `src/lib/ui/play/answer/AnswerPad.svelte` :

```svelte
<script lang="ts">
	import type { AnswerChoice } from '$lib/application/session/contract';
	import type { PitchName } from '$lib/domain/music/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import { orderChoices } from './choices';
	import { answerMessages } from './messages';

	let {
		choices,
		disabled,
		onanswer
	}: {
		choices: AnswerChoice[];
		disabled: boolean;
		onanswer: (pitch: PitchName) => void;
	} = $props();

	const ordered = $derived(orderChoices(choices));
	const messages = $derived(answerMessages());

	/** First tap of the current prompt; cleared when the pad is enabled for the next one. */
	let picked = $state<PitchName | null>(null);

	$effect.pre(() => {
		if (!disabled) picked = null;
	});

	function pick(pitch: PitchName): void {
		if (disabled || picked !== null) return;
		picked = pitch;
		onanswer(pitch);
	}
</script>

<div class="answer-pad" role="group" aria-label={messages.group}>
	<div class="grid">
		{#each ordered as choice (choice.pitch)}
			<div class="cell" class:picked={picked === choice.pitch}>
				<PixelButton
					size="large"
					disabled={disabled || picked !== null}
					onclick={() => pick(choice.pitch)}>{choice.label}</PixelButton
				>
			</div>
		{/each}
	</div>
</div>

<style>
	.answer-pad {
		container: answer-pad / inline-size;
		block-size: 100%;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(64px, 1fr));
		grid-auto-rows: minmax(64px, 1fr);
		gap: 8px;
		block-size: 100%;
	}

	@container answer-pad (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(6, minmax(64px, 1fr));
		}
	}

	.cell {
		display: grid;
		min-block-size: 64px;
		min-inline-size: 64px;
	}

	.cell > :global(*) {
		inline-size: 100%;
		block-size: 100%;
		/* Flat signs stay lowercase: "Gb", never "GB". */
		text-transform: none;
	}
</style>
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/answer/AnswerPad.svelte.spec.ts && npm run check`
Expected: PASS (6 tests), `svelte-check found 0 errors`.

Si `svelte-check` refuse `onclick={() => pick(choice.pitch)}` parce que `PixelButton` type `onclick` avec un paramètre obligatoire, écrire `onclick={(_event: MouseEvent) => pick(choice.pitch)}` et relancer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/play/answer/messages.ts src/lib/ui/play/answer/AnswerPad.svelte src/lib/ui/play/answer/AnswerPad.svelte.spec.ts
git commit -m "feat: add mode 2 answer pad with first-tap lock"
```

---

### Task 3: Contrôleur scripté `DemoIdentifySession`

**Files:**
- Create: `src/lib/ui/play/answer/DemoIdentifySession.svelte.ts`
- Test: `src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts`

**Interfaces:**
- Consumes: `identifyChoices` (Task 1) ; `answerChoiceLabel`, `fretLabel(fret: number, locale: Locale): string`, `stringLabel(string: StringNumber, locale: Locale): string`, `pitchOnString(string: StringNumber, fret: number): PitchName` (A) ; `judgeIdentify(input: { expected: PitchName; promptTime: number; answerTime: number | null; answered: PitchName | null }): Judgement` (B, temps en secondes) ; `PlaySessionController`, `PlayView`, `PlayTimeline`, `IdentifyTarget`, `i18n` (P0).
- Produces:
  - `DEMO_IDENTIFY_SCRIPT: readonly IdentifyTarget[]` — cinq consignes : corde 5 case 8 (F), corde 2 case 7 (F#), corde 6 case 3 (G), corde 3 case 1 (G#), corde 1 case 10 (D).
  - `DEMO_VERDICT_MS = 1200` — durée d'affichage d'un verdict.
  - `class DemoIdentifySession implements PlaySessionController { constructor(script?: readonly IdentifyTarget[], verdictMs?: number) }` — `sessionId: 'demo-identify'`, `view` réactif (`$state`), `timeline.nowBeat()` renvoie 0.

Scénario : `idle` → `start()` → `awaiting` (consigne traduite, horodatée) → `answer(pitch)` → `verdict` (jugé par B, `offsetMs: null`, `answerLabel` = libellé du bouton) → après `verdictMs`, consigne suivante → `finished` après la dernière. `pause()` n'agit qu'en `awaiting` ; `resume()` réaffiche la consigne et relance le temps de réaction. `quit()` annule le minuteur et termine. `start()` relance le scénario depuis `idle` ou `finished`. Les choix du mode 2 restent proposés pendant toute la démonstration, `promptBeatIndex`, `targetBeatIndex` et `leadBeats` valent `null` (P0).

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pitchOnString } from '$lib/domain/music';
import { i18n } from '$lib/i18n/index.svelte';
import {
	DEMO_IDENTIFY_SCRIPT,
	DEMO_VERDICT_MS,
	DemoIdentifySession
} from './DemoIdentifySession.svelte';

describe('DemoIdentifySession', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
		i18n.locale = 'fr';
	});

	it('starts idle with the twelve choices and no beat indexes', () => {
		const demo = new DemoIdentifySession();
		expect(demo.view.status).toBe('idle');
		expect(demo.view.answerChoices).toHaveLength(12);
		expect(demo.view.promptBeatIndex).toBeNull();
		expect(demo.view.targetBeatIndex).toBeNull();
		expect(demo.view.leadBeats).toBeNull();
	});

	it('shows a French identify prompt on start', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt).toEqual({
			direction: 'identify',
			primary: 'case 8',
			secondary: 'corde de A',
			aid: null
		});
	});

	it('follows the locale for prompts', async () => {
		i18n.locale = 'en';
		const demo = new DemoIdentifySession();
		await demo.start();
		expect(demo.view.prompt?.primary).toBe('fret 8');
		expect(demo.view.prompt?.secondary).toBe('A string');
	});

	it('judges a fast right answer perfect', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.view.status).toBe('verdict');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.lastVerdict?.offsetMs).toBeNull();
		expect(demo.view.lastVerdict?.reactionMs).toBeCloseTo(900, 0);
		expect(demo.view.lastVerdict?.answerLabel).toBe('F');
	});

	it('judges a slow right answer late', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(2100);
		demo.answer('F');
		expect(demo.view.lastVerdict?.verdict).toBe('late');
		expect(demo.view.lastVerdict?.reactionMs).toBeCloseTo(2100, 0);
	});

	it('judges a wrong name wrong and shows what was tapped', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(700);
		demo.answer('F#');
		expect(demo.view.lastVerdict?.verdict).toBe('wrong');
		expect(demo.view.lastVerdict?.answerLabel).toBe('F# / Gb');
	});

	it('keeps the first answer of a prompt only', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(800);
		demo.answer('F');
		demo.answer('G');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.lastVerdict?.answerLabel).toBe('F');
	});

	it('ignores answers before the start and while paused', async () => {
		const demo = new DemoIdentifySession();
		demo.answer('F');
		expect(demo.view.lastVerdict).toBeNull();
		await demo.start();
		demo.pause();
		demo.answer('F');
		expect(demo.view.status).toBe('paused');
		expect(demo.view.lastVerdict).toBeNull();
	});

	it('restarts the reaction time when resuming', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(5000);
		demo.pause();
		demo.resume();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
	});

	it('moves to the next prompt after the verdict', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('case 7');
		expect(demo.view.prompt?.secondary).toBe('corde de B');
	});

	it('finishes after the last prompt', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		for (const target of DEMO_IDENTIFY_SCRIPT) {
			demo.answer(pitchOnString(target.string, target.fret));
			expect(demo.view.lastVerdict?.verdict).toBe('perfect');
			vi.advanceTimersByTime(DEMO_VERDICT_MS);
		}
		expect(demo.view.status).toBe('finished');
		expect(demo.view.prompt).toBeNull();
	});

	it('cancels the next prompt on quit, and can start again', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		demo.quit();
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('finished');
		expect(demo.view.prompt).toBeNull();

		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('case 8');
		expect(demo.view.lastVerdict).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts`
Expected: FAIL, « Failed to resolve import "./DemoIdentifySession.svelte" ».

- [ ] **Step 3: Écrire le contrôleur**

Créer `src/lib/ui/play/answer/DemoIdentifySession.svelte.ts` :

```ts
import type {
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { answerChoiceLabel, fretLabel, pitchOnString, stringLabel } from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { judgeIdentify } from '$lib/domain/scoring';
import type { IdentifyTarget } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import { identifyChoices } from './choices';

/** Demo prompts: F, F#, G, G#, D. */
export const DEMO_IDENTIFY_SCRIPT: readonly IdentifyTarget[] = [
	{ direction: 'identify', string: 5, fret: 8 },
	{ direction: 'identify', string: 2, fret: 7 },
	{ direction: 'identify', string: 6, fret: 3 },
	{ direction: 'identify', string: 3, fret: 1 },
	{ direction: 'identify', string: 1, fret: 10 }
];

/** How long the demo shows a verdict before the next prompt. */
export const DEMO_VERDICT_MS = 1200;

/** Scripted mode 2 session without audio, for the demo page and tests. */
export class DemoIdentifySession implements PlaySessionController {
	readonly sessionId = 'demo-identify';
	view = $state<PlayView>({
		status: 'idle',
		prompt: null,
		lastVerdict: null,
		tempoBpm: 80,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		leadBeats: null,
		history: [],
		answerChoices: identifyChoices(),
		fatigueDetected: false
	});
	readonly timeline: PlayTimeline = { nowBeat: () => 0 };

	private readonly script: readonly IdentifyTarget[];
	private readonly verdictMs: number;
	private index = 0;
	/** Epoch ms when the current prompt was displayed. */
	private promptedAt = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(script: readonly IdentifyTarget[] = DEMO_IDENTIFY_SCRIPT, verdictMs = DEMO_VERDICT_MS) {
		this.script = script;
		this.verdictMs = verdictMs;
	}

	async start(): Promise<void> {
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.index = 0;
		this.view.lastVerdict = null;
		this.showPromptOrFinish();
	}

	pause(): void {
		if (this.view.status === 'awaiting') this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	answer(pitch: PitchName): void {
		if (this.view.status !== 'awaiting') return;
		const target = this.script[this.index];
		const judgement = judgeIdentify({
			expected: pitchOnString(target.string, target.fret),
			promptTime: this.promptedAt / 1000,
			answerTime: Date.now() / 1000,
			answered: pitch
		});
		this.view.lastVerdict = {
			verdict: judgement.verdict,
			offsetMs: null,
			reactionMs: judgement.reactionMs,
			answerLabel: answerChoiceLabel(pitch)
		};
		this.view.status = 'verdict';
		this.timer = setTimeout(() => {
			this.timer = null;
			this.index += 1;
			this.showPromptOrFinish();
		}, this.verdictMs);
	}

	quit(): void {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.finish();
	}

	private showPromptOrFinish(): void {
		const target = this.script[this.index];
		if (!target) {
			this.finish();
			return;
		}
		this.view.prompt = {
			direction: 'identify',
			primary: fretLabel(target.fret, i18n.locale),
			secondary: stringLabel(target.string, i18n.locale),
			aid: null
		};
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	private finish(): void {
		this.view.prompt = null;
		this.view.status = 'finished';
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts && npm run check`
Expected: PASS (12 tests), `svelte-check found 0 errors`.

Si « judges a slow right answer late » échoue avec `perfect`, lire `RECALL_THRESHOLD_MS` dans `src/lib/domain/types.ts` : le test suppose 1500 ms (P0). Ne pas changer la constante ; porter le délai du test au-dessus de la valeur lue et le signaler.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/play/answer/DemoIdentifySession.svelte.ts src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts
git commit -m "feat: add scripted mode 2 demo session"
```

---

### Task 4: Adaptateur `AnswerPanel`

**Files:**
- Create: `src/lib/ui/play/answer/AnswerPanel.svelte`
- Test: `src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts`

**Interfaces:**
- Consumes: `AnswerPad` (Task 2), `identifyChoices` (Task 1), `DemoIdentifySession`, `DEMO_VERDICT_MS` (Task 3, tests seulement), `PlaySessionController` (P0).
- Produces: `AnswerPanel.svelte ({ controller: PlaySessionController })` — lit `controller.view.answerChoices` (ou les douze choix par défaut s'ils manquent), désactive le pavé hors de `awaiting`, envoie le toucher à `controller.answer(pitch)`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import AnswerPanel from './AnswerPanel.svelte';
import { DEMO_VERDICT_MS, DemoIdentifySession } from './DemoIdentifySession.svelte';

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

const pad = () => within(screen.getByRole('group', { name: 'Nom de la note' }));

describe('AnswerPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('keeps the pad disabled until a prompt is awaiting', async () => {
		const demo = new DemoIdentifySession();
		render(AnswerPanel, { props: { controller: demo } });
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);

		await demo.start();
		await tick();
		expect(pad().getAllByRole('button')).toHaveLength(12);
		expect(pad().getAllByRole('button').some(isDisabled)).toBe(false);
	});

	it('sends a double tap to the controller once', async () => {
		const demo = new DemoIdentifySession();
		const answer = vi.spyOn(demo, 'answer');
		render(AnswerPanel, { props: { controller: demo } });
		await demo.start();
		await tick();

		vi.advanceTimersByTime(600);
		void fireEvent.click(pad().getByRole('button', { name: 'F' }));
		void fireEvent.click(pad().getByRole('button', { name: 'G' }));
		await tick();

		expect(answer).toHaveBeenCalledTimes(1);
		expect(answer).toHaveBeenCalledWith('F');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('re-enables the pad for the next prompt and reports a slow answer late', async () => {
		const demo = new DemoIdentifySession();
		render(AnswerPanel, { props: { controller: demo } });
		await demo.start();
		await tick();
		await fireEvent.click(pad().getByRole('button', { name: 'F' }));

		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		await tick();
		expect(pad().getAllByRole('button').some(isDisabled)).toBe(false);

		vi.advanceTimersByTime(2100);
		await fireEvent.click(pad().getByRole('button', { name: 'F# / Gb' }));
		expect(demo.view.lastVerdict?.verdict).toBe('late');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts`
Expected: FAIL, « Failed to resolve import "./AnswerPanel.svelte" ».

- [ ] **Step 3: Écrire l'adaptateur**

Créer `src/lib/ui/play/answer/AnswerPanel.svelte` :

```svelte
<script lang="ts">
	import type { PlaySessionController } from '$lib/application/session/contract';
	import AnswerPad from './AnswerPad.svelte';
	import { identifyChoices } from './choices';

	let { controller }: { controller: PlaySessionController } = $props();

	const choices = $derived(controller.view.answerChoices ?? identifyChoices());
	const disabled = $derived(controller.view.status !== 'awaiting');
</script>

<AnswerPad {choices} {disabled} onanswer={(pitch) => controller.answer(pitch)} />
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts && npm run check`
Expected: PASS (3 tests), `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/play/answer/AnswerPanel.svelte src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts
git commit -m "feat: connect the answer pad to the play session controller"
```

---

### Task 5: Intégration dans `PlayScreen`

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte` (fichier de H ; lignes exactes à relever à l'étape 3)
- Test: `src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts`

**Interfaces:**
- Consumes: `AnswerPanel` (Task 4), `showsAnswerPad` (Task 1), `identifyChoices` (Task 1, tests), `PlayScreen.svelte ({ controller: PlaySessionController })` (H), `PlayView`, `PlaySessionController` (P0).
- Produces: `PlayScreen` affiche `AnswerPanel` à la place de la piste de tuiles quand `showsAnswerPad(controller.view)` est vrai ; tout ce qui appartient à la piste (tuiles, ligne d'arrivée et son cœur, « MESURE x/y TEMPS z/4 ») disparaît avec elle. La consigne et la boîte verdict de H restent en place. Une touche Espace pressée sur un bouton ne met pas la série en pause.

Le plan H n'a pas figé le balisage interne de `PlayScreen`. Cette tâche relève donc d'abord où H rend la piste, puis applique la bascule à cet endroit précis.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts` :

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type {
	PlaySessionController,
	PlayView,
	VerdictView
} from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import PlayScreen from '../PlayScreen.svelte';
import { identifyChoices } from './choices';

function view(overrides: Partial<PlayView>): PlayView {
	return {
		status: 'awaiting',
		prompt: null,
		lastVerdict: null,
		tempoBpm: 80,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		leadBeats: null,
		history: [],
		answerChoices: null,
		fatigueDetected: false,
		...overrides
	};
}

function identifyView(overrides: Partial<PlayView> = {}): PlayView {
	return view({
		prompt: { direction: 'identify', primary: 'case 8', secondary: 'corde de A', aid: null },
		answerChoices: identifyChoices(),
		...overrides
	});
}

function locateView(): PlayView {
	return view({
		prompt: { direction: 'locate', primary: 'F', secondary: 'corde de B', aid: null },
		promptBeatIndex: 0,
		targetBeatIndex: 8,
		leadBeats: 8
	});
}

function fakeController(initial: PlayView) {
	const calls = { answers: [] as PitchName[], pauses: 0 };
	const controller: PlaySessionController = {
		sessionId: 'test',
		view: initial,
		timeline: { nowBeat: () => 0 },
		async start() {},
		pause() {
			calls.pauses += 1;
		},
		resume() {},
		answer(pitch) {
			calls.answers.push(pitch);
		},
		quit() {}
	};
	return { controller, calls };
}

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

const PAD = { name: 'Nom de la note' };

describe('PlayScreen in mode 2', () => {
	afterEach(() => cleanup());

	it('replaces the lane with the answer pad for an identify prompt', async () => {
		const { controller, calls } = fakeController(identifyView());
		render(PlayScreen, { props: { controller } });
		const pad = within(screen.getByRole('group', PAD));
		expect(pad.getAllByRole('button')).toHaveLength(12);
		await fireEvent.click(pad.getByRole('button', { name: 'F' }));
		expect(calls.answers).toEqual(['F']);
	});

	it('shows no answer pad for a locate prompt', () => {
		const { controller } = fakeController(locateView());
		render(PlayScreen, { props: { controller } });
		expect(screen.queryByRole('group', PAD)).toBeNull();
	});

	it('disables the pad outside awaiting', () => {
		const { controller } = fakeController(identifyView({ status: 'verdict' }));
		render(PlayScreen, { props: { controller } });
		const buttons = within(screen.getByRole('group', PAD)).getAllByRole('button');
		expect(buttons.every(isDisabled)).toBe(true);
	});

	it('shows a late verdict for a correct but slow answer, without a timing offset', () => {
		const late: VerdictView = {
			verdict: 'late',
			offsetMs: null,
			reactionMs: 2140,
			answerLabel: 'F'
		};
		const { controller } = fakeController(identifyView({ status: 'verdict', lastVerdict: late }));
		render(PlayScreen, { props: { controller } });
		expect(screen.getAllByText(/en retard/i).length).toBeGreaterThan(0);
		expect(screen.queryAllByText(/^[+\-−]\d+\s*ms$/)).toHaveLength(0);
	});

	it('does not pause when Space activates an answer button', async () => {
		const { controller, calls } = fakeController(identifyView());
		render(PlayScreen, { props: { controller } });
		const button = within(screen.getByRole('group', PAD)).getByRole('button', { name: 'C' });
		button.focus();
		await fireEvent.keyDown(button, { key: ' ', code: 'Space' });
		expect(calls.pauses).toBe(0);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts`
Expected: FAIL sur « replaces the lane… », « disables the pad… » et « does not pause… » avec « Unable to find an accessible element with the role "group" and name "Nom de la note" ». « shows no answer pad… » passe déjà. « shows a late verdict… » passe si la boîte verdict de H masque déjà l'écart quand `offsetMs` vaut `null`.

- [ ] **Step 3: Relever le balisage de H**

```bash
rg -n "laneTiles|barLabel|Lane|lane|keydown|Space|' '|offsetMs|\\$props" src/lib/ui/play/PlayScreen.svelte
ls src/lib/ui/play
```

Noter : (a) la ligne `let { controller … } = $props()` ; (b) le premier et le dernier élément du balisage de la piste (composant de piste, ligne d'arrivée, cœur, libellé de mesure) ; (c) l'élément qui porte le placement de la bande basse (classe avec `grid-area`, hauteur) ; (d) un éventuel gestionnaire `keydown` sur `<svelte:window>` ou `<svelte:document>` ; (e) l'endroit où la boîte verdict affiche `offsetMs`, et si cette boîte vit dans `PlayScreen.svelte` ou dans un autre fichier de H.

- [ ] **Step 4: Ajouter la bascule**

Dans le `<script lang="ts">` de `PlayScreen.svelte`, ajouter les imports avec les autres imports de H, et la dérivation juste après la ligne `$props()` relevée en (a) :

```ts
import AnswerPanel from './answer/AnswerPanel.svelte';
import { showsAnswerPad } from './answer/showsAnswerPad';
```

```ts
const answering = $derived(showsAnswerPad(controller.view));
```

Si H déclare déjà un nom `answering`, nommer celui-ci `answerPadShown` partout dans cette tâche.

Dans le balisage, entourer le bloc de piste relevé en (b), sans rien y changer, à l'intérieur de l'élément de placement relevé en (c) :

```svelte
{#if answering}
	<AnswerPanel {controller} />
{:else}
	<!-- bloc de piste de H relevé en (b), déplacé ici tel quel -->
{/if}
```

Si la piste n'a pas de conteneur propre dans `PlayScreen` (le composant de piste porte lui-même son placement), envelopper le `{#if}` d'un `<div class="lane-slot">…</div>` et ajouter dans le `<style>` de `PlayScreen` une règle `.lane-slot` qui reprend exactement les propriétés de placement (`grid-area`, `block-size`, `min-block-size`) que H applique à la piste, relevées en (c).

- [ ] **Step 5: Protéger la barre d'espace (seulement si (d) existe)**

Si `PlayScreen` écoute `keydown` sur la fenêtre ou le document, ajouter en première ligne de ce gestionnaire (dont le paramètre s'appelle ici `event` ; reprendre le nom de H) :

```ts
if (event.target instanceof HTMLButtonElement) return;
```

Un bouton natif s'active déjà lui-même avec Espace ; sans cette garde, la même touche répondrait et mettrait la série en pause. Si (d) n'existe pas, ne rien ajouter.

- [ ] **Step 6: Masquer l'écart absent (seulement si « shows a late verdict… » échoue)**

Si la boîte verdict est dans `PlayScreen.svelte`, entourer la ligne qui affiche l'écart relevée en (e) de :

```svelte
{#if controller.view.lastVerdict?.offsetMs != null}
	<!-- ligne d'écart de H, inchangée -->
{/if}
```

Si la boîte verdict vit dans un autre fichier de H, ne pas le modifier (hors des chemins d'I2) : marquer le test `it.skip` avec le message `'offset line belongs to H'`, et le signaler dans le compte rendu de la branche.

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/ui/play && npm run check`
Expected: tous les tests de `src/lib/ui/play` PASS, y compris ceux de H (aucune régression du mode 1), `svelte-check found 0 errors`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts
git commit -m "feat: show the answer pad instead of the lane in mode 2"
```

---

### Task 6: Extension Impeccable du pavé, inspection et passe `detect`

**Files:**
- Modify: `src/lib/ui/play/answer/AnswerPad.svelte` (styles), `src/lib/ui/play/PlayScreen.svelte` (seulement la variante `answering`, si l'inspection l'exige)
- Create: `src/routes/dev/identify/+page.svelte` (démonstration, chemin d'I2)
- Captures hors du dépôt : `/tmp/np-i2-review/`

**Interfaces:**
- Consumes: tout ce qui précède ; `tokens.css`, `PixelButton`, `DESIGN.md` (H) ; le brief `.impeccable/surfaces/src-routes-session-page-svelte.md` et la maquette `.impeccable/mocks/comp-4-full-bleed-lane.png` (lecture seule).
- Produces: aucune nouvelle signature. Le pavé rendu dans l'univers Bonfire, à 1280 × 720 et à 390 × 844.

Cadre Impeccable : **extension d'une surface existante** (`reference/new-work.md` §3). On hérite du monde (quatre tons, damier, grille 8 px, police pixel, cadres et inversion) et de la composition de l'écran de jeu (consigne à gauche, boîte verdict à droite, bande basse de 35 % sur 16:9). Seuls se décident ici l'emplacement du pavé, sa hiérarchie, ses états et son raccord avec la boîte verdict. Pas de tour de concepts, pas de `concept-seed`, pas de `build-phase`, pas de maquette générée : une construction sans maquette, puis une seule ronde d'inspection bureau et téléphone ensemble. `DESIGN.md`, le brief et le contrat de direction ne changent pas. Si l'inspection montre qu'une primitive de H doit changer (par exemple un état « enfoncé » de `PixelButton`), le signaler au lieu de modifier la primitive.

- [ ] **Step 1: Charger le contexte Impeccable**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/session/+page.svelte
```

Expected: le lanceur charge `PRODUCT.md`, `DESIGN.md` et le brief de surface, et imprime ses directives ; les suivre. Une directive `CONTEXT_STALE` se signale sans rien réparer. Une directive `MANUAL_DETECTOR_REQUIRED` est satisfaite par l'étape 9. Si le lanceur échoue, écrire « Context loading did not run; I'll read the existing project context directly. » et lire les fichiers de l'étape 2 directement.

- [ ] **Step 2: Lire l'autorité visuelle**

Lire, dans cet ordre : `DESIGN.md` (et `.impeccable/design.json` s'il existe), `.impeccable/surfaces/src-routes-session-page-svelte.md`, l'image `.impeccable/mocks/comp-4-full-bleed-lane.png`, `src/lib/ui/tokens.css`, `src/lib/ui/primitives/PixelButton.svelte`, `src/lib/ui/play/PlayScreen.svelte`, puis `~/.cursor/skills/impeccable/reference/new-work.md` §3. Lire `~/.cursor/skills/impeccable/reference/craft-floor.md` juste avant l'étape 4.

- [ ] **Step 3: Relever les noms des jetons**

```bash
rg -n -i "#451218|#e99568|#be6754|#813b2a|: *8px" src/lib/ui/tokens.css
rg -n "text-transform|:focus|disabled|font-size|padding" src/lib/ui/primitives/PixelButton.svelte
```

Noter le nom de la variable dont la valeur est `#451218` (encre), celle de `#E99568` (fond) et celle qui vaut `8px` (tuile), si elle existe.

- [ ] **Step 4: Construire (une passe, sans maquette)**

Appliquer ces décisions dans `AnswerPad.svelte` :

1. **Grille sur les jetons.** Remplacer chaque `8px` du `<style>` par la variable de tuile relevée à l'étape 3, et `64px` par `calc(8 * <variable de tuile>)`. S'il n'y a pas de variable de tuile, garder les valeurs en pixels.
2. **Le toucher s'imprime par inversion**, comme la tuile de la dernière note jouée sur la piste. Ajouter à la fin du `<style>`, en remplaçant `--tone-ink` et `--tone-light` par les noms relevés à l'étape 3 pour `#451218` et `#E99568` :

```css
.cell.picked > :global(*) {
	background-color: var(--tone-ink);
	color: var(--tone-light);
	border-color: var(--tone-ink);
}
```

3. **Les boutons non choisis gardent l'état désactivé de `PixelButton`** (H) ; ne pas lui ajouter de couleur propre.
4. **Aucun texte, cadre ni ornement de plus** : le pavé est douze boutons dans la bande. Pas de titre, pas de consigne d'usage, pas d'ombre portée dure.

Dans `PlayScreen.svelte`, ne rien changer à ce stade : les corrections éventuelles viennent de l'inspection (étape 7).

- [ ] **Step 5: Vérifier que les tests tiennent**

Run: `npx vitest run src/lib/ui/play && npm run check`
Expected: PASS, `svelte-check found 0 errors`.

- [ ] **Step 6: Monter la page d'inspection temporaire**

Créer `src/routes/dev/identify/+page.svelte` :

```svelte
<script lang="ts">
	import PlayScreen from '$lib/ui/play/PlayScreen.svelte';
	import {
		DEMO_IDENTIFY_SCRIPT,
		DemoIdentifySession
	} from '$lib/ui/play/answer/DemoIdentifySession.svelte';

	const controller = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);

	$effect(() => {
		void controller.start();
	});
</script>

<PlayScreen {controller} />
```

Le verdict reste affiché 60 s, le temps de le capturer.

```bash
mkdir -p /tmp/np-i2-review
npm run dev -- --port 5180 --strictPort
```

Expected: « Local: http://localhost:5180/ ». Laisser tourner en arrière-plan.

- [ ] **Step 7: Une ronde d'inspection, bureau et téléphone ensemble**

Avec l'outil de navigateur disponible (par exemple Chrome DevTools MCP : `new_page`, `resize_page`, `navigate_page`, `evaluate_script`, `click`, `take_screenshot`), pour chacune des deux tailles 1280 × 720 puis 390 × 844 :

1. Ouvrir `http://localhost:5180/dev/identify`, attendre l'affichage de la consigne « case 8 / corde de A ».
2. Mesurer les boutons :

```js
() =>
	[...document.querySelectorAll('[role="group"] button')].map((button) => {
		const box = button.getBoundingClientRect();
		return {
			label: button.textContent.trim(),
			x: Math.round(box.x),
			y: Math.round(box.y),
			w: Math.round(box.width),
			h: Math.round(box.height),
			clipped: button.scrollWidth > button.clientWidth
		};
	})
```

Expected: 12 entrées, de « C » à « B » ; `w` et `h` ≥ 64 ; `clipped` faux partout ; six valeurs de `x` distinctes à 1280, trois à 390 ; aucune boîte hors de la fenêtre.

3. Capturer l'état « en attente » : `/tmp/np-i2-review/desktop.png` et `/tmp/np-i2-review/mobile.png`.
4. Attendre au moins 2 s, toucher « F » : la boîte verdict passe à « En retard ». Capturer `/tmp/np-i2-review/desktop-late.png` et `/tmp/np-i2-review/mobile-late.png`.
5. Recharger, appuyer sur Tab jusqu'au premier bouton du pavé, capturer `/tmp/np-i2-review/desktop-focus.png`.

Ouvrir chaque capture une fois et vérifier qu'elle montre ce que son nom annonce. Juger ensuite, sur les cinq captures ensemble :

- le pavé occupe exactement la place de la piste (bande basse de 35 % sur 16:9, place de la piste sous la consigne en portrait), et plus rien de la piste ne subsiste (tuiles, ligne d'arrivée, cœur, libellé de mesure) ;
- 6 × 2 sur bureau, 3 × 4 sur téléphone, dans l'ordre C … B, gouttières d'une tuile ;
- les libellés altérés s'écrivent « F# / Gb » (bémol en minuscule) et tiennent sur une ligne ;
- la consigne du mode 2 (« case 8 », et la plus longue, « corde à vide ») tient dans sa colonne aux deux tailles ;
- le bouton touché est inversé, les autres lisiblement désactivés sans recours à la couleur ;
- la boîte verdict montre le sprite « flèche droite », « En retard » et le temps de réaction, sans ligne d'écart en ms ;
- l'anneau de focus est visible et tiré des quatre tons ;
- rien hors des quatre tons et du damier ; contrastes conformes à `craft-floor.md`.

- [ ] **Step 8: Corriger en un seul lot, puis une capture de confirmation**

Appliquer en une fois toutes les corrections relevées, parmi celles-ci selon le symptôme :

- **Pavé trop bas en portrait** (rangées sous 64 px) : dans `PlayScreen.svelte`, ajouter `class:answering` sur l'élément de placement de la bande relevé à la Task 5 (c) (ou sur `.lane-slot`) et, dans son `<style>`, la règle suivante, en reprenant le nom de classe de H à la place de `.lane-slot` :

```css
.lane-slot.answering {
	min-block-size: calc(4 * 64px + 3 * 8px);
}
```

- **Libellé coupé** dans un bouton : dans `AnswerPad.svelte`, ajouter à `.cell > :global(*)` les deux déclarations `white-space: nowrap;` et `padding-inline: 4px;`.
- **Consigne du mode 2 trop large** : dans `PlayScreen.svelte`, ajouter `class:answering` sur l'élément de la consigne principale et, dans le `<style>`, une règle `.answering` qui ramène sa taille au palier immédiatement inférieur de l'échelle que H utilise pour cette consigne.
- **Bande qui garde un ornement de piste** : déplacer cet élément dans la branche `{:else}` de la Task 5.

Relancer `npx vitest run src/lib/ui/play && npm run check` (PASS, `svelte-check found 0 errors`), puis refaire une seule fois les cinq captures sur les mêmes fichiers pour confirmer que les corrections ont porté. Pas de seconde chasse aux défauts : ce qui reste est signalé dans le compte rendu de la branche.

- [ ] **Step 9: Passe `detect`**

```bash
~/.cursor/skills/impeccable/scripts/impeccable detect --json src/lib/ui/play/answer/AnswerPad.svelte src/lib/ui/play/answer/AnswerPanel.svelte src/lib/ui/play/PlayScreen.svelte
```

Expected: `[]`. Corriger tout constat mécanique dans les fichiers d'I2 ou dans les lignes ajoutées à `PlayScreen` par ce plan, relancer jusqu'à `[]`. Un constat qui porte sur du code de H non modifié par ce plan se signale sans correction.

- [ ] **Step 10: Vérifier**

Arrêter le serveur de développement, puis :

```bash
npx vitest run src/lib/ui/play && npm run check
git status --short
```

Expected: PASS, `svelte-check found 0 errors` ; `git status --short` ne liste que des fichiers sous `src/lib/ui/play/answer/`, `src/lib/ui/play/PlayScreen.svelte` et `src/routes/dev/identify/`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/ui/play/answer src/lib/ui/play/PlayScreen.svelte src/routes/dev/identify
git commit -m "style: fit the mode 2 answer pad to the Bonfire play screen"
```

---

## Vérification finale

```bash
npm test && npm run check && npm run build
git diff --name-only main...HEAD
```

Expected: tous les tests PASS, `svelte-check found 0 errors`, le build écrit `build/index.html`. La liste des fichiers modifiés contient exactement :

```
src/lib/ui/play/PlayScreen.svelte
src/lib/ui/play/answer/AnswerPad.svelte
src/lib/ui/play/answer/AnswerPad.svelte.spec.ts
src/lib/ui/play/answer/AnswerPanel.svelte
src/lib/ui/play/answer/AnswerPanel.svelte.spec.ts
src/lib/ui/play/answer/DemoIdentifySession.svelte.spec.ts
src/lib/ui/play/answer/DemoIdentifySession.svelte.ts
src/lib/ui/play/answer/PlayScreen.identify.svelte.spec.ts
src/lib/ui/play/answer/choices.spec.ts
src/lib/ui/play/answer/choices.ts
src/lib/ui/play/answer/messages.ts
src/lib/ui/play/answer/showsAnswerPad.spec.ts
src/lib/ui/play/answer/showsAnswerPad.ts
src/routes/dev/identify/+page.svelte
```

## Fin du plan

La branche `plan/i2-reponse-mode-2` se fusionne dans `main` en fin de vague 2, `npm test && npm run check` après la fusion. Le compte rendu de la branche signale : les constats `detect` laissés sur le code de H, un éventuel test `it.skip` de la Task 5 (écart affiché par une boîte verdict hors de `PlayScreen.svelte`), et ce que la capture de confirmation a laissé ouvert.

Limites connues, laissées aux plans suivants :

- Après un toucher, le bouton natif désactivé perd le focus ; au clavier, il faut revenir dans le pavé par Tab à chaque consigne.
- La démonstration du mode 2 est la route `/dev/identify`, retirée du build de production par le plan K avec les autres routes `dev`.
