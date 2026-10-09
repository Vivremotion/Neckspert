# Design — retours de la voie de la mémoire

Date : 2026-10-09. Statut : approuvé dans la conversation du 2026-10-09, en deux parties (jugement, écran).

Suite de C1 (`2026-10-08-voie-memoire-triades-design.md`), avant sa fusion. Vient des premières sessions « Triades » jouées le 2026-10-08. L’amélioration de la reconnaissance elle-même (justesse du capteur) vient après la fusion ; ici on ne change que le moment des lectures, la règle du premier accord et ce que l’écran montre.

## Constats

1. **Un accord faux puis le bon, dans la bande, est compté juste.** Le capteur cumule le spectre de chaque attaque pendant 2 s (maximum par fréquence) : le second accord se fond dans la lecture de la première attaque, que le juge reconnaît alors comme attendue.
2. **Le bilan ne montre pas toutes les erreurs.** La liste des accords refusés ne retient que les fautes sur l’accord ; une fondamentale fausse ou absente, ou aucun accord dans la bande, n’y figurent pas. Et sans repère, on ne se souvient plus des consignes.
3. **Le verdict arrive parfois après la bande.** Le capteur ne juge qu’à 250, 500, 1000 et 2000 ms après l’attaque ; un accord faux ou non reconnu n’est final qu’à 2 s. Le guitariste croit ne pas avoir été entendu et rejoue l’accord de plusieurs façons : la confiance dans l’application s’érode.
4. **L’aide « 2‑3‑2 » ne dit pas à quelle corde va chaque case.**
5. **Après un raté, on ne sait pas ce qui a été entendu** : bon accord avec la fondamentale sur une autre corde, autre renversement… Le guitariste ne sait pas si l’erreur vient de lui ou du juge.

## 1. Le jugement

### Capteur d’accords (`NnlsChordVerifier`)

- **Jugement continu.** Le spectre est déjà calculé toutes les ~21 ms. Après la première lecture (`FIRST_READING_MS` = 250 ms, la fenêtre d’analyse dure 170 ms et le début n’est que transitoire), le capteur juge toutes les `JUDGE_EVERY_MS` (100 ms) jusqu’à `LAST_READING_MS` (2000 ms). Un jugement coûte environ 1 ms (6 ms au pire avec 6 candidats, prise du 2026-10-08).
- **Lecture finale** (`ChordReport.final`), la première de ces conditions :
  - la forme décidée est attendue (règle actuelle) ;
  - la même forme non attendue est décidée `STABLE_READINGS` (3) jugements de suite ;
  - rien n’est décidé à `NOTHING_FINAL_MS` (1000 ms) ;
  - la dernière lecture (2000 ms), ou la fenêtre coupée par le retrait de l’attente (règle actuelle).

  Après une lecture finale, l’attaque ne rapporte plus rien.

- **Attaques séparées.** Une attaque dont la lecture est finale cesse de cumuler son spectre ; une nouvelle attaque ouvre sa propre fenêtre, qui ne contient que ce qui a sonné depuis elle. Un accord faux puis le bon donnent ainsi deux lectures distinctes. Un arpège n’est pas coupé : tant que la première note sonne seule, rien n’est décidé, sa fenêtre cumule les notes suivantes. Risque connu : deux notes d’un arpège décidées comme une autre forme, stable, avant la troisième ; à surveiller dans les données de jeu réel.
- **Journal de diagnostic.** Chaque lecture y est écrite ; le spectre n’accompagne que les lectures à 250, 500, 1000, 2000 ms et la lecture finale, pour ne pas multiplier le volume du journal.
- Les variantes du juge restent jugées côte à côte, à chaque lecture.

### Ancrage : seul le premier accord compte

- La première attaque d’accord dans la bande (temps 2 à la fin de la mesure) est la réponse ; ses lectures la précisent jusqu’à la finale (règle actuelle).
- **Lecture finale fausse** (forme non attendue ou rien de reconnu) : la manche affiche aussitôt un raté **provisoire**, avec ce qui a été entendu, comme le raté provisoire du hors temps. Elle continue d’écouter jusqu’à la fin de la bande (avec l’attente des lectures d’une attaque tardive, règle actuelle).
- Une attaque suivante dans la bande lue juste (lecture finale attendue) tranche la manche en **`corrected`**. Sinon, la manche reste un raté (`wrong`) à la fin de l’attente.
- Une fondamentale fausse ou absente décide le raté comme aujourd’hui ; la correction ne porte que sur l’accord.
- **La zone** garde « premier accord = réponse », sans correction : sa cible est sur le temps, sans bande. À reconsidérer plus tard.

### Le verdict « Corrigé »

- Nouveau verdict `corrected`, ordre : perfect > early/late > offbeat > corrected > wrong.
- **Compté comme un raté partout** : `correct: false`, `isSuccess` faux, FSRS Again, jamais rappel direct, raté pour le rythme d’introduction et le rattrapage. Le premier rappel était faux ; la correction est saluée à l’écran sans gonfler l’apprentissage.
- `Attempt.data` de l’ancrage : `answer` garde la fondamentale, le premier accord et la correction (`{ root, chord, correction }`) ; la confusion est celle du premier accord.
- Verdict stocké comme une chaîne : pas de nouvelle version de la base. La sauvegarde (version 3) accepte `corrected`.
- Un sprite propre dans `VerdictSprite`, dans les quatre tons ; bandeau « Corrigé » / « Corrected ».

