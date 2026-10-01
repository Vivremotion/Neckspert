# Carte, seuil d’identification, bilan du Jeu libre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur la carte la durée réelle du délai de localisation en secondes, compter un nommage juste jusqu’à 3 s comme un rappel direct, et ouvrir à la fin du Jeu libre un bilan avec une note de S+ à F+.

**Architecture:** Le tempo est copié sur `SessionRecord` au démarrage. `buildNeckMap` convertit le `leadBeats` courant avec le tempo de la session qui a écrit ce délai. Le seuil d’identification est une constante séparée, lue par le verdict et par les deux copies de `isDirectRecall`. Le bilan du Jeu libre réutilise `SummaryScreen` : `summarizeSession` élargit le pool à toutes les tentatives et `sessionGrade` produit la lettre. La page de session redirige uniquement quand `finishDestination` retourne un chemin.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Vitest. Tests `*.spec.ts` (Node) et `*.svelte.spec.ts` (jsdom). Pas de nouvelle dépendance.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-10-01-carte-seuil-bilan-design.md`.
- `IDENTIFY_RECALL_THRESHOLD_MS = 3000`. `RECALL_THRESHOLD_MS` reste `1500` et ne sert qu’à la localisation (`leadForThreshold` et `isDirectRecall` quand `leadBeats` est renseigné).
- `locateLeadMs = Math.round(leadBeats × 60_000 / tempoBpm)`. Affichage via le formateur existant `seconds` : deux décimales, virgule (`2,00 s`, `0,50 s`).
- Session retenue pour une carte de localisation : dernière tentative `phase === 'review'` et `temperature === 'cold'` (plus grande `promptedAt`) ; sinon `introducedInSession`. Tempo absent, `null`, ou session absente → `locateLeadMs` `null`, sans repli vers une session plus ancienne. La case affiche alors seulement le statut.
- `tempoBpm` sur `SessionRecord` : copié des réglages au démarrage, conservé à la clôture. Un changement de tempo en cours de session n’est pas suivi. Sauvegarde version 1 : champ facultatif ; absent ou `null` valide ; si présent, nombre fini `> 0`.
- Note : aucune tentative → `null` ; aucune juste → `F+` ; sinon S / A / B / C / D pour une part de fausses de 0 / `< 0,25` / `< 0,50` / `< 0,75` / reste. `+` si au moins la moitié des justes ont `verdict === 'perfect'` (`>= 0,5`). Pas de signe moins. `grade` est `null` hors `kind === 'free'`.
- `pool` vaut `'all'` si et seulement si `record.kind === 'free'`, sinon `'cold'`. Le pool `'all'` compte toutes les températures pour la précision, l’écart au temps et le temps pour nommer. Les filtres de direction existants restent (écart = localisations justes avec offset ; nommer = identifications avec `reactionMs`).
- Bilan Jeu libre : libellé « Précision » / « Accuracy », note en `PixelText` échelle 4 sous le titre, pas de ligne « Prochaine session ». Bilan froid : « Précision à froid » / « Cold accuracy », pas de note, ligne « Prochaine session » conservée.
- Ne pas fusionner les deux `isDirectRecall`. Ne pas rediriger `daily` ni `placement`. Ne pas ajouter de couperet de temps à l’identification.
- Les commits n’incluent pas `.impeccable/questions/421cac00.state.json`.
- Pour tout fichier `.svelte` ou `.svelte.ts` touché : lire et suivre `svelte-code-writer` (`/Users/cyril/.agents/skills/svelte-code-writer/SKILL.md`) avant d’éditer.

## File structure

- `src/lib/domain/types.ts` — constantes de seuil, `SessionRecord.tempoBpm`, `NeckMapCell.locateLeadMs`, `SessionSummary` renommé, `SessionGrade`.
- `src/lib/domain/scoring/identify.ts` et `recall.ts` — seuil 3000 pour le nommage. `src/lib/domain/progress/lead.ts` — même branche, copie séparée.
- `src/lib/domain/progress/grade.ts` — `sessionGrade` seul. Pas d’export dans `progress/index.ts`.
- `src/lib/domain/progress/stats.ts` — durée de carte et bilan.
- `src/lib/application/session/SessionController.svelte.ts` — écrit le tempo.
- `src/lib/application/session/finishDestination.ts` — chemin de fin de Jeu libre.
- `src/lib/ui/screens/map/NeckMapScreen.svelte` — secondes ou statut.
- `src/lib/ui/screens/summary/SummaryScreen.svelte` et `messages.ts` — note, libellé, ligne suivante.
- `src/routes/session/+page.svelte` — redirection. `src/routes/dev/summary/+page.svelte` — fixture Jeu libre. `src/routes/dev/map/+page.svelte` — `locateLeadMs` fourni.
- `docs/brief.md` — une phrase de seuil.

---

### Task 1: Seuil d’identification à 3 s

**Files:**
- Modify: `src/lib/domain/types.ts` (constante à côté de `RECALL_THRESHOLD_MS`)
- Modify: `src/lib/domain/scoring/identify.ts`
- Modify: `src/lib/domain/scoring/identify.spec.ts`
- Modify: `src/lib/domain/scoring/recall.ts`
- Modify: `src/lib/domain/scoring/recall.spec.ts`
- Modify: `src/lib/domain/progress/lead.ts`
- Modify: `src/lib/domain/progress/lead.spec.ts`
- Modify: `docs/brief.md` (la puce « Seuil mémoire contre calcul »)
- Test: les trois `*.spec.ts` ci-dessus

**Interfaces:**
- Consumes: `RECALL_THRESHOLD_MS` inchangé à 1500.
- Produces: `IDENTIFY_RECALL_THRESHOLD_MS = 3000` exporté depuis `$lib/domain/types`. `judgeIdentify` et les deux `isDirectRecall` utilisent 3000 quand `leadBeats === null`.

- [ ] **Step 1: Write the failing test**

Dans `identify.spec.ts`, remplacer l’import de `RECALL_THRESHOLD_MS` par `IDENTIFY_RECALL_THRESHOLD_MS`, et remplacer le test de frontière et le test d’arrondi :

```ts
it('keeps exactly IDENTIFY_RECALL_THRESHOLD_MS perfect and one millisecond more late', () => {
	expect(identify(15.345, 'F')).toMatchObject({
		verdict: 'perfect',
		reactionMs: IDENTIFY_RECALL_THRESHOLD_MS
	});
	expect(identify(15.346, 'F')).toMatchObject({
		correct: true,
		verdict: 'late',
		reactionMs: IDENTIFY_RECALL_THRESHOLD_MS + 1
	});
});

