# Voie de la mémoire des triades (C1) — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deux mécaniques de triades (ancrage, zone) jouées dans une session « Triades », avec ce qu’il faut au cœur : plusieurs capteurs par mécanique, réponse qui se précise, rythme propre à chaque exercice, changement de tempo entre séquences.

**Architecture:** partie 1 (tâches 1 à 5) : le cœur, sans aucune triade, prouvé par des mécaniques factices et sans changement pour les notes. Partie 2 (tâches 6 à 12) : domaine des triades (position, ordre, définitions), règles et rapport au temps à deux cibles, sélecteur, lien avec la file des notes, présentateurs, session, accueil et bilan.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (`server` / `client`), Dexie + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-08-voie-memoire-triades-design.md` (à lire avant chaque tâche). Contexte : `2026-10-07-capteur-accords-design.md`, `2026-10-06-accords-voicings-design.md`, `2026-10-02-apprentissage-design.md`, `2026-10-03-sondage-avant-apprentissage-design.md`.

## Global Constraints

- Node 22 via `.nvmrc` : `source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx` ; `npm ci` une fois avant la tâche 1.
- Porte de chaque tâche : `npm test && npm run check`, sortie de `check` lue (0 erreur) ; `npx prettier --check` sur les fichiers texte touchés. Pas de `node:` dans les specs.
- Code et commentaires en anglais ; textes d’interface en français et anglais (`defineMessages`) ; commits Conventional Commits en minuscules avec `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Le cœur (`SessionController`, `ObservationSpan`, `AttemptRecorder`, `sensors.ts` hors capteurs) ne nomme aucune mécanique. Les exercices de notes gardent leur comportement exact : leurs specs passent sans changer leurs attentes (seules les signatures mécaniques bougent : `sensor` → `sensors`).
- Valeurs : `pacing` par défaut `{ leadSteps: [8, 4, 2], respirationBars: 1, learnedAfter: 2 }` (les constantes actuelles) ; fenêtre de l’accord en ancrage : de `cible + 1` temps à `cible + 4` temps (exclu) ; séquences de 4 consignes d’une même mécanique ; contenu `stringSets: [[3, 2, 1], [4, 3, 2]]`, `qualities: ['maj', 'min']`.
- `pacing.leadSteps` reste pris dans `LEAD_STEPS` (8, 4, 2) : la validation des cartes n’accepte que ces valeurs. L’élargir est hors périmètre.
- Identifiants : mécaniques `triad-anchor`, `triad-zone` ; exercices `triads-anchor`, `triads-zone` ; genre de session `triads` ; capteurs `note`, `chord`.

## Review Focus

1. **Accord précédent parmi les candidats** : la consigne suivante est un autre renversement du même accord (D fondamentale sur sol après D fondamentale sur si) ; aucune occurrence du voicing précédent n’est candidate (tâche 10).
2. **Ancrage incomplet** : fondamentale juste et accord absent, ou accord joué avant le temps 2 → raté ; accord juste et fondamentale fausse → raté avec la confusion de la fondamentale (tâche 7).
3. **Lecture provisoire jamais confirmée** : un arpège dont aucune lecture ne reconnaît l’attendu est jugé sur la dernière lecture quand la fenêtre se ferme ; une lecture provisoire seule ne tranche jamais (tâche 3).
4. **Changement de tempo pendant une capture hors temps** : la capture se règle d’abord, puis le métronome repart au nouveau tempo après une mesure comptée (tâche 5).
5. **Sessions de notes inchangées** : Apprentissage et jeu libre donnent les mêmes consignes, verdicts et cartes qu’avant (tâches 1, 2, 9).

---

## Partie 1 — le cœur

### Task 1: Le rythme propre à chaque exercice

