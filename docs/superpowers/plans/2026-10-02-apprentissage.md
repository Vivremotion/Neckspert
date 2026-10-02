# Apprentissage — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la session du jour par l’Apprentissage : 5 minutes, toujours ouverte, rappels espacés dans la session, fenêtre glissante sur une file ordonnée, froid compté aussi en jeu libre.

**Architecture :** un sélecteur pur (`domain/progress/learnSelector.ts`) choisit chaque consigne ; `SessionController` l’interroge après chaque verdict au lieu de vider une liste. La file d’introduction (`introduction.ts`) remplace les ensembles. L’éligibilité au froid (`review.ts`) est partagée par le sélecteur, l’accueil et le bilan.

**Tech Stack :** Svelte 5 (runes), SvelteKit statique, TypeScript, Vitest, Dexie, ts-fsrs.

**Spec :** `docs/superpowers/specs/2026-10-02-apprentissage-design.md` (lire aussi sa section « Corrections »).

## Global Constraints

- Branche `plan/apprentissage`. Barrière à chaque commit : `npm test && npm run check`.
- Toute valeur chiffrée est une constante nommée dans `src/lib/domain/progress/constants.ts`.
- Code, identifiants, commentaires en anglais ; textes d’interface FR et EN via `defineMessages`.
- Commits Conventional Commits, minuscules, impératif, orientés comportement.
- Domaine sans Svelte ni API navigateur.
- Seuls les essais à froid touchent FSRS, l’acquis, la maîtrise et les statistiques de rétention.

## Review Focus

1. **Session sans rien à proposer** (fatigue sans retest en attente, ou 5 minutes écoulées) : `next()` rend `null` et le contrôleur termine proprement, sans boucle ni exception. → tests Task 4 (`fatigue_only_retests`, `ends_after_five_minutes`) et Task 5 (`stops after the current verdict past five minutes`).
2. **Note seule en apprentissage, rien d’autre** : le retest est servi en avance, la note peut devenir apprise. → test Task 4.
3. **Course entre `record()` et le temps suivant** : `record()` est appelé de façon synchrone avant tout `await` dans `persistAttempt`. → test Task 5.
4. **Quitter au milieu d’un apprentissage** : la carte reste `learnedAt: null` et revient en reprise à la session suivante. → test Task 4 (reprise) + Task 5 (carte créée dès la présentation).
5. **Carte jouée en jeu libre il y a 10 min, puis due** : ni proposée en révision, ni comptée dans `dueCount`. → tests Task 3 et Task 6.

---

### Task 1 : modèle de données, renommage `learn`, remise à zéro

**Files :**
- Modify : `src/lib/domain/types.ts`, `src/lib/domain/progress/cards.ts`, `src/lib/domain/progress/constants.ts` (+ spec), `src/lib/domain/progress/index.ts`
- Modify : `src/lib/infrastructure/storage/db.ts` (+ spec), `validateBackup.ts` (+ spec), `testing/fixtures.ts`
- Modify : toute occurrence de `'daily'` (`homeAction.ts`, `routes/session/+page.svelte`, `createAppServices.ts`, specs)
- Test : `cards.spec.ts`, `db.spec.ts`, `validateBackup.spec.ts`

**Interfaces :**
- Produces :
  - `CardState.learnedAt: number | null`
  - `SessionKind = 'placement' | 'learn' | 'free'`
  - `ItemPhase = 'placement' | 'review' | 'learning' | 'consolidation' | 'free'`
  - `PlannedItem` sans `repeatUntilCorrect`
  - `introduceCard(target, now, sessionId)` → `learnedAt: null`
  - `placementCard(...)` → `learnedAt: now`
  - `markLearned(card: CardState, now: number, tempoBpm: number): CardState` → `learnedAt: now`, `leadBeats: target.direction === 'locate' ? leadForThreshold(tempoBpm) : 1`, `scheduling: introScheduling(now)`
  - constantes : `LEARN_SESSION_MS = 300_000`, `LEARN_COLD_CAP = 20`, `LEARNING_SLOTS = 3`, `MAX_UNCONSOLIDATED = 10`, `LEARN_PRESENT_LEAD_BEATS = 8`, `LEARN_RETEST_GAPS = [2, 4] as const`, `LEARN_SUCCESSES = 2`, `CONSOLIDATION_SKIP_RECENT = 2`, `CONFUSION_LOOKBACK = 3`, `FREE_PLAY_COUNT = 20`. Supprimées : `DAILY_COLD_CAP`, `NEW_PER_SESSION`, `UNLOCK_RATIO` (dans la Task 2), `NEXT_SESSION_GAP_MS` (dans la Task 6).

