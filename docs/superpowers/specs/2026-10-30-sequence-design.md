# La séquence (S) : des notes imposées, jugées note à note

Date : 2026-10-30. Statut : décidé avec l'auteur en brainstorming (2026-10-29 et 30). Suite de `2026-10-14-temps-musical-et-sequences-design.md` (« Reprise », « Ce que H6 laisse à S ») : la séquence s'y écrivait `round.figure` à côté de `round.expectations` (D10 de H5) et devait absorber le cycle (D8 de H6). Cette spec garde l'absorption et change la place de la figure (D10 amendée, voir § 1).

## Ce que le joueur vit

Il joue une suite de notes imposée, en rythme : l'arpège d'un accord sur une figure (quatre croches en montée-descente), un accord après l'autre sur une grille, ou un thème écrit en partition et tablature. Chaque note est jugée sur sa hauteur et sur sa place. Une fausse note en place est marquée « fausse », pas « manquée » ; une note sautée ne décale pas tout le reste. À la respiration, la phrase dit où regarder (« Mesure 6, temps 3 : sol au lieu de la ») et, pour un arpège raté, montre la forme attendue. Les niveaux montent la figure (noires, croches, doubles) et le tempo ; un niveau d'aide montre la tablature, les niveaux hauts retirent la portée puis la tablature.

Les exercices de rythme seul (contretemps, mesures muettes, 2 et 4) se jouent comme avant : ils deviennent des séquences sans hauteur.

## Pourquoi maintenant

Le passage du corpus au crible (2026-10-27) compte 13 exercices sur 43 bloqués par la séquence de hauteurs, la plus grosse pièce manquante. Neuf tirent leurs notes de l'item (l'arpège d'une forme, une position de gamme), trois d'une partition écrite. Les deux sources ont au moins deux exercices réels chacune : elles entrent ensemble.

## Décisions de cadrage

