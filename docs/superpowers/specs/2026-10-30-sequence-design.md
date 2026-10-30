# La séquence (S) : des notes imposées, jugées note à note

Date : 2026-10-30. Statut : décidé avec l'auteur en brainstorming (2026-10-29 et 30). Suite de `2026-10-14-temps-musical-et-sequences-design.md` (« Reprise », « Ce que H6 laisse à S ») : la séquence s'y écrivait `round.figure` à côté de `round.expectations` (D10 de H5) et devait absorber le cycle (D8 de H6). Cette spec garde l'absorption et change la place de la figure (D10 amendée, voir § 1).

## Ce que le joueur vit

Il joue une suite de notes imposée, en rythme : l'arpège d'un accord sur une figure (quatre croches en montée-descente), un accord après l'autre sur une grille, ou un thème écrit en partition et tablature. Chaque note est jugée sur sa hauteur et sur sa place. Une fausse note en place est marquée « fausse », pas « manquée » ; une note sautée ne décale pas tout le reste. À la respiration, la phrase dit où regarder (« Mesure 6, temps 3 : sol au lieu de la ») et, pour un arpège raté, montre la forme attendue. Les niveaux montent la figure (noires, croches, doubles) et le tempo ; un niveau d'aide montre la tablature, les niveaux hauts retirent la portée puis la tablature.

Les exercices de rythme seul (contretemps, mesures muettes, 2 et 4) se jouent comme avant : ils deviennent des séquences sans hauteur.

## Pourquoi maintenant

Le passage du corpus au crible (2026-10-27) compte 13 exercices sur 43 bloqués par la séquence de hauteurs, la plus grosse pièce manquante. Neuf tirent leurs notes de l'item (l'arpège d'une forme, une position de gamme), trois d'une partition écrite. Les deux sources ont au moins deux exercices réels chacune : elles entrent ensemble.

## Décisions de cadrage