**Files:** Modify `src/lib/domain/exercise/types.ts`, `src/lib/domain/timing/beat.ts`, `grid.ts`, `src/lib/domain/mechanics/types.ts`, `src/lib/application/session/SessionController.svelte.ts` ; Test `src/lib/domain/timing/beat.spec.ts`, `src/lib/application/session/pacing.spec.ts` (nouveau).

**Interfaces:**

- Produces :

  ```ts
  interface ExercisePacing {
  	leadSteps: readonly LeadBeats[];
  	respirationBars: number;
  	learnedAfter: number;
  }
  const DEFAULT_PACING: ExercisePacing; // valeurs des Global Constraints
  function createBeatTiming(pacing: ExercisePacing): TimingRelation; // beatTiming = createBeatTiming(DEFAULT_PACING)
  function pacingOf(definition: ExerciseDefinition): ExercisePacing; // params.pacing, sinon DEFAULT_PACING
  // MechanicRules gagne : timingFor?(pacing: ExercisePacing): TimingRelation
  ```

  Le contrôleur prend le rapport au temps d’une consigne par `rules.timingFor?.(pacingOf(exerciseById(item.exerciseId))) ?? rules.timing`, partout où il utilise aujourd’hui `rules.timing`. `respirationStart` reçoit le nombre de mesures en paramètre.

- [ ] **Step 1: Write the failing tests** : `createBeatTiming({ leadSteps: [8, 4], respirationBars: 2, learnedAfter: 2 })` raccourcit 8 → 4 et s’arrête à 4, et place la consigne suivante 2 mesures après la cible ; `createBeatTiming(DEFAULT_PACING)` donne les mêmes résultats que `beatTiming` sur les cas de `beat.spec.ts` ; une mécanique factice à `timingFor`, jouée par le contrôleur avec un exercice au `pacing` `respirationBars: 2`, attend 2 mesures avant la consigne suivante, et la même mécanique sur un autre exercice sans `pacing` en attend 1.
- [ ] **Step 2: Run** les specs — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` — PASS, specs des notes inchangées.
- [ ] **Step 5: Commit** — `feat: read the pacing of a prompt from its exercise`

### Task 2: Plusieurs capteurs par mécanique

**Files:** Modify `src/lib/application/mechanics/types.ts`, `locate.ts`, `identify.ts`, `src/lib/domain/mechanics/types.ts`, `src/lib/domain/timing/types.ts`, `beat.ts`, `free.ts`, `SessionController.svelte.ts`, les specs qui construisent des présentateurs (`thirdMechanic.spec.ts`, `expectation.spec.ts`…) ; Test `src/lib/application/session/twoSensors.spec.ts` (nouveau).

**Interfaces:**

- Produces :

  ```ts
  // MechanicPresenter : sensors: SensorKind[] (remplace sensor) ;
  // expectation?(item, round: { opensAt: number; previous: PlannedItem | null }): Partial<Record<SensorKind, unknown>>
  // MechanicRules.judge(item, payload, sensor: string)
  // Round.observe({ time, correct, answer, sensor, final? })
  ```

  `openSources` ouvre l’union des capteurs des présentateurs. Une observation va à la manche si son capteur est dans `presenter.sensors`, sinon `other-sensor`. `expectAll` donne à chaque source l’attente du présentateur pour son capteur, `null` aux autres. `previous` est la consigne précédente de la session (ou `null`). Les rapports au temps existants ignorent `sensor`.

- [ ] **Step 1: Write the failing tests** (`twoSensors.spec.ts`, harnais de `thirdMechanic.spec.ts`) : une mécanique factice à deux capteurs `a` et `b`, dont le jugement est juste si `payload.value === item.n` ; chaque source reçoit sa propre attente (`{ a: …, b: … }`) ; une observation de `a` répond ; une observation d’un capteur `c` que la mécanique n’écoute pas est enregistrée `other-sensor` ; `previous` vaut `null` puis la première consigne.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** et passer les présentateurs de notes à `sensors: ['note']` / `['tap']`.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** — `feat: let a mechanic listen to several sensors`

### Task 3: Une réponse qui se précise

**Files:** Modify `src/lib/application/session/sensors.ts` (`Observation.final?: boolean`), `src/lib/domain/timing/beat.ts`, `SessionController.svelte.ts`, `observationSpan.ts` si le sort doit le dire ; Test `beat.spec.ts`, `src/lib/application/session/refining.spec.ts` (nouveau).

**Interfaces:**

- Produces : `final === false` veut dire qu’une meilleure lecture **de la même attaque** (même `time`) va suivre. Dans `BeatRound` : une réponse non finale dans la fenêtre devient la réponse en attente (aucun verdict) ; une lecture suivante de même `time` la remplace et tranche si elle est finale ou juste ; une lecture d’une autre attaque est ignorée (`settled`) tant qu’une réponse est en attente ; quand la fenêtre ou la capture hors temps se ferme (`onBeat`, `abandon`), la réponse en attente est jugée telle quelle. Une observation sans `final` est finale (notes, taps : inchangé).

- [ ] **Step 1: Write the failing tests** : une lecture provisoire fausse puis une lecture finale juste de la même attaque → juste, temps de réponse = `time` de l’attaque ; trois lectures provisoires fausses puis fermeture de la fenêtre → jugé sur la dernière ; une lecture provisoire puis une autre attaque → la seconde attaque est `settled` ; notes sans `final` → comportement inchangé (specs existantes).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: let a sensor refine a reading of the same attack`