it('decides the verdict on the rounded reaction time', () => {
	expect(identify(15.3454, 'F')).toMatchObject({ verdict: 'perfect', reactionMs: 3000 });
	expect(identify(15.3456, 'F')).toMatchObject({ verdict: 'late', reactionMs: 3001 });
});
```

Dans `recall.spec.ts`, le premier test (« judges mode 2 on the reaction time ») importe `IDENTIFY_RECALL_THRESHOLD_MS` et compare `reactionMs` à cette constante, plus un, au lieu de `RECALL_THRESHOLD_MS`. Le test mode 1 (2 temps à 80 BPM vrai, 4 temps faux) ne change pas.

Dans `lead.spec.ts`, le test « mode 2: uses reactionMs against the threshold » fait la même substitution. Le test mode 1 ne change pas. `leadForThreshold` ne change pas.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/scoring/identify.spec.ts src/lib/domain/scoring/recall.spec.ts src/lib/domain/progress/lead.spec.ts`

Expected: FAIL. L’import `IDENTIFY_RECALL_THRESHOLD_MS` est introuvable, ou, si seul le temps a été changé, verdict `late` au lieu de `perfect` à 3000 ms.

- [ ] **Step 3: Write minimal implementation**

Dans `types.ts`, remplacer le commentaire et ajouter la constante juste après `RECALL_THRESHOLD_MS` :

```ts
/** Locate: a correct answer whose lead fits in this duration is direct recall. To calibrate. */
export const RECALL_THRESHOLD_MS = 1500;

/** Identify: a correct name within this duration is direct recall. To calibrate. */
export const IDENTIFY_RECALL_THRESHOLD_MS = 3000;
```

Dans `identify.ts`, importer `IDENTIFY_RECALL_THRESHOLD_MS` à la place de `RECALL_THRESHOLD_MS`. `speedVerdict` :

