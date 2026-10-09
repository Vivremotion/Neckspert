# Retours de la voie de la mémoire — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un accord faux puis corrigé n’est plus compté juste mais salué par « Corrigé » ; le verdict d’un accord tombe pendant la bande ; l’aide et le verdict dessinent les formes (deux styles au choix) ; le guitariste voit ce qui a été entendu et conteste pendant le jeu.

**Architecture:** Le capteur juge en continu et sépare les attaques (infrastructure). L’ancrage rend un raté provisoire sur un premier accord faux, puis `corrected` sur une correction (domaine, rapport au temps), que le contrôleur accepte depuis `observe`. Les présentateurs de triades fournissent les formes (aide, Joué / Attendu, écart) ; une brique `ChordShape` les dessine dans le style résolu par le contrôleur (réglage ou exercice). La contestation passe du bilan au contrôleur.

**Tech Stack:** Svelte 5 (runes), SvelteKit, TypeScript, Vitest (node + jsdom), Dexie.

**Spec:** `docs/superpowers/specs/2026-10-09-retours-voie-memoire-design.md`

## Global Constraints

- Code, identifiants et commentaires en anglais ; textes d’interface en français et en anglais (`defineMessages`).
- Toutes les valeurs à calibrer sont des constantes nommées : `FIRST_READING_MS = 250`, `JUDGE_EVERY_MS = 100`, `LAST_READING_MS = 2000`, `STABLE_READINGS = 3`, `NOTHING_FINAL_MS = 1000`.
- Le cœur (contrôleur, enregistreur, manches, capteurs) ne nomme aucune mécanique.
- Ordre des verdicts : perfect > early/late > offbeat > corrected > wrong. `corrected` a toujours `correct: false`.
- Pas de nouvelle version Dexie ; sauvegarde version 3 inchangée, qui accepte `corrected` et `chordDiagram`.
- Quatre tons seulement (`--np-*`), texte ≥ 16 px, `prefers-reduced-motion` respecté.
- Barrière : `npm test && npm run check` ; `npx prettier --check` sur les fichiers touchés seulement (ne jamais lancer `npm run format` sur tout le dépôt : il reformate des fichiers hors sujet).
- Commits Conventional Commits, en minuscules, à l’impératif, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Arpège lent** : trois notes pincées sur ~400 ms ne doivent pas être découpées ; la première note seule ne décide rien. Test dans la tâche 2 (synthèse de trois notes décalées → une seule lecture finale juste).
2. **Accord faux non reconnu (`decided: null`) suivi du bon** : le premier est final à 1 s, mais si le bon arrive avant, la fenêtre du premier ne doit pas l’absorber. Test dans la tâche 2 (null puis juste à 600 ms → deux attaques lues séparément).
3. **Pause pendant un raté provisoire** : `abandon()` doit trancher en `wrong` avec la réponse, sans correction fantôme. Test dans la tâche 3.
4. **« Joué juste » pressé avant l’écriture de l’essai** (raté provisoire) : l’essai écrit plus tard doit porter `contested: true`. Test dans la tâche 8.
5. **Réglage absent dans des données anciennes** : `settings.chordDiagram` manquant vaut `strings`, partout (lecture, sauvegarde). Test dans la tâche 5.

---

### Task 1: Le verdict `corrected`

**Files:**

- Modify: `src/lib/domain/types.ts` (Verdict, VERDICTS, commentaires), `src/lib/infrastructure/storage/validateBackup.ts:160`, `src/lib/infrastructure/audio/cues/cueSpecs.ts`, `src/lib/ui/primitives/VerdictSprite.svelte`, `src/lib/ui/play/messages.ts`
- Test: `src/lib/domain/types.spec.ts` (ou le spec existant de `isSuccess`), `src/lib/infrastructure/storage/validateBackup.spec.ts`, `src/lib/infrastructure/audio/cues/cueSpecs.spec.ts`, `src/lib/ui/primitives/VerdictSprite.svelte.spec.ts`

