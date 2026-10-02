# Sonder avant d’enseigner — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer le positionnement par un sondage sans aide de chaque note nouvelle, dans l’Apprentissage ; réussi en rappel direct, la note passe en révision ; manqué, l’aide arrive à la consigne suivante.

**Architecture :** le sélecteur d’Apprentissage (`domain/progress/learnSelector.ts`) sert l’option 4 en `phase: 'probe'` et calcule, dans `record()`, la carte qui en résulte (`probeCard` ou carte en apprentissage). Le contrôleur fixe la température du sondage par son résultat (`probeTemperature`) et écrit la carte. Le positionnement (type, plan, réglage, écrans) disparaît ; Dexie version 3 convertit les données existantes.

**Tech Stack :** Svelte 5 (runes), SvelteKit statique, TypeScript, Vitest, Dexie (+ `fake-indexeddb/auto` dans les specs), ts-fsrs.

**Spec :** `docs/superpowers/specs/2026-10-03-sondage-avant-apprentissage-design.md`. Contexte : `docs/superpowers/specs/2026-10-02-apprentissage-design.md` (section « Ajustements » pour l’échelle des temps d’avance).

## Global Constraints

- Branche `plan/apprentissage`. Barrière à chaque commit : `npm test && npm run check`.
- Code, identifiants, commentaires en anglais ; textes d’interface FR et EN via `defineMessages`.
- Commits Conventional Commits, minuscules, impératif, orientés comportement, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Domaine sans Svelte ni API navigateur. `isDirectRecall` reste interne à `domain/progress`.
- Température d’un sondage : **réussi → `'cold'`, manqué → `'hot'`** (spec, section 1). Un seul endroit la calcule.
- Aucune annonce à l’écran pour un sondage ; aucun changement de `PlayScreen`, `PlayView` ni du contrat `.impeccable/surfaces/src-routes-session-page-svelte.md`.
- Pas de conversion des sauvegardes à l’import (aucun export antérieur).

## Review Focus

1. **Session terminée (5 min, quitter) juste après un sondage manqué** : la carte reste en apprentissage et, à la session suivante, revient en reprise avec l’aide, jamais en sondage. → Task 2, test `resumes_a_missed_probe_with_the_aid`.
2. **Quitter pendant un sondage, avant toute réponse** : aucune tentative, aucune carte écrite ; la position sera sondée à nouveau. → Task 3, test `stores nothing when quitting before a probe is answered`.
3. **Sondage du mode 1 réussi, puis le mode 2 de la même position dans la même session** : le sélecteur voit la carte acquise tout de suite et peut sonder le mode 2. → Task 2, test `probes_identify_right_after_a_passed_locate_probe`.
4. **Mode 2 à la limite exacte de 3 000 ms** : réussi (≤). → Task 1, test sur `probeTemperature`.
5. **Base version 2 sans aucune donnée de positionnement** (ou sans ligne de réglages) : la montée en version 3 n’altère rien. → Task 6, test `upgrades a version 2 database without placement rows untouched`.

---

### Task 1 : `probeCard` et `probeTemperature`

**Files :**

- Modify : `src/lib/domain/types.ts` (`ItemPhase` gagne `'probe'` ; `'placement'` reste jusqu’à la Task 5)
- Modify : `src/lib/domain/progress/cards.ts`, `src/lib/domain/progress/index.ts`, `src/lib/domain/progress/scheduling.ts` (commentaire de `graduateToReview` : « Probe success: … »)
- Modify : `src/lib/infrastructure/storage/validateBackup.ts` (`ITEM_PHASES` accepte `'probe'`)
- Test : `src/lib/domain/progress/cards.spec.ts`

**Interfaces :**

- Produces :
  - `probeCard(target: Target, attempt: Attempt, now: number, sessionId: string, tempoBpm: number): CardState | null` — remplace `placementCard` (supprimé, ses appels passent à `probeCard`). Réussite : `scheduling: graduateToReview(now)`, `learnedAt = acquiredAt = now`, `leadBeats: attempt.leadBeats ?? 1`, `introducedInSession: sessionId`. Sinon `null`.
  - `probeTemperature(attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>, tempoBpm: number): Temperature` — `'cold'` si `isDirectRecall`, sinon `'hot'`. Commentaire JSDoc : la règle et son renvoi à la spec, section 1.
  - Les deux exportés par `progress/index.ts`.