```ts
function speedVerdict(reactionMs: number): Verdict {
	return reactionMs <= IDENTIFY_RECALL_THRESHOLD_MS ? 'perfect' : 'late';
}
```

Dans `recall.ts` et `lead.ts`, importer les deux constantes. Branche `leadBeats === null` :

```ts
return attempt.reactionMs !== null && attempt.reactionMs <= IDENTIFY_RECALL_THRESHOLD_MS;
```

La branche avec `leadBeats` reste sur `RECALL_THRESHOLD_MS`. Mettre à jour le commentaire de chaque fonction pour dire que le mode 2 compare à `IDENTIFY_RECALL_THRESHOLD_MS`.

Dans `docs/brief.md`, remplacer la puce seuil par :

```md
- **Seuil « mémoire contre calcul ».** Jouer une note en moins d'environ 1,5 s correspond à un rappel direct ; la nommer, en moins de 3 s. Au-delà, c'est un calcul.
```

Ne pas modifier la puce « Définition de maîtrisé ».

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/scoring/identify.spec.ts src/lib/domain/scoring/recall.spec.ts src/lib/domain/progress/lead.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/scoring/identify.ts src/lib/domain/scoring/identify.spec.ts src/lib/domain/scoring/recall.ts src/lib/domain/scoring/recall.spec.ts src/lib/domain/progress/lead.ts src/lib/domain/progress/lead.spec.ts docs/brief.md
git commit -m "$(cat <<'EOF'
feat: count a named note within 3s as direct recall

EOF
)"
```

---

### Task 2: Tempo enregistré sur la session

**Files:**
- Modify: `src/lib/domain/types.ts` (`SessionRecord`)
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts`
- Modify: `src/lib/infrastructure/storage/testing/fixtures.ts`
- Modify: `src/lib/infrastructure/storage/validateBackup.ts`
- Modify: `src/lib/infrastructure/storage/validateBackup.spec.ts`
- Modify: `src/lib/domain/progress/stats.spec.ts` (le littéral `SessionRecord` du test `summarizeSession`)
- Test: `SessionController.spec.ts`, `validateBackup.spec.ts`

**Interfaces:**
- Consumes: `settings.tempoBpm` déjà lu dans `beginAudio`.
- Produces: `SessionRecord.tempoBpm: number | null`. Les deux `sessions.put` du contrôleur écrivent le tempo capturé au démarrage.

- [ ] **Step 1: Write the failing test**

Dans `SessionController.spec.ts`, ajouter :

```ts
it('stores the tempo from settings at start and keeps it after the tempo setting changes', async () => {
	await deps.settings.update({ tempoBpm: 60 });
	const controller = new SessionController(planWith([locateItem()]), deps);
	await controller.start();
	expect((await deps.sessions.get('sess-1'))?.tempoBpm).toBe(60);

	await deps.settings.update({ tempoBpm: 120 });
	controller.quit();
	for (let i = 0; i < 8; i++) await Promise.resolve();

	const ended = await deps.sessions.get('sess-1');
	expect(ended?.tempoBpm).toBe(60);
	expect(ended?.endedAt).not.toBeNull();
});
```

Dans `validateBackup.spec.ts`, ajouter deux tests : une session sans propriété `tempoBpm` passe `validateBackup` ; une session avec `tempoBpm: 0` jette une erreur qui contient `tempoBpm`. Construire l’objet sans le champ ainsi :

```ts
const { tempoBpm: _dropped, ...withoutTempo } = makeSession();
expect(() => validateBackup({ ...makeBackup(), sessions: [withoutTempo] })).not.toThrow();
```

Si `makeSession` n’a pas encore le champ, omettre simplement `tempoBpm` du littéral passé à `validateBackup` et attendre que l’ajout du champ requis fasse échouer le premier test du contrôleur à la compilation ou à l’assertion `toBe(60)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts src/lib/infrastructure/storage/validateBackup.spec.ts`

Expected: FAIL. `tempoBpm` est `undefined` après `start()`, ou le test `0` ne jette pas.

- [ ] **Step 3: Write minimal implementation**

`SessionRecord` :

