# I1 — Accueil, bilan, carte du manche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les trois écrans hors jeu du prototype — accueil (un bouton, un chiffre), bilan de session, carte du manche 6×12 — en composants de présentation alimentés par props, routes minces via `useAppServices()`, pages de prévisualisation `dev`, helpers de libellés relatifs et de tendance testés, puis une surface Impeccable par écran et une passe `detect` + finish-reviewer sur les trois.

**Architecture:** Chaque écran est un composant de présentation sous `src/lib/ui/screens/{home,summary,map}/`, sans accès aux services. Les routes `src/routes/+page.svelte`, `summary/+page.svelte`, `map/+page.svelte` appellent `useAppServices()`, chargent `HomeStats` / `SessionSummary` / `NeckMapCell[]`, et passent des props. Les pages `src/routes/dev/{home,summary,map}/` servent des fixtures pour la vérification visuelle et les surfaces Impeccable. Les helpers purs (temps relatif, tendance, précision à froid, bascule d'action) vivent sous `src/lib/ui/screens/home/` (partagés avec le bilan via import) et sont testés en Node. L'univers Bonfire vient de H (jetons, `PixelButton`, `PixelBox`, `PixelText`) ; I1 n'ajoute aucune primitive.

**Tech Stack:** Svelte 5 (runes), SvelteKit, TypeScript, Vitest (Node `*.spec.ts`, jsdom `*.svelte.spec.ts`), `@testing-library/svelte`, CSS natif, Impeccable (`concept-seed`, `serve-question`, `build-phase`, `detect`, finish-reviewer).

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

- **Chemins possédés** (README, ligne I1) : `src/routes/+page.svelte`, `src/routes/summary/**`, `src/routes/map/**`, `src/lib/ui/screens/home/**`, `src/lib/ui/screens/summary/**`, `src/lib/ui/screens/map/**`, `src/routes/dev/home/**`, `src/routes/dev/summary/**`, `src/routes/dev/map/**`. Rien d'autre n'est commité comme code produit, sauf l'exception Impeccable ci-dessous.
- **Vague 2** : la branche `plan/i1-accueil-bilan-carte` part de `main` après la fusion de la vague 1. Ce plan consomme, exactement comme le README les signe : de H, `PixelBox.svelte ({ variant: 'plain' | 'double' | 'inverted'; children })`, `PixelButton.svelte ({ onclick; disabled?; size?: 'large' | 'huge'; children })`, `PixelText.svelte ({ as?: string; scale?: 1 | 2 | 3 | 4 | 8; children })`, `tokens.css` ; de C (via les types P0 et `AppServices`), `HomeStats`, `SessionSummary`, `NeckMapCell`, `CardStatus` ; de A, `formatNote` n'est pas requis (les cellules portent déjà `pitch`) ; de P0, `useAppServices()`, `defineMessages`, `i18n`, `Locale`, `SessionKind`, `STRING_NUMBERS`, `StringNumber`, `PitchName`.
- **Accueil** : un seul `PixelButton` `size="huge"` (positionnement, session du jour, ou libellé d'attente) actionnable à la barre d'espace ; un seul chiffre (médiane à froid + tendance). Pas de second bouton, pas de grille de stats, pas de carte du manche sur `/`.
- **Attente (`nextAction: 'wait'`)** : le bouton est **désactivé** et affiche l'heure relative de `nextReviewAt`. Le jeu libre reste ouvert ailleurs (`/session?kind=free`) ; I1 n'ajoute pas de second contrôle sur l'accueil.
- **Bilan** : précision à froid (`coldCorrect` / `coldCount`), médiane à froid, positions apprises (`learnedCount`), fatigue, prochaine heure conseillée (`nextSuggestedAt`). Navigation minimale vers `/map` et `/` après lecture.
- **Carte** : 6 cordes × 12 cases (frets 0..11), corde 6 en haut, case 0 à gauche ; statut `locate` et `identify` par cellule (`CardStatus`).
- **i18n** : chaque dossier d'écran déclare ses messages avec `defineMessages` ; pas de fichier de messages partagé hors helpers purs.
- **Univers** : surfaces entières dans un monde établi (`reference/new-work.md` §3). Une ronde de concepts par écran (`concept-seed --scope surface --mode operate`), comps ancrés sur une capture de l'écran de jeu construit, verrouillage, construction, **une** inspection. Puis une seule passe `detect` + finish-reviewer sur les trois. `DESIGN.md` (s'il existe à l'exécution) est l'autorité visuelle ; sinon le contrat de session + `tokens.css` + la capture de jeu. I1 ne réécrit pas `DESIGN.md`.
- **Exception Impeccable / propriété des chemins** : le README attribue `.impeccable/**` à H. Les Tasks 8–11 doivent néanmoins écrire les briefs de surface, comps, états `build-phase` et captures de revue sous `.impeccable/` pour les trois écrans I1 (sinon le parcours surface est impossible). Ne pas modifier le brief/session, la maquette `comp-4`, les jetons, les primitives, ni `DESIGN.md`. Signaler tout écart dans le compte rendu de branche.
- **Tests** : comme I2 — `fireEvent`, propriétés DOM, `cleanup()` dans `afterEach` ; au moins une assertion par test. Helpers purs en `*.spec.ts` ; composants en `*.svelte.spec.ts`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/ui/screens/home/relativeTime.ts` | `formatRelativeDelay` — libellé relatif FR/EN injecté |
| `src/lib/ui/screens/home/relativeTime.spec.ts` | Tests Node |
| `src/lib/ui/screens/home/trend.ts` | `formatTrend` — libellé de tendance ou `null` |
| `src/lib/ui/screens/home/trend.spec.ts` | Tests Node |
| `src/lib/ui/screens/home/homeAction.ts` | `homeSessionKind`, `isHomeActionEnabled` |
| `src/lib/ui/screens/home/homeAction.spec.ts` | Tests Node |
| `src/lib/ui/screens/home/coldAccuracy.ts` | `coldAccuracyRatio` — partagé avec le bilan |
| `src/lib/ui/screens/home/coldAccuracy.spec.ts` | Tests Node |
| `src/lib/ui/screens/home/messages.ts` | Messages de l'accueil |
| `src/lib/ui/screens/home/HomeScreen.svelte` | Présentation : bouton huge + un chiffre |
| `src/lib/ui/screens/home/HomeScreen.svelte.spec.ts` | Tests jsdom |
| `src/routes/+page.svelte` | Route mince : `homeStats()`, navigation, barre d'espace |
| `src/routes/dev/home/+page.svelte` | Fixture visuelle |
| `src/lib/ui/screens/summary/messages.ts` | Messages du bilan |
| `src/lib/ui/screens/summary/SummaryScreen.svelte` | Présentation du bilan |
| `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts` | Tests jsdom |
| `src/routes/summary/+page.svelte` | Route mince : `sessionSummary(sessionId)` |
| `src/routes/dev/summary/+page.svelte` | Fixture visuelle |
| `src/lib/ui/screens/map/messages.ts` | Messages de la carte |
| `src/lib/ui/screens/map/neckGrid.ts` | `cellsByString` — grille 6×12 ordonnée |
| `src/lib/ui/screens/map/neckGrid.spec.ts` | Tests Node |
| `src/lib/ui/screens/map/NeckMapScreen.svelte` | Présentation 6×12, statut par sens |
| `src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts` | Tests jsdom |
| `src/routes/map/+page.svelte` | Route mince : `neckMap()` |
| `src/routes/dev/map/+page.svelte` | Fixture visuelle |

---

### Task 1: Helpers purs (temps relatif, tendance, action, précision)

**Files:**
- Create: `src/lib/ui/screens/home/relativeTime.ts`, `trend.ts`, `homeAction.ts`, `coldAccuracy.ts`
- Test: `src/lib/ui/screens/home/relativeTime.spec.ts`, `trend.spec.ts`, `homeAction.spec.ts`, `coldAccuracy.spec.ts`

**Interfaces:**
- Consumes: `HomeStats`, `SessionKind` (`$lib/domain/types`).
- Produces:
  - `formatRelativeDelay(targetAt: number, now: number, t: RelativeTimeMessages): string`
  - `formatTrend(trend: HomeStats['trend'], t: TrendMessages): string | null`
  - `homeSessionKind(nextAction: HomeStats['nextAction']): SessionKind | null` — `'placement'` → `'placement'`, `'session'` → `'daily'`, `'wait'` → `null`
  - `isHomeActionEnabled(nextAction: HomeStats['nextAction']): boolean` — faux seulement pour `'wait'`
  - `coldAccuracyRatio(coldCorrect: number, coldCount: number): number | null`

- [ ] **Step 1: Vérifier que la vague 1 est fusionnée**

```bash
ls src/lib/ui/primitives/PixelButton.svelte src/lib/ui/primitives/PixelBox.svelte src/lib/ui/primitives/PixelText.svelte src/lib/ui/tokens.css
ls src/lib/application/app.ts src/lib/i18n/index.svelte.ts
rg -n "export (interface HomeStats|type CardStatus|interface SessionSummary|interface NeckMapCell)" src/lib/domain/types.ts
rg -n "export function (computeHomeStats|summarizeSession|buildNeckMap)" src/lib/domain/progress
```

Expected: les chemins H/P0 existent ; les quatre types P0 et les trois fonctions C sont listés. Si un chemin manque, arrêter : la vague 1 n'est pas fusionnée.

- [ ] **Step 2: Écrire les tests**

Créer `src/lib/ui/screens/home/relativeTime.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeDelay } from './relativeTime';

const t = {
	soon: 'bientôt',
	inMinutes: (n: number) => (n === 1 ? 'dans 1 min' : `dans ${n} min`),
	inHours: (n: number) => (n === 1 ? 'dans 1 h' : `dans ${n} h`),
	inDays: (n: number) => (n === 1 ? 'dans 1 j' : `dans ${n} j`)
};

describe('formatRelativeDelay', () => {
	it('uses soon under one minute', () => {
		expect(formatRelativeDelay(30_000, 0, t)).toBe('bientôt');
	});

	it('rounds up to whole minutes under one hour', () => {
		expect(formatRelativeDelay(90_000, 0, t)).toBe('dans 2 min');
		expect(formatRelativeDelay(60_000, 0, t)).toBe('dans 1 min');
	});

	it('rounds to whole hours under one day', () => {
		expect(formatRelativeDelay(2 * 60 * 60 * 1000, 0, t)).toBe('dans 2 h');
		expect(formatRelativeDelay(90 * 60 * 1000, 0, t)).toBe('dans 2 h');
	});

	it('rounds to whole days beyond one day', () => {
		expect(formatRelativeDelay(36 * 60 * 60 * 1000, 0, t)).toBe('dans 2 j');
	});

	it('treats a past target as soon', () => {
		expect(formatRelativeDelay(0, 5_000, t)).toBe('bientôt');
	});
});
```

Créer `src/lib/ui/screens/home/trend.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { formatTrend } from './trend';

const t = { improving: 'en baisse', stable: 'stable', worsening: 'en hausse' };

describe('formatTrend', () => {
	it('returns null when there is no trend', () => {
		expect(formatTrend(null, t)).toBeNull();
	});

	it('maps each trend to its label', () => {
		expect(formatTrend('improving', t)).toBe('en baisse');
		expect(formatTrend('stable', t)).toBe('stable');
		expect(formatTrend('worsening', t)).toBe('en hausse');
	});
});
```

Créer `src/lib/ui/screens/home/homeAction.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { homeSessionKind, isHomeActionEnabled } from './homeAction';

describe('homeSessionKind', () => {
	it('maps placement and session, and disables wait', () => {
		expect(homeSessionKind('placement')).toBe('placement');
		expect(homeSessionKind('session')).toBe('daily');
		expect(homeSessionKind('wait')).toBeNull();
	});
});

describe('isHomeActionEnabled', () => {
	it('enables placement and session only', () => {
		expect(isHomeActionEnabled('placement')).toBe(true);
		expect(isHomeActionEnabled('session')).toBe(true);
		expect(isHomeActionEnabled('wait')).toBe(false);
	});
});
```

Créer `src/lib/ui/screens/home/coldAccuracy.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { coldAccuracyRatio } from './coldAccuracy';

describe('coldAccuracyRatio', () => {
	it('returns null when there were no cold attempts', () => {
		expect(coldAccuracyRatio(0, 0)).toBeNull();
	});

	it('returns the ratio otherwise', () => {
		expect(coldAccuracyRatio(9, 10)).toBe(0.9);
		expect(coldAccuracyRatio(0, 5)).toBe(0);
	});
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/ui/screens/home/relativeTime.spec.ts src/lib/ui/screens/home/trend.spec.ts src/lib/ui/screens/home/homeAction.spec.ts src/lib/ui/screens/home/coldAccuracy.spec.ts`

Expected: FAIL (modules introuvables).

- [ ] **Step 4: Implémenter**

Créer `src/lib/ui/screens/home/relativeTime.ts` :

```ts
export interface RelativeTimeMessages {
	soon: string;
	inMinutes: (n: number) => string;
	inHours: (n: number) => string;
	inDays: (n: number) => string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Human delay from `now` to `targetAt` (epoch ms). Past or < 1 min → soon. */
export function formatRelativeDelay(
	targetAt: number,
	now: number,
	t: RelativeTimeMessages
): string {
	const delta = targetAt - now;
	if (delta < MINUTE) return t.soon;
	if (delta < HOUR) return t.inMinutes(Math.ceil(delta / MINUTE));
	if (delta < DAY) return t.inHours(Math.ceil(delta / HOUR));
	return t.inDays(Math.ceil(delta / DAY));
}
```

Créer `src/lib/ui/screens/home/trend.ts` :

```ts
import type { HomeStats } from '$lib/domain/types';

export interface TrendMessages {
	improving: string;
	stable: string;
	worsening: string;
}

/** Reaction-time trend label. Improving = faster (lower ms). */
export function formatTrend(trend: HomeStats['trend'], t: TrendMessages): string | null {
	if (trend === null) return null;
	return t[trend];
}
```

Créer `src/lib/ui/screens/home/homeAction.ts` :

```ts
import type { HomeStats, SessionKind } from '$lib/domain/types';

export function homeSessionKind(nextAction: HomeStats['nextAction']): SessionKind | null {
	if (nextAction === 'placement') return 'placement';
	if (nextAction === 'session') return 'daily';
	return null;
}

export function isHomeActionEnabled(nextAction: HomeStats['nextAction']): boolean {
	return nextAction !== 'wait';
}
```

Créer `src/lib/ui/screens/home/coldAccuracy.ts` :

```ts
/** Share of cold attempts that were correct; null when none. */
export function coldAccuracyRatio(coldCorrect: number, coldCount: number): number | null {
	if (coldCount <= 0) return null;
	return coldCorrect / coldCount;
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/ui/screens/home/relativeTime.spec.ts src/lib/ui/screens/home/trend.spec.ts src/lib/ui/screens/home/homeAction.spec.ts src/lib/ui/screens/home/coldAccuracy.spec.ts`

Expected: PASS (tous les tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/screens/home/relativeTime.ts src/lib/ui/screens/home/relativeTime.spec.ts \
  src/lib/ui/screens/home/trend.ts src/lib/ui/screens/home/trend.spec.ts \
  src/lib/ui/screens/home/homeAction.ts src/lib/ui/screens/home/homeAction.spec.ts \
  src/lib/ui/screens/home/coldAccuracy.ts src/lib/ui/screens/home/coldAccuracy.spec.ts
git commit -m "$(cat <<'EOF'
feat: add home relative-time, trend and accuracy helpers

EOF
)"
```

---

### Task 2: `HomeScreen` de présentation

**Files:**
- Create: `src/lib/ui/screens/home/messages.ts`, `src/lib/ui/screens/home/HomeScreen.svelte`
- Test: `src/lib/ui/screens/home/HomeScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: helpers Task 1 ; `PixelButton`, `PixelText` (H) ; `defineMessages`, `i18n` (P0) ; `HomeStats` (P0).
- Produces: `HomeScreen` — props `{ stats: HomeStats; now: number; onstart: () => void }`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/screens/home/HomeScreen.svelte.spec.ts` :

```ts
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeStats } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import HomeScreen from './HomeScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const base: HomeStats = {
	nextAction: 'session',
	nextReviewAt: null,
	medianColdReactionMs: 1200,
	trend: 'improving'
};

describe('HomeScreen', () => {
	it('shows one huge start button and the one reaction number with trend', () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {} } });
		const button = screen.getByRole('button');
		expect(button.textContent).toMatch(/session du jour/i);
		expect(button).not.toBeDisabled();
		expect(screen.getByText('1,20 s')).toBeTruthy();
		expect(screen.getByText(/en baisse/i)).toBeTruthy();
	});

	it('disables the button and shows relative wait time', () => {
		const stats: HomeStats = {
			nextAction: 'wait',
			nextReviewAt: 2 * 60 * 60 * 1000,
			medianColdReactionMs: null,
			trend: null
		};
		render(HomeScreen, { props: { stats, now: 0, onstart: () => {} } });
		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
		expect(button.textContent).toMatch(/dans 2 h/i);
	});

	it('calls onstart when the button is clicked', async () => {
		const onstart = vi.fn();
		render(HomeScreen, { props: { stats: base, now: 0, onstart } });
		await fireEvent.click(screen.getByRole('button'));
		expect(onstart).toHaveBeenCalledOnce();
	});

	it('switches copy to English', () => {
		i18n.locale = 'en';
		render(HomeScreen, {
			props: {
				stats: { ...base, nextAction: 'placement', medianColdReactionMs: 900, trend: 'stable' },
				now: 0,
				onstart: () => {}
			}
		});
		expect(screen.getByRole('button').textContent).toMatch(/placement/i);
		expect(screen.getByText('0,90 s')).toBeTruthy();
		expect(screen.getByText(/stable/i)).toBeTruthy();
	});
});
```

Note : si la locale `en` formate encore avec une virgule via le helper local du composant (pas `Intl`), les assertions `1,20 s` / `0,90 s` restent valides dans les deux langues — le séparateur décimal est fixe dans le formatteur du composant (virgule, comme sur la maquette de jeu).

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/screens/home/HomeScreen.svelte.spec.ts`

Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter messages et composant**

Créer `src/lib/ui/screens/home/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		placement: 'Positionnement',
		session: 'Session du jour',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		improving: 'en baisse',
		stable: 'stable',
		worsening: 'en hausse',
		reactionLabel: 'Médiane à froid',
		emptyReaction: '—'
	},
	en: {
		placement: 'Placement',
		session: 'Daily session',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		improving: 'getting faster',
		stable: 'stable',
		worsening: 'getting slower',
		reactionLabel: 'Cold median',
		emptyReaction: '—'
	}
});
```

Créer `src/lib/ui/screens/home/HomeScreen.svelte` :

```svelte
<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { formatRelativeDelay } from './relativeTime';
	import { formatTrend } from './trend';
	import { isHomeActionEnabled } from './homeAction';
	import { homeMessages } from './messages';

	let {
		stats,
		now,
		onstart
	}: {
		stats: HomeStats;
		now: number;
		onstart: () => void;
	} = $props();

	const t = $derived(homeMessages());

	const enabled = $derived(isHomeActionEnabled(stats.nextAction));

	const buttonLabel = $derived.by(() => {
		if (stats.nextAction === 'placement') return t.placement;
		if (stats.nextAction === 'session') return t.session;
		if (stats.nextReviewAt == null) return t.soon;
		return formatRelativeDelay(stats.nextReviewAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
	});

	const reaction = $derived.by(() => {
		if (stats.medianColdReactionMs == null) return t.emptyReaction;
		const seconds = stats.medianColdReactionMs / 1000;
		return `${seconds.toFixed(2).replace('.', ',')} s`;
	});

	const trend = $derived(
		formatTrend(stats.trend, {
			improving: t.improving,
			stable: t.stable,
			worsening: t.worsening
		})
	);
</script>

<section class="home" aria-label="Neckspert Play">
	<div class="action">
		<PixelButton size="huge" disabled={!enabled} onclick={onstart}>
			{buttonLabel}
		</PixelButton>
	</div>
	<div class="stat">
		<PixelText scale={4}>{reaction}</PixelText>
		{#if trend}
			<PixelText scale={1}>{trend}</PixelText>
		{/if}
	</div>
</section>

<style>
	.home {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(8 * var(--tile, 8px));
		padding: calc(4 * var(--tile, 8px));
		box-sizing: border-box;
	}

	.action {
		width: min(100%, 28rem);
		display: flex;
		justify-content: center;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tile, 8px);
		font-variant-numeric: tabular-nums;
	}
</style>
```

Si `PixelText` ou `PixelButton` n'acceptent pas exactement ces props à l'exécution, s'aligner sur les signatures H du README sans changer les primitives : adapter uniquement l'appel dans ce fichier et noter l'écart.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/ui/screens/home/HomeScreen.svelte.spec.ts`

Expected: PASS. Si `getByRole('button')` échoue parce que `PixelButton` ne rend pas un `<button>` natif, arrêter et le signaler (primitive H).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/screens/home/messages.ts src/lib/ui/screens/home/HomeScreen.svelte \
  src/lib/ui/screens/home/HomeScreen.svelte.spec.ts
git commit -m "$(cat <<'EOF'
feat: add HomeScreen with one button and one number

EOF
)"
```

---

### Task 3: Route d'accueil, barre d'espace, page `dev/home`

**Files:**
- Modify: `src/routes/+page.svelte`
- Create: `src/routes/dev/home/+page.svelte`

**Interfaces:**
- Consumes: `HomeScreen`, `homeSessionKind` ; `useAppServices()` (P0) ; navigation SvelteKit vers `/session?kind=`.
- Produces: `/` charge `homeStats()` ; Space déclenche `onstart` si l'action est active ; `/dev/home` affiche trois fixtures.

- [ ] **Step 1: Remplacer la page d'accueil**

Remplacer `src/routes/+page.svelte` par :

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';
	import { homeSessionKind } from '$lib/ui/screens/home/homeAction';

	const services = useAppServices();

	let stats = $state<HomeStats | null>(null);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.homeStats().then(
			(value) => {
				if (!cancelled) {
					stats = value;
					now = Date.now();
				}
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		return () => {
			cancelled = true;
		};
	});

	function start() {
		if (!stats) return;
		const kind = homeSessionKind(stats.nextAction);
		if (!kind) return;
		void goto(`/session?kind=${kind}`);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== ' ') return;
		if (event.repeat) return;
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
		event.preventDefault();
		start();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if error}
	<p role="alert">{error}</p>
{:else if stats}
	<HomeScreen {stats} {now} onstart={start} />
{/if}
```

- [ ] **Step 2: Créer la page de prévisualisation**

Créer `src/routes/dev/home/+page.svelte` :

```svelte
<script lang="ts">
	import type { HomeStats } from '$lib/domain/types';
	import HomeScreen from '$lib/ui/screens/home/HomeScreen.svelte';

	const fixtures: { label: string; stats: HomeStats; now: number }[] = [
		{
			label: 'session',
			now: 0,
			stats: {
				nextAction: 'session',
				nextReviewAt: null,
				medianColdReactionMs: 1180,
				trend: 'improving'
			}
		},
		{
			label: 'placement',
			now: 0,
			stats: {
				nextAction: 'placement',
				nextReviewAt: null,
				medianColdReactionMs: null,
				trend: null
			}
		},
		{
			label: 'wait',
			now: 0,
			stats: {
				nextAction: 'wait',
				nextReviewAt: 2 * 60 * 60 * 1000,
				medianColdReactionMs: 1400,
				trend: 'worsening'
			}
		}
	];
</script>

<main class="dev">
	{#each fixtures as fixture (fixture.label)}
		<section>
			<h1>{fixture.label}</h1>
			<HomeScreen stats={fixture.stats} now={fixture.now} onstart={() => {}} />
		</section>
	{/each}
</main>

<style>
	.dev {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	h1 {
		font-family: inherit;
		font-size: 1rem;
		margin: 0;
		padding: 0.5rem;
	}
</style>
```

- [ ] **Step 3: Vérifier types et tests**

Run: `npx vitest run src/lib/ui/screens/home && npm run check`

Expected: PASS, `svelte-check found 0 errors`. `useAppServices` lèvera hors contexte au runtime sur `/` tant que K n'a pas câblé le layout — acceptable en vague 2 ; `/dev/home` n'utilise pas les services.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte src/routes/dev/home/+page.svelte
git commit -m "$(cat <<'EOF'
feat: wire home route with space bar and dev preview

EOF
)"
```

---

### Task 4: `SummaryScreen` de présentation

**Files:**
- Create: `src/lib/ui/screens/summary/messages.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte`
- Test: `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `coldAccuracyRatio`, `formatRelativeDelay` (Task 1) ; `PixelBox`, `PixelButton`, `PixelText` (H) ; `SessionSummary` (P0).
- Produces: `SummaryScreen` — props `{ summary: SessionSummary; now: number; onhome: () => void; onmap: () => void }`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts` :

```ts
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import SummaryScreen from './SummaryScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const summary: SessionSummary = {
	sessionId: 's1',
	coldCount: 10,
	coldCorrect: 8,
	medianColdReactionMs: 1100,
	learnedCount: 2,
	fatigueDetected: true,
	nextSuggestedAt: 2 * 60 * 60 * 1000
};