- [ ] **Step 1 : tests en échec** dans `cards.spec.ts` (renommer le `describe` de `placementCard`) :
  - `probeCard` mode 1, juste à `leadBeats: 2`, 80 bpm → carte avec `learnedAt === acquiredAt === now`, `scheduling.state === 2`, `leadBeats === 2`.
  - `probeCard` mode 1, `correct: false` → `null`.
  - `probeCard` mode 2 (`leadBeats: null`), juste, `reactionMs: 3000` → carte, `leadBeats === 1` ; `reactionMs: 3001` → `null`.
  - `probeTemperature` : juste mode 1 à 2 temps → `'cold'` ; faux → `'hot'` ; mode 2 juste à 3000 ms → `'cold'`, à 3001 ms → `'hot'`. Nom du test : `records a passed probe cold and a missed probe hot`.
- [ ] **Step 2 :** `npx vitest run src/lib/domain/progress/cards.spec.ts` → FAIL (`probeCard` non exporté).
- [ ] **Step 3 :** implémenter dans `cards.ts`, renommer les appels de `placementCard` (`SessionController.svelte.ts`, `progress/index.ts`, `index.spec.ts`) en `probeCard` sans changer leur comportement.
- [ ] **Step 4 :** `npm test && npm run check` → PASS.
- [ ] **Step 5 :** commit `feat: create a review card from a probe in either direction`.

### Task 2 : le sélecteur sonde chaque note nouvelle

**Files :**

- Modify : `src/lib/domain/progress/selector.ts` (`RecordOutcome`), `src/lib/domain/progress/learnSelector.ts`
- Modify : `src/lib/application/session/SessionController.svelte.ts` (seulement `outcome.learned` → `outcome.card`)
- Test : `src/lib/domain/progress/learnSelector.spec.ts`, `src/lib/application/session/SessionController.spec.ts` (helper `learnOnRecord` et test « stores the card the selector reports as learned » passés à `{ card }`)

**Interfaces :**

- Consumes : `probeCard` (Task 1), `introduceCard`, `markLearned`, `leadForThreshold`.
- Produces : `export type RecordOutcome = { card: CardState } | null;` — la carte qu’un essai vient de créer ou de changer : note apprise, sondage réussi (`probeCard`), sondage manqué (la carte en apprentissage créée par `introduce()`).

Comportement de `LearnSelector` :

- `introduce()` crée toujours la carte en mémoire (`introduceCard`), puis renvoie `{ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: locate ? leadForThreshold(tempo) : null }` au lieu de `present()`. Aucune `LearningEntry` n’est créée à ce stade.
- `record()` pour `phase === 'probe'` : `probeCard(...)` ; si non nul, le mettre dans `this.cards` et renvoyer `{ card }`. Sinon créer une `LearningEntry` comme `present()` (aidée, `lead: LEARN_PRESENT_LEAD_BEATS`, `successes: 0`) avec `dueAt = this.served` pour qu’elle soit la consigne suivante, et renvoyer `{ card }` avec la carte en apprentissage.
- `resume()` inchangé (présentation aidée, pas de sondage).
- Ladder : au retour `'learned'`, renvoyer `{ card: learned }`.

- [ ] **Step 1 : tests en échec** dans `learnSelector.spec.ts` (adapter les tests existants qui attendaient une présentation aidée en première consigne d’une note nouvelle : la présentation arrive maintenant après un sondage manqué) :
  - `serves_a_new_note_as_an_unaided_probe` : base vide → `{ phase: 'probe', aid: 'none', temperature: 'cold', leadBeats: 2 }` (80 bpm), cible `ORDER[0]`.
  - `passed_probe_goes_to_review_and_frees_its_slot` : réponse juste → `record()` rend `{ card }` avec `acquiredAt !== null` ; trois sondages réussis puis un quatrième sont servis d’affilée (aucune limite `LEARNING_SLOTS` atteinte).
  - `missed_probe_brings_the_aid_on_the_next_prompt` : `correct: false` → consigne suivante = même cible, `phase: 'learning'`, `aid: 'show-position'`, `leadBeats: 8` ; `record()` avait rendu une carte `learnedAt: null`.
  - `no_answer_counts_as_a_missed_probe` : `answer: null, correct: false, verdict: 'wrong', reactionMs: null` → même résultat.
  - `slow_identify_probe_is_missed` : base vide ; réussir le sondage de `ORDER[0]` ; la consigne suivante est le sondage identify de la même position (les candidates du mode 2 passent avant la file du mode 1) ; y répondre `correct: true, reactionMs: 3001` → consigne suivante = même cible identify, `phase: 'learning'`, `aid: 'show-position'`.
  - `probes_identify_right_after_a_passed_locate_probe` (Review Focus 3) : réussir le sondage de `ORDER[0]` → la consigne suivante est `{ target: { direction: 'identify', string: ORDER[0].string, fret: … }, phase: 'probe' }`.
  - `resumes_a_missed_probe_with_the_aid` (Review Focus 1) : nouvelle instance construite avec la carte en apprentissage d’un sondage manqué → première consigne : cette cible, `phase: 'learning'`, aidée.
  - `passed_probes_do_not_count_as_unconsolidated` : 10 cartes `probeCard` (acquises) en base → une note nouvelle est encore servie.
  - `fatigue_serves_no_probe` : `fatigued: true`, base vide → `null`.