| #   | Décision                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Débit lent d'abord.** S vise le débit du détecteur de notes actuel (environ 4 notes/s). Le capteur de vérification de hauteur pour les notes rapides est une piste à part ; sa vraie limite se mesure après S, en jouant.                                         |
| C2  | **Un seul plan** pour les notes dérivées et les notes écrites, conçues ensemble ; une étape jouable au milieu du plan.                                                                                                                                              |
| C3  | **Une seule notion d'attente.** Une cible unique est déjà une liste d'une attente ; la figure n'est qu'une autre façon d'écrire des places dans cette liste. L'appariement (`first-answer` ou `alignment`) reste un réglage de la politique, pas un second concept. |
| C4  | **La réussite d'un tour de séquence** est le verdict du cycle étendu : une fausse note compte comme une attente manquée dans la fidélité ; les seuils sont des données de l'exercice.                                                                                |
| C5  | **La séquence est un savoir-faire** (`learner: 'skill'`), avec des niveaux d'exercice, sans carte FSRS. La mémoire des formes reste le travail des triades.                                                                                                       |
| C6  | **La vue des figures** (l'actuelle vue du rythme, renommée) montre la séquence ; le plan visuel 3 la redessinera.                                                                                                                                                 |
| C7  | **Les exercices réels restent privés.** Les exercices du professeur et les morceaux protégés ne vont pas dans le dépôt public : un dossier d'exercices locaux, hors git, arrive dans S (§ 6).                                                                       |

## 1. Le format : une figure dans la liste d'attentes

Une entrée de `round.expectations` écrit soit une place (`at`), comme aujourd'hui, soit une figure qui commence à `at` :

```ts
{ figure: FigureRef, at: Position, sensor, content, window }
```

- `figure` se donne comme tout nombre du gabarit : écrite (texte LilyPond), lue dans les paramètres résolus (`{ param: 'figure' }`, un id parmi `ExerciseDefinition.figures`, ce qui laisse un niveau changer de figure), ou lue sur l'item (`{ item: 'figure' }`, le rythme, dont chaque item est une figure).
- `content` vaut `null` (rythme seul), `{ from: <dérivation>, pattern? }` (notes dérivées de l'item, § 3) ou `{ from: 'figure' }` (les hauteurs écrites dans la figure).
- `compileRound` déplie l'entrée en une `Expectation` par note jouée (une liaison prolonge, un silence n'attend rien), chacune avec son contenu. La figure se répète pour remplir la longueur du tour, comme un cycle aujourd'hui. `RoundPlan` ne change pas.
- Le gabarit gagne `round.accompaniment` (une `Accompaniment` ou `{ param }`) : ses mesures « off » sont les mesures muettes du tour, et la respiration et l'écoute préalable le lisent là (§ 5).
- `roundProblem` connaît les nouvelles clés et continue de refuser les autres.

D10 de H5 (`round.figure` à côté de `round.expectations`) est amendée : la figure est dans la liste, pour qu'il n'y ait qu'un compilateur et qu'un tour puisse mêler une note posée et une figure.

## 2. Le juge : l'alignement apprend la hauteur

- **Un contenu `pitch`** (une hauteur MIDI exacte) et son juge dans `domain/judges/`, enregistrés comme tout vocabulaire. Il diffère du contenu `note` de Localiser, qui accepte toute octave possible sur la corde demandée (`acceptableMidis`).
- **L'appariement compte la hauteur.** Le coût d'une paire est l'écart de temps plus une pénalité de hauteur fausse : après une note sautée, la note juste suivante se rattache à sa propre attente ; une fausse note en place reste appariée à son attente. Le décalage d'un temps perdu ou ajouté (`shift`) reste.
- **Verdicts par attente** : `hit`, `wrong-pitch` (nouveau), `missed`, `dropped`.
- **Mesures** : la fidélité est la part des `hit` ; le placement et la précision se mesurent sur toutes les attaques appariées, fausses comprises ; les seuils restent des données (une fidélité de 1 exige zéro faute).
- **Retour** : `feedbackLine` gagne la raison « fausse note ». Une note se désigne par sa mesure et son temps, jamais par son rang ; au-delà de deux fautes, la phrase résume (« 3 fausses notes, mesures 6 et 9 ») et les marques sur la portée montrent l'endroit.
- **Validation** : l'alignement accepte un contenu qui a un juge enregistré ; il refuse toujours le temps libre, les étendues, deux attentes au même endroit et plus d'un capteur.
- `correct` d'une tentative de séquence : « aucune fausse note » ; `null` sans contenu.

## 3. L'écriture des notes

**LilyPond.** Le sous-ensemble lit des hauteurs : lettres `a` à `g`, altérations `is`/`es`, octave absolue (`'` et `,`, `c'` = MIDI 60), la hauteur qui sonne (convention `treble_8` de la guitare), et un numéro de corde optionnel `\1` à `\6` après la note. Il refuse toujours `\relative`, les accords `<…>`, `#`, `$` et toute commande autre que `\tuplet` et le numéro de corde. Les figures de rythme écrites `c` ne changent pas : leur hauteur n'est pas lue.

**La figure.** `FigureElement` (note) gagne `pitch?: Midi` et `string?: StringNumber` ; le `schema` de `figureToJson` passe à la version suivante, l'ancien se lit tel quel. La case se déduit de la hauteur, de la corde et de l'accordage standard (`midiOnString`).

**L'item d'une forme.** `{ voicing, occurrence }` : `voicing` est la clé de voicing existante (l'accord et le degré de chaque corde, de 1 à 6 cordes, triades comme tétrades : `C|maj|5:1,4:3,3:5,2:1,1:3` est le do ouvert) ; `occurrence` choisit laquelle des places de la forme sur le manche (0, la plus basse, par défaut), comme `occurrenceOfId`. « Renversement » n'est pas un champ : une source d'items peut s'en servir pour produire des clés (`closeTriadVoicings`).

**La dérivation `voicing-notes`** donne les notes de la forme de la corde grave à l'aiguë, chacune avec sa hauteur et sa corde (de là, une tablature d'aide est possible). Elle part d'un accord (fondamentale et degrés), jamais d'un symbole de table, pour que le parseur de symboles puisse changer (§ « Hors périmètre »).

**Le motif.** `pattern` : des indices à partir de 1 dans la liste dérivée, répétés sur les notes jouées de la figure (la note k prend `pattern[k mod longueur]`) ; sans motif, la liste dans l'ordre, en boucle. Exemple : Do 1ᵉʳ renversement sur sol-si-mi à la case 8, `pattern: [1, 2, 3, 2]` sur quatre croches → mi 4, sol 4, do 5, sol 4.

**Ce que la validation refuse** (ce que l'engine ne peut pas jouer, rien d'autre) : une note impossible sur sa corde (case négative ou au-delà de la dernière) ; `{ from: 'figure' }` sur une figure dont une note jouée n'a pas de hauteur ; un indice de motif au-delà de la liste (à la compilation de l'item ; les tests d'ouverture le cherchent) ; un niveau qui montre la tablature d'une figure dont une note n'a pas de corde.

**`dim7`.** La qualité attend le degré `bb7` (`chord.ts`). S l'ajoute si la grille de l'exercice de preuve en contient.

## 4. Plusieurs accords, et la vue

**Plusieurs accords** : un tour par forme, enchaînés sans trou (`handover: 'end'`), comme les changements d'un passage du geste. Les items viennent d'une liste écrite par l'exercice, chacun avec sa durée (le nombre de temps de son accord, lu comme `{ item: … }`) ; chaque accord est une tentative avec son niveau. À vérifier dans le plan : que la politique de séance accepte un tour au verdict du cycle joué une fois puis passé au suivant. Choisir les formes selon une grille et une zone, comme le fait le geste, reste hors de S.

**La vue `figure`** (`FigureView`, l'actuelle `rhythm-figure` renommée d'un coup, sans alias). `ui/notation/renderFigure.ts`, seul importateur de VexFlow, grave chaque ligne en système selon `notation` :

| `notation`      | La ligne                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| rythme seul     | une portée à une ligne, comme aujourd'hui                                |
| `staff`         | une portée en clé de sol 8 avec les hauteurs                              |
| `tab`           | une tablature à six lignes, cases et rythme sur les hampes                |
| `staff` + `tab` | portée en haut, tablature en bas, reliées (`StaveConnector`)              |

`FigureLayout` garde l'abscisse de chaque attaque : marques, curseur et lignes de retour se posent comme avant.

**`params.notation`** (`{ staff, tab }`, remplaçable par tout niveau). Par défaut : une figure aux hauteurs écrites montre portée et tablature ; une figure dérivée montre le rythme et la consigne, pas ses notes (la question, pas la réponse) ; un niveau d'aide qui écrit `notation.tab: true` grave la tablature des notes dérivées, aide que le niveau se donne et qui ne compte pas comme aidée (`levelAided`).

**La consigne** passe par la présentation de l'exercice (`presentation.primary` et les champs de l'item), rendue par `presentPrompt` au-dessus de la figure ; `figure` entre dans `PROMPT_STAGE_VIEWS`.