**Interfaces:**

- Produces: `Verdict = 'perfect' | 'early' | 'late' | 'offbeat' | 'corrected' | 'wrong'` ; `VERDICTS = ['perfect','early','late','offbeat','corrected','wrong']`.

- [ ] **Step 1: Failing tests** : `VERDICTS` dans cet ordre ; `isSuccess({ correct: false, verdict: 'corrected' })` faux ; `sessionGrade` compte un `corrected` comme un raté entier ; une sauvegarde avec un essai `verdict: 'corrected'` est valide, et le message d’erreur nomme `corrected` ; `CUE_SPECS.corrected` existe et diffère de `wrong` et de `offbeat` ; `VerdictSprite` rend pour `corrected` un dessin différent de celui de `wrong` (comparer le `innerHTML`) ; `playMessages` fr `verdict.corrected === 'Corrigé'`, en `'Corrected'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain src/lib/infrastructure/storage src/lib/infrastructure/audio/cues src/lib/ui/primitives` → FAIL.
- [ ] **Step 3: Implement.** Sprite : la croix du raté surmontée d’une flèche de reprise, ou un cercle plein barré d’un trait, en 16×16 `crispEdges`, `currentColor`. Signal : deux notes montantes douces (`triangle`, gain ≤ 0,12), plus aigu que `wrong`, plus court que 150 ms.
- [ ] **Step 4: Run** les mêmes specs → PASS ; `npm run check`.
- [ ] **Step 5: Commit** `feat: add the corrected verdict, a miss that was put right`

### Task 2: Jugement continu et attaques séparées dans le capteur

**Files:**

- Modify: `src/lib/infrastructure/audio/chords/constants.ts`, `src/lib/infrastructure/audio/chords/NnlsChordVerifier.ts`, `src/lib/application/ports/ChordVerifierPort.ts` (doc de `final`)
- Test: `src/lib/infrastructure/audio/chords/NnlsChordVerifier.spec.ts`, `src/lib/infrastructure/audio/chords/realChords.spec.ts`

**Interfaces:**

- Produces: constantes `FIRST_READING_MS`, `JUDGE_EVERY_MS`, `LAST_READING_MS`, `STABLE_READINGS`, `NOTHING_FINAL_MS`, `SPECTRUM_POINTS_MS = [250, 500, 1000, 2000]` (remplace `REPORT_POINTS_MS`). `ChordReport` inchangé ; `final` : forme attendue, ou même forme non attendue `STABLE_READINGS` fois de suite, ou rien de décidé à `NOTHING_FINAL_MS`, ou dernière lecture / fenêtre coupée. Après une lecture finale, l’attaque ne rapporte plus.

