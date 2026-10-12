# Design — voie du geste (D)

Sous-projet D de l’étape 3 (`docs/plateforme.md`). Conçu dans la conversation du 2026-10-10, à partir du cours du 2026-09-24 (`docs/brief.md`) et de ses devoirs : la grille d’« I Only Have Eyes for You », lignes 1 et 2, en montant le manche puis, à la reprise, en descendant ; retrouver plusieurs formes d’un même accord. Specs liées : `2026-10-06-accords-voicings-design.md` (A), `2026-10-07-capteur-accords-design.md` (B1), `2026-10-08-voie-memoire-triades-design.md` (C1), `2026-10-09-retours-voie-memoire-design.md`.

## Décisions de pédagogie

- **La pédagogie décide, la technique suit.** Le geste se joue comme en jam : l’accord est attaqué sur son changement, puis le rythme est libre (plaqué, arpégé, mélangé).
- **La mémoire (C1) apprend les formes ; le geste les enchaîne.** Ici, pas de carte FSRS : on mesure un savoir-faire, et sa courbe est le tempo tenu.
- **Un passage** est une grille jouée une fois, sans arrêt, au tempo de l’exercice. **Chaque changement d’accord est un essai.**
- **Quatre exercices, dans l’ordre de l’échelle** : relier les formes, contrainte de déplacement, rester dans une zone, jam. Un exercice s’ouvre quand la voie de la mémoire a appris ses triades.
- **Les grilles sont des données** écrites avec leurs vrais symboles (Dm7, G7, Cmaj7…). Une règle, elle aussi en données, donne la triade jouée pour chaque symbole. Les grilles resteront justes le jour où on jouera des tétrades.
- **La vue appartient à l’exercice** : le moteur produit un modèle d’écran, l’exercice nomme la vue qui l’affiche. Une nouvelle présentation (grille du prof, partition, piste) est une nouvelle vue, sans toucher au moteur.

## 1. Les quatre exercices

Contenu de départ : triades majeures et mineures serrées sur sol‑si‑mi `[3, 2, 1]` et ré‑sol‑si `[4, 3, 2]`, comme en C1.

| Exercice                  | Id              | Élément                  | Passage                                                                     | Juste quand l’accord joué…                                                                                                                   | Repère affiché                                               |
| ------------------------- | --------------- | ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Relier les formes         | `gesture-link`  | un accord sur un groupe  | ses formes en montant puis en descendant, une par mesure                    | est la forme demandée                                                                                                                        | le groupe, le renversement demandé (« fondamentale sur si ») |
| Contrainte de déplacement | `gesture-climb` | une grille sur un groupe | la grille, en montant ou en descendant, en alternant d’un passage à l’autre | est sur le groupe, à une position strictement plus haute (montée) ou plus basse (descente) que la forme jouée avant, la première étant libre | le groupe et une flèche ↑ ou ↓                               |
| Rester dans une zone      | `gesture-zone`  | une grille               | la grille, dans une zone de 5 cases qui change à chaque passage             | a toutes ses cases dans la zone, sur l’un des deux groupes                                                                                   | « cases 5 à 9 »                                              |
| Jam                       | `gesture-jam`   | une grille               | la grille                                                                   | est le bon accord, sur l’un des deux groupes, à n’importe quelle position                                                                    | les accords seuls                                            |

- **Relier.** Les formes d’un passage sont les `LINK_SHAPES` (4) premières occurrences de l’accord sur le groupe, de position croissante à partir de la plus basse : les trois renversements, puis le premier à l’octave. Le passage les monte puis les redescend sans répéter la plus haute (D sur sol‑si‑mi : 2‑3‑2, 7‑7‑5, 11‑10‑10, 14‑15‑14, 11‑10‑10, 7‑7‑5, 2‑3‑2, soit 7 mesures). Sans occurrence à l’octave, le tour s’arrête aux trois renversements.
- **Contrainte.** La position d’une forme est celle de C1 (`occurrencePosition` : la case fretté la plus basse ; une forme à vide vaut 0). On la compare à la **dernière forme entendue dans le passage**. Sans forme entendue, le changement est libre. Le premier passage d’un élément monte ; ensuite, le sens alterne d’un passage à l’autre, comme les devoirs : « à la reprise, la contrainte inverse ».
- **Zone.** Une zone couvre `ZONE_FRETS` (5) cases, de `from` à `from + 4`. Une corde à vide est hors zone. D’un passage à l’autre, la zone avance de `ZONE_STEP_FRETS` (3) cases et revient en bas du manche après `MAX_VOICING_FRET`. Une zone est sautée quand un accord de la grille n’y a aucune forme, sur aucun des deux groupes. Les formes jumelles des deux groupes, qui sonnent pareil, sont décalées d’au moins 5 cases : elles ne tiennent jamais ensemble dans une zone de 5 cases (et le juge de zone accepte les deux groupes).
- **Jam.** Aucune contrainte de position.

**Attaque et rythme, partout.** L’attaque est jugée à chaque changement : `perfect`, `early` ou `late`, avec les tolérances des notes (section 4). La première attaque est la réponse. Les suivantes sont gardées dans les observations mais pas jugées : le rythme reste libre jusqu’au changement suivant.

**Aides.** Une aide montre la forme à jouer **au prochain changement** :

- en relier, la forme demandée ;
- en contrainte, la forme admise la plus proche de celle qu’on vient d’entendre ;
- en zone, la forme la plus basse dans la zone ;
- en jam, rien.

Un passage est aidé quand son élément n’a encore aucun passage réussi, ou quand son dernier passage a échoué. L’aide disparaît après un passage réussi (`PlannedItem.aid`, `'show-position'` ou `'none'`).