describe('SummaryScreen', () => {
	it('shows cold accuracy, median, learned, fatigue and next time', () => {
		render(SummaryScreen, {
			props: { summary, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('80 %')).toBeTruthy();
		expect(screen.getByText('1,10 s')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByText(/fatigue/i)).toBeTruthy();
		expect(screen.getByText(/dans 2 h/i)).toBeTruthy();
	});

	it('navigates home and to the map', async () => {
		const onhome = vi.fn();
		const onmap = vi.fn();
		render(SummaryScreen, { props: { summary, now: 0, onhome, onmap } });
		await fireEvent.click(screen.getByRole('button', { name: /accueil|home/i }));
		await fireEvent.click(screen.getByRole('button', { name: /carte|map/i }));
		expect(onhome).toHaveBeenCalledOnce();
		expect(onmap).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implémenter**

Créer `src/lib/ui/screens/summary/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';

export const summaryMessages = defineMessages({
	fr: {
		title: 'Bilan',
		accuracy: 'Précision à froid',
		median: 'Médiane à froid',
		learned: 'Positions apprises',
		fatigue: 'Fatigue détectée',
		noFatigue: 'Pas de fatigue',
		next: 'Prochaine session',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		home: 'Accueil',
		map: 'Carte du manche',
		empty: '—'
	},
	en: {
		title: 'Summary',
		accuracy: 'Cold accuracy',
		median: 'Cold median',
		learned: 'Positions learned',
		fatigue: 'Fatigue detected',
		noFatigue: 'No fatigue',
		next: 'Next session',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		home: 'Home',
		map: 'Neck map',
		empty: '—'
	}
});
```

Créer `src/lib/ui/screens/summary/SummaryScreen.svelte` :

```svelte
<script lang="ts">
	import type { SessionSummary } from '$lib/domain/types';
	import PixelBox from '$lib/ui/primitives/PixelBox.svelte';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { coldAccuracyRatio } from '$lib/ui/screens/home/coldAccuracy';
	import { formatRelativeDelay } from '$lib/ui/screens/home/relativeTime';
	import { summaryMessages } from './messages';

	let {
		summary,
		now,
		onhome,
		onmap
	}: {
		summary: SessionSummary;
		now: number;
		onhome: () => void;
		onmap: () => void;
	} = $props();

	const t = $derived(summaryMessages());

	const accuracy = $derived.by(() => {
		const ratio = coldAccuracyRatio(summary.coldCorrect, summary.coldCount);
		if (ratio == null) return t.empty;
		return `${Math.round(ratio * 100)} %`;
	});

	const median = $derived.by(() => {
		if (summary.medianColdReactionMs == null) return t.empty;
		return `${(summary.medianColdReactionMs / 1000).toFixed(2).replace('.', ',')} s`;
	});

	const next = $derived.by(() => {
		if (summary.nextSuggestedAt == null) return t.empty;
		return formatRelativeDelay(summary.nextSuggestedAt, now, {
			soon: t.soon,
			inMinutes: t.inMinutes,
			inHours: t.inHours,
			inDays: t.inDays
		});
	});
</script>

<section class="summary">
	<PixelText scale={3}>{t.title}</PixelText>
	<PixelBox variant="double">
		<ul class="rows">
			<li>
				<span>{t.accuracy}</span>
				<strong>{accuracy}</strong>
			</li>
			<li>
				<span>{t.median}</span>
				<strong>{median}</strong>
			</li>
			<li>
				<span>{t.learned}</span>
				<strong>{summary.learnedCount}</strong>
			</li>
			<li>
				<span>{summary.fatigueDetected ? t.fatigue : t.noFatigue}</span>
			</li>
			<li>
				<span>{t.next}</span>
				<strong>{next}</strong>
			</li>
		</ul>
	</PixelBox>
	<nav class="nav">
		<PixelButton size="large" onclick={onhome}>{t.home}</PixelButton>
		<PixelButton size="large" onclick={onmap}>{t.map}</PixelButton>
	</nav>
</section>

<style>
	.summary {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(3 * var(--tile, 8px));
		padding: calc(4 * var(--tile, 8px));
		box-sizing: border-box;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: calc(2 * var(--tile, 8px));
		display: flex;
		flex-direction: column;
		gap: var(--tile, 8px);
		min-width: min(100%, 22rem);
		font-variant-numeric: tabular-nums;
	}

	.rows li {
		display: flex;
		justify-content: space-between;
		gap: calc(2 * var(--tile, 8px));
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--tile, 8px);
		justify-content: center;
	}
</style>
```

- [ ] **Step 4: Lancer le test**

Run: `npx vitest run src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/screens/summary
git commit -m "$(cat <<'EOF'
feat: add SummaryScreen for post-session bilans

EOF
)"
```

---

### Task 5: Route bilan et page `dev/summary`

**Files:**
- Create: `src/routes/summary/+page.svelte`, `src/routes/dev/summary/+page.svelte`

**Interfaces:**
- Consumes: `SummaryScreen` ; `useAppServices().sessionSummary(sessionId)` ; `?sessionId=` dans l'URL.
- Produces: `/summary` affiche le bilan ; `/dev/summary` une fixture.

- [ ] **Step 1: Créer la route**

Créer `src/routes/summary/+page.svelte` :

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAppServices } from '$lib/application/app';
	import type { SessionSummary } from '$lib/domain/types';
	import SummaryScreen from '$lib/ui/screens/summary/SummaryScreen.svelte';

	const services = useAppServices();

	let summary = $state<SessionSummary | null>(null);
	let now = $state(Date.now());
	let error = $state<string | null>(null);

	const sessionId = $derived(page.url.searchParams.get('sessionId'));

	$effect(() => {
		const id = sessionId;
		if (!id) {
			error = 'Missing sessionId';
			summary = null;
			return;
		}
		let cancelled = false;
		error = null;
		void services.sessionSummary(id).then(
			(value) => {
				if (!cancelled) {
					summary = value;
					now = Date.now();
				}
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		return () => {
			cancelled = true;
		};
	});
</script>

{#if error}
	<p role="alert">{error}</p>
{:else if summary}
	<SummaryScreen
		{summary}
		{now}
		onhome={() => void goto('/')}
		onmap={() => void goto('/map')}
	/>
{/if}
```

Si `$app/state` n'est pas disponible dans la version SvelteKit du socle, remplacer l'import par `import { page } from '$app/stores'` et lire `$page.url.searchParams.get('sessionId')` avec une rune dérivée adaptée (`$derived($page.url.searchParams.get('sessionId'))` si les stores sont encore exposés) — sans toucher `package.json`.

- [ ] **Step 2: Page dev**

Créer `src/routes/dev/summary/+page.svelte` :

```svelte
<script lang="ts">
	import type { SessionSummary } from '$lib/domain/types';
	import SummaryScreen from '$lib/ui/screens/summary/SummaryScreen.svelte';

	const summary: SessionSummary = {
		sessionId: 'dev',
		coldCount: 12,
		coldCorrect: 10,
		medianColdReactionMs: 1050,
		learnedCount: 3,
		fatigueDetected: false,
		nextSuggestedAt: 2 * 60 * 60 * 1000
	};
</script>

<SummaryScreen {summary} now={0} onhome={() => {}} onmap={() => {}} />
```

- [ ] **Step 3: Vérifier**

Run: `npx vitest run src/lib/ui/screens/summary && npm run check`

Expected: PASS, `svelte-check found 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/summary/+page.svelte src/routes/dev/summary/+page.svelte
git commit -m "$(cat <<'EOF'
feat: wire summary route and dev preview

EOF
)"
```

---

### Task 6: Grille et `NeckMapScreen`

**Files:**
- Create: `src/lib/ui/screens/map/neckGrid.ts`, `messages.ts`, `NeckMapScreen.svelte`
- Test: `src/lib/ui/screens/map/neckGrid.spec.ts`, `NeckMapScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `NeckMapCell`, `CardStatus`, `STRING_NUMBERS` (P0) ; primitives H.
- Produces:
  - `cellsByString(cells: readonly NeckMapCell[]): NeckMapCell[][]` — index 0 = corde 6, chaque rangée frets 0..11.
  - `NeckMapScreen` — props `{ cells: NeckMapCell[]; onhome: () => void }`.

- [ ] **Step 1: Écrire les tests**

Créer `src/lib/ui/screens/map/neckGrid.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { NeckMapCell } from '$lib/domain/types';
import { cellsByString } from './neckGrid';

function cell(string: 1 | 2 | 3 | 4 | 5 | 6, fret: number): NeckMapCell {
	return {
		string,
		fret,
		pitch: 'C',
		locate: 'unseen',
		identify: 'unseen',
		medianColdReactionMs: null,
		coldAccuracy: null
	};
}

describe('cellsByString', () => {
	it('orders string 6 at the top and frets 0..11 left to right', () => {
		const cells = [cell(1, 11), cell(6, 0), cell(6, 1), cell(1, 0)];
		const rows = cellsByString(cells);
		expect(rows).toHaveLength(6);
		expect(rows[0].map((c) => c.string)).toEqual(Array(12).fill(6));
		expect(rows[0].map((c) => c.fret)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(rows[5][0].string).toBe(1);
	});
});
```

Créer `src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts` :

```ts
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { NeckMapCell } from '$lib/domain/types';
import { STRING_NUMBERS } from '$lib/domain/music/types';
import { i18n } from '$lib/i18n/index.svelte';
import NeckMapScreen from './NeckMapScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

function buildCells(): NeckMapCell[] {
	const cells: NeckMapCell[] = [];
	for (const string of STRING_NUMBERS) {
		for (let fret = 0; fret < 12; fret++) {
			cells.push({
				string,
				fret,
				pitch: 'E',
				locate: string === 6 && fret === 3 ? 'mastered' : 'unseen',
				identify: string === 6 && fret === 3 ? 'acquired' : 'unseen',
				medianColdReactionMs: null,
				coldAccuracy: null
			});
		}
	}
	return cells;
}

describe('NeckMapScreen', () => {
	it('renders 72 cells with per-direction status', () => {
		render(NeckMapScreen, { props: { cells: buildCells(), onhome: () => {} } });
		expect(screen.getAllByRole('gridcell')).toHaveLength(72);
		const marked = screen.getByRole('gridcell', { name: /corde 6.*case 3/i });
		expect(marked.textContent).toMatch(/maîtrisé|mastered/i);
		expect(marked.textContent).toMatch(/acquis|acquired/i);
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/ui/screens/map`

Expected: FAIL.

- [ ] **Step 3: Implémenter**

Créer `src/lib/ui/screens/map/neckGrid.ts` :

```ts
import type { StringNumber } from '$lib/domain/music/types';
import type { NeckMapCell } from '$lib/domain/types';

const ROW_ORDER: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Six rows (string 6 → 1), each with frets 0..11. Missing cells are omitted from that slot's source list — callers pass the full 72. */
export function cellsByString(cells: readonly NeckMapCell[]): NeckMapCell[][] {
	const byKey = new Map(cells.map((cell) => [`${cell.string}:${cell.fret}`, cell] as const));
	return ROW_ORDER.map((string) =>
		Array.from({ length: 12 }, (_, fret) => {
			const found = byKey.get(`${string}:${fret}`);
			if (!found) {
				throw new Error(`Missing neck map cell string ${string} fret ${fret}`);
			}
			return found;
		})
	);
}
```

Créer `src/lib/ui/screens/map/messages.ts` :

```ts
import { defineMessages } from '$lib/i18n/index.svelte';
import type { CardStatus } from '$lib/domain/types';

export const mapMessages = defineMessages({
	fr: {
		title: 'Carte du manche',
		home: 'Accueil',
		locate: 'Localisation',
		identify: 'Identification',
		cell: (string: number, fret: number) => `Corde ${string}, case ${fret}`,
		status: {
			unseen: 'non vu',
			learning: 'en cours',
			acquired: 'acquis',
			mastered: 'maîtrisé'
		} satisfies Record<CardStatus, string>
	},
	en: {
		title: 'Neck map',
		home: 'Home',
		locate: 'Locate',
		identify: 'Identify',
		cell: (string: number, fret: number) => `String ${string}, fret ${fret}`,
		status: {
			unseen: 'unseen',
			learning: 'learning',
			acquired: 'acquired',
			mastered: 'mastered'
		} satisfies Record<CardStatus, string>
	}
});
```

Créer `src/lib/ui/screens/map/NeckMapScreen.svelte` :

```svelte
<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import PixelButton from '$lib/ui/primitives/PixelButton.svelte';
	import PixelText from '$lib/ui/primitives/PixelText.svelte';
	import { cellsByString } from './neckGrid';
	import { mapMessages } from './messages';

	let {
		cells,
		onhome
	}: {
		cells: NeckMapCell[];
		onhome: () => void;
	} = $props();

	const t = $derived(mapMessages());
	const rows = $derived(cellsByString(cells));
</script>

<section class="map">
	<PixelText scale={3}>{t.title}</PixelText>
	<div class="board" role="grid" aria-label={t.title}>
		{#each rows as row (row[0].string)}
			<div class="row" role="row">
				{#each row as cell (cell.fret)}
					<div
						class="cell"
						class:mastered={cell.locate === 'mastered' || cell.identify === 'mastered'}
						class:acquired={cell.locate === 'acquired' || cell.identify === 'acquired'}
						class:learning={cell.locate === 'learning' || cell.identify === 'learning'}
						role="gridcell"
						aria-label="{t.cell(cell.string, cell.fret)}. {t.locate}: {t.status[
							cell.locate
						]}. {t.identify}: {t.status[cell.identify]}"
					>
						<span class="pitch">{cell.pitch}</span>
						<span class="dirs">
							<span data-status={cell.locate}>{t.status[cell.locate]}</span>
							<span data-status={cell.identify}>{t.status[cell.identify]}</span>
						</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
	<PixelButton size="large" onclick={onhome}>{t.home}</PixelButton>
</section>

<style>
	.map {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(2 * var(--tile, 8px));
		padding: calc(2 * var(--tile, 8px));
		box-sizing: border-box;
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		max-width: 56rem;
		overflow-x: auto;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(12, minmax(2.5rem, 1fr));
		gap: 2px;
	}

	.cell {
		border: 2px solid var(--tone-ink, #451218);
		min-height: 3rem;
		padding: 2px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		font-variant-numeric: tabular-nums;
		background: var(--tone-mid, #be6754);
		color: var(--tone-ink, #451218);
	}

	.cell.learning {
		background-image: linear-gradient(
			45deg,
			var(--tone-ink, #451218) 25%,
			transparent 25%,
			transparent 50%,
			var(--tone-ink, #451218) 50%,
			var(--tone-ink, #451218) 75%,
			transparent 75%,
			transparent
		);
		background-size: 4px 4px;
	}

	.cell.acquired {
		background: var(--tone-shadow, #813b2a);
		color: var(--tone-light, #e99568);
	}

	.cell.mastered {
		background: var(--tone-ink, #451218);
		color: var(--tone-light, #e99568);
	}

	.pitch {
		font-size: 0.75rem;
	}

	.dirs {
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-size: 0.55rem;
		line-height: 1.1;
		text-transform: uppercase;
	}
</style>
```

Remplacer les noms de variables CSS par ceux de `tokens.css` relevés à l'exécution (même valeurs Bonfire).

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run src/lib/ui/screens/map`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/screens/map
git commit -m "$(cat <<'EOF'
feat: add NeckMapScreen for 6x12 status grid

EOF
)"
```

---

### Task 7: Route carte et page `dev/map`

**Files:**
- Create: `src/routes/map/+page.svelte`, `src/routes/dev/map/+page.svelte`

**Interfaces:**
- Consumes: `NeckMapScreen` ; `useAppServices().neckMap()`.
- Produces: `/map` et `/dev/map`.

- [ ] **Step 1: Route**

Créer `src/routes/map/+page.svelte` :

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAppServices } from '$lib/application/app';
	import type { NeckMapCell } from '$lib/domain/types';
	import NeckMapScreen from '$lib/ui/screens/map/NeckMapScreen.svelte';

	const services = useAppServices();

	let cells = $state<NeckMapCell[] | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		void services.neckMap().then(
			(value) => {
				if (!cancelled) cells = value;
			},
			(err: unknown) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			}
		);
		return () => {
			cancelled = true;
		};
	});
</script>

{#if error}
	<p role="alert">{error}</p>
{:else if cells}
	<NeckMapScreen {cells} onhome={() => void goto('/')} />
{/if}
```

- [ ] **Step 2: Dev avec 72 cellules**

Créer `src/routes/dev/map/+page.svelte` :

```svelte
<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import { STRING_NUMBERS } from '$lib/domain/music/types';
	import { pitchOnString } from '$lib/domain/music';
	import NeckMapScreen from '$lib/ui/screens/map/NeckMapScreen.svelte';

	const cells: NeckMapCell[] = STRING_NUMBERS.flatMap((string) =>
		Array.from({ length: 12 }, (_, fret) => {
			const locate =
				string === 6 && fret === 3
					? 'mastered'
					: string === 6 && fret <= 7
						? 'acquired'
						: string === 5 && fret <= 3
							? 'learning'
							: 'unseen';
			return {
				string,
				fret,
				pitch: pitchOnString(string, fret),
				locate,
				identify: locate === 'mastered' ? 'acquired' : 'unseen',
				medianColdReactionMs: null,
				coldAccuracy: null
			} satisfies NeckMapCell;
		})
	);
</script>

<NeckMapScreen {cells} onhome={() => {}} />
```

- [ ] **Step 3: Vérifier**

Run: `npx vitest run src/lib/ui/screens && npm run check`

Expected: PASS, `svelte-check found 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/map/+page.svelte src/routes/dev/map/+page.svelte
git commit -m "$(cat <<'EOF'
feat: wire neck map route and dev preview

EOF
)"
```

---

### Task 8: Surface Impeccable — Accueil

**Files:**
- Modify: `src/lib/ui/screens/home/HomeScreen.svelte` (structure/styles selon le contrat verrouillé)
- Create (exception `.impeccable/`) : brief de surface pour `src/routes/+page.svelte` / `HomeScreen`, comps sous `.impeccable/mocks/`, captures sous `.impeccable/review/`
- Preview: `src/routes/dev/home/+page.svelte`

**Interfaces:**
- Consumes: monde H + `DESIGN.md` s'il existe ; capture de `/session/demo` ou `/session` comme ancre visuelle.
- Produces: contrat de direction de l'accueil ; `HomeScreen` aligné sur le comp verrouillé.

Cadre : **surface entière dans un monde établi** (`reference/new-work.md` §3). Mode Operate. Pas de nouveau monde, pas de réécriture de `DESIGN.md`.

- [ ] **Step 1: Charger le contexte et l'autorité visuelle**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/+page.svelte
```

Lire dans l'ordre : `DESIGN.md` (s'il existe), `.impeccable/design.json` (s'il existe), `.impeccable/surfaces/src-routes-session-page-svelte.md`, `.impeccable/mocks/comp-4-full-bleed-lane.png`, `src/lib/ui/tokens.css`, `HomeScreen.svelte`, puis `reference/new-work.md` §3 et `reference/craft-floor.md`.

- [ ] **Step 2: Capturer l'écran de jeu construit comme ancre**

Démarrer l'app, ouvrir `/session/demo` (ou la route de démo H), capturer le premier viewport bureau dans `/tmp/np-i1-play-anchor.png` (ou `.impeccable/review/play-anchor.png`). Cette image est la référence pixel passée à chaque génération de comp (`--ref` / image d'entrée du harness).

- [ ] **Step 3: Ronde de concepts surface**

```bash
~/.cursor/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode operate
```

Suivre la sortie du script. Dériver 5–7 structures matériellement différentes pour l'accueil (un bouton huge + un chiffre, mains loin, 60 cm–1 m), puis présenter la main traitée (trois cartes) via `serve-question`. Chaque carte déclare un `comp` sous `.impeccable/mocks/decision/` ; générer les comps **après** avoir servi la page, en ancrant chaque prompt sur `/tmp/np-i1-play-anchor.png` : le prompt mène avec la structure de l'accueil et nomme la palette / typo / caractère des composants de `DESIGN.md` (ou du contrat de session si `DESIGN.md` manque). Verrouiller une carte.

- [ ] **Step 4: Enregistrer le contrat de direction**

Écrire le brief de surface pour la cible primaire `src/routes/+page.svelte` (related: `src/lib/ui/screens/home/HomeScreen.svelte`) avec les six blocs THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH via `impeccable surface-brief write`. Relire et vérifier la présence de la clé de seed.

- [ ] **Step 5: Construire selon le chemin verrouillé**

Si comp-led (défaut avec génération d'images) : `impeccable build-phase start --comp <comp approuvé>` puis enchaîner les phases dues (spec → … selon ce que le gate exige pour cette surface Operate simple). Construire uniquement avec les primitives H et les jetons existants ; ajuster `HomeScreen.svelte` pour tenir le FIRST VIEWPORT verrouillé (toujours : un bouton, un chiffre ; pas de stats secondaires).

Si code-led (bascule utilisateur) : pas de `build-phase` ; porter l'ambition dans le FIRST VIEWPORT et construire directement.

- [ ] **Step 6: Une inspection**

Capturer bureau (1440) et mobile (390) de `/dev/home` (état `session`) dans `.impeccable/review/` (`home-desktop.png`, `home-mobile.png`). Critiquer contre le contrat et le brief ; corriger les écarts matériels en une seule passe ; confirmer par une seconde capture seulement si une correction a changé le premier viewport.

- [ ] **Step 7: Tests + commit**

```bash
npx vitest run src/lib/ui/screens/home && npm run check
git add src/lib/ui/screens/home src/routes/dev/home \
  .impeccable/surfaces .impeccable/mocks .impeccable/review .impeccable/build 2>/dev/null || true
git status --short
git commit -m "$(cat <<'EOF'
style: lock and build the home surface in the Bonfire world

EOF
)"
```

N'ajouter que les artefacts Impeccable de **cette** surface ; ne pas restager le brief session ni `comp-4`.

---

### Task 9: Surface Impeccable — Bilan

**Files:**
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte`
- Create (exception `.impeccable/`) : brief + comps + captures pour le bilan
- Preview: `src/routes/dev/summary/+page.svelte`

**Interfaces:**
- Même cadre que Task 8 ; mode Operate ; contenu : précision, médiane, apprises, fatigue, prochaine heure.

- [ ] **Step 1: Contexte**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/summary/+page.svelte
```

Relire `DESIGN.md` / contrat session / jetons / craft-floor.

- [ ] **Step 2: Concepts + comps ancrés**

```bash
~/.cursor/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode operate
```

Réutiliser `/tmp/np-i1-play-anchor.png` (recréer si besoin). Structures pour un bilan post-session lisible à distance, sans carte dashboard. Servir, générer comps avec `--ref`, verrouiller.

- [ ] **Step 3: Brief + build + une inspection**

Écrire le brief (`src/routes/summary/+page.svelte`, related `SummaryScreen.svelte`). Construire selon le chemin verrouillé. Capturer `summary-desktop.png` / `summary-mobile.png` depuis `/dev/summary`. Une passe de correctifs.

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run src/lib/ui/screens/summary && npm run check
git add src/lib/ui/screens/summary src/routes/dev/summary \
  .impeccable/surfaces .impeccable/mocks .impeccable/review .impeccable/build 2>/dev/null || true
git commit -m "$(cat <<'EOF'
style: lock and build the summary surface in the Bonfire world

EOF
)"
```

---

### Task 10: Surface Impeccable — Carte du manche

**Files:**
- Modify: `src/lib/ui/screens/map/NeckMapScreen.svelte`
- Create (exception `.impeccable/`) : brief + comps + captures pour la carte
- Preview: `src/routes/dev/map/+page.svelte`

**Interfaces:**
- Consumes: monde H + `DESIGN.md` s'il existe ; ancre `/tmp/np-i1-play-anchor.png`.
- Produces: contrat de direction de la carte ; `NeckMapScreen` aligné sur le comp verrouillé (grille 6×12, statut par sens ; scroll horizontal accepté si le contrat le dit).

Cadre : **surface entière dans un monde établi** (`reference/new-work.md` §3). Mode Operate.

- [ ] **Step 1: Contexte et autorité visuelle**

```bash
~/.cursor/skills/impeccable/scripts/impeccable context --target src/routes/map/+page.svelte
```

Lire : `DESIGN.md` (s'il existe), `.impeccable/design.json` (s'il existe), `.impeccable/surfaces/src-routes-session-page-svelte.md`, `tokens.css`, `NeckMapScreen.svelte`, `reference/new-work.md` §3, `reference/craft-floor.md`.

- [ ] **Step 2: Ronde de concepts + comps ancrés**

Recréer `/tmp/np-i1-play-anchor.png` depuis `/session/demo` si le fichier manque.

```bash
~/.cursor/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode operate
```

Dériver 5–7 structures pour la carte 6×12 (corde 6 en haut, frets 0..11, `locate` et `identify` par case). Servir la page de décision, générer les comps sous `.impeccable/mocks/decision/` avec `--ref /tmp/np-i1-play-anchor.png` (prompt mené par la structure, palette/typo/composants nommés depuis `DESIGN.md` ou le contrat de session). Verrouiller une carte.

- [ ] **Step 3: Brief, build, une inspection**

Écrire le brief de surface pour `src/routes/map/+page.svelte` (related: `src/lib/ui/screens/map/NeckMapScreen.svelte`) avec THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH. Construire selon le chemin verrouillé (comp-led : `build-phase start --comp <approuvé>` ; code-led : FIRST VIEWPORT seul) en n'utilisant que les primitives H. Capturer `map-desktop.png` et `map-mobile.png` depuis `/dev/map` ; une passe de correctifs matériels.

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run src/lib/ui/screens/map && npm run check
git add src/lib/ui/screens/map src/routes/dev/map \
  .impeccable/surfaces .impeccable/mocks .impeccable/review .impeccable/build 2>/dev/null || true
git commit -m "$(cat <<'EOF'
style: lock and build the neck map surface in the Bonfire world

EOF
)"
```

---

### Task 11: `detect` et finish-reviewer sur les trois écrans

**Files:**
- Modify: uniquement les écrans I1 si le reviewer exige des correctifs matériels
- Captures : `.impeccable/review/home-*.png`, `summary-*.png`, `map-*.png`

**Interfaces:**
- Consumes: les trois contrats de direction ; craft-floor ; comps verrouillés.
- Produces: rapport `detect` traité ; verdict finish-reviewer ; correctifs en une vague si `fix`.

- [ ] **Step 1: Passe `detect`**

```bash
~/.cursor/skills/impeccable/scripts/impeccable detect --json \
  src/lib/ui/screens/home/HomeScreen.svelte \
  src/lib/ui/screens/summary/SummaryScreen.svelte \
  src/lib/ui/screens/map/NeckMapScreen.svelte \
  src/routes/+page.svelte \
  src/routes/summary/+page.svelte \
  src/routes/map/+page.svelte \
  src/routes/dev/home/+page.svelte \
  src/routes/dev/summary/+page.svelte \
  src/routes/dev/map/+page.svelte
```

Corriger ce qui est mécanique dans les chemins I1. Ne pas modifier les primitives H : reporter les constats qui les concernent.

- [ ] **Step 2: Recapturer les six viewports**

`/dev/home`, `/dev/summary`, `/dev/map` en 1440 et 390 ; mouvement d'entrée désactivé ou terminé ; fichiers sous `.impeccable/review/`. Ouvrir chaque fichier et vérifier qu'il montre la bonne surface.

- [ ] **Step 3: Spawner `impeccable-finish-reviewer`**

Paquet d'entrée : demande d'origine (trois écrans Operate), réponses confirmées, chemins des artefacts, captures, les trois contrats de direction, constats `detect` restants, cartes QUALITY BAR / comps approuvés (ou comps de décision en critique si code-led), craft-floor, état/spec/diff `build-phase` s'ils existent. `fork_turns: 0`. Attendre le retour complet (cinq sections, ou liste de recapture).

- [ ] **Step 4: Agir sur la disposition**

- `recapture` → recapturer ce qui est nommé, puis revue complète à nouveau.
- `rebuild` → reconstruire la surface nommée, puis revue complète.
- `fix` → une vague de correctifs I1, recapture, passe de verdict.
- `ship` → continuer.

Deux rondes max en non supervisé ; si des items restent, les lister dans le compte rendu de branche.

- [ ] **Step 5: Vérification finale + commit**

```bash
npm test && npm run check && npm run build
git diff --name-only main...HEAD
```

Expected: tests PASS, `svelte-check found 0 errors`, `build/index.html` écrit. Les chemins de code touchés sont uniquement ceux d'I1, plus les artefacts `.impeccable/` des trois surfaces (exception documentée).

```bash
git add src/lib/ui/screens src/routes/+page.svelte src/routes/summary src/routes/map \
  src/routes/dev/home src/routes/dev/summary src/routes/dev/map \
  .impeccable/surfaces .impeccable/mocks .impeccable/review .impeccable/build 2>/dev/null || true
git commit -m "$(cat <<'EOF'
chore: finish-review and detect pass for home, summary, map

EOF
)"
```

---

## Vérification finale

```bash
npm test && npm run check && npm run build
git diff --name-only main...HEAD
```

Expected: la liste de code source contient au plus :

```
src/lib/ui/screens/home/**
src/lib/ui/screens/summary/**
src/lib/ui/screens/map/**
src/routes/+page.svelte
src/routes/summary/+page.svelte
src/routes/dev/summary/+page.svelte
src/routes/map/+page.svelte
src/routes/dev/map/+page.svelte
src/routes/dev/home/+page.svelte
```

plus les fichiers `.impeccable/` créés pour les trois surfaces (pas le brief session, pas `comp-4`, pas `DESIGN.md`, pas `tokens.css`, pas les primitives).

## Fin du plan

La branche `plan/i1-accueil-bilan-carte` se fusionne dans `main` en fin de vague 2, `npm test && npm run check` après la fusion. Le compte rendu signale : l'exception `.impeccable/**`, les constats `detect` laissés sur H, l'absence d'entrée jeu libre sur l'accueil en `wait`, et tout item finish-reviewer encore ouvert.

Limites connues, laissées aux plans suivants :

- Câblage de `provideAppServices` dans le layout (K) pour que `/`, `/summary` et `/map` fonctionnent hors `dev`.
- Navigation post-série vers `/summary?sessionId=` (J).
- Entrée jeu libre depuis l'accueil quand `nextAction === 'wait'` (produit : un seul bouton désactivé ; libre via `/session?kind=free`).