### Task 4: Le capteur d’accords marque ses lectures finales

**Files:** Modify `src/lib/application/ports/ChordVerifierPort.ts` (`expected: readonly string[]`, `ChordReport.final: boolean`), `src/lib/infrastructure/audio/chords/NnlsChordVerifier.ts`, `sensors.ts` (`chordSensor` recopie `final`), `src/routes/diagnostic/+page.svelte`, specs et fixtures qui construisent des attentes ; Test `NnlsChordVerifier.spec.ts`, `sensors.spec.ts`.

**Interfaces:**

- Produces : un rapport est `final` quand sa décision active est dans `expected`, ou qu’il est le dernier de son attaque (dernier point de `REPORT_POINTS_MS`, ou coupé par une nouvelle attente). Après un rapport final qui retient l’attendu, l’adaptateur continue d’émettre les rapports suivants (ils restent dans les observations), marqués `final`.

- [ ] **Step 1: Write the failing tests** : D 2‑3‑2 synthétique → le rapport à 250 ms est `final` ; avec un attendu que le juge ne retient pas, seuls le rapport à 2000 ms (ou le rapport coupé) sont `final` ; `chordSensor` donne à l’observation `final` du rapport.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: mark the chord reading that settles an attack`

### Task 5: Changer de tempo entre deux séquences

**Files:** Modify `SessionController.svelte.ts` ; Test `src/lib/application/session/tempoSwitch.spec.ts` (nouveau).

**Interfaces:**

- Produces : quand la consigne suivante appartient à une exécution dont le tempo diffère du tempo du métronome, le contrôleur règle d’abord la manche en cours (capture comprise), arrête le métronome, appelle `setTempo`, puis repart comme une reprise : mesure comptée affichée (4, 3, 2, 1), consigne sur la grille au nouveau tempo. Une exécution sans tempo (écran) ne déclenche rien.

- [ ] **Step 1: Write the failing tests** (deux exercices factices sur le temps à 80 et 100 bpm, liste alternant deux séquences) : le métronome passe de 80 à 100 entre les séquences, une mesure comptée précède la première consigne à 100 ; une capture hors temps ouverte au changement se règle avant l’arrêt ; deux séquences au même tempo ne relancent rien.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** — `feat: restart the metronome with a counted bar when the next sequence changes tempo`

## Partie 2 — les triades

### Task 6: Domaine des triades : position, ordre, définitions

**Files:** Create `src/lib/domain/triads/` (`position.ts`, `introduction.ts`, `items.ts`, `index.ts`) ; Modify `src/lib/domain/exercise/catalog.ts` ; Tests colocalisés.

**Interfaces:**

- Produces :

  ```ts
  function occurrencePosition(o: VoicingOccurrence): number | 'open'; // case appuyée la plus basse
  interface TriadParams {
  	stringSets: StringSet[];
  	qualities: string[];
  	pacing: ExercisePacing;
  }
  function triadVoicings(params: TriadParams): Voicing[]; // closeTriadVoicings sur 12 fondamentales en dièses
  function triadIntroductionOrder(
  	params: TriadParams,
  	acquiredPositions: ReadonlySet<string>
  ): Voicing[];
  // clé de position : `${string}:${pitch}` (comme un item de localisation)
  const TRIADS_ANCHOR: ExerciseDefinition;
  const TRIADS_ZONE: ExerciseDefinition; // dans EXERCISES
  ```

  Ordre : spec, section 2 (groupes dans l’ordre, familles majeur puis mineur, renversements du plus grave au plus aigu par la position de leur plus basse occurrence, fondamentales triées par positions acquises décroissantes, puis naturelles avant altérées, puis ordre chromatique depuis C).

- [ ] **Step 1: Write the failing tests** : positions de D sur sol‑si‑mi (2‑3‑2 → 2, 7‑7‑5 → 5, 11‑10‑10 → 10, 14‑15‑14 → 14), A 2‑2‑0 → 2, Em 0‑0‑0 → `'open'` ; 144 voicings ; sans position acquise, les six premiers sont C (majeur, trois renversements, du plus grave au plus aigu) puis Cm sur sol‑si‑mi ; avec les positions de D acquises, D passe en tête ; égalité : naturelles d’abord ; ré‑sol‑si après tout sol‑si‑mi ; le catalogue reste des données (`JSON` aller-retour).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: order the triads of the memory track`