```ts
export interface SessionRecord {
	id: string;
	kind: SessionKind;
	startedAt: number;
	endedAt: number | null;
	fatigueDetected: boolean;
	/** Tempo copied from settings when the session started. Null on older records. */
	tempoBpm: number | null;
}
```

`makeSession` ajoute `tempoBpm: 80`.

Le littéral dans `stats.spec.ts` (`summarizeSession`) ajoute `tempoBpm: 80`.

`SessionController` : champ privé `sessionTempoBpm: number | null = null`. Dans `beginAudio`, après la lecture des réglages :

```ts
this.sessionTempoBpm = this.settings.tempoBpm;
```

Les deux objets passés à `sessions.put` (démarrage et `finish`) incluent `tempoBpm: this.sessionTempoBpm`. Ne pas relire les réglages dans `finish`.

`checkSession` dans `validateBackup.ts` : si `tempoBpm` est `undefined` ou `null`, OK. Sinon, nombre fini strictement positif, sinon `'tempoBpm must be a positive number or null'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts src/lib/infrastructure/storage/validateBackup.spec.ts src/lib/domain/progress/stats.spec.ts src/lib/infrastructure/storage/DexieBackup.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/application/session/SessionController.svelte.ts src/lib/application/session/SessionController.spec.ts src/lib/infrastructure/storage/testing/fixtures.ts src/lib/infrastructure/storage/validateBackup.ts src/lib/infrastructure/storage/validateBackup.spec.ts src/lib/domain/progress/stats.spec.ts
git commit -m "$(cat <<'EOF'
feat: store each session's starting tempo

EOF
)"
```

---

### Task 3: Durée en secondes sur la carte

**Files:**
- Modify: `src/lib/domain/types.ts` (`NeckMapCell.locateLeadMs`)
- Modify: `src/lib/domain/progress/stats.ts`
- Modify: `src/lib/domain/progress/stats.spec.ts`
- Modify: `src/lib/application/services/createAppServices.ts`
- Modify: `src/lib/ui/screens/map/NeckMapScreen.svelte`
- Modify: `src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts`
- Modify: `src/lib/ui/screens/map/neckGrid.spec.ts`
- Modify: `src/routes/dev/map/+page.svelte`
- Test: `stats.spec.ts`, `NeckMapScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `SessionRecord.tempoBpm` (Task 2). `mapMessages().seconds(ms)`.
- Produces: `NeckMapCell.locateLeadMs: number | null`. `buildNeckMap` exige `sessions: readonly { id: string; tempoBpm?: number | null }[]`.

- [ ] **Step 1: Write the failing test**

Dans `stats.spec.ts`, ajouter un test `buildNeckMap` :

```ts
it('shows the current lead at the tempo of the session that last set it', () => {
	const intro = introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 'slow');
	const card = { ...intro, leadBeats: 1 as const };
	const cells = buildNeckMap({
		cards: [card],
		attempts: [
			coldAttempt({
				cardKey: card.key,
				target: card.target,
				phase: 'review',
				temperature: 'cold',
				sessionId: 'fast',
				promptedAt: NOW
			})
		],
		sessions: [
			{ id: 'slow', tempoBpm: 60 },
			{ id: 'fast', tempoBpm: 120 }
		],
		pitchAt: () => 'C'
	});
	const cell = cells.find((c) => c.string === 2 && c.fret === 8);
	expect(cell?.locateLeadMs).toBe(500);
});

it('omits the lead duration when that session has no tempo', () => {
	const card = introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 'old');
	const cells = buildNeckMap({
		cards: [{ ...card, leadBeats: 2 }],
		attempts: [],
		sessions: [{ id: 'old', tempoBpm: null }],
		pitchAt: () => 'C'
	});
	const cell = cells.find((c) => c.string === 2 && c.fret === 8);
	expect(cell?.locateLeadBeats).toBe(2);
	expect(cell?.locateLeadMs).toBeNull();
});
```

Réutiliser le `pitchAt` du test voisin : l’index de case est le nom, et la case 8 est `C`. La cellule corde 2 case 8 est donc la carte.

Mettre à jour l’appel existant de `buildNeckMap` pour passer `sessions: []`. La cellule acquise sans session a `locateLeadMs: null`.

Dans `NeckMapScreen.svelte.spec.ts`, la cellule corde 6 case 3 a `locateLeadMs: 2000` et les autres `null`. Le test attend `2,00 s` dans le texte et dans `aria-label`, et n’attend plus `2 temps`. Ajouter une assertion : une cellule avec `locateLeadBeats: 4` et `locateLeadMs: null` et `locate: 'learning'` affiche `en cours` et pas `temps`.

Ajouter `locateLeadMs: null` au helper de `neckGrid.spec.ts`. Dans `dev/map/+page.svelte`, chaque cellule gagne `locateLeadMs: locate === 'unseen' ? null : locate === 'learning' ? 6000 : 1500`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts src/lib/ui/screens/map/neckGrid.spec.ts`