- [ ] **Step 1 : tests en échec**
  - `cards.spec.ts` : `markLearned` sur une carte locate à 80 bpm → `learnedAt === now`, `leadBeats === 2`, `scheduling.due === now + MIN_COLD_DELAY_MS` ; sur une carte identify → `leadBeats === 1`. `introduceCard` → `learnedAt === null`. `placementCard` réussi → `learnedAt === now`.
  - `db.spec.ts` : ouvre en version 2 ; une base créée en version 1 avec une ligne dans chaque table, rouverte par `NeckspertDb`, a ses quatre tables vides (la ligne `settings` comprise).
  - `validateBackup.spec.ts` : carte sans `learnedAt` → erreur `learnedAt must be a number or null` ; session `kind: 'daily'` → refusée ; `kind: 'learn'` acceptée ; tentative `phase: 'consolidation'` acceptée.
  - `constants.spec.ts` : nouvelles valeurs ci-dessus.
- [ ] **Step 2 :** `npx vitest run src/lib/domain/progress src/lib/infrastructure/storage` → échecs attendus.
- [ ] **Step 3 : implémenter.** `db.ts` : `this.version(2).stores({...mêmes tables}).upgrade(tx => Promise.all(tx.tables.map(t => t.clear())))`. `markLearned` dans `cards.ts`, exporté par `index.ts`. Renommer `'daily'` en `'learn'` partout, fixtures comprises (`makeCard` gagne `learnedAt: 1000`). Retirer `repeatUntilCorrect` des types et de `plans.ts` (les items de l’ancien plan quotidien perdent le champ ; la logique de répétition du contrôleur est supprimée en Task 5, la garder compilable d’ici là en ignorant le champ).
- [ ] **Step 4 :** `npm test && npm run check` → vert.
- [ ] **Step 5 :** commit `feat: track when a card is learned and rename the daily session to learn`.

### Task 2 : positions sans case 0 et file d’introduction

**Files :**
- Modify : `src/lib/domain/music/curriculum.ts` (+ spec), `src/lib/domain/music/index.ts` (+ spec)
- Create : `src/lib/domain/progress/introduction.ts` (+ `introduction.spec.ts`)
- Delete : `src/lib/domain/progress/curriculum.ts` (+ spec) ; `Curriculum`, `CurriculumSet` dans `types.ts` ; `curriculum` dans `SessionDeps`, `createApp.ts`, `createAppServices.ts`, specs.

**Interfaces :**
- Produces :
  - `LEARNABLE_FRETS: readonly number[]` = 1..11 (dans `music/curriculum.ts`)
  - `placementTargets(): LocateTarget[]` → 66 positions, cordes 6 → 1, cases 1..11
  - `practiceTargets(): Target[]` → 66 locate + 66 identify (cases 1..11), pour le jeu libre
  - `introductionOrder(): LocateTarget[]` → 66 positions (spec, section 2)
  - `nextNewTarget(cards: readonly CardState[]): Target | null` → d’abord la première position identify (dans l’ordre de `introductionOrder`) dont la carte locate est acquise et qui n’a pas de carte ; sinon la première position locate sans carte ; sinon `null`.