### Task 7: Règles des deux mécaniques et rapport au temps à deux cibles

**Files:** Create `src/lib/domain/timing/anchor.ts`, `src/lib/domain/mechanics/triadAnchor.ts`, `triadZone.ts` ; Modify `src/lib/domain/mechanics/index.ts` (`mechanicRules`), `src/lib/infrastructure/storage/validateBackup.ts` si les items ne passent pas ; Tests colocalisés.

**Interfaces:**

- Consumes : tâches 1 à 4, 6 ; `classifyNoteConfusion`, `acceptableMidis` pour la fondamentale.
- Produces :

  ```ts
  function createAnchorTiming(pacing: ExercisePacing): TimingRelation; // cible 1 'note', cible 2 'chord'
  const triadAnchorRules: MechanicRules<TriadAnchorItem, …>; // item { voicingKey }
  const triadZoneRules: MechanicRules<TriadZoneItem, …>;     // item { voicingKey, position }
  ```

  L’item zone porte la position demandée ; la carte reste par voicing (`itemKey` = clé du voicing). Jugement ancrage : observation `note` → fondamentale juste si sa hauteur est dans les octaves de la fondamentale sur la corde de la fondamentale du voicing ; observation `chord` → juste si la décision est une occurrence du voicing. `AnchorRound` : la fondamentale suit les fenêtres de `BeatRound` (verdict de temps) ; l’accord n’est pris qu’entre `cible + 1` et `cible + 4` temps ; verdict final quand les deux sont connus ou à la fin de la mesure cible : juste si les deux sont justes, verdict de temps de la fondamentale. Jugement zone : juste si la décision est l’occurrence demandée ; confusions `other-octave`, `other-inversion`, `other-quality`, `none`.