### Grilles de départ (`domain/grid/catalog.ts`)

- **`iohefy-a`** : « I Only Have Eyes for You », lignes 1 et 2 avec la première fin (relevé iReal Pro du cours), 8 mesures en 4/4 :

  | Mesure  | 1   | 2   | 3   | 4   | 5     | 6                  | 7   | 8                  |
  | ------- | --- | --- | --- | --- | ----- | ------------------ | --- | ------------------ |
  | Accords | Dm7 | G7  | Dm7 | G7  | Cmaj7 | Cmaj7, F7 sur le 3 | Em7 | Ebm7, Ab7 sur le 3 |

  Triades : Dm, G, C, F, Em, Ebm, Ab.

- **`blues-f`** : blues en F, 12 mesures : F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | F7 | C7 | Bb7 | F7 | C7. C’est la forme simple. Le cours ne précisait pas laquelle ; à confirmer avec le prof, c’est une donnée.

Deux symboles égaux qui se suivent forment **un seul changement** : en mesure 5, Cmaj7 dure 6 temps.

## 2. Grilles et symboles (`src/lib/domain/grid/`)

```ts
/** Où un accord commence : mesure (1…) et temps (1…), fractionnaire (4.5 : la croche après le 4). */
interface GridChord {
	bar: number;
	beat: number;
	symbol: string;
}
interface ChordGrid {
	id: string;
	title: string;
	beatsPerBar: 4;
	bars: number;
	chords: readonly GridChord[];
}

/** Un changement : son début et sa durée en temps depuis le début de la grille, et son symbole. */
interface GridChange {
	at: number;
	length: number;
	symbol: string;
}
function gridChanges(grid: ChordGrid): GridChange[]; // fusionne les symboles égaux consécutifs
```

- **Validation** (`RangeError`) : le premier accord est en mesure 1, temps 1 ; les positions croissent strictement ; chaque temps est dans `[1, beatsPerBar + 1)` ; chaque mesure est dans la grille ; chaque symbole se lit. Un temps est un nombre : une triolet (1 + 2/3) est approchée, et les tests comparent avec `toBeCloseTo`.
- **Lecteur de symboles** `parseChordSymbol(symbol)` → `{ root: SpelledNote; quality: string; extensions: string[]; bass: SpelledNote | null }`.
  - La fondamentale est une lettre suivie de `#` ou `b`.
  - Le suffixe est cherché dans une **table de données** (`SUFFIXES`, la plus longue correspondance d’abord). Elle connaît `''`, `m`, `-`, `7`, `maj7`, `M7`, `Δ7`, `Δ`, `m7`, `-7`, `6`, `m6`, `ø`, `ø7`, `m7b5`, `dim`, `o`, `aug`, `+`, `7#5`, `7+5`, `7b9`, `7#9`, `7#11`, `7b13`, `9`, `sus2` et `sus4`.
  - La table donne l’id de la qualité et les extensions, gardées en données (`b9`, `#11`… : les degrés au-delà de l’octave viendront avec la Généralisation).
  - `/F` donne la basse.
  - Un symbole inconnu lève une `RangeError` qui le cite.