- [ ] **Step 2 :** `npx vitest run src/lib/domain/progress/learnSelector.spec.ts` → FAIL.
- [ ] **Step 3 :** implémenter ; changer `RecordOutcome` et ses deux usages (contrôleur, spec du contrôleur).
- [ ] **Step 4 :** `npm test && npm run check` → PASS.
- [ ] **Step 5 :** commit `feat: probe each new note unaided before teaching it`.

### Task 3 : le contrôleur enregistre le sondage

**Files :**

- Modify : `src/lib/application/session/SessionController.svelte.ts` (`persistAttempt`, `temperatureFor`)
- Test : `src/lib/application/session/SessionController.spec.ts`

**Interfaces :**

- Consumes : `probeTemperature` (Task 1), `RecordOutcome = { card } | null` (Task 2).

Comportement :

- Température provisoire d’un `'probe'` : `item.temperature`. Température finale : `probeTemperature(attempt, this.settings.tempoBpm)`, avec un commentaire d’une ligne qui renvoie à la spec (section 1).
- Écriture de carte : pour `'probe'` et `'learning'`, `if (outcome) await this.storeCard(outcome.card)` ; garder pour `'learning'` le repli `introduceCard` quand aucune carte n’existe.

- [ ] **Step 1 : tests en échec** :
  - `records a missed probe hot and a passed probe cold` : sélecteur espion, item `locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 })` ; note juste → tentative `'cold'` ; deuxième run avec mauvaise note (`midi: 60`) → `'hot'`.
  - `stores the card the selector reports for a probe` : `spy.learnOnRecord({ card })` avec une carte `probeCard` → `deps.cards.get('locate:2:F')` a `acquiredAt` non nul.
  - `stores nothing when quitting before a probe is answered` (Review Focus 2) : item probe, `controller.quit()` pendant `awaiting` → `deps.attempts.all()` et `deps.cards.all()` vides.
- [ ] **Step 2 :** `npx vitest run src/lib/application/session/SessionController.spec.ts` → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** `npm test && npm run check` → PASS.
- [ ] **Step 5 :** commit `feat: record a probe cold only when it is a direct recall`.

### Task 4 : bilan — précision des révisions, notes déjà sues

**Files :**

- Modify : `src/lib/domain/types.ts` (`SessionSummary.knownCount: number`, avec JSDoc « Probes passed in this session. »)
- Modify : `src/lib/domain/progress/stats.ts` (`summarizeSession`)
- Modify : `src/lib/ui/screens/summary/SummaryScreen.svelte`, `src/lib/ui/screens/summary/messages.ts`, `src/routes/dev/summary/+page.svelte` (données de démo)
- Test : `src/lib/domain/progress/stats.spec.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`

Comportement :

- Pool `'cold'` : `counted`, `medianOffsetMs`, `identifyMedianReactionMs` ignorent les tentatives `phase === 'probe'`. Pool `'all'` (jeu libre) inchangé.
- `knownCount` : tentatives de la session `phase === 'probe' && temperature === 'cold'`.
- Écran : ligne après « Notes apprises », seulement si `knownCount > 0`. Messages : FR `known: (n) => n === 1 ? '1 note déjà sue' : \`${n} notes déjà sues\``, EN `'1 note already known'` / `` `${n} notes already known` ``.

- [ ] **Step 1 : tests en échec** :
  - `stats.spec.ts` : une session learn avec un sondage réussi (cold, juste), un sondage manqué (hot, faux) et une révision froide fausse → `attemptCount === 1`, `correctCount === 0`, `knownCount === 1`.
  - `stats.spec.ts` : session learn avec seulement un sondage réussi → `attemptCount === 0` et `medianOffsetMs === null`.
  - `stats.spec.ts` : `isMastered` / `buildNeckMap` — une carte dont l’historique contient un sondage manqué (`hot`) puis trois sessions de rappels directs à froid espacées comme l’exige la maîtrise → maîtrisée ; `coldAccuracy` de sa case = 1.
  - `SummaryScreen.svelte.spec.ts` : `knownCount: 2` → texte « 2 notes déjà sues » ; `knownCount: 0` → absent.