- [ ] **Step 1: Failing tests** (synthèse `synthChordSignal`, sommer deux signaux pour deux attaques) :
  - `reads a strummed chord from 250 ms every 100 ms until it is final` : D 2‑3‑2 attendu → une seule lecture, `[250, true]` ;
  - `ends with the reading that holds the same wrong shape three times` : attendu `0,1,0` → `windowMs` `[250, 350, 450]`, finals `[false, false, true]`, toutes `decided: '2,3,2'` ;
  - `ends at 1 s a reading that recognizes nothing` : candidats sans la forme jouée → dernière lecture `windowMs` 1000, `final: true`, `decided: null` ;
  - `reads a chord played after a final one on its own` : 0‑1‑0 (faux, stable) à 1,0 s puis 2‑3‑2 (attendu) à 1,8 s → deux attaques ; la première finale fausse, la seconde finale juste, et la décision de la première reste fausse ;
  - `does not cut an arpeggio` : trois notes de D pincées à 1,0 / 1,15 / 1,3 s → la première attaque finit juste (`2,3,2`), aucune lecture finale fausse avant ;
  - journal : `writes the spectrum only at 250, 500, 1000, 2000 ms and on the final reading` ;
  - mettre à jour les tests existants qui attendent `[250, 500, 1000, 2000]` et « every one after it ».
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords` → FAIL.
- [ ] **Step 3: Implement** dans `NnlsChordVerifier` : `OpenWindow` garde `nextJudgeMs`, `lastDecided`, `sameCount`, `closed` ; à chaque frame, juger les fenêtres ouvertes dont `nextJudgeMs` est atteint (premier à `FIRST_READING_MS`, puis `+ JUDGE_EVERY_MS`, dernier à `LAST_READING_MS`) ; une fenêtre finale est retirée. Une nouvelle attaque ferme (rapport final immédiat avec ce qu’elle a) toute fenêtre ouverte dont la dernière décision est non nulle ; une fenêtre sans décision continue de cumuler (arpège). Spectre au journal seulement si `windowMs ∈ SPECTRUM_POINTS_MS` ou `final`.
- [ ] **Step 4: Run** `npx vitest run src/lib/infrastructure/audio/chords` → PASS. Si une fixture réelle change de décision, ne pas ajuster les constantes : noter la fixture, sa décision avant / après, et le signaler au guitariste.
- [ ] **Step 5: Commit** `feat: judge chords continuously and keep each attack apart`

### Task 3: L’ancrage se corrige

**Files:**

- Modify: `src/lib/domain/timing/anchor.ts`, `src/lib/domain/mechanics/triadAnchor.ts` (`TriadAnchorData.answer.correction`)
- Test: `src/lib/domain/timing/anchor.spec.ts`

**Interfaces:**

- Consumes: `Verdict 'corrected'` (tâche 1).
- Produces: `AnchorRound.observe` rend `{ kind: 'provisional', outcome }` (verdict `wrong`, `answer: { root, chord, correction: null }`, confusion du premier accord) sur la première lecture finale fausse quand la fondamentale est juste ; puis `settled` en `corrected` (`correct: false`, `answer.correction` = réponse de l’attaque juste) ou en `wrong` à la fin de l’attente. Une attaque ultérieure fausse → `ignored` / `settled`. `TriadAnchorData.answer: { root, chord, correction: ChordReading | null } | null`.

- [ ] **Step 1: Failing tests** (horloge du spec existant, 80 bpm) :
  - `shows a wrong first chord at once and keeps listening` : fondamentale juste ; accord faux final au temps 10 → `provisional` `wrong` avec la confusion `other-inversion` ;
  - `settles a right chord after a wrong one as corrected` : … puis accord juste au temps 11 → `settled` `{ verdict: 'corrected', correct: false, answer: { chord: { decided: 'x' }, correction: { decided: 'd' } } }`, `timingOffsetMs` de la fondamentale ;
  - `settles wrong when no correction comes` : provisoire puis `onBeat` 15 → `settled` `wrong`, `correction: null` ;
  - `ignores a correction after the band` (attaque à `beatTime(12) + 0.01`) ;
  - `never corrects a wrong root` : fondamentale fausse, accord juste → `wrong` (règle actuelle, sans provisoire) ;
  - `abandon after a provisional miss settles wrong` (Review Focus 3).
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/timing/anchor.spec.ts` → FAIL.
- [ ] **Step 3: Implement** : un état `firstChord` (réponse retenue) et `correction` ; `combine` rend `corrected` quand la fondamentale est juste, le premier accord faux et la correction juste. Mettre à jour le commentaire de classe.
- [ ] **Step 4: Run** → PASS ; `npx vitest run src/lib/domain` → PASS.
- [ ] **Step 5: Commit** `feat: count a chord put right in the band as corrected, not right`

### Task 4: Le contrôleur prend un raté provisoire depuis une observation

**Files:**

- Modify: `src/lib/application/session/SessionController.svelte.ts` (`onObservation`)
- Test: `src/lib/application/session/twoSensors.spec.ts`