- [ ] **Step 1: Write the failing tests** : ancrage : fondamentale parfaite + accord au temps 3 → parfait ; fondamentale en retard + accord → en retard ; fondamentale juste, aucun accord avant la fin de la mesure → mauvaise note ; accord joué au temps 1 seulement → raté ; fondamentale fausse + accord juste → raté, confusion de la fondamentale ; accord à l’autre octave → juste. Zone : occurrence demandée → juste ; autre octave → raté `other-octave` ; autre renversement → `other-inversion`. Les deux règles sont dans `mechanicRules` et leurs clés se relisent (`parseItem`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: judge triads anchored on their root and triads in a position`

### Task 8: Le sélecteur de la session Triades

**Files:** Create `src/lib/domain/progress/triadSelector.ts` ; Test `triadSelector.spec.ts`.

**Interfaces:**

- Consumes : tâches 1, 6, 7 ; `introduceCard`, `probeCard`, `markLearned`, `applyColdAttempt`, `isAcquired`, `reviewableCards`, `lastAttemptByCard`, `cardSuccessRate`, `sessionSuccessRate` ; constantes de l’Apprentissage (`MAX_WORKING_SET`, `NEW_NOTE_MIN_CARD_SUCCESS`, `NEW_NOTE_MIN_SESSION_SUCCESS`, `SUCCESS_WINDOW`, `SEQUENCE_LENGTH`).
- Produces : `createTriadSelector({ cards, attempts, sessionId, definitions: { anchor, zone }, acquiredPositions, tempos, random }): SessionSelector`. Catégories et garde-fous : spec, section 2. Séquences de 4 d’une même mécanique. Jamais deux fois de suite le même voicing. Une triade entre en zone quand sa carte d’ancrage est acquise (`isAcquired`) ; en zone, la position est tirée parmi les occurrences, sauf celle de la dernière consigne de cette carte. Apprise après `pacing.learnedAfter` réussites au temps d’avance le plus court du `pacing`.

- [ ] **Step 1: Write the failing tests** : session vierge → première consigne : sondage d’ancrage de la première triade de l’ordre ; sondage raté → présentation aidée ensuite ; deux réussites au plus court → apprise ; une triade acquise en ancrage apparaît en zone ; jamais le même voicing deux fois de suite sur 200 tirages ; séquences de 4 d’une même mécanique ; les positions en zone alternent.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: select the prompts of a triads session`

### Task 9: Les positions des triades en tête de la file des notes

**Files:** Modify `src/lib/domain/progress/introduction.ts`, `learnSelector.ts`, `src/lib/application/services/createAppServices.ts` ; Tests `introduction.spec.ts`, `learnSelector.spec.ts`.

**Interfaces:**

- Produces : `introductionOrder(priority: readonly LocateItem[] = [])` met les items de `priority` (dans leur ordre, sans doublon, en gardant la règle des miroirs) avant les autres ; `createLearnSelector({ …, priority })` ; la préparation de l’Apprentissage calcule `priority` à partir des cartes `triad-anchor` introduites et non acquises (positions de toutes leurs occurrences sur leurs cordes, cases 1 à 11, non acquises en localisation).

- [ ] **Step 1: Write the failing tests** : avec `priority = [C# sur la corde 1]`, ce C# est la prochaine note introduite ; sans priorité, l’ordre est inchangé (specs existantes) ; la préparation de l’Apprentissage met en tête les positions d’une triade en cours d’ancrage.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: bring the notes of the triads being learned to the front of the notes queue`

### Task 10: Les présentateurs

**Files:** Create `src/lib/application/mechanics/triads.ts`, `triadMessages.ts` ; Modify `src/lib/application/mechanics/index.ts` ; Test `triads.spec.ts`.

**Interfaces:**

- Consumes : tâches 2, 4, 6, 7.
- Produces : `triadAnchorPresenter` (`sensors: ['note', 'chord']`, scène `guitar`) et `triadZonePresenter` (`sensors: ['chord']`). Consignes : « D · fondamentale sur si », « D · position 2 », « Em · à vide » ; groupe de cordes en ligne secondaire (« sol‑si‑mi ») ; aide ancrage « · 2‑3‑2 » (occurrence la plus basse appuyée), aide zone « (fondamentale sur si) » ; correction « 2‑3‑2 · A D F# ». Orthographe de l’accord : celle de la fondamentale du voicing (dièses) sauf pour les fondamentales usuellement bémolisées en tonalité (Eb, Ab, Bb), écrites en bémol. `expectation` : `{ chord: ChordExpectation }` ; candidats = `voicingCandidates` de l’occurrence attendue (zone) ou de la plus basse occurrence (ancrage, toutes les occurrences du voicing dans `expected`), **sans aucune occurrence du voicing de `previous`** s’il s’agit d’une triade ; `style: 'unknown'`.

- [ ] **Step 1: Write the failing tests** : textes des consignes, aides et corrections (fr et en) ; l’attente d’ancrage liste toutes les occurrences de D fondamentale sur si dans `expected` ; après D fondamentale sur si, l’attente de D fondamentale sur sol ne contient ni 2‑3‑2 ni 14‑15‑14 ; Eb mineur s’écrit « Ebm ».
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat: prompt and reveal triads on the play screen`

### Task 11: Session Triades, accueil, bilan et contestation

**Files:** Modify `src/lib/domain/types.ts` (`SessionKind` + `'triads'`, `Attempt.contested?: boolean`), `validateBackup.ts`, `createAppServices.ts` (préparation `triads`, tempo suivant pour chaque exécution sur le temps aussi en fin de session `triads`), `src/lib/application/app.ts` (`triadsDue()`, `contestAttempt(id)`), le dépôt des essais (`setContested`), `src/lib/composition/createApp.ts` (présentateurs), l’écran d’accueil et sa page, l’écran de bilan et sa page, la page de session (`kind=triads`), les doubles de `/dev` ; Tests des écrans (`*.svelte.spec.ts`) et `createAppServices`.

**Interfaces:**

- Produces : bouton « Triades » sur l’accueil avec le nombre de révisions dues ; bilan d’une session `triads` : précision et temps médian à froid, triades apprises, déjà sues, prochaines révisions, puis la liste des accords refusés avec « Joué juste » qui appelle `contestAttempt` (l’essai prend `contested: true`, FSRS inchangé, le bouton devient « Contesté »).

- [ ] **Step 1: Write the failing tests** : l’accueil montre « Triades » et lance une session `triads` ; le bilan liste un accord refusé et « Joué juste » écrit `contested: true` sans toucher à la carte ; la sauvegarde accepte et rend `contested` ; une session `triads` écrit le tempo suivant de chacun de ses exercices.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** — `feat: add a triads session to the home screen, with a contest in its summary`

### Task 12: De bout en bout

**Files:** Test `src/lib/application/session/triadsSession.spec.ts` (nouveau).

- [ ] **Step 1: Write the test** : services avec détecteur de notes factice et `FakeChordVerifier` ; une session `triads` vierge : sondage d’ancrage de C, raté (aucune réponse) → présentation aidée ; deux réussites au plus court (fondamentale au temps 1, rapport final retenant l’accord au temps 3) → C apprise ; une session suivante après le délai froid → révision d’ancrage réussie → C acquise ; C apparaît alors en zone avec une position, et le capteur reçoit l’attente de cette occurrence.
- [ ] **Step 2: Run** — FAIL si un maillon manque ; corriger dans la tâche qui le possède (Ruling).
- [ ] **Step 3: Run the merge gate** `npm test && npm run check` — tout vert. Vérification dans un navigateur (Chrome sans tête, faux micro, script jetable du scratchpad) : l’accueil montre « Triades », la session démarre et affiche « C · fondamentale sur si » (ou la première consigne de l’ordre), sans erreur console.
- [ ] **Step 4: Commit** — `test: play a triads session from probe to position`