Expected: FAIL. `sessions` inconnu, ou `locateLeadMs` absent, ou le texte contient encore `2 temps`.

- [ ] **Step 3: Write minimal implementation**

Ajouter sur `NeckMapCell` :

```ts
/** Duration of locateLeadBeats at the tempo of the session that set it. Null when unknown. */
locateLeadMs: number | null;
```

Dans `stats.ts`, résoudre le tempo :

```ts
function leadTempoBpm(
	card: CardState,
	attempts: readonly Attempt[],
	sessions: ReadonlyMap<string, { tempoBpm?: number | null }>
): number | null {
	if (card.target.direction !== 'locate') return null;
	let latest: Attempt | null = null;
	for (const attempt of attempts) {
		if (attempt.cardKey !== card.key || attempt.phase !== 'review' || attempt.temperature !== 'cold') {
			continue;
		}
		if (!latest || attempt.promptedAt >= latest.promptedAt) latest = attempt;
	}
	const tempo = sessions.get(latest?.sessionId ?? card.introducedInSession)?.tempoBpm;
	return tempo == null || tempo <= 0 ? null : tempo;
}
```

`buildNeckMap` construit la map des sessions une fois. Pour la carte de localisation :

```ts
const tempo = locateCard ? leadTempoBpm(locateCard, input.attempts, bySession) : null;
locateLeadMs: tempo == null || !locateCard ? null : Math.round((locateCard.leadBeats * 60_000) / tempo),
```

`createAppServices.neckMap` charge `deps.sessions.list()` en parallèle des cartes et des tentatives, et passe `sessions`.

`NeckMapScreen` : texte visible et `aria-label` utilisent `t.seconds(cell.locateLeadMs)` quand `locateLeadMs != null`, sinon `t.status[cell.locate]`. Ne plus appeler `t.beats` pour la localisation. Laisser `beats` dans les messages. L’identification continue d’utiliser `t.seconds(cell.identifyMedianReactionMs)`.

Lire `svelte-code-writer` avant d’éditer le `.svelte`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts src/lib/ui/screens/map/neckGrid.spec.ts src/lib/application/services/createAppServices.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progress/stats.ts src/lib/domain/progress/stats.spec.ts src/lib/application/services/createAppServices.ts src/lib/ui/screens/map/NeckMapScreen.svelte src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts src/lib/ui/screens/map/neckGrid.spec.ts src/routes/dev/map/+page.svelte
git commit -m "$(cat <<'EOF'
feat: show locate lead on the neck map in seconds

EOF
)"
```

---

### Task 4: Note de session

**Files:**
- Create: `src/lib/domain/progress/grade.ts`
- Create: `src/lib/domain/progress/grade.spec.ts`
- Modify: `src/lib/domain/types.ts` (`SessionGrade`)
- Test: `src/lib/domain/progress/grade.spec.ts`

**Interfaces:**
- Consumes: `Attempt.correct`, `Attempt.verdict`.
- Produces: `export type SessionGrade` dans `types.ts`. `export function sessionGrade(attempts: readonly Attempt[]): SessionGrade | null` dans `grade.ts`. Ne pas l’ajouter à `progress/index.ts`.

- [ ] **Step 1: Write the failing test**

`grade.spec.ts` construit des tentatives avec un helper `attempts(n, { correct, perfect })` : `n` tentatives, dont `correct` sont justes ; parmi ces justes, `perfect` ont `verdict: 'perfect'` et les autres `verdict: 'late'`. Les fausses ont `correct: false` et `verdict: 'wrong'`. Coder exactement :

| n | justes | perfect parmi les justes | note |
| --- | --- | --- | --- |
| 0 | 0 | 0 | `null` |
| 20 | 0 | 0 | `F+` |
| 20 | 20 | 10 | `S+` |
| 20 | 20 | 9 | `S` |
| 20 | 16 | 8 | `A+` |
| 20 | 15 | 15 | `B+` |
| 20 | 11 | 5 | `B` |
| 20 | 6 | 0 | `C` |
| 20 | 5 | 0 | `D` |
| 20 | 1 | 1 | `D+` |
| 2 | 2 | 1 | `S+` |

11 justes sur 20 = 45 % de fausses → B, et 5/11 perfect &lt; 0,5 → `B` sans plus. 6 justes = 70 % de fausses → C.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/progress/grade.spec.ts`