**Les retours** : en jeu, une marque `wrong-pitch` distincte de « manquée », sans mots ; à la respiration, la phrase du § 2, et pour une figure dérivée ratée la forme attendue avec `ChordShape` (l'image `shape`).

## 5. L'absorption du cycle

**Le rythme au nouveau format.** Les trois exercices de rythme gardent leurs niveaux (mêmes chemins : `accompaniment`, `cycleBars`, `thresholds.*`) ; leur gabarit `round` les lit :

```ts
round: {
  expectations: [{ figure: { item: 'figure' }, at: { bars: 0 }, sensor: 'attack', content: null, window: { param: 'window' } }],
  accompaniment: { param: 'accompaniment' },
  length: { bars: { param: 'cycleBars' } },
  policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' }, thresholds: { param: 'thresholds' } }
}
```

Un test fige, pour chaque exercice et chaque niveau, que le plan compilé est le même qu'avant.

**Ce qui devient générique** : la respiration et l'écoute préalable jouent `round.accompaniment` du tour compilé ; `listenInBars` et `countIn` passent dans `pacing` pour tout exercice (0 et `true` par défaut ; `checkStart` refuse toujours les deux à la fois) ; `entryBars` se déduit de l'accompagnement ; `recordCycle` se fond dans `recordResponse` ; `levelAided` devient générique ; `cycleStage` devient `figureStage`, construit depuis le plan.

**Ce qui est supprimé** : `compileCycle`, la porte de `compilePlan` entre cycle et gabarit, `rhythmExercise.ts` (`rhythmParamsOf`, le `LevelParams` du rythme), `CyclePlanRecord`, et le test de frontière du cycle, devenu sans objet.

**Les mécaniques** : `rhythm-figure` devient `figure` (items : les figures de l'exercice ; capteur : `params.sensor`, les attaques par défaut), avec sa source `createFigureSource`. Nouvelle : `voicing-figure` (items `{ voicing, occurrence }`, capteur de notes ; ses champs d'item, la dérivation `voicing-notes`, l'image `shape`). Le juge `pitch` et sa vue de faute sont génériques.

**Le stockage : Dexie 12, backup 8** (le chantier 2 passe à 13). `v12.ts`, fonction pure appliquée par la mise à jour et par l'import : chaque `CyclePlanRecord` stocké devient un `RoundPlanRecord` (avec `startAudioS`), recompilé depuis ce qu'il contient (figure, mesures, accompagnement, tempo, fenêtre, seuils) par la version figée de `compileCyclePlan` dont il a besoin (test fil-piège) ; le `mechanic` `rhythm-figure` des tentatives devient `figure`. Un backup 8 refuse `CyclePlanRecord` et `rhythm-figure`. L'oracle (`/diagnostic/oracle`) ne lit plus que `RoundPlanRecord`.

## 6. Exercices locaux et conversion MusicXML

**`exercises.local/`**, à la racine, dans `.gitignore` : un fichier JSON par exercice, au format `ExerciseDefinition` (figures en texte LilyPond). Chargés au build par `import.meta.glob`, passés à `validateExercise` et aux validateurs de présentation et d'écran, ajoutés au catalogue ; un fichier refusé est signalé avec la raison du validateur, jamais ignoré en silence. L'accueil les liste avec les exercices de séance d'exercice. Le chantier 2 reprend le reste (composition de séances, édition, partage).

**`scripts/musicxml-to-lilypond.mjs`** (outil de dev, testé sur un petit MusicXML neutre) :

- une partie à une voix → notre LilyPond : hauteurs calculées depuis la corde et la case de la tablature (l'export écrit la guitare une octave au-dessus du son ; la tablature dit ce qui sonne), durées, liaisons, triolets, barres, numéros de corde ; une levée remplie de silences ; signale ce qu'il n'exprime pas (accords, ornements, voix supplémentaires, techniques de jeu), sans l'avaler en silence ;
- une partie en accords → la liste des formes mesure par mesure (cordes et cases), à nommer par leur symbole pour en faire des items `{ voicing, occurrence }`.

Ses sorties vont dans `exercises.local/`. Ni le fichier source ni le résultat n'entrent dans le dépôt.

## 7. Preuves et tests

**Preuves réelles, privées** : la pratique en cours de l'auteur, un thème de jazz (protégé : domaine public en France en 2030) et les tétrades sur sa grille, écrits dans `exercises.local/` depuis son export Guitar Pro. Les tétrades sur la grille (notes dérivées, plusieurs accords enchaînés) sont **l'étape jouable du milieu du plan** ; le thème (notes écrites, portée et tablature, figure longue) vient à la fin. Les croches en triolet du thème à ♩ = 93 font environ 4,7 notes/s : son premier niveau se joue plus lent (autour de ♩ = 70), et la pratique dira où le capteur décroche.

**Tests publics, sur de la matière commune** (triades arpégées, une gamme en position) :

- plan figé du rythme, avant et après ;
- `randomExercise` tire des entrées à figure (trois contenus, des motifs) ; `openness.spec.ts` joue chaque exercice accepté avec les bonnes notes, sans notes et avec de fausses notes ;
- le juge : note sautée, fausse note en place, temps perdu sous des fausses notes ;
- le parseur LilyPond (hauteurs, octaves, cordes, refus) ; la dérivation et le motif ; la validation (§ 3) ;
- `v12.ts` et son fil-piège ; les frontières (LilyPond dans `domain/exercise/` et `ui/notation/` seulement ; le cœur ne nomme ni mécanique ni exercice ; `thirdMechanic.spec.ts`) ;
- le chargement des exercices locaux (fichier valide, fichier refusé et signalé) ; le script de conversion ;
- `scripts/functional-ui.mjs` sur la vue `figure` sous ses trois formes (`/dev/rhythm` les montre), chiffres de tablature compris dans la règle des 16 px.

Garde de fusion : `npm test && npm run check`.

## Hors périmètre

- **Les notes rapides** : le capteur de vérification de hauteur sur séquence et les attaques legato (C1).
- **N'importe quel accord** : l'auteur veut que les joueurs puissent utiliser tout accord, y compris ceux que les tables ne listent pas. Deux moitiés : du nom aux notes (une grammaire qui engendre les symboles, `\chordmode` de LilyPond ou autre, à la place de `parseChordSymbol` et de sa table ; S la rend possible en dérivant depuis l'accord, pas depuis le symbole) et des notes aux cordes (un générateur de formes pour 4 à 6 notes). À ouvrir en issue.
- **Choisir les formes selon une grille et une zone** (« Tétrades en arpèges sur une grille » tel que le corpus l'écrit) : une sélection comme celle du geste.
- **Le swing comme paramètre** (rapport des croches) : le thème de preuve l'écrit déjà en triolets ; il entrera avec un second exercice réel qui en a besoin.
- **Les positions de gamme** (dérivation d'une gamme dans une position) : se branchent sur le même motif, plus tard.
- **D'autres accordages, plus de six cordes** : une donnée de l'exercice le jour où un exercice réel le demande.
- **Le dessin définitif de la vue** : le plan visuel 3.
- **Le concept de mécanique** : l'auteur doute qu'il convienne au projet ; S n'y ajoute que ce qu'il lui faut, la question se rouvre plus tard.

## Risques

- **Erreurs d'octave** du détecteur de hauteur : le contenu `pitch` est exact, une note lue à l'octave serait fausse. Mesuré sur les prises réelles après S.
- **Débit** : un thème réel dépasse par endroits le débit du capteur ; les niveaux lents le contiennent, la pratique le mesure.
- **Tours enchaînés au verdict du cycle** (§ 4) : à vérifier en premier dans le plan.