- [ ] **Step 2 :** `npx vitest run src/lib/domain/progress/stats.spec.ts src/lib/ui/screens/summary` → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** `npm test && npm run check` → PASS.
- [ ] **Step 5 :** commit `feat: count notes already known apart from cold review accuracy`.

### Task 5 : retirer le positionnement

**Files :**

- Modify : `src/lib/domain/types.ts` — `SessionKind = 'learn' | 'free'` ; `ItemPhase` sans `'placement'` ; `Settings` et `DEFAULT_SETTINGS` sans `placementDoneAt` ; `HomeStats` sans `nextAction` ; JSDoc de `CardState.introducedAt` : « learning (or probe) ».
- Modify : `src/lib/domain/progress/plans.ts` (+ spec), `index.ts` (+ spec) — supprimer `buildPlacementPlan`.
- Modify : `src/lib/domain/music/curriculum.ts` (+ spec), `src/lib/domain/music/index.spec.ts` — `placementTargets` → `locateTargets` (même corps, JSDoc inchangée).
- Modify : `src/lib/domain/progress/stats.ts` (+ spec) — `computeHomeStats` sans branche `placementDoneAt` ni `nextAction` ; ses tests de placement supprimés, les autres sans `placementDoneAt`.
- Modify : `src/lib/application/services/createAppServices.ts` (+ spec) — branche `'placement'` supprimée ; le test « startSession(placement) » supprimé ; un test `startSession('learn') serves a probe first on an empty database`.
- Modify : `src/lib/application/session/SessionController.svelte.ts` (+ spec) — `finish()` n’écrit plus `placementDoneAt` ; test « sets placementDoneAt » supprimé ; commentaire de `temperatureFor` sans « placement ».
- Modify : `src/lib/application/session/finishDestination.ts` (+ spec) — toujours le bilan ; signature `finishDestination(sessionId: string): string`.
- Modify : `src/routes/session/+page.svelte` — `finishDestination(controller.sessionId)`, `<PlayScreen {controller} quitToSummary />` (la prop reste : la page de démo `/session/demo` la laisse à `false`).
- Delete : `src/lib/ui/screens/home/homeAction.ts`, `homeAction.spec.ts`. `src/routes/+page.svelte` lance toujours `'learn'`.
- Modify : `src/lib/ui/screens/home/HomeScreen.svelte` (+ spec), `messages.ts` — libellé toujours `t.session`, clé `placement` supprimée, `how` FR exact : « Le bouton lance l’Apprentissage : environ 5 minutes, à relancer quand tu veux. La note défile dans la piste : joue-la, sur la corde indiquée, quand sa case atteint le trait. Les cordes à vide sont supposées connues. Le clic sort des enceintes de l’ordinateur. » ; EN : « The button starts Learn: about 5 minutes, start again whenever you like. The note travels along the lane: play it, on the string shown, when its tile reaches the line. Open strings are assumed known. The click comes from the computer speakers. »
- Modify : `src/routes/dev/home/+page.svelte`, `src/lib/ui/screens/calibration/fakeServices.ts`, `src/lib/composition/createApp.svelte.spec.ts` — sans `nextAction` ; scénario de démo « placement » supprimé.
- Modify : `src/lib/infrastructure/storage/validateBackup.ts` (+ spec), `DexieSettingsRepository.spec.ts` — phases `['probe', 'review', 'learning', 'consolidation', 'free']`, sessions `['learn', 'free']` (messages d’erreur alignés), plus de contrôle `placementDoneAt` ; le test du dépôt de réglages utilise un autre champ (`tempoBpm`).

- [ ] **Step 1 : tests en échec** :
  - `HomeScreen.svelte.spec.ts` : premier lancement (stats vides) → bouton « Apprentissage » ; aucun texte /positionnement/i.
  - `validateBackup.spec.ts` : tentative `phase: 'placement'` → erreur ; session `kind: 'placement'` → erreur ; tentative `phase: 'probe'` → acceptée.
  - `finishDestination.spec.ts` : `finishDestination('s 1')` → `/summary?sessionId=s%201`.
  - `createAppServices.spec.ts` : `startSession('learn')` sur base vide, premier prompt `phase === 'probe'`.