Expected: FAIL. Module `./grade` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
export type SessionGrade =
	| 'S+' | 'S'
	| 'A+' | 'A'
	| 'B+' | 'B'
	| 'C+' | 'C'
	| 'D+' | 'D'
	| 'F+';
```

```ts
import type { Attempt, SessionGrade } from '$lib/domain/types';

const PLUS = { S: 'S+', A: 'A+', B: 'B+', C: 'C+', D: 'D+' } as const;

export function sessionGrade(attempts: readonly Attempt[]): SessionGrade | null {
	if (attempts.length === 0) return null;
	const correct = attempts.filter((attempt) => attempt.correct);
	if (correct.length === 0) return 'F+';
	const wrongRatio = (attempts.length - correct.length) / attempts.length;
	const letter =
		wrongRatio === 0 ? 'S' : wrongRatio < 0.25 ? 'A' : wrongRatio < 0.5 ? 'B' : wrongRatio < 0.75 ? 'C' : 'D';
	const clean = correct.filter((attempt) => attempt.verdict === 'perfect').length;
	return clean / correct.length >= 0.5 ? PLUS[letter] : letter;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/progress/grade.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progress/grade.ts src/lib/domain/progress/grade.spec.ts
git commit -m "$(cat <<'EOF'
feat: grade a free-play run from S+ to F+

EOF
)"
```

---

### Task 5: Bilan — pool et note dans le domaine

**Files:**
- Modify: `src/lib/domain/types.ts` (`SessionSummary`)
- Modify: `src/lib/domain/progress/stats.ts`
- Modify: `src/lib/domain/progress/stats.spec.ts`
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte`
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`
- Modify: `src/lib/ui/screens/calibration/fakeServices.ts`
- Modify: `src/routes/dev/summary/+page.svelte`
- Test: `stats.spec.ts`, `SummaryScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `sessionGrade` (Task 4). `record.kind`.
- Produces: `SessionSummary` avec `pool: 'cold' | 'all'`, `attemptCount`, `correctCount`, `medianOffsetMs`, `grade: SessionGrade | null`. Les champs `coldCount`, `coldCorrect`, `medianColdOffsetMs` n’existent plus. L’écran lit les nouveaux noms et garde le comportement visuel actuel (toujours « Précision à froid », toujours la ligne suivante, pas de note). La fixture dev reste un bilan froid (`pool: 'cold'`, `grade: null`).

- [ ] **Step 1: Write the failing test**

Étendre le test `summarizeSession` existant. Le record daily attend :

```ts
pool: 'cold',
attemptCount: 3,
correctCount: 2,
medianOffsetMs: 12,
identifyMedianReactionMs: 640,
grade: null,
```

à la place de `coldCount`, `coldCorrect`, `medianColdOffsetMs`. Le chaud reste exclu : la tentative `temperature: 'hot'` ne change pas ces comptes.

Ajouter un second test, mêmes tentatives, `record.kind = 'free'`. Le helper est juste et `verdict: 'perfect'` par défaut. La deuxième tentative est fausse. La troisième est chaude, juste, `timingOffsetMs: 4`. La quatrième est une identification froide juste, sans offset. Offsets de localisation justes : 12 et 4, médiane 8. Justes : 3 sur 4, toutes `perfect`. Part de fausses 0,25, donc B, et 3/3 `perfect`, donc `B+`.

```ts
expect(summary.pool).toBe('all');
expect(summary.attemptCount).toBe(4);
expect(summary.correctCount).toBe(3);
expect(summary.medianOffsetMs).toBe(8);
expect(summary.identifyMedianReactionMs).toBe(640);
expect(summary.grade).toBe('B+');
```