**Interfaces:**

- Consumes: `RoundEvent 'provisional'` depuis `observe` (tâche 3).
- Produces: sur `provisional` venu d’une observation : l’observation est rangée `answer`, puis `showProvisional(outcome)` ; le verdict final suit comme pour le hors temps (`settle` en mode provisoire : piste et signal changent si le verdict change).

- [ ] **Step 1: Failing test** dans `twoSensors.spec.ts` avec une mécanique factice dont la manche rend `provisional` puis `settled` : verdict `wrong` affiché puis remplacé, une seule entrée de piste, un seul essai écrit avec le verdict final, et l’observation provisoire rangée `answer`.
- [ ] **Step 2: Run** → FAIL (`Round.observe returned 'provisional'`).
- [ ] **Step 3: Implement** la branche `provisional` dans `onObservation`.
- [ ] **Step 4: Run** `npx vitest run src/lib/application` → PASS.
- [ ] **Step 5: Commit** `feat: show a miss from an observation while the round still listens`

### Task 5: Le style de dessin des accords

**Files:**

- Create: `src/lib/domain/exercise/chordDiagram.ts`
- Modify: `src/lib/domain/types.ts` (`Settings.chordDiagram`, `DEFAULT_SETTINGS`), `src/lib/domain/exercise/types.ts` (`ExerciseDefinition.chordDiagram?`), `src/lib/infrastructure/storage/validateBackup.ts`, le dépôt de réglages Dexie (valeur par défaut à la lecture), `src/lib/ui/screens/settings/SettingsScreen.svelte` et `messages.ts`
- Test: `src/lib/domain/exercise/chordDiagram.spec.ts`, `validateBackup.spec.ts`, le contrat des dépôts de réglages, `SettingsScreen.svelte.spec.ts`

**Interfaces:**

- Produces: `type ChordDiagramStyle = 'strings' | 'grid'` ; `chordDiagramFor(definition: ExerciseDefinition, settings: Pick<Settings, 'chordDiagram'>): ChordDiagramStyle` (la définition l’emporte).

- [ ] **Step 1: Failing tests** : `chordDiagramFor` (réglage seul ; exercice qui impose `grid` malgré `strings`) ; `DEFAULT_SETTINGS.chordDiagram === 'strings'` ; des réglages stockés sans `chordDiagram` se lisent `strings` (Review Focus 5) ; la sauvegarde accepte `strings` / `grid` / absent, refuse `'tab'` ; l’écran Réglages montre « Dessin des accords » avec deux choix (« Cordes », « Grille ») et enregistre le choix.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Deux boutons de choix, comme les autres réglages de l’écran ; l’aperçu dessiné de chaque style s’ajoute à la tâche 6.
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `feat: choose how chord shapes are drawn, unless the exercise says`

### Task 6: La brique `ChordShape`

**Files:**

- Create: `src/lib/ui/primitives/ChordShape.svelte`
- Modify: `src/lib/application/session/contract.ts` (type `ShapeView`)
- Test: `src/lib/ui/primitives/ChordShape.svelte.spec.ts`

**Interfaces:**

- Produces: `interface ShapeView { notes: { string: StringNumber; fret: number }[] }` dans `contract.ts` ; `<ChordShape shape={ShapeView} style={ChordDiagramStyle} locale={Locale} />`. Noms des cordes : fr `mi si sol ré la mi` (1 → 6), en `E B G D A E`.