- [ ] **Step 2 :** `npm test` → FAIL sur ces tests.
- [ ] **Step 3 :** appliquer la liste ci-dessus ; `grep -rn -i "placement" src` ne doit plus rien rendre hors `db.ts` (Task 6).
- [ ] **Step 4 :** `npm test && npm run check && npm run lint` → PASS.
- [ ] **Step 5 :** commit `feat: open learn from the first visit and drop placement`.

### Task 6 : Dexie version 3 convertit le positionnement

**Files :**

- Modify : `src/lib/infrastructure/storage/db.ts`
- Test : `src/lib/infrastructure/storage/db.spec.ts`

Comportement : `this.version(3).stores(stores).upgrade(tx => …)`, sur les lignes brutes (non typées, `placement` n’existe plus dans les types) :

- `attempts` : `phase === 'placement'` → `phase = 'probe'` ; si `correct === false`, `temperature = 'hot'`.
- `sessions` : `kind === 'placement'` → `kind = 'learn'`.
- `settings` : supprimer `placementDoneAt` de la ligne `'settings'`.
- `cards` : rien.
- Commentaire d’une ligne : pourquoi un échec devient chaud (renvoi spec, section 1).

- [ ] **Step 1 : tests en échec** :
  - `converts placement data when a version 2 database is opened` : base Dexie brute en version 2 (mêmes `stores`) avec une tentative de positionnement juste (`cold`), une fausse (`cold`), une tentative `'review'`, une session `'placement'`, une session `'learn'`, une ligne de réglages `{ id: 'settings', tempoBpm: 96, placementDoneAt: 5 }`, une carte → après `createDatabase(name).open()` : `verno === 3` ; phases `['probe', 'probe', 'review']` ; températures `['cold', 'hot', 'cold']` ; sessions `['learn', 'learn']` ; réglages `{ id: 'settings', tempoBpm: 96 }` ; carte identique.
  - `upgrades a version 2 database without placement rows untouched` (Review Focus 5) : une tentative `'learning'` et aucune ligne de réglages → mêmes lignes après ouverture.
  - Mettre à jour `opens at version 2…` en version 3 ; garder le test de la version 1 (vidage) en attendant `verno === 3`.
- [ ] **Step 2 :** `npx vitest run src/lib/infrastructure/storage/db.spec.ts` → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** `npm test && npm run check` → PASS.
- [ ] **Step 5 :** commit `feat: turn stored placement attempts into probes`.

### Task 7 : documentation

**Files :**

- Modify : `PRODUCT.md`, `CLAUDE.md`, `docs/superpowers/plans/README.md`, en-tête de la spec (statut « approuvé »).

Contenu (spec, section 10) :

- `PRODUCT.md` :
  - Progression : remplacer la puce « Positionnement » par « **Sondage** : la première fois qu’une note sort de la file, elle est demandée sans aide. Retrouvée en rappel direct, elle passe directement en révision ; sinon l’aide arrive à la consigne suivante et l’apprentissage commence. Rien n’annonce un sondage à l’écran. »
  - Apprentissage, option 4 : « Note nouvelle, sondée d’abord sans aide, … » ; paragraphe « Apprendre une note » : la présentation suit un sondage manqué ; « Le bouton de l’accueil reste toujours actif ; » (sans « après le positionnement »).
  - Terminologie : entrée « **Sondage** » ; sous « À froid / à chaud », la phrase « Exception : un sondage manqué est enregistré à chaud, parce qu’il ne mesure pas un oubli (la note n’a jamais été apprise) ; un sondage réussi est à froid. » ; « Acquis » : « … postérieure à son apprentissage, ou au sondage. »
  - Bilan : mention des notes déjà sues.
- `CLAUDE.md` : « Sessions are `'learn' | 'free'` » ; learn sert d’abord chaque note nouvelle en `'probe'` ; règle « Cold vs hot » complétée par l’exception du sondage ; retirer « Placement and free play run a fixed list » → « Free play runs a fixed list ».
- `docs/superpowers/plans/README.md` : la décision « Positionnement » devient « **Sondage** » avec renvoi vers la spec du 2026-10-03 ; « Acquis » : « (ou au sondage) » ; « Fin de positionnement (`placementDoneAt`) » retiré du paragraphe J ; ligne d’index des plans pour ce plan.

- [ ] **Step 1 :** appliquer ; `grep -n -i "positionnement\|placement" PRODUCT.md CLAUDE.md docs/superpowers/plans/README.md` ne laisse que des mentions historiques explicites.
- [ ] **Step 2 :** `npm run lint` → PASS.
- [ ] **Step 3 :** commit `docs: describe probing new notes in place of placement`.