- **Qualités de septième.** De nouvelles lignes entrent dans la table de `chord.ts` : `maj7` (1, 3, 5, 7), `7` (1, 3, 5, b7), `m7` (1, b3, 5, b7), `m7b5` (1, b3, b5, b7), `6` (1, 3, 5, 6), `m6` (1, b3, 5, 6) et `7#5` (1, 3, #5, b7). Elles n’utilisent que les degrés existants ; `dim7`, qui demande `bb7`, attend la Généralisation. `closeTriadVoicings` refuse toujours ce qui n’est pas une triade.
- **Triade d’un symbole** `triadOf(symbol)` → `Chord`, par la table de données `TRIAD_OF_QUALITY` :
  - `maj`, `7`, `maj7`, `6` et `9` donnent `maj` ;
  - `min`, `m7` et `m6` donnent `min` ;
  - `m7b5` et `dim` donnent `dim` ;
  - `aug` et `7#5` donnent `aug`.

  `sus2` et `sus4` n’ont pas de triade : une `RangeError` refuse la grille dans un exercice de triades. La basse est ignorée : G7/F se joue G.

- **Temps audio.** Un changement à `at` temps du début du passage tombe à `beatTime(début + at)`, et le métronome clique les temps. Aucune grille de départ n’a de changement entre deux temps, mais le moteur les accepte : un test en fait jouer un à la croche et un à la triolet.

## 3. La mécanique `chord-grid`

Une seule mécanique pour les quatre exercices : ils ne diffèrent que par leurs données. `src/lib/domain/mechanics/chordGrid.ts` et `src/lib/domain/gesture/`.

```ts
type GestureRule = 'link' | 'climb' | 'zone' | 'jam';

/** Un changement d'un passage : tout ce qu'il faut pour le juger, l'écouter et l'afficher. */
interface ChordGridItem {
	rule: GestureRule;
	/** L'élément (stable) : 'link:D|maj:3,2,1', 'climb:iohefy-a:3,2,1', 'zone:iohefy-a', 'jam:blues-f'. */
	element: string;
	/** Ce passage dans la série : les essais d'un passage se regroupent par lui. */
	passageId: string;
	index: number;
	changes: readonly GridChange[]; // la grille du passage, pour la vue
	symbol: string; // ce changement
	chord: string; // sa triade : 'D|min'
	sets: readonly (readonly StringNumber[])[];
	shape?: string; // relier : l'occurrence demandée (occurrenceId)
	direction?: 'up' | 'down'; // contrainte
	zone?: { from: number; to: number }; // zone
	/** La dernière forme entendue dans le passage (occurrenceId) : elle sonne encore ; la contrainte s'y compare. */
	previous: string | null;
}
```

- **Clé et sauvegarde.** `itemKey` vaut `${element}#${index}`. `cardItem` et `parseItem` rendent `{ element, index }`, si bien que la validation de la sauvegarde accepte les essais (un aller-retour testé). `learner` vaut `'skill'` (section 5).
- **Juge** `judge(item, { decided })`. Il est pur et ne lit que l’item. Dans l’ordre :
  1. rien de reconnu donne `none` ;
  2. une autre fondamentale donne `other-chord` ;
  3. la même fondamentale avec une autre qualité donne `other-quality` ;
  4. une forme hors des groupes du passage donne `other-set` ;
  5. ensuite, selon la règle :
     - relier : une autre forme que celle demandée donne `other-shape` ;
     - contrainte : une position qui ne monte pas donne `not-higher`, une position qui ne descend pas donne `not-lower` ;
     - zone : une forme hors de la zone donne `out-of-zone` ;
     - jam : tout le reste est juste.

  Confusion : `{ kind, part: 'chord' }`, comme en C1.

- **Candidats** (`MechanicPresenter.expectation`, capteur `chord`) :
  - **attendues** : les formes que la règle admet, sur les groupes du passage ;
  - **voisines** : les autres formes du même accord sur ces groupes, celles de l’autre qualité, et celles des autres accords de la grille, à `NEIGHBOUR_FRETS` (2) cases au plus de la plage des attendues (en jam, tout le manche) ;
  - **jamais la forme qui sonne encore** (`previous`), ni aucune forme de mêmes hauteurs.

  Style `'unknown'`.

- **Présentateur** `chordGridPresenter` (`src/lib/application/mechanics/chordGrid.ts`) : capteur `chord`, scène `guitar`, `contestable`. Il donne :
  - `prompt` (le symbole et le repère, pour le contrat commun) ;
  - `feedback` (la forme entendue, la forme admise la plus proche, la confusion) ;
  - `expectation` ;
  - `stage` (section 6).

## 4. Le temps : des manches contiguës

Une consigne de grille est **un changement**. Les manches d’un passage se suivent **sans respiration ni mesure comptée**.

### Le rapport au temps `gridTiming` (`domain/timing/gridChange.ts`)

- **Tolérance en avance** : `early = min(GRID_EARLY_MS, GRID_EARLY_MAX_BEATS × durée d'un temps)`, soit 200 ms à 80 bpm et 150 ms à 160 bpm. Elle reste sous la demi-temps : une attaque de l’accord précédent sur la croche d’avant ne passe jamais pour le changement.
- **La manche du changement k** :
  - elle écoute de `change − early` à **la passe** : `changement suivant − early`, ou fin du passage − early pour le dernier ;
  - fenêtre juste : jusqu’à `change + LATE_LIMIT_MS`, bornée par la passe. Dedans, une attaque juste reçoit `timingVerdict(écart)` : `perfect`, `early` ou `late` ;
  - après, jusqu’à la passe : `offbeat` si l’accord est juste, `wrong` sinon ;
  - sans réponse quand la fenêtre se ferme, un raté provisoire s’affiche, comme pour `BeatRound` ;
  - la première attaque est la réponse ; ses lectures se précisent (`final`), comme en C1 ;
  - une attaque d’avant l’ouverture est `before-window`, une attaque d’après la passe est `after-capture`.
- **Ouverture d’une manche.**
  - Une manche qui suit une passe (`chained`) a son changement au temps fractionnaire de la passe.
  - Autrement (début de passage, reprise après une pause), elle s’ouvre sur le temps 4 d’une mesure et son changement tombe sur le 1 suivant (`promptBeat = alignedPromptBeat(earliest, 1)`). Après une pause, le passage reprend au changement suivant, après la mesure comptée.
- `isDirectRecall` vaut toujours false ; `leadBeats` est null ; `previewBeats` vaut 0.

### Ce que le cœur gagne (générique, ne nomme aucune mécanique)

- **`Round.handover?: { beat: number; time: number }`** : « la manche suivante peut s’ouvrir sans intervalle à cette heure audio, sur ce temps (fractionnaire) ». Une manche qui a une passe s’est réglée au plus tard à cette heure. Le contrôleur n’avance plus sur `after().advanceAt` : seule la passe le fait.
- **`TimingRelation.open` reçoit `chained: boolean`** et l’item de la consigne (`planned.item`), en plus de `leadBeats`.
- **`MetronomePort.at(time, callback): () => void`** appelle `callback` une fois que l’horloge audio a atteint `time`, au réveil suivant de l’ordonnanceur (au plus `DEFAULT_LOOKAHEAD_MS` de retard, jamais en avance). L’appel est annulé par `stop()` ou par la fonction rendue. `FakeMetronome.flush()` déclenche les réveils dus dans l’ordre du temps, entre les temps.
- **La passe, dans le contrôleur.** À l’ouverture d’une manche qui a une passe, le contrôleur programme `metronome.at(handover.time)`. Au réveil, dans l’ordre :
  1. retirer les attentes (`expectAll({})`), pour que la fenêtre coupée du capteur rapporte dans la manche qui finit ;
  2. régler la manche (`abandon`) et enregistrer son essai, ce qui informe le sélecteur ;
  3. prendre la consigne suivante. S’il n’y en a pas, la session se termine. Si elle n’a ni `countIn`, ni autre tempo, ni autre scène, sa manche s’ouvre aussitôt, `chained`, au temps de la passe (`beginNextItem`). Sinon, elle attend sur la grille des temps comme aujourd’hui, à partir du premier temps entier après la passe, avec mesure comptée et changement de tempo.

  Une pause, un arrêt ou la fin annulent le réveil.

Les observations restent rattachées à la manche ouverte **à leur arrivée**. Les attentes changent à la passe, et le capteur rapporte la fenêtre coupée dans la manche qui finit : une attaque faite avant la passe est lue avec l’attente de son changement.

## 5. Progrès, ouverture, session

- **`MechanicRules.learner: 'memory' | 'skill'`.** Les essais d’un apprenant `skill` sont enregistrés avec leurs observations, mais ne créent ni ne touchent aucune carte. `AttemptRecorder` le fait déjà.
- **Réussite d’un passage** : la part de ses changements `isSuccess` vaut au moins `PASSAGE_SUCCESS` (0,9). Les changements se regroupent par `passageId`.
- **Le tempo, courbe de progrès, par exercice** : chaque exercice a son `Progression`. La fin de session applique `nextTempo` à chacun, comme aujourd’hui pour tout genre autre que `free`. Le tempo de départ est 80 (`startTempo`).
- **Ouverture** (`domain/gesture/opening.ts`). « Acquise » veut dire une carte `acquiredAt !== null` :
  - relier (accord, groupe) : ses 3 renversements sur le groupe sont acquis en ancrage ;
  - contrainte (grille, groupe) : chaque renversement de chaque triade de la grille sur le groupe est acquis en ancrage ;
  - zone (grille) : chaque renversement de chaque triade sur les deux groupes est acquis en zone ;
  - jam (grille) : chaque renversement de chaque triade est acquis en ancrage sur au moins un groupe.

  Un exercice est ouvert quand l’un de ses éléments l’est.

- **La session « Geste »** (genre `gesture`, `createGestureSelector`) :
  - elle fait des tours dans l’ordre de l’échelle, un passage par exercice ouvert à chaque tour ;
  - pour chaque exercice, elle choisit l’élément ouvert joué le moins récemment, d’après l’historique et la séance ; à égalité, l’ordre du contenu l’emporte, ce qui alterne les groupes ;
  - elle ne commence plus de passage après `GESTURE_SESSION_MS` (5 min) ou quand la fatigue est détectée ; un passage commencé finit toujours ;
  - le premier changement d’un passage a `countIn` ; les autres non ;
  - chaque exercice joue à son tempo ; un autre tempo redémarre le métronome avec une mesure comptée (C1) ;
  - le sélecteur garde `previous` (la forme `decided` de la dernière réponse du passage, qui sonne encore), le sens de la contrainte, la zone et l’aide de chaque élément.

## 6. La vue : un modèle d’écran et un registre

- **`MechanicPresenter.stage?(item, settled, locale)`** rend `{ model }`, un modèle d’écran opaque au cœur. Le contrôleur le pose dans **`PlayView.stage: { view: string; model: unknown } | null`**, avec `view` tiré de `ExerciseDefinition.view` (à défaut, `'grid-scroll'`). Le modèle est calculé :
  - pour la consigne en attente pendant la mesure comptée (la grille se montre avant le premier accord) ;
  - à l’ouverture de chaque manche ;
  - au réglage de la manche, avec sa réponse (`settled`), parce que l’aide de la contrainte dépend de la forme entendue.

  Les autres mécaniques n’ont pas de `stage` : `PlayView.stage` reste null et leur écran ne change pas.

- **Modèle de la grille**, défini par la mécanique et lu par ses vues :

  ```ts
  { title, beatsPerBar, changes: GridChange[], index,
    cue: { kind: 'link'; set: string; inversion: string }
       | { kind: 'climb'; set: string; direction: 'up' | 'down' }
       | { kind: 'zone'; from: number; to: number } | { kind: 'jam' },
    aid: ShapeView | null }
  ```

  Avec `PlayView.targetBeatIndex` (le temps du changement en cours, donc le début du passage) et `PlayView.history` (un verdict par changement, à son temps), une vue sait tout placer.

- **Registre** `src/lib/ui/play/views/index.ts` : `PLAY_VIEWS: Record<string, Component<{ controller: PlaySessionController; model: unknown }>>`. Une vue factice enregistrée sous un autre nom et nommée par un exercice factice est choisie à sa place (test).
- **Cadre commun** `PlayFrame.svelte` : démarrer, pause (Espace), quitter, décompte, « Joué juste » (Entrée), erreur d’entrée audio, fatigue. Au centre, la vue du registre. La page `/session` l’emploie pour le genre `gesture` ; les notes et les triades gardent `PlayScreen` (leur migration reste dans `docs/todo.md`).
- **Vue `grid-scroll`** (`GridScrollView.svelte`, Game Boy, `DESIGN.md`) :
  - la ligne des accords défile mesure par mesure, comme la ligne du prof ;
  - l’accord en cours est grand, le suivant est visible et annoncé au moins un temps avant, les suivants sont petits ;
  - les accords joués portent leur verdict ;
  - le repère de l’exercice est affiché, et l’aide est dessinée avec `ChordShape` ;
  - aucun texte sous 16 px ;
  - `prefers-reduced-motion` coupe le défilement animé et les pops.

## 7. Accueil et bilan

- **Accueil** : un bouton « Geste », visible dès qu’un exercice est ouvert (`AppServices.gesture(): Promise<{ open: boolean }>`).
- **Bilan** (`SessionSummary.gesture`), par exercice joué :
  - passages réussis sur passages joués ;
  - part des changements justes et à temps (`isSuccess`) ;
  - tempo joué et tempo suivant.

  Suivent les changements ratés (accord, forme entendue, forme attendue), chacun avec « Joué juste » (`AppServices.contest(attemptId)`, qui étiquette l’essai sans rien changer d’autre). Le bilan des notes et des triades ne change pas.

## 8. Constantes (à calibrer)

| Constante              | Valeur  | Rôle                                                |
| ---------------------- | ------- | --------------------------------------------------- |
| `GRID_EARLY_MS`        | 200     | avance tolérée sur un changement                    |
| `GRID_EARLY_MAX_BEATS` | 0,4     | …jamais plus de 0,4 temps                           |
| `PASSAGE_SUCCESS`      | 0,9     | part des changements réussis pour un passage réussi |
| `LINK_SHAPES`          | 4       | formes montées en relier                            |
| `ZONE_FRETS`           | 5       | largeur d’une zone                                  |
| `ZONE_STEP_FRETS`      | 3       | avance de la zone d’un passage à l’autre            |
| `NEIGHBOUR_FRETS`      | 2       | portée des candidats voisins                        |
| `GESTURE_SESSION_MS`   | 300 000 | durée d’une session Geste                           |

`LATE_LIMIT_MS`, `PERFECT_WINDOW_MS` et `nextTempo` sont ceux des notes.

## 9. Tests (écrits avant le code)

- **Domaine** :
  - lecteur de symboles : tous les symboles des deux grilles, Δ et ø, G7/F, et des erreurs (`H7`, `Dm7#`, `Gsus` inconnu) ;
  - `triadOf` ;
  - `gridChanges` : fusion de Cmaj7, positions et durées d’`iohefy-a`, validation ;
  - position fractionnaire en heure audio, à 80 et 120 bpm (croche, triolet) ;
  - juge des quatre règles avec leurs confusions (trop basse, hors zone, autre groupe, autre forme, autre accord) ;
  - candidats sans la forme qui sonne ni ses jumelles ;
  - formes de relier pour D et Ab ;
  - rotation des zones, avec les zones sautées ;
  - ouverture des quatre exercices.
- **Temps** : `GridRound` (avance, juste, en retard, hors temps, sans réponse, lecture qui se précise, attaque d’avant l’ouverture).
- **Cœur** : une mécanique factice dont trois consignes s’enchaînent par passes, jouée de bout en bout par le contrôleur avec `FakeMetronome` :
  - pas de respiration ;
  - une attaque 100 ms avant un changement compte pour lui, en avance ;
  - une attaque 300 ms avant reste dans la manche précédente ;
  - une passe sans réponse se règle en raté ;
  - la pause annule la passe ;
  - le tempo change au début du passage suivant.

  Les sessions de notes et de triades restent inchangées (leurs specs passent telles quelles).

- **`FakeMetronome.at` et `WebAudioMetronome.at`** : jamais en avance, annulation, ordre avec les temps.
- **Apprenant `skill`** : essais enregistrés, aucune carte ; aller-retour par la sauvegarde.
- **Sélecteur** : ordre de l’échelle, élément le moins récent, alternance des groupes et du sens, `countIn` au premier changement, fin après 5 min et à la fatigue, `previous` suivi.
- **Vues** (`*.svelte.spec.ts`) :
  - la grille défilante montre l’accord en cours, le suivant, le repère et l’aide ;
  - une vue factice est choisie par son exercice ;
  - `PlayFrame` met en pause et reprend.
- **De bout en bout** : un passage de relier sur D, des passages de contrainte et de jam sur `iohefy-a`, avec un vérificateur factice ; tempo suivant écrit ; bilan.

## Risques connus

- **Formes jumelles** : en jam, deux groupes peuvent sonner à l’identique, et le juge s’en moque. En contrainte, le groupe est annoncé. En zone, la largeur de 5 cases les sépare.
- **`previous` est la forme de la réponse**, pas celle d’une attaque plus tardive du même changement. Quand le joueur change de forme en cours d’accord, la forme qui sonne à la passe peut être une autre : elle reste candidate.
- **Candidats nombreux en jam** : les jumelles et les autres accords de la grille sur tout le manche. Le journal de diagnostic (variantes) dira si le juge s’y perd.
- **Attaque à cheval sur la passe** : coupée par le changement d’attente, elle rapporte une lecture courte dans la manche qui finit, et le changement suivant prend l’attaque d’après.
- Le **« Joué juste » en jeu** dure jusqu’au changement suivant : c’est court en jouant. Le bilan l’offre aussi.

## Hors périmètre

La session à deux voies (E), l’accompagnement de batterie, les formes pleines (CAGED), les tétrades jouées, les changements sur des subdivisions cliquées par le métronome, le passage des notes et des triades à `PlayFrame`, la Généralisation (`docs/todo.md`) et un éditeur de grilles.

## Réalisation (2026-10-10)

Branche `plan/voie-geste`, plan `docs/superpowers/plans/2026-10-10-voie-geste.md`, puis corrections demandées à la relecture. Ce qui suit dit où la réalisation s’écarte de la spec ou la précise.

### Écarts et décisions

- **Contrainte : le sens tourne où le manche s’arrête.** La règle seule rend toute grille injouable : sur `iohefy-a` en montant sur sol‑si‑mi, en prenant chaque fois la forme admise la plus basse, Dm 1, G 3, Dm 5, G 7, C 8, F 13, Em 15, et Ebm n’a plus de forme au-dessus de 15. Un passage de 9 changements perdait donc toujours au moins un changement, sous `PASSAGE_SUCCESS`. Désormais, à un changement où aucune forme de l’accord sur le groupe n’est strictement au-delà de `previous` dans le sens courant, le sens s’inverse à ce changement et le reste jusqu’à la fin du passage (`climbDirection`). Le sélecteur le calcule après `record()` et le porte sur les items suivants : le juge reste pur. L’aide suit le nouveau sens. La règle vaut à chaque fois que le manche s’arrête : un sens déjà inversé peut tourner encore. L’alternance d’un passage à l’autre suit le sens de départ du passage, pas le sens tourné. Sur `iohefy-a` (sol‑si‑mi et ré‑sol‑si) et `blues-f`, un passage joué en suivant l’aide est gagné.
- **Zones.**
  - Une corde à vide est dans la zone qui commence à la case 1, hors de toute autre (Em 0‑0‑0, C 0‑1‑0 et 2‑0‑1 dans 1 à 4).
  - La zone parcourt tous les départs, de 1 à `MAX_VOICING_FRET − ZONE_FRETS + 1` (13) : `ZONE_STEP_FRETS` vaut 5, modulo le nombre de départs, si bien que tous passent avant qu’un revienne (1, 6, 11, 3, 8, 13, 5, 10, 2, 7, 12, 4, 9). Une zone où un accord de la grille n’a aucune forme reste sautée.
  - **Largeur passée à 5 cases (2026-10-11).** À 4 cases, une zone n’est retenue que si chaque accord de la grille y a une forme : `iohefy-a` ne tenait que dans les zones 1, 7 et 10 (34 formes sur 61 demandées, jamais C 5‑5‑3) et `blues-f` dans 7 zones (24 sur 26). À 5 cases, les 13 zones conviennent aux deux grilles et toutes leurs formes sont demandées. Les tests ne vérifient pas la couverture morceau par morceau (choix de Cyril, pour économiser) : ils vérifient la rotation et que chaque zone visitée convient.
  - L’explication donnée d’abord (« G n’a aucune forme dans 1 à 4 ») était fausse : G a 4‑3‑3 sur sol‑si‑mi. La zone 1 à 4 était sautée parce que C et Em n’y tenaient qu’avec des cordes à vide, alors comptées hors zone ; 4 à 7 l’est pour G et Ebm.
- **Un tempo par exercice et par grille.** Une ballade et un blues progressent à part : la contrainte, la zone et le jam ont un tempo par grille ; relier garde un tempo pour l’exercice. Le cœur reste sans mécanique : une portée générique et facultative du tempo, `Execution.scope`, `Progression.scope`, `PlannedItem.tempoScope`, et `Attempt.tempoScope` sur l’essai. `startTempo` et l’écriture de fin de session travaillent par (exercice, portée) ; le contrôleur associe une consigne à son exécution par les deux, et une autre portée à un autre tempo redémarre le métronome comme un autre exercice. Une nouvelle portée commence au tempo de départ de l’exercice (80), jamais au tempo d’une autre grille. Sans portée, rien ne change. Stockage : Dexie version 7 ajoute la table `scopedProgressions` (clé `[exerciseId+scope]`) à côté de `progressions`, sans migration ; la sauvegarde reste en version 3, les champs sont facultatifs et validés (chaîne non vide). Le bilan a une ligne par exercice et grille.
- **Une seule table de qualités.** Les septièmes sont des lignes de `QUALITIES` ; le code des triades garde les qualités à trois degrés (`isTriadQuality`).
- **9 changements par grille, pas 8** (le plan se trompait) : `iohefy-a` donne Dm7, G7, Dm7, G7, Cmaj7, F7, Em7, Ebm7, Ab7 ; `blues-f` donne F7, Bb7, F7, Bb7, F7, C7, Bb7, F7, C7.
- **Signatures du cœur, en ajout facultatif** : `TimingRelation.open` reçoit `item?` et `chained?` (absent : faux) ; `PlayView.stage?` ; `Round.abandon(now?)`. Avec l’heure, une manche de grille réglée à la passe l’est même quand aucun temps n’a fermé sa fenêtre (un changement d’un temps à 160 bpm). Une pause avant la fermeture de la fenêtre, sans réponse, abandonne le changement au lieu d’enregistrer un raté, comme `BeatRound`.
- **`MechanicPresenter.stage` reçoit l’aide de la consigne** (`aids: { aid }`) en quatrième argument : l’aide dépend de `PlannedItem.aid`, que l’item ne porte pas.
- **Chaque exercice du geste a `startTempoBpm: 80`** : ils partagent la mécanique `chord-grid`, et `startTempo` prendrait sinon le tempo d’un autre.
- **Ouverture du jam** : pour chaque triade de la grille, un groupe où ses trois renversements sont acquis en ancrage.
- **Éléments de relier** : 12 fondamentales écrites comme une grille (C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B) × majeur et mineur × groupe, l’accord avant le groupe, si bien qu’à égalité les deux groupes d’un accord se suivent.
- **Aide de la contrainte sans forme de référence** : la plus basse en montant, la plus haute en descendant.
- **Bilan** : les ratés sont les changements faux (`correct` faux) ; un hors-temps n’y figure pas. Le reste du bilan n’est pas montré pour le geste.
- **Reprise après une pause** au changement suivant, comme la spec le dit : le changement interrompu n’est pas rejoué.
- **Tests** : la vue factice est donnée à `PlayFrame` par une prop `views` (par défaut `PLAY_VIEWS`) ; le choix par l’exercice est vérifié dans `stage.spec.ts`. Attentes de specs existantes changées : la liste du registre des mécaniques (`.slice(0, 4)`), le titre et le contenu du test des qualités, le nombre de tables et `verno` dans `db.spec.ts`, le harnais de `createAppServices.spec.ts` (présentateurs du geste ajoutés).

### Premier essai de relier, et refonte (2026-10-11)

- **Retour du guitariste**, sur l’application réelle : il ne savait pas quand commencer (deux mesures vides, pas de décompte) ; la grille montrait « E » partout, maintenant, ensuite et dans chaque mesure, sans jamais dire quoi jouer ; rien n’expliquait que les formes montent le manche l’une après l’autre puis redescendent ; « forme suivante » se confondait avec la consigne ; les mesures clignotaient et glissaient sans se lire comme une grille qui avance.
- **Une vue à part pour relier, `link-path`** (« le chemin sur le manche ») ; `grid-scroll` reste à la contrainte, à la zone et au jam. Le manche ne montre que le groupe du passage, de la case sous la plus basse (au moins 1, la case 0 avec une corde à vide) à la case au-dessus de la plus haute. Chaque forme distincte y est placée et numérotée dans l’ordre du jeu ; des flèches montrent la montée, une ligne dit « monte, puis redescends par le même chemin », et à la descente les flèches reviennent. Au centre, une seule chose : « MAINTENANT », le numéro de la forme, son renversement (« fondamentale sur si »), pleine sur le manche ; la suivante n’est qu’un contour, et « ENSUITE 3 » en petit. Le bloc « forme suivante » n’existe plus pour relier. Quatre cases se remplissent aux temps de la mesure en cours. Chaque forme porte le verdict de son dernier changement, encadré pour qu’une flèche d’avance ou de retard ne se lise jamais comme le chemin. Le modèle (`LinkPathModel`, union discriminée par `kind`) porte les formes dans l’ordre, le chemin, le changement en cours, le groupe, l’accord et l’aide ; le placement pur est `ui/play/views/linkPath.ts`.
- **Sans aide**, aucun point : chaque forme est un cadre sur ses cases, numéroté ; celui à jouer est rempli d’un damier fond et mi-teinte (règle de `DESIGN.md` pour une cinquième teinte), le suivant en pointillés. Le joueur cherche les cases lui-même.
- **Une seule mesure comptée** avant le premier changement d’un passage, après une reprise et entre deux passages : 4, 3, 2, 1 sur les quatre temps juste avant le changement, qui tombe sur le temps fort suivant. La manche s’ouvre toujours un temps avant son changement (l’attaque en avance compte) ; le décompte compte jusqu’au changement, pas jusqu’à l’ouverture. Le cœur reste générique : un rapport au temps peut donner `targetOffset` (le temps entre l’ouverture et la cible) ; le contrôleur prend alors sa borne comme celle de la cible et compte jusqu’à elle. Les notes et les triades n’en ont pas : rien ne change pour elles.
- **Décompte visible** : grand, dans le cadre, à la place des verdicts, avec « Départ dans ». Trouvé en route : `PixelWord` ne dessine que des lettres de notes ; un chiffre y est vide. Le cadre écrit donc le décompte en texte. **L’écran des notes et des triades (`PlayScreen`) a le même défaut** et n’a pas été touché.
- **Une consigne avant le premier passage d’un exercice dans la série** (`ExerciseDefinition.howTo`, en données, français et anglais) : le contrôleur s’arrête là, métronome arrêté, `PlayView.briefing`, puis une mesure comptée au tempo de l’exercice quand le joueur appuie sur « C’est parti » (ou Espace) ; cet arrêt remplace le redémarrage pour le tempo. La consigne du premier exercice est sur l’écran de départ (`controller.ready()`, appelé par `/session` pour le geste), sans second arrêt. Le cœur ne lit que la présence et le texte de `howTo` ; les notes et les triades n’en ont pas. Cela couvre en partie l’entrée « Présenter un exercice que le guitariste n’a jamais vu » de `docs/todo.md`.
- **`/dev/gesture`** montre relier sur `link-path`, en boucle ; `?view=grid` montre une contrainte sur `grid-scroll`.

### Risques connus

- La détection de fatigue lit les essais du geste comme des temps de réaction de mode 2 (pas de `leadBeats`), mesurés depuis la consigne : environ 750 ms au premier changement d’un passage, 150 à 200 ms aux changements enchaînés. La médiane devrait l’absorber ; non vérifié.
- Le jam donne beaucoup de candidats (les deux groupes, tous les accords de la grille sur tout le manche).
- Chaque essai du geste garde toute la grille de son passage.
- Une grille dont un accord n’a pas de forme dans une zone de 5 cases ne laisse jouer en zone qu’une part de ses formes : ce n’est le cas d’aucune grille de départ, mais rien ne le vérifie pour une grille ajoutée.

### Non vérifié

- La nouvelle vue de relier avec le son réel ; vue en capture headless sur `/dev/gesture` (1280×800, 390×844), sans texte sous 16 px ni défilement horizontal. Sur téléphone, le manche est étroit (environ 20 px par case).

- Le son réel et le vrai vérificateur d’accords.
- Une session réelle avec des changements entre deux temps (croche, triolet) : seul le rapport au temps est testé, le contrôleur n’a enchaîné que des temps entiers.
- L’affichage : vu en capture headless sur `/dev/gesture` à 1280×800 et 390×844 (aucun texte sous 16 px, pas de défilement horizontal) ; `scripts/functional-ui.mjs` ne couvre pas cette page.

## Deuxième refonte de relier : la Lane (2026-10-12)

Conçue dans la conversation du 2026-10-12, après de vraies sessions sur `link-path`. Maquette approuvée : `.impeccable/mocks/link-lane.html`.

### Retour du guitariste

- La fondamentale, dans un coin, ne se remarque pas, ni quand elle change : c'est le plus gros problème.
- Il ne sait toujours pas quand jouer l'accord suivant, ni où il en est s'il s'est perdu.
- La pause entre deux tours d'une même fondamentale casse le rythme.
- L'écran est trop lourd : des composants compliqués qui clignotent sans rien éclairer.
- Les autres exercices ont la Lane, qui dit simplement quoi jouer et quand ; monter et descendre se disent par des flèches.

### Décisions

- **La vue `link-path` est remplacée par une Lane d'une tuile par mesure.** L'accord se joue quand sa tuile touche la barre. Toutes les tuiles ont la même taille. La première tuile d'une série porte la fondamentale (« E ») ; les suivantes ne portent qu'une flèche, ↗ (forme suivante plus haut) ou ↘ (plus bas), ni chiffre ni lettre. Les tuiles passées portent leur verdict au-dessus, comme la Lane des notes. Couleurs de la Lane des notes : tuile en cours `--i`, suivante `--m`, plus loin un contour `--s`, passées en damier.
- **Le temps de la mesure** s'écrit en chiffre au-dessus de la tuile juste à droite de la barre, dans le style des numéros de temps de la Lane des notes. Pas de carrés de temps.
- **En haut à gauche**, la fondamentale en très grand, la qualité (« majeur »), puis « sur cordes » et le groupe (« sol · si · mi »). Plus de « MAINTENANT », d'« ENSUITE », de numéros de forme, ni de « où j'en suis ».
- **Pas de manche sans aide.** Le joueur cherche les formes lui-même.
- **L'aide** : le manche du groupe sous la Lane, avec les notes des deux formes à jouer dans des cercles (exception assumée aux formes carrées de `DESIGN.md`), chaque cercle de la teinte de sa tuile : forme en cours `--i`, suivante `--m`. Aucune autre forme. Elle apparaît après `LINK_AID_AFTER_MISSES` (2) changements ratés dans un tour, au changement suivant, et reste jusqu'à un tour réussi. Elle ne dépend plus du passage précédent.
- **On reste sur un accord et un groupe jusqu'à un tour réussi** (`passageSucceeded`), sans minimum ni maximum : un succès immédiat passe plus vite à une autre fondamentale, et le joueur finit toujours par réussir. Ce n'est pas un paramètre de l'exercice.
- **Pas de pause entre deux tours du même accord sur le même groupe, et pas de doublement.** Le tour suivant enchaîne sans mesure comptée et commence à la deuxième forme : la forme la plus grave, jouée à la fin de la descente, sert de départ (1 2 3 4 3 2 1 2 3 4 3 2 1…). Sa première tuile est donc une flèche ↗. Un tour enchaîné a `LINK_SHAPES` × 2 − 2 changements (6) ; le premier en a un de plus (7).
- **Une mesure comptée, et elle seule, quand l'accord ou le groupe change.** La nouvelle fondamentale prend l'écran en très grand, l'ancienne s'efface ; sa tuile arrive sur la Lane comme les autres ; le décompte s'écrit « Départ dans 3 temps ».
- **La consigne** (`howTo`, avant le premier passage de l'exercice dans la série) : jouer l'accord demandé sur les cordes indiquées en partant de sa position la plus grave, monter les renversements un par un vers l'aigu puis redescendre par le même chemin, un accord par mesure sur le premier temps ; les flèches donnent le sens. Elle montre une petite Lane d'exemple : « E » (l'accord), ↗ ↗ (monte), ↘ (descends).

### Risques connus

- Choisir de rester sur l'accord demande de savoir si le tour est réussi au moment d'ouvrir le suivant, enchaîné, alors que le dernier changement du tour peut ne pas être encore réglé (lecture d'accord en cours). À vérifier dans le contrôleur : le choix peut attendre le réglage, ou se faire au changement suivant.
- Sans doublement, rien ne marque la reprise d'un tour : c'est voulu, le guitariste jugera à l'usage.

### Réalisation (2026-10-12)

Plan : `docs/superpowers/plans/2026-10-12-relier-en-lane.md`.

- **Tours enchaînés** : `ChordGridItem.continued` marque un tour qui suit un tour du même élément ; `linkShapes(chord, set, continued)` laisse alors la forme la plus grave. Le sélecteur garde la forme qui sonne (`previous`) dans le tour enchaîné et ne compte pas de mesure. Un tour se juge sur les essais enregistrés au moment d'ouvrir le suivant ; un essai encore en lecture ne compte pas comme raté.
- **Aide** : `ElementState.aidOn`, allumée quand un tour compte `LINK_AID_AFTER_MISSES` ratés (un raté = un essai qui n'est pas `isSuccess`), éteinte quand un tour réussit ; elle vit dans la session seulement : une nouvelle session commence sans aide. La contrainte, la zone et le jam gardent l'aide au passage.
- **Vue `link-lane`** (`LinkLaneView`, placement pur `views/linkLane.ts`, modèle `LinkLaneModel`) : une tuile par changement, son bord gauche sur la barre à son changement ; `LANE_BARS_BEFORE` (2) mesures passées, `LANE_BARS_AFTER` (4) à venir ; les mesures des passages précédents viennent de l'historique, sans symbole. Pendant la mesure comptée, la vue place les tuiles sur le décompte (`countdown`, figé à chaque temps). La fondamentale fait 16 tuiles de haut, 28 pendant la mesure comptée.
- **Consigne** : la Lane d'exemple n'a pas été faite ; la consigne dit les flèches en texte (« ↗ monte, ↘ descends »), le cadre n'affichant que du texte.
- **Décompte** : « Départ dans 3 temps » (« Starting in 3 beats »), en une phrase, pour tout le geste.
- Vu en capture sur `/dev/gesture` (1280×800, 390×844) : pas de texte sous 16 px, pas de défilement horizontal. Non vérifié : le son réel, et le choix du tour suivant quand le dernier accord est encore en lecture.