Ajouter un troisième cas : session `free`, `attempts: []` → `attemptCount` 0, `medianOffsetMs` null, `identifyMedianReactionMs` null, `grade` null.

Mettre à jour le littéral de `SummaryScreen.svelte.spec.ts`, `EMPTY_SUMMARY` et `dev/summary` vers les nouveaux champs, avec `pool: 'cold'` et `grade: null`. L’écran doit encore afficher `80 %`, `18 ms`, `0,64 s`, `2`, fatigue, et `Dans 2 h`. Pas de lettre de note.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Expected: FAIL. Champs inconnus, ou `grade` absent.

- [ ] **Step 3: Write minimal implementation**

Remplacer dans `SessionSummary` `coldCount` / `coldCorrect` / `medianColdOffsetMs` par `pool`, `attemptCount`, `correctCount`, `medianOffsetMs`, et ajouter `grade`. Garder `identifyMedianReactionMs`, `learnedCount`, `fatigueDetected`, `nextSuggestedAt`.

`locateOffsets` et `identifyReactions` prennent un second argument `pool: 'cold' | 'all' = 'cold'`. Le filtre `temperature !== 'cold'` ne s’applique que si `pool === 'cold'`. `computeHomeStats` ne passe pas le second argument.

`summarizeSession` :

```ts
const pool = input.record.kind === 'free' ? 'all' : 'cold';
const counted = pool === 'all' ? input.attempts : input.attempts.filter((attempt) => attempt.temperature === 'cold');
return {
	sessionId: input.record.id,
	pool,
	attemptCount: counted.length,
	correctCount: counted.filter((attempt) => attempt.correct).length,
	medianOffsetMs: median(locateOffsets(input.attempts, pool)),
	identifyMedianReactionMs: median(identifyReactions(input.attempts, pool)),
	learnedCount: input.cards.filter((card) => card.introducedInSession === input.record.id).length,
	fatigueDetected: input.record.fatigueDetected,
	nextSuggestedAt: /* inchangé */,
	grade: pool === 'all' ? sessionGrade(input.attempts) : null
};
```

`SummaryScreen` lit `attemptCount`, `correctCount`, `medianOffsetMs`. Ne pas encore afficher `grade` ni brancher le libellé sur `pool` : c’est la tâche 6. Le projet doit compiler.

Lire `svelte-code-writer` avant le `.svelte`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts src/lib/application/services/createAppServices.spec.ts`

Expected: PASS. `npm run check` ne signale pas d’erreur sur `SessionSummary`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progress/stats.ts src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/summary/SummaryScreen.svelte src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts src/lib/ui/screens/calibration/fakeServices.ts src/routes/dev/summary/+page.svelte
git commit -m "$(cat <<'EOF'
feat: score free-play summaries across cold and hot attempts

EOF
)"
```

---

### Task 6: Écran de bilan du Jeu libre