## 2. L’écran

### Les deux dessins d’une forme

- Brique commune `ChordShape` : une forme (cordes et cases) dessinée dans l’un des deux styles :
  - **`strings`** : les six cordes en lignes horizontales, aiguë en haut, comme l’aide de localisation (`StringDiagram`) ; les cordes de la forme en trait épais, avec leur nom et leur case ;
  - **`grid`** : diagramme d’accord, cordes verticales, cases horizontales, points sur les cases, case de départ écrite à côté quand la forme ne part pas du sillet.
- **Réglage** `Settings.chordDiagram: 'strings' | 'grid'`, par défaut `strings`. L’écran Réglages propose « Dessin des accords » avec un aperçu de chaque style. Un réglage manquant (données existantes, sauvegardes) vaut `strings`.
- **Imposé par l’exercice** : `ExerciseDefinition.chordDiagram?` l’emporte sur le réglage. Aucun exercice ne le fixe pour l’instant ; il sert à décider plus tard, après avoir essayé les deux.
- **L’aide de l’ancrage** (présentation aidée) devient ce dessin sous la consigne, à la place de « 2‑3‑2 ». Le présentateur fournit la forme (`PromptView.shape`), pas un texte ; l’aide de la zone (« fondamentale sur si ») reste un texte.

### « Joué / Attendu » dans le verdict

- Après un raté ou un « Corrigé » de triade, pendant la respiration : le sprite rétrécit à côté du bandeau ; la boîte montre **Joué** et **Attendu**, deux petits dessins côte à côte dans le style en vigueur, et une ligne qui nomme l’écart : « autre renversement », « autre qualité », « autre octave », « rien de reconnu », « pas d’accord dans la bande », « fondamentale entendue : D# ».
- Sans forme reconnue ou sans accord, **Joué** porte ce texte au lieu d’un dessin. Pour un « Corrigé », Joué est le premier accord, celui qui compte.
- **Attendu** est la forme demandée : en ancrage, l’occurrence la plus proche de celle jouée quand il y en a une, sinon la plus basse ; en zone, celle de la position demandée.
- Le raté provisoire montre déjà Joué / Attendu ; le passage à « Corrigé » change le bandeau et le sprite.
- Un essai juste n’affiche rien de plus qu’aujourd’hui. La localisation et l’identification gardent leur correction en texte.
- Contrat : `VerdictView.heard`, `expected` (formes ou null), `gap` (texte ou null), fournis par le présentateur à partir de la réponse et de la confusion.

### Contester pendant le jeu

- Après un raté ou un « Corrigé » d’une mécanique contestable, un bouton **« Joué juste »** apparaît dans la boîte du verdict, avec la touche **Entrée** (une pédale USB peut l’émettre). La barre d’espace reste la pause.
- Disponible jusqu’à l’apparition de la consigne suivante. Une fois pressé : « Contesté », sans retour arrière.
- Comme avant : `contested: true` sur l’essai, FSRS intact. Échafaudage à retirer quand les variantes et l’arbitre de B3 suffiront.
- Le cœur ne nomme aucune mécanique : `MechanicPresenter.contestable?: boolean`, vrai pour les deux mécaniques de triades. `PlaySessionController.contest()` ; `PlayView.contest: 'available' | 'done' | null`. L’essai pouvant être écrit après le verdict (capture, corrections), la contestation attend son écriture.
- La liste « accords refusés » quitte le bilan (`SessionSummary.triads.refused`, `refusedView`, `oncontest`).

### Dette assumée

`PromptView.shape`, `VerdictView.heard` / `expected` / `gap` et `PlayView.contest` s’ajoutent au contrat commun de l’écran de jeu. Ils rejoignent la liste de l’entrée « Une vue de jeu par mécanique » de `docs/todo.md`.

## 3. Tests

- **Capteur** : jugement continu (lectures toutes les 100 ms après 250 ms) ; finale par forme attendue, par stabilité, par rien de reconnu à 1 s ; une attaque finale ne cumule plus, la suivante est lue seule ; un arpège n’est pas coupé ; spectre au journal aux seuls points prévus ; fixtures réelles rejouées sans régression.
- **Ancrage** : accord faux puis juste → raté provisoire puis `corrected` ; accord faux seul → raté à la fin de l’attente ; accord juste d’emblée → inchangé ; correction après la bande → ignorée ; fondamentale fausse → raté sans correction.
- **Notation** : `corrected` compte comme un raté (FSRS Again, `isSuccess` faux, pas de rappel direct, rattrapage) ; la sauvegarde l’accepte.
- **Écran** : les deux styles ; réglage et style imposé par l’exercice ; aide dessinée ; Joué / Attendu et l’écart ; bouton et touche Entrée, fin de la contestation à la consigne suivante, contestation écrite sur l’essai ; plus de liste au bilan.
- **De bout en bout** : la session Triades du spec C1, avec une correction.

Barrière de fusion : `npm test && npm run check`, puis vérification dans Chrome sans tête.

## Hors périmètre

Justesse de la reconnaissance (après la fusion de C1), correction en zone, une vue de jeu par mécanique (`docs/todo.md`), marque « entendu » à l’attaque.