- [ ] **Step 1 : tests en échec** (`introduction.spec.ts`, `curriculum.spec.ts`)
  - `placementTargets()` : longueur 66, aucune case 0 (`pitchOnString(string, 0)` absent pour chaque corde).
  - `introductionOrder()` : longueur 66, clés uniques ; les 36 premières sont des naturelles (pas de `#`), les 30 suivantes des altérées ; les 6 premières sont `[6:G, 5:C, 4:F, 3:C, 2:D, 1:G]` (la corde 3 n’a pas de naturelle en case 3 : A# ; elle commence par C, case 5) ; sur la corde 6, l’ordre des naturelles est G, A, B, F, C, D (cases 3, 5, 7, 1, 8, 10) ; sur la corde 3, C, D, E, A, B, F (cases 5, 7, 9, 2, 4, 10).
  - `nextNewTarget([])` → `6:G` locate ; avec des cartes pour les 66 locate non acquises → `null` ; avec la carte `locate:6:G` acquise → `identify:6:3`.
- [ ] **Step 2 :** lancer, échecs attendus.
- [ ] **Step 3 : implémenter.** Alternance : construire par corde la liste ordonnée (naturelles sur cases 3, 5, 7, 9 par case croissante, puis autres naturelles par case croissante) ; entrelacer les cordes 6..1 tour par tour en sautant les cordes épuisées ; puis même chose pour les altérées par case croissante. Supprimer l’ancien curriculum et ses consommateurs ; `buildDailyPlan` utilise provisoirement `nextNewTarget` en boucle (remplacé en Task 5), `buildFreePlan` tire dans `practiceTargets()` avec `FREE_PLAY_COUNT`.
- [ ] **Step 4 :** `npm test && npm run check` → vert.
- [ ] **Step 5 :** commit `feat: introduce notes from one ordered queue without open strings`.

### Task 3 : éligibilité au froid

**Files :**
- Create : `src/lib/domain/progress/review.ts` (+ `review.spec.ts`), export dans `index.ts`

**Interfaces :**
- Produces :
  - `lastAttemptByCard(attempts: readonly Attempt[]): Map<CardKey, number>` (plus grand `promptedAt`, toutes phases)
  - `reviewableAt(card: CardState, lastAttemptAt: number | undefined): number | null` → `null` si `learnedAt === null`, sinon `max(card.scheduling.due, (lastAttemptAt ?? -Infinity) + MIN_COLD_DELAY_MS)`
  - `reviewableCards(cards, lastByCard, now): CardState[]` → cartes avec `reviewableAt <= now`, triées par `due`, puis locate avant identify, puis clé
  - `nextReviewAt(cards, lastByCard): number | null` → minimum des `reviewableAt` non nuls

- [ ] **Step 1 : tests en échec**
  - carte apprise due, dernière tentative (phase `free`) il y a 10 min → absente de `reviewableCards`, `reviewableAt === last + MIN_COLD_DELAY_MS`.
  - carte `learnedAt: null` due → absente, `reviewableAt === null`.
  - ordre de tri sur trois cartes.
  - `nextReviewAt` sans carte apprise → `null`.
- [ ] **Step 2–4 :** lancer en échec, implémenter, `npx vitest run src/lib/domain/progress/review.spec.ts` vert.
- [ ] **Step 5 :** commit `feat: tell which cards can be reviewed cold now`.

### Task 4 : sélecteurs

**Files :**
- Create : `src/lib/domain/progress/selector.ts` (contrat + `createListSelector`), `src/lib/domain/progress/learnSelector.ts` (+ `learnSelector.spec.ts`, `selector.spec.ts`)
- Modify : `src/lib/domain/progress/index.ts`

**Interfaces :**
- Consumes : `nextNewTarget`, `reviewableCards`, `lastAttemptByCard`, `markLearned`, `introduceCard`, `isDirectRecall`, `leadForThreshold`, constantes de la Task 1.
- Produces :
```ts
export interface SelectorContext { now: number; elapsedMs: number; fatigued: boolean }
export type RecordOutcome = { learned: CardState } | null;
export interface SessionSelector {
	next(context: SelectorContext): PlannedItem | null;
	/** Synchronous. Returns the learned card when this attempt completes learning. */
	record(attempt: Attempt, now: number): RecordOutcome;
}
export function createListSelector(items: readonly PlannedItem[]): SessionSelector;
export function createLearnSelector(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
	tempoBpm: number;
}): SessionSelector;
```

Règles (spec section 1, avec les corrections) :
- `next` rend `null` si `elapsedMs >= LEARN_SESSION_MS`.
- Compteur `served` incrémenté à chaque item rendu ; l’index de service de chaque carte est mémorisé. Un retest « après `g` consignes » est dû quand `served >= index + g + 1`.
- Priorités : retest dû → (si non fatigué) révision → reprise → nouvelle note → consolidation → retest en avance (le plus proche) → `null`. Fatigué : seulement retest dû puis retest en avance.
- Révision : `reviewableCards(...)` hors cartes déjà servies, au plus `LEARN_COLD_CAP` ; item `phase 'review'`, `cold`, aide `none`, `leadBeats` de la carte (identify : `null`).
- Reprise : carte `learnedAt === null` non encore présentée dans la session, par `introducedAt`. Nouvelle note : `nextNewTarget(cartes connues)`, si (#`learnedAt === null`) < `LEARNING_SLOTS` et (#appris non acquis) < `MAX_UNCONSOLIDATED` ; le sélecteur ajoute `introduceCard(target, now, sessionId)` à sa copie.
- Présentation : `phase 'learning'`, `hot`, aide `show-position`, `leadBeats` `LEARN_PRESENT_LEAD_BEATS` (identify : `null`).
- Retest : `phase 'learning'`, `hot`, aide `none` (ou `show-position` après une erreur), `leadBeats` `leadForThreshold(tempoBpm)` (aidé : 8 ; identify : `null`).
- `record` sur `phase 'learning'` : aidé et juste → retest sans aide à l’écart `GAPS[0]` ; aidé et faux → encore aidé à `GAPS[0]` ; sans aide et `isDirectRecall` → réussites +1, retest à `GAPS[réussites]`, ou si réussites = `LEARN_SUCCESSES` : `markLearned` dans la copie, retour `{ learned }` ; sans aide et pas rappel direct → réussites 0, aidé à `GAPS[0]`.
- Consolidation : cartes apprises, hors les `CONSOLIDATION_SKIP_RECENT` dernières servies ; d’abord celles avec une confusion dans leurs `CONFUSION_LOOKBACK` dernières tentatives (historique initial + `record`), puis `stability` croissante, puis clé. `phase 'consolidation'`, `hot`, aide `none`, `leadBeats` de la carte.

- [ ] **Step 1 : tests en échec** (`learnSelector.spec.ts`, tempo 80, `now` fixe, helpers `learnedCard(target, overrides)` et `attempt(...)` locaux)
  - `ends_after_five_minutes` : `elapsedMs = LEARN_SESSION_MS` → `null`.
  - `whole_neck_known_consolidates` : 132 cartes apprises non dues, aucune en apprentissage → consolidation servie.
  - `presents_first_new_note` : aucune carte → item locate `6:G`, aide `show-position`, `leadBeats 8`, `phase 'learning'`.
  - `fills_three_slots_then_waits` : 4 premiers `next()` sans `record` d’erreur → 3 présentations différentes, puis un retest servi (en avance si rien d’autre).
  - `retest_gaps` : présentation de A juste (aidée) → A revient sans aide après exactement 2 autres consignes, `leadBeats 2` ; juste en rappel direct → revient après 4 ; deuxième réussite → `record` rend `{ learned }` avec `learnedAt === now` et `leadBeats 2`.
  - `slow_answer_is_an_error` : retest juste avec `leadBeats 4` → réussites remises à 0, prochain passage aidé.
  - `aided_success_does_not_count`.
  - `priority_order` : un retest dû et une révision disponible → le retest d’abord ; révision vs nouvelle note → révision ; reprise vs nouvelle → reprise.
  - `skips_recently_played_due_card` : carte apprise due, tentative `free` il y a 10 min → jamais servie en révision.
  - `never_reviews_learning_cards`.
  - `unconsolidated_cap` : 10 cartes apprises non acquises → aucune nouvelle note ; 9 → une nouvelle note.
  - `identify_after_locate_acquired` (via `nextNewTarget`, un cas d’intégration).
  - `fatigue_only_retests` : `fatigued: true`, révision disponible et retest en attente → retest ; sans retest → `null`.
  - `lone_note_retested_early` : seule la note A en apprentissage, aucune autre carte, file épuisée (66 cartes) → le retest est servi immédiatement.
  - `consolidation_order` : confusion récente d’abord, puis stabilité croissante, jamais les 2 dernières servies.
  - `review_cap` : 25 cartes dues → 20 révisions au plus.
  - `selector.spec.ts` : `createListSelector` rend les items dans l’ordre puis `null` ; `record` rend `null`.
- [ ] **Step 2–4 :** lancer en échec, implémenter, vert.
- [ ] **Step 5 :** commit `feat: pick each learn prompt from retests, reviews, new notes and weak notes`.

### Task 5 : contrôleur piloté par un sélecteur, froid en jeu libre

**Files :**
- Modify : `src/lib/application/session/SessionController.svelte.ts` (+ spec), `src/lib/application/services/createAppServices.ts` (+ spec), `src/lib/application/session/prompt.ts` (+ spec), `src/routes/session/demo/+page.svelte`
- Modify : `src/lib/domain/progress/plans.ts` (+ spec) : supprimer `buildDailyPlan`, `SessionPlan` ; `buildPlacementPlan` et `buildFreePlan` rendent `PlannedItem[]`.

**Interfaces :**
- Consumes : Task 4.
- Produces :
```ts
new SessionController(
	session: { id: string; kind: SessionKind },
	makeSelector: () => Promise<SessionSelector>,
	deps: SessionDeps
)
```
  - `startSession(kind)` : `placement` → `createListSelector(buildPlacementPlan(...))` ; `free` → `createListSelector(buildFreePlan(...))` ; `learn` → `createLearnSelector({ cards, attempts, sessionId, tempoBpm })`, données relues à chaque appel de la fabrique.
  - `buildPromptView` : identify avec aide `show-position` → `aid` = nom de la note (`formatNote(spellPitch(pitchOnString(string, fret), random))`).

- [ ] **Step 1 : tests en échec** (`SessionController.spec.ts`, adapter `planWith` en `selectorWith(items)` → `async () => createListSelector(items)`)
  - les tests existants passent sur la liste ; supprimer `requeues learning items…` et `drops remaining learning items` (couverts par le sélecteur).
  - `asks the selector after each verdict` : sélecteur espion, `next` appelé avant chaque consigne avec `elapsedMs` croissant et `fatigued`.
  - `stops after the current verdict past five minutes` : `FakeClock` avancé au-delà de `LEARN_SESSION_MS` pendant une consigne → verdict rendu, puis `finished`.
  - `records synchronously before persisting` : `record` appelé avant que `attempts.add` ne résolve (repository dont `add` reste en attente).
  - `creates the card at presentation even when wrong` : item learning aidé, mauvaise note → carte `learnedAt: null` en base.
  - `writes the learned card` : sélecteur dont `record` rend `{ learned }` → carte en base avec `learnedAt`.
  - `counts a cold free-play attempt on a learned card` : carte apprise, aucune tentative depuis 2 h, item `free` juste → tentative `cold`, `scheduling.reps` incrémenté.
  - `keeps free play hot on unknown or learning cards` : aucune carte créée ; carte `learnedAt: null` inchangée, tentative `hot`.
  - `consolidation stays hot` : item `consolidation` → tentative `hot`, carte inchangée.
  - `prompt.spec.ts` : identify aidé → `aid` non nul égal au nom de la note.
  - `createAppServices.spec.ts` : `startSession('learn')` après positionnement → première consigne `6:G` aidée ; `startSession('free')` ne contient aucune case 0.
- [ ] **Step 2 :** lancer, échecs attendus.
- [ ] **Step 3 : implémenter.** Le contrôleur garde `selector`, `startedAt` (epoch ms au début de `beginAudio`) ; `beginNextItem` demande `next({ now, elapsedMs, fatigued })`, finit sur `null` ; `advanceAfterVerdict` repasse toujours en `count-in` ; `beginNewSeries` rappelle la fabrique. `persistAttempt` : pousser la tentative, `detectFatigue`, `selector.record(attempt, now)` avant le premier `await` ; puis lire la carte, classer la température (`review` et `free` sur carte apprise : `classifyTemperature` ; sinon `item.temperature`), écrire : placement → `placementCard` ; `review`/`free` à froid → `applyColdAttempt` ; `learning` → `introduceCard` si absente, `outcome.learned` si présent.
- [ ] **Step 4 :** `npm test && npm run check` → vert.
- [ ] **Step 5 :** commit `feat: drive sessions from a selector and count cold free-play attempts`.

### Task 6 : statistiques d’accueil, bilan, carte

**Files :**
- Modify : `src/lib/domain/progress/stats.ts` (+ spec), `src/lib/domain/types.ts`, `src/lib/application/services/createAppServices.ts` (`sessionSummary` charge aussi `attempts.all()`), `plans.ts` (supprimer `nextSuggestedAt`), `constants.ts` (supprimer `NEXT_SESSION_GAP_MS`)

**Interfaces :**
- Produces :
  - `HomeStats = { nextAction: 'placement' | 'learn'; dueCount: number; nextReviewAt: number | null; medianColdOffsetMs; trend }`
  - `SessionSummary` : `nextSuggestedAt` → `nextReviewAt: number | null` ; nouveau `pendingCount: number` ; `learnedCount` = cartes dont `learnedAt ∈ [record.startedAt, record.endedAt ?? now]`
  - `summarizeSession({ record, attempts, allAttempts, cards, now })`
  - `buildNeckMap` : cases 1..11 (66 cellules) ; `leadTempoBpm` accepte `phase 'review' | 'free'` à froid

- [ ] **Step 1 : tests en échec** (`stats.spec.ts`)
  - après positionnement, aucune carte → `nextAction 'learn'`, `dueCount 0`, `nextReviewAt null`.
  - deux cartes apprises dues dont une jouée en jeu libre il y a 10 min → `dueCount 1` ; `nextReviewAt` égal au plus petit `reviewableAt`.
  - bilan : `learnedCount` compte `learnedAt` dans la fenêtre de la session ; `pendingCount` = cartes `learnedAt: null` ayant une tentative `learning` dans la session ; `nextReviewAt` présent.
  - carte du manche : 66 cellules, aucune `fret === 0` ; durée d’annonce calculée depuis une tentative `free` à froid.
- [ ] **Step 2–4 :** échec, implémenter, `npm test && npm run check` vert (adapter `fakeServices.ts`, `routes/dev/home`, `routes/dev/summary` au nouveau type).
- [ ] **Step 5 :** commit `feat: report due reviews and learned notes for learn sessions`.

### Task 7 : écrans

**Files :**
- Modify : `src/lib/ui/screens/home/{HomeScreen.svelte, messages.ts, homeAction.ts}` (+ specs), `src/routes/+page.svelte`
- Modify : `src/lib/ui/screens/summary/{SummaryScreen.svelte, messages.ts}` (+ spec)
- Modify : `src/lib/ui/screens/map/{neckGrid.ts, NeckMapScreen.svelte}` (+ specs), `src/routes/dev/map/+page.svelte`
- Modify : `src/lib/application/session/finishDestination.ts` (+ spec), `src/routes/session/+page.svelte`

**Interfaces :**
- Consumes : `HomeStats`, `SessionSummary` (Task 6).
- Textes :
  - Accueil, bouton : FR `Apprentissage`, EN `Learn`. Ligne : FR `(n) => n === 1 ? '1 révision due' : \`${n} révisions dues\``, EN `'1 review due' / \`${n} reviews due\``; FR `Prochaines révisions` + délai relatif existant (« Dans 2 h »), EN `Next reviews` + délai.
  - Accueil, texte : FR « Le bouton lance le positionnement, puis l’Apprentissage : environ 5 minutes, à relancer quand tu veux. La note défile dans la piste : joue-la, sur la corde indiquée, quand sa case atteint le trait. Les cordes à vide sont supposées connues. Le clic sort des enceintes de l’ordinateur. » EN « The button starts placement, then Learn: about 5 minutes, start again whenever you like. The note travels along the lane: play it, on the string shown, when its tile reaches the line. Open strings are assumed known. The click comes from the computer speakers. »
  - Bilan : `learned` FR `Notes apprises` / EN `Notes learned` ; `pending` FR `(n) => n === 1 ? '1 note reprendra la prochaine fois' : \`${n} notes reprendront la prochaine fois\`` / EN `'1 note will resume next time' / \`${n} notes will resume next time\`` ; `noCold` FR `Aucune révision à froid cette fois` / EN `No cold review this time` ; `next` FR `Prochaines révisions` / EN `Next reviews`.

- [ ] **Step 1 : tests en échec**
  - `homeAction.spec.ts` : `'learn'` → `'learn'` ; `isHomeActionEnabled` supprimé (bouton jamais désactivé).
  - `HomeScreen.svelte.spec.ts` : `dueCount 6` → « 6 révisions dues » ; `dueCount 0`, `nextReviewAt` dans 2 h → « Prochaines révisions » et « Dans 2 h » ; aucun des deux → pas de ligne ; bouton actif.
  - `SummaryScreen.svelte.spec.ts` : pool `cold`, `attemptCount 0` → « Aucune révision à froid cette fois » à la place des lignes précision et écart ; `pendingCount 1` → phrase singulière ; `pendingCount 0` → absente.
  - `neckGrid.spec.ts` / `NeckMapScreen.svelte.spec.ts` : 6 rangées de 11 cases, cases 1..11.
  - `finishDestination.spec.ts` : `learn` et `free` → `/summary?sessionId=…` ; `placement` → `null`.
- [ ] **Step 2–4 :** échec, implémenter (`session/+page.svelte` : `quitToSummary={kind !== 'placement'}`, défaut `kind` = `'learn'`), `npm test && npm run check` vert.
- [ ] **Step 5 :** commit `feat: keep learn always open and summarize what was learned`.

### Task 8 : documentation et vérification réelle

**Files :**
- Modify : `PRODUCT.md`, `CLAUDE.md`, `docs/superpowers/plans/README.md` (section « Décisions de produit » : session du jour, positionnement, curriculum)

- [ ] **Step 1 :** `PRODUCT.md` selon la spec, section 8 ; `CLAUDE.md` : `'learn'`, sélecteurs, `introduction.ts`, `review.ts` ; README des plans : renvoyer les trois décisions concernées vers la spec du 2026-10-02.
- [ ] **Step 2 :** `npm test && npm run check && npm run lint` → vert (`npm run format` si besoin).
- [ ] **Step 3 :** lancer `npm run dev`, ouvrir `/` dans le navigateur, vérifier : bouton « Positionnement », puis après un positionnement quitté, bouton « Apprentissage » actif ; `/session?kind=learn` affiche une première consigne aidée ; `/map` montre 11 cases par corde. Aucune erreur console.
- [ ] **Step 4 :** commit `docs: describe the learn session in the product rules`.