**Files:**
- Modify: `src/lib/ui/screens/summary/messages.ts`
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte`
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`
- Modify: `src/routes/dev/summary/+page.svelte`
- Test: `SummaryScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `SessionSummary.pool`, `SessionSummary.grade` (Task 5).
- Produces: le bilan affiche la note seulement si `grade != null`, le libellé « Précision » seulement si `pool === 'all'`, et masque « Prochaine session » dans ce cas. `/dev/summary` montre un exemple `pool: 'all'`, `grade: 'S+'`.

- [ ] **Step 1: Write the failing test**

Dans `SummaryScreen.svelte.spec.ts`, garder le test daily (pool cold, grade null) : `Précision à froid`, `Dans 2 h`, et `queryByText` ne trouve pas une note `S+`.

Ajouter un test avec la même fixture passée en `pool: 'all'`, `grade: 'S+'` :

```ts
expect(screen.getByText('S+')).toBeTruthy();
expect(screen.getByText('Précision')).toBeTruthy();
expect(screen.queryByText(/prochaine session/i)).toBeNull();
expect(screen.queryByText(/dans 2 h/i)).toBeNull();
```

Le libellé « Précision » ne doit pas être confondu avec « Précision à froid » : chercher le texte exact de la ligne, par exemple `getByText('Précision', { exact: true })` sur l’élément qui porte ce libellé, ou `getByText(/^Précision$/)` .

Messages anglais : `accuracyAll: 'Accuracy'`. Le test reste en `fr`.

`dev/summary` : `pool: 'all'`, `grade: 'S+'`, `attemptCount: 12`, `correctCount: 10`, `medianOffsetMs: 24`, `identifyMedianReactionMs: 640`, `learnedCount: 3`, `fatigueDetected: false`, `nextSuggestedAt: 2 * 60 * 60 * 1000`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Expected: FAIL. `S+` absent, ou « Prochaine session » encore là.

- [ ] **Step 3: Write minimal implementation**

Dans `messages.ts`, ajouter `accuracyAll: 'Précision'` en fr et `'Accuracy'` en en. Ne pas changer `accuracy`.

Dans `SummaryScreen.svelte` :

```svelte
const accuracyLabel = $derived(summary.pool === 'all' ? t.accuracyAll : t.accuracy);
```

Sous le `header` du titre, avant `PixelBox` :

```svelte
{#if summary.grade}
	<p class="grade"><PixelText scale={4}>{summary.grade}</PixelText></p>
{/if}
```

La ligne de précision utilise `accuracyLabel`. La ligne `t.next` est dans `{#if summary.pool !== 'all'}`.

Centrer `.grade` comme le titre. Pas de nouveau bouton.

Lire `svelte-code-writer` avant d’éditer.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/screens/summary/messages.ts src/lib/ui/screens/summary/SummaryScreen.svelte src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts src/routes/dev/summary/+page.svelte
git commit -m "$(cat <<'EOF'
feat: show a free-play grade on the session summary

EOF
)"
```

---

### Task 7: Redirection en fin de Jeu libre

**Files:**
- Create: `src/lib/application/session/finishDestination.ts`
- Create: `src/lib/application/session/finishDestination.spec.ts`
- Modify: `src/routes/session/+page.svelte`
- Test: `finishDestination.spec.ts`

**Interfaces:**
- Consumes: `SessionKind`, `controller.sessionId`, `controller.view.status`.
- Produces: `finishDestination(kind: SessionKind, sessionId: string): string | null`. Pour `free`, `` `/summary?sessionId=${encodeURIComponent(sessionId)}` ``. Pour `daily` et `placement`, `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { finishDestination } from './finishDestination';

describe('finishDestination', () => {
	it('sends a finished free play to its summary', () => {
		expect(finishDestination('free', 'abc')).toBe('/summary?sessionId=abc');
		expect(finishDestination('free', 'a b')).toBe('/summary?sessionId=a%20b');
	});

	it('leaves daily and placement on the play screen', () => {
		expect(finishDestination('daily', 'abc')).toBeNull();
		expect(finishDestination('placement', 'abc')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/application/session/finishDestination.spec.ts`

Expected: FAIL. Module introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SessionKind } from '$lib/domain/types';

export function finishDestination(kind: SessionKind, sessionId: string): string | null {
	if (kind !== 'free') return null;
	return `/summary?sessionId=${encodeURIComponent(sessionId)}`;
}
```

Dans `src/routes/session/+page.svelte`, importer `goto` depuis `$app/navigation` et `finishDestination`. Le `kind` déjà lu dans `onMount` doit être lisible par un effet : le dériver de `page.url.searchParams` comme aujourd’hui (`'daily'` par défaut).

```ts
let left = false;

$effect(() => {
	if (left || !controller || controller.view.status !== 'finished') return;
	const href = finishDestination(kind, controller.sessionId);
	if (!href) return;
	left = true;
	void goto(href);
});
```

`onDestroy` ne quitte pas une session déjà `finished` : ne pas changer cette garde. Lire `svelte-code-writer` avant d’éditer la page.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/application/session/finishDestination.spec.ts src/lib/application/session/SessionController.spec.ts`

Expected: PASS. Puis `npm run check` : pas d’erreur nouvelle dans `src/routes/session/+page.svelte`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/finishDestination.ts src/lib/application/session/finishDestination.spec.ts src/routes/session/+page.svelte
git commit -m "$(cat <<'EOF'
feat: open the summary when free play ends

EOF
)"
```