| #   | Décision                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Débit lent d'abord.** S vise le débit du détecteur de notes actuel (environ 4 notes/s). Le capteur de vérification de hauteur pour les notes rapides est une piste à part ; sa vraie limite se mesure après S, en jouant.                                         |
| C2  | **Un seul plan** pour les notes dérivées et les notes écrites, conçues ensemble ; une étape jouable au milieu du plan.                                                                                                                                              |
| C3  | **Une seule notion d'attente.** Une cible unique est déjà une liste d'une attente ; la figure n'est qu'une autre façon d'écrire des places dans cette liste. L'appariement (`first-answer` ou `alignment`) reste un réglage de la politique, pas un second concept. |
| C4  | **La réussite d'un tour de séquence** est le verdict du cycle étendu : une fausse note compte comme une attente manquée dans la fidélité ; les seuils sont des données de l'exercice.                                                                               |
| C5  | **La séquence est un savoir-faire** (`learner: 'skill'`), avec des niveaux d'exercice, sans carte FSRS. La mémoire des formes reste le travail des triades.                                                                                                         |
| C6  | **La vue des figures** (l'actuelle vue du rythme, renommée) montre la séquence ; le plan visuel 3 la redessinera.                                                                                                                                                   |
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

| `notation`      | La ligne                                                     |
| --------------- | ------------------------------------------------------------ |
| rythme seul     | une portée à une ligne, comme aujourd'hui                    |
| `staff`         | une portée en clé de sol 8 avec les hauteurs                 |
| `tab`           | une tablature à six lignes, cases et rythme sur les hampes   |
| `staff` + `tab` | portée en haut, tablature en bas, reliées (`StaveConnector`) |

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
- **L'arpège qui continue d'un accord à l'autre** : sur une grille, chaque accord repart de la première note de sa forme (`form-figure`). Enchaîner en gardant le fil, sans revenir à la première note, viendra plus tard.
- **Le concept de mécanique** : l'auteur doute qu'il convienne au projet ; S n'y ajoute que ce qu'il lui faut, la question se rouvre plus tard.

## Risques

- **Erreurs d'octave** du détecteur de hauteur : le contenu `pitch` est exact, une note lue à l'octave serait fausse. Mesuré sur les prises réelles après S.
- **Débit** : un thème réel dépasse par endroits le débit du capteur ; les niveaux lents le contiennent, la pratique le mesure.
- **Tours enchaînés au verdict du cycle** (§ 4) : à vérifier en premier dans le plan.

## Réalisation (2026-10-30)

Branche `plan/sequence-s` (plan `docs/superpowers/plans/2026-10-30-s-sequence.md`, treize tâches, une tâche 12b et une tâche 14). Ce qui suit dit où la réalisation s'écarte de la spec ou la précise. Les rapports de tâche et le registre des décisions de l'exécution sont dans `.superpowers/sdd/2026-10-30-s-sequence/` (ignoré par git).

### Après le premier essai de l'auteur

L'essai a montré deux exercices inutilisables : le Thème, 49 mesures sur 10 000 px de haut qu'aucun défilement ne suivait, précédé de 2 min 48 d'écoute ; les Tétrades, sans aucune aide pour qui ne connaît pas encore les formes, le niveau d'aide écrit étant inatteignable. Quatre pièces génériques, aucune propre à ces exercices :

- **`neck: true` sur un niveau** dessine sur le manche les notes que le tour dérive de son élément (image `neck`). La forme entière, même sur un changement qui n'en joue que deux : c'est elle qui s'apprend.
- **Le nom d'une note suit la forme** (`movedForm`, `spelledLike`), donc E♭ G B♭ D♭ sur E♭7. La portée, elle, écrit toujours en dièses.
- **`flow.levelChange: 'next-round'`** applique un niveau au tour enchaîné suivant, s'il garde le tempo, sans l'annoncer. Sans lui, l'aide revenait à la fin de la grille, trois minutes plus tard.
- **La vue `figure` garde sa hauteur** et suit la ligne jouée ; **`flow.demonstration: false`** retire l'écoute de la première rencontre.

L'aide s'écrit comme un niveau ordinaire, pas `aid: true` : on ne descend à un niveau d'aide que par l'anti-blocage. La liaison du Geste a presque la même règle codée en dur (`LINK_AID_AFTER_MISSES`) : elle pourra passer par ces pièces quand le Geste deviendra de la donnée.

Le deuxième essai a montré un autre manque : pendant le jeu, rien ne dit si la note a été reconnue, juste, ni en place, et le doute s'installe. **`liveMarks: true` sur un niveau** marque chaque note sous la ligne jouée, avec les formes du bilan et sans chiffres. Le Thème étant un seul round de 49 mesures, attendre son verdict ne convenait pas, et relancer le juge à chaque note coûtait une dizaine de millions de cases en fin de morceau : `Pairing.live` n'aligne que ce qui n'est pas encore tranché, avec les mêmes coûts mais sans chercher de temps perdu, et ne revient jamais sur ce qu'il a dit (`alignPlain`). Un silence n'est dit qu'une fois passé `LIVE_READING_MARGIN_S` et la latence du capteur après la fin de sa zone : sans cette marge, le premier essai avec un vrai détecteur comptait « manquée » une note jouée tard dont la lecture arrivait après. Ce n'est pas une `Aid` enregistrée : elle dit ce qui vient d'être joué, pas ce qu'il faut jouer.

### Les dix décisions du plan

- **D1 — Une figure se désigne par son id.** `figure: { id } | { param } | { item }` ; la spec disait « écrite (texte LilyPond) ». Les figures sont listées une fois dans `ExerciseDefinition.figures` (texte LilyPond, parsé au chargement) : il n'y a pas deux façons d'écrire la même figure. Le gabarit gagne aussi `round.accompaniment` (une `Accompaniment` ou `{ param }`), comme la spec le prévoyait.
- **D2 — Toute note d'une figure porte sa hauteur.** Le parseur donne à chaque note sa hauteur MIDI (`c` = do 3, MIDI 48) ; les figures du rythme gardent `c`, leur hauteur n'est lue que par un contenu `{ from: 'figure' }`. Le JSON de figure passe au schéma 2 ; le schéma 1 se lit toujours (sans hauteur) et devient du schéma 2.
- **D3 — `domain/time/` garde des nombres.** `FigureElement` gagne `pitch?: number` (MIDI) et `string?: number` (1 à 6) sans importer `domain/music`.
- **D4 — Une fidélité sans seuil exige zéro faute.** `thresholds.fidelity` (part des `hit`, de 0 à 1), quand un niveau l'écrit, laisse passer un tour dont la fidélité l'atteint malgré des notes manquées ou fausses ; les autres raisons d'échec (en trop, décalage, régularité, tenue, précision) restent. La spec disait « les seuils restent des données » sans nommer celui-ci.
- **D5 — `WRONG_PITCH_COST = 0.5`.** Une paire coûte au plus 1 par le temps seul ; une note fausse en place coûte donc moins qu'une attente manquée plus une attaque en trop (2), et une note juste voisine gagne sur elle. L'anti-blocage traite une fausse note comme une manquée (la même fausse note deux fois est un problème de lecture, jamais d'exécution).
- **D6 — Une attaque garde sa dernière lecture finale.** Le capteur de notes peut relire une attaque ; l'alignement garde, par instant d'attaque, la dernière charge `final`, sinon la dernière reçue.
- **D7 — `listenInBars` et `countIn` passent dans `pacing`** pour tout exercice (0 et `true` par défaut). Les trois exercices du rythme écrivent `pacing.listenInBars: 2` (l'ancien `LISTEN_IN_BARS`) et gardent leur comportement ; leurs niveaux qui surchargeaient `listenInBars`/`countIn` écrivent désormais `pacing.*`.
- **D8 — L'item d'une forme porte sa durée.** `VoicingFigureItem = { voicing, occurrence, beats? }`, clé `${voicing}@${occurrence}` suivie de `@${beats}` quand il y en a. Un exercice enchaîne ses formes par `ExerciseDefinition.items` (clés d'items de sa mécanique) ; la longueur du tour lit `{ item: 'beats' }`. Les tours enchaînés au verdict du cycle, le premier risque de la spec, se sont joués sans changement du moteur (tâche 9 : des tests et un banc seulement).
- **D9 — `rhythm-figure` devient `figure` en un coup** : identité, catalogue, vue, tentatives stockées (Dexie 12). Sa clé d'item ne change pas (`${figureId}@${level}`). `createFigureSource` est remplacée par `createExerciseItemSource` (`series/itemSource.ts`), qui sert les `items` de l'exercice, sinon ses figures. Une tentative a une seule forme : `RoundPlanRecord` remplace `CyclePlanRecord`, `roundAttempt` remplace `recordCycle`. Un exercice qui écrit une figure et des niveaux se joue en séance d'exercice (`exerciseSessionExercises()`, une fonction sur le catalogue vivant et non une constante, pour que les exercices locaux apparaissent à l'accueil) ; le dossier `application/session/cycle/` n'existe plus.
- **D10 — Le dossier local est lu au build de développement seulement**, comme du texte : `import.meta.glob('/exercises.local/*.json', { eager: true, query: '?raw' })` derrière `import.meta.env.DEV`, si bien qu'un build de production n'emporte aucun exercice privé (vérifié en cherchant l'id d'un fichier factice dans `build/`). Chaque texte est lu en JSON dans `readLocalExercises` : une virgule oubliée refuse le fichier avec l'erreur du lecteur, au lieu d'arrêter le serveur de développement ou le build. Un fichier refusé n'arrête pas l'application : la raison va à la console et sur l'accueil. Le format est décrit dans `docs/exercices-locaux.md` avec de la matière commune.

### Précisions et écarts

- **Le juge.** Le contenu `pitch` (hauteur exacte, `{ midi, string? }`) et le contenu `note` de Localiser (toute octave possible sur la corde) restent deux contenus. Une fausse note en place est `wrong-pitch` dans le rapport du cycle, la marque est distincte de « manquée » ; la fidélité est la part des `hit`, le placement et la précision se mesurent sur toutes les attaques appariées. Un capteur d'attaques apparié à un contenu `pitch` rend une fausse note (pas d'exception).
- **Une figure remplit n'importe quelle durée (tâche 12b).** La spec disait « se répète pour remplir la longueur du tour » et la validation refusait une durée qui n'était pas un nombre entier de boucles. Une grille réelle change d'accord sur des durées variées, dont des changements de 2 temps, et sur des temps qui ne sont pas le premier d'une mesure : `figureExpectations` coupe maintenant la dernière boucle à la fin de la durée (une attaque sur la fin revient au tour suivant). Le plan figé du rythme ne change pas. La vue suit : le modèle d'écran grave la figure telle que le tour la joue (`loopFigure`, `domain/time/figure.ts` : bouclée sur le tour, la dernière boucle coupée, les notes au-delà écrites en silences pour garder la dernière mesure entière ; une seule boucle quand le tour en joue un nombre entier, chacune sur les mêmes notes), si bien que les marques, la « mesure N » dite et la tablature d'aide tombent sur les notes demandées ; les mesures se comptent entières (« mesure 1 / 1 » pour 2 temps), et un tour qui commence au milieu d'une mesure est suivi depuis son propre premier temps.
- **`correct` compte aussi les notes manquées.** La spec dit « aucune fausse note » ; le code (`cycleCorrect`, `series/recordResponse.ts`) dit qu'aucune attente n'est `wrong-pitch` ni `missed` : un accord dont une note manque n'a pas été joué juste. Gardé ainsi ; une attente qu'un temps perdu écarte (`dropped`) n'est ni l'une ni l'autre.
- **Les items listés sont vérifiés.** `validateExercise` lit chaque `items[i]` par sa mécanique (`parseItem`) et compile le tour sur lui à chaque niveau d'exercice : une occurrence que le manche n'a pas, une clé illisible ou une note de `pattern` au-delà de la forme sont refusées en nommant `items[i]` et le niveau, au lieu d'arrêter la série dans un réveil du transport. Un fichier local passe par là.
- **L'écoute et le décompte sont vérifiés.** `pacing.listenInBars` (un entier positif ou nul) et `pacing.countIn` (un booléen) le sont dans les params et à chaque niveau d'exercice, comme le refus d'aucune mesure d'écoute sans mesure décomptée, qui ne levait qu'au départ d'une course (`checkStart`).
- **Le capteur s'écrit dans le tour.** Les trois exercices du rythme ne portent plus `params.sensor` : leur tour écrit `sensor: 'attack'`, et rien ne lisait le paramètre.
- **Des listes dérivées.** `ContentDerivation` gagne `list?: true` : une entrée de figure exige une dérivation qui donne une liste, une entrée de point la refuse (un tableau ne doit pas atteindre un juge). Les assistants `landingBar`, `accompanimentFrom` et `unmuted` vivent dans `domain/time/accompaniment.ts`.
- **Les formes.** L'occurrence 1 d'un exemple de la spec dépassait `MAX_VOICING_FRET` : le test utilise la forme `C|maj|3:5,2:1,1:3` (0-1-0 puis 12-13-12). Dans la phrase de faute, les notes portent les lettres de l'application (« A au lieu de G »), pas le solfège de l'exemple de la spec : un seul nom par concept ; deux notes de même nom mais d'octaves différentes sont dites comme une erreur d'octave.
- **La vue.** `figure` est dans `PROMPT_STAGE_VIEWS` ; l'écran dépend de la vue de l'exercice (`stage.ts`), et un exercice de figure doit écrire `view: 'figure'` (`screenProblem` le refuse sinon). Les notes dérivées sont écrites dans le modèle d'écran pour la tablature d'aide.
- **`notation` se pose par les niveaux d'exercice.** Comme tout paramètre de figure (`feedback`, `listen`, `cursor`, `thresholds`), il est lu au niveau de l'exercice, pas de l'item : la spec disait « remplaçable par tout niveau ». Un niveau d'item (une échelle) ne peut pas montrer la tablature.
- **Les altérations s'écrivent en dièses sur la portée.** Une `Figure` ne garde que la hauteur MIDI ; une armure ou une orthographe demandent un champ de plus. Un thème en tonalité de bémols s'engrave donc « La# » pour « Si♭ » tant que ce champ n'existe pas.
- **À la respiration, les marques jouées restent sur la ligne de rythme**; la portée ne sert qu'à la grande gravure et à la figure suivante. Le plan visuel 3 redessine la respiration.
- **L'oracle.** `/diagnostic/oracle` ne lit que `RoundPlanRecord` (fourni par la tentative, avec son tempo et ses seuils) ; il enchaîne deux cycles quand l'un commence à moins d'un temps de la fin de l'autre (le plan stocké ne porte pas de mètre ; c'était une mesure).
- **Stockage.** Dexie 12 / sauvegarde 8 (`v12.ts`, pur, appliqué par la mise à jour et par l'import) : `rhythm-figure` devient `figure` (clé de carte comprise) et chaque `CyclePlanRecord` devient le `RoundPlanRecord` qu'il jugeait, recompilé par une copie figée de l'ancien compilateur de cycle, fil-piège contre `figureExpectations` ; un plan illisible devient null. Les fixtures de stockage utilisent l'identité figée du rythme (`RHYTHM_FIGURE_RULES_V11`). Le chantier 2 prend la version 13.
- **Seuils lus au niveau de l'exercice.** Les seuils du verdict (`readsThresholds`) se lisent au niveau d'exercice seulement ; aucune échelle d'item n'en écrit. Un seuil d'item est ignoré.
- **Pas de `round.figure`.** Le `roundProblem` continue de refuser toute clé de `round` qu'il ne connaît pas ; la figure est dans la liste des attentes, comme l'amendait déjà la spec.
- **Le MusicXML.** `npm run musicxml -- <fichier> --part P1` ou `--shapes P2`, sans bibliothèque XML. Il lit les consignes `string`/`fret` des exports Guitar Pro (y compris dans les instructions de traitement `<?GP …?>`), une seule voix par partie, l'accordage standard déclaré dans l'une ou l'autre octave, les silences (`forward` compris), les triolets et les liaisons ; il signale par un avertissement ce qu'il n'exprime pas (accords dans une partie à une voix, ornements, capodastre, triolet ouvert en fin de mesure, écrit tout de même avec son avertissement).

### Ce qui reste ouvert, pour le jeu

- **Deux trous connus de la tâche 12b** : la démonstration et le « joué avec » restent silencieux sur un changement plus court que sa figure ; un tour qui ne commence pas sur le premier temps repart au début d'une figure de plusieurs mesures (une figure d'une mesure n'est pas touchée). L'affichage d'un changement de 2 ou 6 temps, ou hors premier temps, est corrigé et contrôlé par des tests (`figureStage.spec.ts`, `sequenceSession.spec.ts`, `FigureView.svelte.spec.ts`) : ce n'était pas qu'un défaut d'affichage, la tablature d'aide levait sur les notes sans hauteur dérivée.
- **À la respiration, les marques de toute la course se posent sur la figure du dernier tour.** Une course qui enchaîne des changements de durées différentes montre donc les marques des autres tours sur une gravure qui n'est pas la leur ; le plan visuel 3 redessine la respiration.
- **Notes rapides, erreurs d'octave du détecteur, débit réel** : toujours à mesurer en jouant (Risques).
- **Points mineurs reportés** (relevés en relecture, sans effet connu sur le comportement ; la tablature d'aide d'un tour qui commence dans une figure de plusieurs mesures et la règle de case écrite deux fois sont réglées, `loopFigure` et `fretOf`) : `renderFigure.ts` passe 650 lignes (la tablature à extraire) ; le texte « note N » compte les silences ; une altération se répète sur une liaison à travers la barre.

### Les formes (tâche 14, après le premier essai de l'auteur)

Au premier essai sur une grille, l'auteur a constaté que les formes d'arpège travaillées ont plusieurs notes par corde, comme une gamme, et que la même forme se déplace d'un accord à l'autre. `voicing-notes` ne peut pas les jouer : une forme d'accord a une note par corde, et sa place se dit par une occurrence sur le manche. La tâche ajoute donc, à côté de `voicing-figure` et de `voicing-notes` qui restent pour les arpèges d'un accord :

- **Une forme est une donnée de l'exercice** : `ExerciseDefinition.forms`, `{ id, symbol, notes }`, écrite `{ id, symbol, lilypond }` dans un fichier (`parseLilyPondNotes`, qui partage la lecture des notes et des cordes de `parseLilyPond` et ne lit aucun rythme).
- **La mécanique `form-figure`** : l'item `{ form, first, beats? }`, clé `${form}@${first}` puis `@${beats}`, dit quelle forme jouer et sur quelle première note. Le déplacement garde les cordes (`movedForm`) ; chaque tour compile sa liste à part, donc chaque accord repart de la première note.
- **`ContentDerivation.derive` et `ItemFields.fields` reçoivent la définition de l'exercice** : les formes sont à l'exercice, l'item ne fait que les nommer.
- **La lecture d'un nom de note sort du parseur** (`domain/time/noteName.ts`, écart au plan qui ne le prévoyait pas) : la clé d'un item, la dérivation et le champ `chord` lisent `first`, et la frontière du LilyPond interdit à `domain/mechanics/`, `domain/derivations/` et `application/` d'importer le parseur. `parseLilyPond` lit ses notes avec le même code.
- **Un item n'est refusé que par son tour** : `itemsProblem` compile le tour sur chaque item, donc un tour qui dérive `form-notes` refuse une forme absente ou sortie du manche, en nommant `items[i]`. Un tour qui ne dérive pas ses notes ne lit pas la forme : le moteur peut le jouer et le laisse passer, et le champ `chord` dit alors la note seule, sans jamais lever d'erreur. La validation ne porte pas de contrôle propre à une mécanique. Seul l'`id` d'une forme qui contient `@`, le séparateur des clés, est refusé d'avance : aucun item ne pourrait la nommer.
- **Pas d'image `shape` pour une forme** (`DERIVED_PICTURES` inchangé) : un dessin d'accord ne sait pas montrer plusieurs notes sur une corde. La respiration dit les fausses notes en mots, et un niveau d'aide peut écrire `notation.tab`.
- **Une barre de mesure dans une forme est refusée**, comme tout ce qui n'est pas une note : une forme n'a pas de mesure à vérifier.

### Étapes jouables : à venir

Les deux étapes jouables avec l'auteur n'ont pas encore eu lieu : les tétrades sur sa grille (notes dérivées, plusieurs accords enchaînés, tablature d'aide) et son thème (notes écrites, portée et tablature, figure longue), tous deux depuis `exercises.local/`. Cette section sera complétée de ce qu'elles changent. La fusion attend leur accord.