- [ ] **Step 1: Failing tests** : style `strings` → six lignes, les trois de la forme marquées (`.row.played`), chacune avec son nom et sa case (« si » / « 3 ») ; style `grid` → six cordes, un point par note sur la bonne corde et la bonne case relative, la case de départ (la plus basse case appuyée) écrite à côté quand elle dépasse 1 (« 3 » pour 5‑5‑3) ; une forme à vide (case 0) dessine un rond au-dessus du sillet.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** en SVG ou grille CSS, tokens `--np-*`, texte ≥ 16 px, taille réglable par une prop `size: 'aid' | 'small'`. Ajouter l’aperçu de chaque style aux choix de l’écran Réglages (tâche 5), avec un test.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: draw a chord shape on strings or on a chord grid`

### Task 7: Les présentateurs de triades donnent les formes

**Files:**

- Modify: `src/lib/application/mechanics/types.ts` (`feedback?`, `contestable?`), `src/lib/application/mechanics/triads.ts`, `triadMessages.ts`, `src/lib/application/session/contract.ts` (`PromptView.shape?`, `VerdictView.heard/expected/gap`, `PlayView.chordDiagram`), `SessionController.svelte.ts` (`verdictView`, résolution du style)
- Test: `src/lib/application/mechanics/triads.spec.ts`, `twoSensors.spec.ts`

**Interfaces:**

- Consumes: `ShapeView` (tâche 6), `chordDiagramFor` (tâche 5).
- Produces:
  - `MechanicPresenter.feedback?(item, outcome: { answer: unknown; confusion: unknown; verdict: Verdict }, locale): { heard: ShapeView | null; expected: ShapeView | null; gap: string | null } | null` ;
  - `PromptView.shape?: ShapeView` (aide de l’ancrage, remplace le texte `aid` « 2‑3‑2 », qui devient null) ;
  - `VerdictView.heard: ShapeView | null`, `expected: ShapeView | null`, `gap: string | null` (null sans `feedback`, et sur un verdict juste) ;
  - `PlayView.chordDiagram: ChordDiagramStyle`, résolu à chaque consigne avec `chordDiagramFor(exercice, réglages)`.

- [ ] **Step 1: Failing tests** (`triads.spec.ts`) :
  - aide de D fondamentale sur si : `shape.notes` = `[{3,2},{2,3},{1,2}]`, `aid` null ;
  - ancrage, accord `C|maj|3:1,2:3,1:5@5-5-3` entendu pour D fondamentale sur si → `heard` 5‑5‑3, `expected` 2‑3‑2 (l’occurrence de D fondamentale sur si dont la plus basse case est la plus proche de 3, la plus basse case de 5‑5‑3), `gap` fr « autre qualité » ;
  - autre renversement → « autre renversement » ; rien de reconnu → `heard` null, « rien de reconnu » ; pas d’accord → « pas d’accord dans la bande » ; fondamentale fausse midi 63 → « fondamentale entendue : D# » ; `corrected` → `heard` = premier accord ;
  - zone : `expected` = forme de la position demandée ; autre octave → « autre octave » ;
  - en : « other inversion », « other quality », « other octave », « nothing recognized », « no chord in the band », « root heard: D# » ;
  - verdict juste → `feedback` null.
  - `twoSensors.spec.ts` : `VerdictView` porte `heard/expected/gap` du présentateur ; `PlayView.chordDiagram` suit le réglage.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** « La plus proche » : l’occurrence dont la plus basse case appuyée est la plus proche de celle jouée ; sans accord joué, `lowestShape`.
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `feat: tell what was heard and what was expected after a triad miss`

### Task 8: Contester pendant le jeu

**Files:**

- Modify: `contract.ts` (`PlayView.contest`, `PlaySessionController.contest()`), `SessionController.svelte.ts`, `AttemptRecorder.ts` (`idOf(attempt)`), `triads.ts` (`contestable: true`), démos (`DemoPlaySession`, `DemoIdentifySession`), `src/lib/domain/progress/stats.ts`, `src/lib/domain/types.ts` (`SessionSummary.triads`), `SummaryScreen.svelte`, `refused.ts` (supprimé), `src/lib/application/app.ts` et `createAppServices.ts` (`contestAttempt` retiré), la route du bilan
- Test: `twoSensors.spec.ts` (ou un spec `contest.spec.ts` dans `application/session`), `stats.spec.ts`, `SummaryScreen.svelte.spec.ts`

**Interfaces:**

- Consumes: `AttemptRepository.setContested(id)`.
- Produces: `PlayView.contest: 'available' | 'done' | null` ; `contest(): void` (sans effet hors `available`) ; `AttemptRecorder.idOf(attempt): Promise<number> | null`.

- [ ] **Step 1: Failing tests** :
  - après un raté d’une mécanique `contestable`, `contest` vaut `available` ; `contest()` → `done`, et l’essai stocké a `contested: true` ;
  - après une réussite, ou pour une mécanique non contestable : `null` ;
  - `contest()` pendant un raté provisoire, avant l’écriture : l’essai écrit ensuite porte `contested: true` (Review Focus 4) ;
  - la consigne suivante remet `contest` à `null` ; une pause aussi ;
  - le bilan n’a plus de `triads.refused` ; l’écran du bilan n’a plus de « Joué juste ».
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Le contrôleur garde l’essai du dernier verdict (ou un drapeau en attente quand il n’est pas encore écrit) ; la contestation attend `idOf`.
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `feat: contest a refused chord during play, not in the summary`

### Task 9: L’écran de jeu

**Files:**

- Modify: `src/lib/ui/play/PlayScreen.svelte`, `messages.ts`
- Test: `src/lib/ui/play/PlayScreen.svelte.spec.ts`

**Interfaces:**

- Consumes: `PromptView.shape`, `VerdictView.heard/expected/gap`, `PlayView.chordDiagram`, `PlayView.contest`, `contest()`, `ChordShape`.

- [ ] **Step 1: Failing tests** :
  - aide dessinée sous la consigne quand `prompt.shape` existe (`ChordShape`, style de `view.chordDiagram`) ;
  - verdict avec `heard`/`expected` : libellés « Joué » / « Attendu », deux `ChordShape` `small`, la ligne `gap` ; `heard` null → le texte `gap` à la place du dessin Joué ;
  - bandeau « Corrigé » pour `corrected` ;
  - `contest === 'available'` → bouton « Joué juste » ; clic → `controller.contest()` ; touche Entrée → `contest()` ; Entrée sur un bouton focalisé ne déclenche pas deux fois ; `done` → « Contesté », sans bouton ;
  - rien de tout ça sur un verdict de localisation.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Avec Joué / Attendu, le sprite passe en petit à côté du bandeau ; garder la mise en page portrait (`@container play (max-width: 860px)`).
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `feat: draw the triad aid and what was heard on the play screen`

### Task 10: De bout en bout et vérification

**Files:**

- Modify: `src/lib/application/session/triadsSession.spec.ts`, `CLAUDE.md` (règles : verdict `corrected`, capteur continu, contestation en jeu, `chordDiagram`), `.impeccable/surfaces/src-routes-session-page-svelte.md`
- Test: `triadsSession.spec.ts`

- [ ] **Step 1: Failing test** : une session Triades où une consigne d’ancrage reçoit la fondamentale, un accord faux au temps 2 puis le bon au temps 3 → essai `corrected`, carte non apprise sur cet essai (FSRS Again), `contest()` → essai contesté.
- [ ] **Step 2: Run** → FAIL puis implémenter ce qui manque (rien, normalement : c’est l’assemblage) → PASS.
- [ ] **Step 3: Barrière** `npm test && npm run check` ; `npx prettier --check` sur les fichiers modifiés.
- [ ] **Step 4: Navigateur** : serveur de dev, Chrome sans tête, faux micro (script jetable du scratchpad) : `/session?kind=triads` démarre sans erreur console ; `/settings` montre « Dessin des accords » ; captures de l’aide dans les deux styles via un réglage changé.
- [ ] **Step 5: Commit** `test: play a triad put right in the band, then contest it` (et `docs: …` pour CLAUDE.md et le contrat de surface)
