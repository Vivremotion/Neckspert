# Chantier 2 : aucun exercice dans le code

Date : 2026-11-18. Statut : décidé avec l'auteur en brainstorming (du 2026-11-02 au 2026-11-18). Epic #21. Suite de `2026-10-14-temps-musical-et-sequences-design.md` (amendement du 2026-10-26, « un langage d'exercices ouvert », et « Points mineurs reportés ») et de `2026-10-30-sequence-design.md` (§ 6, exercices locaux).

## Ce que le joueur vit

Il joue les mêmes exercices qu'avant, et sa progression est gardée. Ce qui change pour lui :

- Il importe un fichier d'exercices dans l'application en ligne, depuis les réglages. Ses exercices privés ne passent plus par le dépôt ni par une version de développement.
- L'accueil liste des routines. La Bibliothèque liste tous les exercices, chacun jouable seul.
- Un exercice mal écrit est refusé à l'import, avec le fichier, l'objet et le champ en cause. Il ne plante plus en jeu.
- Quelques règles disparaissent, parce que l'auteur les juge arbitraires (C12). L'aide des changements d'accords vient quand il bloque au tempo le plus bas, plus d'office.

## Pourquoi maintenant

Le catalogue, les grilles, la composition des séances, les règles d'apprentissage des notes et des triades et toute la voie du geste sont du code TypeScript. Ajouter ou retoucher un exercice demande un développeur. Les exercices privés de l'auteur ne se jouent qu'en développement. Le chantier 3 (ensembles admis) et la partie données de #11 attendent que les exercices soient des fichiers.

## Décisions de cadrage

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **But.** L'auteur écrit un exercice sans code et l'importe dans l'application en production sans le commiter. Le format est documenté dans le dépôt. Il est marqué instable (`"format": 0`).                                                                                                                                                                                                                                         |
| C2  | **Figer le moins possible.** Le système musical général se pense à part, à son rythme. Le chantier 2 ne fige que ce qu'un exercice du catalogue demande : la migration 13 ne renomme que ce qui est décidé ici, le mécanisme des ensembles entre petit.                                                                                                                                                                              |
| C3  | **Une capacité (`skill`)** est un seul objet pour ce que les docs appelaient capacité et compétence ; la nature de ses éléments fait la différence. Une tentative crédite une seule capacité. Un exercice écrit `practices: <capacité>` et rien d'autre : pas de liste de sous-capacités.                                                                                                                                            |
| C4  | **Tout objet est l'élément d'un ensemble.** Une famille est une fonction : pour un index, l'ensemble de ses membres. On restreint un ensemble, on l'ordonne, on en prend tout ou le premier.                                                                                                                                                                                                                                         |
| C5  | **Trois étages de vocabulaire** dans le code : le cœur, une musique, un instrument (§ 1).                                                                                                                                                                                                                                                                                                                                            |
| C6  | **Le mot « mécanique » disparaît.** Il se coupe en deux : la capacité, en données, et l'ensemble de ses éléments, en code.                                                                                                                                                                                                                                                                                                           |
| C7  | **L'identifiant fait l'identité.** Même identifiant, même progression, quelle que soit la définition. Pour repartir de zéro, on change d'identifiant.                                                                                                                                                                                                                                                                                |
| C8  | **Livré et importé.** Le catalogue est un dossier de fichiers JSON du dépôt ; les fichiers importés vivent dans la base locale et dans la sauvegarde. `exercises.local/` disparaît.                                                                                                                                                                                                                                                  |
| C9  | **Plus de geste en code à la fin du chantier.** Les quatre exercices passent en données ; leurs deux vues sont rebranchées sur un modèle générique, sans être redessinées. Le plan visuel 3 les refera, et le modèle sera repris alors.                                                                                                                                                                                              |
| C10 | **La routine est provisoire.** Elle sort du code la composition des séances et leurs ouvertures ; le chantier 5 la remplacera. Elle tient en quatre champs.                                                                                                                                                                                                                                                                          |
| C11 | **Les exercices réels restent privés.** Le corpus du professeur et les morceaux protégés n'entrent pas dans le dépôt.                                                                                                                                                                                                                                                                                                                |
| C12 | **Règles retirées**, sur décision de l'auteur : le miroir (jamais une note après son miroir ; une note attend tant que son miroir est en cours) ; « une autre corde de préférence » ; les notes des triades en cours placées en tête de la file des notes ; les fondamentales les plus connues placées en tête des triades ; la tendance et l'écart au temps sur l'accueil ; les trois règles propres au lien et aux grilles du § 7. |

## 1. Vocabulaire

| Mot      | Sens                                                                                      | Dans le code |
| -------- | ----------------------------------------------------------------------------------------- | ------------ |
| capacité | ce qu'un exercice fait travailler                                                         | `skill`      |
| ensemble | ce dont une capacité tire ses éléments, enregistré par un étage                           | `ItemSet`    |
| élément  | un élément d'un ensemble ; ce qu'une carte ou une tentative concerne                      | `item`       |
| famille  | une fonction : pour un index, l'ensemble de ses membres                                   | `family`     |
| membre   | un élément de l'ensemble qu'une famille rend                                              | `member`     |
| attribut | une valeur calculée sur un membre, comparable                                             | `attribute`  |
| forme    | un motif de notes sur des cordes, sans note de départ                                     | `shape`      |
| zone     | une région de l'instrument : des cordes et des cases, l'une ou l'autre partie facultative | `zone`       |
| passage  | une suite d'éléments jouée une fois, enchaînée                                            | `passage`    |
| portée   | ce qui sépare les niveaux d'un même exercice                                              | `scope`      |
| routine  | une entrée de l'accueil (provisoire)                                                      | `routine`    |

Les trois étages :

| Étage         | Ce qu'il définit                                                                                                          | Ce qu'il ne connaît pas                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| le cœur       | ensemble, élément, attribut, famille ; restreindre, ordonner, prendre ; le temps, le juge, l'apprentissage, les séries    | aucun exercice, aucun instrument, aucune musique particulière |
| une musique   | les douze notes, les accords et leurs degrés, le voicing (un accord et le degré de chaque note), les figures, les grilles | aucun instrument                                              |
| un instrument | pour la guitare : les endroits d'une note, les formes d'un accord, leurs attributs, les zones, leurs dessins              | aucun exercice                                                |

Chaque étage enregistre ses ensembles, ses familles et ses attributs dans le cœur, comme les mécaniques enregistrent leur vocabulaire aujourd'hui (`ITEM_FIELDS`, `CONTENT_DERIVATIONS`, `CONTENT_VIEWS`, `PICTURES`). Le cœur lit des noms et des valeurs comparables ; il ne sait pas ce que « position » veut dire.

« Capacité » appartient désormais à `skill` : la « couche de capacités » du chantier 6 se renomme « couche d'outils ».

Deux écarts sont connus et non traités ici : les mesures (`Meter`) et les douze notes vivent encore dans le cœur (`domain/time`) alors qu'elles sont d'une musique ; les notes d'une figure portent un numéro de corde facultatif, dont la tablature a besoin.

## 2. Les objets et les fichiers

Un fichier porte quatre listes, toutes facultatives :

```json
{ "format": 0, "skills": [], "grids": [], "exercises": [], "routines": [] }
```

Les noms de clés de cette spec sont ceux du format de départ ; le plan peut en ajuster un sans en changer le sens, puisque le format est instable.

**La capacité.**

```json
{
	"id": "locate-note-string",
	"name": { "fr": "Trouver une note sur une corde", "en": "Find a note on a string" },
	"items": "note-on-string",
	"memory": true,
	"directRecall": { "withinMs": 1500 }
}
```

- `items` nomme un ensemble enregistré. La capacité ne le décompose pas.
- `memory` remplace `learner: 'memory' | 'skill'` : avec des cartes, ou sans.
- `directRecall` dit ce qui compte comme un rappel direct ; il est exigé d'une capacité de mémoire. Il remplace `params.recallThresholdMs` des exercices et sert à quatre choses : la note FSRS, l'acquisition, la maîtrise, le haut de l'échelle.

**L'exercice** est la définition d'aujourd'hui (`ExerciseDefinition`, lue par `exerciseFromJson`), avec ces changements :

- `practices` remplace `mechanic` ;
- `version` disparaît : `format` dit le format, l'identifiant fait l'identité ;
- `items` est une liste écrite, dans l'ordre (§ 5) ; une entrée est une clé, ou `{ "item": "7@d", "beats": 8 }` quand le tour a une longueur ;
- `forms` devient `shapes` ;
- les figures et les formes écrites restent dans leur exercice, en LilyPond.

**La grille** est le `ChordGrid` d'aujourd'hui, en JSON. **La routine** est décrite au § 8.

**Les ensembles enregistrés.**

| Nom                  | Ce que c'est                                | Étage   | Clé                         |
| -------------------- | ------------------------------------------- | ------- | --------------------------- |
| `note-on-string`     | une note sur une corde, hauteur libre       | guitare | `3:C#`                      |
| `placed-note`        | une note à sa case                          | guitare | `3:6`                       |
| `voicing-on-strings` | un voicing et ses cordes, hauteur libre     | guitare | `D\|maj\|3:5,2:1,1:3`       |
| `placed-voicing`     | un voicing à ses cases exactes              | guitare | `D\|maj\|3:5,2:1,1:3@2-3-2` |
| `placed-shape`       | une forme écrite, posée sur une note exacte | guitare | `m7@g`                      |
| `change`             | un changement d'une grille                  | musique | `iohefy-a#3`                |
| `figure`             | une figure                                  | musique | `eighths@1`                 |

Deux états reviennent : « sur des cordes », où la hauteur reste libre, et « posé », à un endroit exact.

**Les règles.**

- Une référence se fait par identifiant, d'un fichier à l'autre et vers le catalogue.
- Les identifiants ont un espace de noms par sorte d'objet.
- Une référence qui ne mène nulle part refuse l'objet qui la porte.

**Le catalogue** tient en quatre fichiers : `notes.json`, `chords.json`, `changes.json`, `rhythm.json`. `docs/exercices-locaux.md` devient la documentation du format.

| Exercice et capacité | Nom de la capacité                           | Ensemble             | Mémoire |
| -------------------- | -------------------------------------------- | -------------------- | ------- |
| `locate-note-string` | Trouver une note sur une corde               | `note-on-string`     | oui     |
| `identify-note`      | Nommer une note                              | `placed-note`        | oui     |
| `chord-anchor`       | Ancrer un accord sur sa fondamentale         | `voicing-on-strings` | oui     |
| `chord-zone`         | Jouer un accord près d'une case              | `voicing-on-strings` | oui     |
| `inversion-run`      | Enchaîner les renversements d'un accord      | `placed-voicing`     | non     |
| `grid-in-direction`  | Jouer une grille en montant ou en descendant | `change`             | non     |
| `grid-in-zone`       | Jouer une grille dans une zone               | `change`             | non     |
| `grid-reading`       | Lire une grille                              | `change`             | non     |

Ces huit exercices travaillent purement leur capacité et en portent le nom ; ce n'est pas une règle générale. Les trois exercices de rythme gardent leurs identifiants (`rhythm-silent-bars`, `rhythm-two-four`, `rhythm-offbeats`) et travaillent `inner-pulse`, `displaced-pulse` et `figure-independence`, sur l'ensemble `figure`, sans mémoire.

## 3. Charger, importer, refuser

**Le catalogue livré.** Un dossier `catalog/` à la racine du dépôt, embarqué à la construction, en production comme en développement. Un test lit chaque fichier avec le lecteur de l'application et exige zéro refus : une erreur du catalogue est un test rouge, jamais un écran d'erreur. Les exercices écrits en TypeScript disparaissent (`catalog.ts`, `rhythmCatalog.ts`, `gesture/exercises.ts`, les grilles de `domain/grid/`) ; les tests qui les lisaient lisent les fichiers ou leurs propres exercices.

**Les fichiers importés.**

- Le joueur choisit un ou plusieurs fichiers dans les réglages, section « Fichiers importés », à côté de « Sauvegarde ».
- L'application range le texte de chaque fichier tel quel, sous son nom, dans une table à part. Elle le relit à chaque démarrage : le format peut changer sans migration des définitions, un fichier devenu illisible est refusé avec sa raison.
- Réimporter un fichier du même nom le remplace. Le supprimer retire ses objets ; la progression reste et se retrouve si l'on réimporte (C7).
- Les fichiers importés partent dans la sauvegarde.
- Une taille maximale par fichier est imposée.

**Un seul registre.** Au démarrage, le lecteur prend le catalogue, puis les fichiers importés dans l'ordre de leurs noms. Dans un fichier il lit les capacités et les grilles, puis les exercices, puis les routines. `registerExercises`, `EXERCISES` et `exerciseById` laissent la place à ce registre.

| Cas                                                                      | Ce qui est refusé    |
| ------------------------------------------------------------------------ | -------------------- |
| le texte n'est pas du JSON, ou `format` est inconnu                      | le fichier entier    |
| un objet ne passe pas les validateurs                                    | cet objet seul       |
| un identifiant est déjà pris par le catalogue ou par un fichier lu avant | cet objet seul       |
| une référence mène à un objet absent ou refusé                           | l'objet qui la porte |

**Un refus lisible** dit le fichier, la sorte d'objet, son identifiant, le champ, puis la raison. Le cadre est traduit ; la raison reste celle du validateur, en anglais, avec les noms des champs du format. Il s'affiche sur l'écran « Fichiers importés », juste après l'import, et plus tard si un fichier rangé ne se lit plus. Dans ce second cas, une ligne de l'accueil y mène.

**Une progression sans définition** (fichier supprimé ou refusé) est gardée et ignorée par les écrans. Aujourd'hui `exerciseById` lève une erreur sur un identifiant inconnu.

**Une entrée non fiable.** Un fichier importé n'est jamais exécuté : il est lu en JSON et validé ; ses textes s'affichent comme du texte ; le sous-ensemble LilyPond refuse déjà `#` et `$`.

## 4. Les capacités dans le moteur

| Mécanique aujourd'hui        | Ensemble                                   | Capacités                    |
| ---------------------------- | ------------------------------------------ | ---------------------------- |
| `locate`                     | `note-on-string`                           | `locate-note-string`         |
| `identify`                   | `placed-note`                              | `identify-note`              |
| `triad-anchor`, `triad-zone` | `voicing-on-strings`                       | `chord-anchor`, `chord-zone` |
| `chord-grid`                 | `change`, et `placed-voicing` pour le lien | les quatre des changements   |
| `figure`                     | `figure`                                   | les trois du rythme          |
| `voicing-figure`             | `placed-voicing`                           | celles d'exercices importés  |
| `form-figure`                | `placed-shape`                             | celles d'exercices importés  |

Un ensemble porte en code ce que la mécanique portait de ses éléments : leur clé et sa lecture, leurs champs, leurs dérivations, leurs dessins, leurs capteurs, ce qu'une tentative en garde. `MechanicIdentity`, `MechanicRules`, `MECHANIC_RULES` et `MECHANIC_PRESENTERS` sont redécoupés par ensemble ; les présentateurs par famille d'exercices (`triads.ts`, `chordGrid.ts`) disparaissent.

| Enregistrement | Aujourd'hui                 | Demain                |
| -------------- | --------------------------- | --------------------- |
| carte          | mécanique + élément         | capacité + élément    |
| tentative      | `exerciseId`, `mechanic`    | `exerciseId`, `skill` |
| niveau         | exercice + portée + élément | inchangé              |

Deux exercices qui travaillent la même capacité partagent ses cartes, donc sa rétention, et gardent chacun leur échelle. Un élément déjà acquis qu'un nouvel exercice rencontre part du bas de l'échelle de cet exercice : pas de sonde d'entrée, aucun exercice du catalogue ne partage une capacité de mémoire.

Le rappel direct se lit sur une réponse. Un exercice qui travaille une capacité de mémoire avec un tour jugé au cycle est refusé.

## 5. L'apprentissage en données

`neckSubject` et `triadSubject` disparaissent. Un seul sujet est construit à partir des données ; la procédure d'apprentissage (`createLearningProcedure`) ne change pas.

| Règle dans le code aujourd'hui                         | Où elle va                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| quels éléments, dans quel ordre                        | l'exercice : `items`, une liste écrite ; son ordre est l'ordre d'introduction     |
| un élément attend qu'un autre soit acquis              | l'exercice : une condition d'entrée                                               |
| jamais le même élément deux fois de suite              | le cœur, pour tout exercice de mémoire                                            |
| la présentation aidée suit aussitôt, ou attend         | l'exercice : `learning.presentAtOnce` (faux pour les accords, qui sonnent encore) |
| échelle, seuil de rappel, aide qui s'efface, confusion | déjà en données, ou lu de façon générale sur la tentative                         |

Un script écrit une fois les listes du catalogue à partir de l'ordre statique d'aujourd'hui ; ensuite ce sont des paramètres de l'exercice. Les générateurs du code (`introductionOrder`, `triadIntroductionOrder`, `triadVoicings`, les repères `MARKER_FRETS`) disparaissent.

Deux conditions d'entrée restent, écrites dans l'exercice :

| Exercice        | Condition                                                   |
| --------------- | ----------------------------------------------------------- |
| `identify-note` | la note au même endroit est acquise en `locate-note-string` |
| `chord-zone`    | le même voicing est acquis en `chord-anchor`                |

```json
"learning": { "enter": { "acquired": { "skill": "chord-anchor", "item": "same" } } }
```

`item` nomme une correspondance enregistrée entre l'ensemble de l'exercice et celui de la capacité nommée (`same`, ou la note d'une case). C'est le prédicat des ouvertures (§ 8), appliqué à un élément. Les capacités restent des nœuds sans arêtes : ces conditions vivent dans l'exercice, le graphe est le chantier 5.

Il ne reste aucune préférence ni aucun ordre calculé sur l'état du joueur.

## 6. Familles, filtres, zones

**Une famille** rend, pour un index, un ensemble de membres. La guitare enregistre `note-places` (une note : ses cases) et `chord-shapes` (un accord dans une zone de cordes : ses formes, sur chaque groupe de cordes voisines de la zone). La musique enregistre `grid-changes` (une grille : ses changements).

**Un membre** se nomme par son identité (ses cordes, ses degrés, ses cases), jamais par son rang. Un rang n'existe qu'une fois l'ensemble ordonné ; il change avec l'ordre, les filtres et les bornes du manche, et ne se stocke pas. Un membre est un endroit lu comme une chose : les mêmes cases sont un la mineur 7 ou un do 6.

**Les attributs** d'un membre, pour la guitare :

| Attribut   | Pour une forme                | Pour une note |
| ---------- | ----------------------------- | ------------- |
| `strings`  | ses cordes                    | sa corde      |
| `frets`    | ses cases                     | sa case       |
| `position` | sa case frettée la plus basse | sa case       |
| `pitch`    | sa note la plus grave         | sa hauteur    |

**Trois opérations**, dans le cœur :

- **restreindre** : des filtres indépendants, qui s'additionnent ; chacun compare un attribut à une valeur écrite, à un paramètre, ou au même attribut du membre précédent ;
- **ordonner** : par une liste d'attributs ;
- **prendre** : tout membre qui reste, ou seulement le premier.

Les filtres qui entrent sont ceux qu'un exercice du catalogue demande :

| Filtre                 | Sens                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| dans une zone          | toutes les notes du membre sont sur les cordes et dans les cases de la zone                                                                    |
| à une case             | le membre couvre cette case (`chord-zone`)                                                                                                     |
| au-delà du précédent   | sa position est plus haute, ou plus basse, que celle du dernier membre entendu ; une option fait tourner le sens quand plus rien n'est au-delà |
| autre que le précédent | ce n'est pas le dernier membre demandé de cet élément (`chord-zone`)                                                                           |

« Près d'un repère » et « pas encore joué » attendent leur exercice.

**Un seul juge de contenu**, « membre d'une famille », remplace `note`, `chord-voicing` et `chord-grid` : la réponse est juste si ce que le capteur a entendu est un membre admis. `name` et `pitch` restent. La même fonction pure (la chose, les filtres, le contexte : les membres admis) sert au juge, à l'aide, à la consigne, aux candidats du capteur d'accords et au tirage d'un membre.

**Le contexte.** La série tient la liste des membres entendus dans le passage et la passe à cette fonction. Le juge reste pur ; plus aucun sélecteur n'écrit `previous` ou `direction` sur les éléments.

**Une limite.** Le capteur de notes entend une hauteur, pas une corde : pour une note, un membre se reconnaît à sa hauteur seule, comme aujourd'hui.

## 7. Les changements en données

« Geste » devient « changements » (`changes`). `GestureRule` disparaît.

**Un passage** est la suite des membres d'une famille pour un index que l'exercice liste.

| Exercice                       | Ses index                                   | Son passage                                                     |
| ------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| `inversion-run`                | des accords, chacun sur une zone de cordes  | les 4 premières formes de l'accord par position, puis le retour |
| `grid-in-direction`            | des grilles, chacune sur une zone de cordes | les changements de la grille                                    |
| `grid-in-zone`, `grid-reading` | des grilles                                 | les changements de la grille                                    |

```json
"passages": {
	"of": { "grid": ["iohefy-a", "blues-f"], "strings": [[3, 2, 1], [4, 3, 2]] },
	"members": { "family": "grid-changes" },
	"each": { "direction": ["up", "down"] }
}
```

Le lien écrit `"members": { "family": "chord-shapes", "order": ["position"], "take": 4, "andBack": true }`.

**Ce qu'un changement accepte** s'écrit dans le contenu de l'attente du tour :

```json
"content": {
	"family": "chord-shapes",
	"where": [
		{ "in": { "param": "zone" } },
		{ "position": { "beyond": "previous", "toward": { "param": "direction" }, "turns": true } }
	]
}
```

| Exercice            | Filtres                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `inversion-run`     | aucun : l'élément est un membre exact                                                               |
| `grid-in-direction` | dans la zone de cordes ; au-delà du précédent, dans `direction`, le sens tournant au bout du manche |
| `grid-in-zone`      | dans la zone de cordes et de cases                                                                  |
| `grid-reading`      | dans la zone de cordes                                                                              |

**Les paramètres de passage** (`each`) prennent la valeur suivante de leur liste à chaque passage du même index ; leur dernière valeur se relit dans les tentatives. `direction` vaut `["up", "down"]`. `zone` est une liste écrite de zones (`[1, 5]`, `[6, 10]`, `[11, 15]`…) : la largeur et le pas ne sont plus des constantes du code (`ZONE_FRETS`, `ZONE_STEP_FRETS`).

**Les règles autour du passage.**

| Règle d'aujourd'hui                                                     | Ce qu'elle devient                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| un passage de grille est aidé la première fois et après un passage raté | retirée : le mécanisme général. Chaque exercice écrit un niveau d'aide sous son niveau 1, qui dessine les membres admis sur le manche, et `flow.antiBlocking` ; trois ratés de suite au niveau 1 y font descendre |
| le lien est aidé après 2 ratés dans un tour                             | retirée : le même mécanisme (#19)                                                                                                                                                                                 |
| un tour de lien raté est rejoué aussitôt, enchaîné                      | un passage raté revient, après une mesure comptée ; plus d'enchaînement ni de forme sautée                                                                                                                        |
| une mesure de silence avant un nouvel accord du lien                    | gardée, en données (`restBars`)                                                                                                                                                                                   |
| le sens de départ alterne                                               | gardé : le paramètre `direction`                                                                                                                                                                                  |
| le sens tourne au bout du manche                                        | gardé : l'option du filtre                                                                                                                                                                                        |
| la zone avance, et saute une zone où un accord n'a pas de forme         | gardé : le paramètre `zone` ; règle générale, un passage injouable est sauté                                                                                                                                      |
| on joue l'index joué le moins récemment                                 | gardé, en règle du cœur                                                                                                                                                                                           |
| un index s'ouvre selon les triades acquises                             | gardé : le prédicat « acquis » (§ 8), appliqué index par index, écrit dans `passages.opens`                                                                                                                       |

L'ouverture par index garde le sens d'aujourd'hui (`opening.ts`) : pour le lien, les trois renversements de l'accord sur ses cordes acquis en `chord-anchor` ; pour `grid-in-direction`, ceux de chaque accord de la grille sur ses cordes ; pour `grid-in-zone`, ceux de chaque accord sur chaque groupe de cordes, en `chord-zone` ; pour `grid-reading`, ceux de chaque accord sur un groupe au moins, en `chord-anchor`.

Un passage réussit quand la part de ses éléments justes atteint le seuil que l'exercice écrit (0,9 aujourd'hui, `PASSAGE_SUCCESS`).

**Les écrans.** `grid-scroll` et `link-lane` restent des composants. Leurs modèles, construits aujourd'hui par `application/mechanics/chordGrid.ts` en lisant la règle, viennent d'un seul modèle générique d'une suite de tours enchaînés, construit par le cœur à partir du passage : chaque tour avec sa place en temps et les champs de son élément ; la consigne, écrite dans `presentation` avec des champs comme `{symbol}`, `{direction}` ou `{zone}` ; l'aide, un dessin des membres admis ; après un raté, les dessins de ce qui a été entendu et attendu (`CONTENT_VIEWS`, `PICTURE_VIEWS`). Le plan commence par la liste de tout ce que les deux vues lisent.

**Le capteur d'accords** reçoit les membres admis comme candidats ; son fonctionnement ne change pas.

**Ce qui part du code** : `gestureSelector.ts`, `domain/gesture/` (`passages.ts`, `opening.ts`, `exercises.ts`, `summary.ts`), l'aiguillage de `gridClassify.ts`, les champs de règle de `ChordGridItem`, les consignes, aides et modèles de `application/mechanics/chordGrid.ts`.

## 8. Routines, accueil, Bibliothèque

**La routine** est une entrée de l'accueil :

```json
{
	"id": "chords-zone",
	"title": { "fr": "Triades vers une case", "en": "Triads around a fret" },
	"exercises": ["chord-zone"],
	"opens": { "acquired": { "skill": "chord-anchor", "atLeast": 6 } }
}
```

Le catalogue en écrit quatre : `notes` (« Apprentissage » : `locate-note-string`, `identify-note`), `chords` (« Triades »), `chords-zone`, `changes` (« Changements », les quatre exercices).

**Comment une séance pioche** se déduit des exercices, la routine ne l'écrit pas :

| Les exercices de la routine       | La séance                                                         |
| --------------------------------- | ----------------------------------------------------------------- |
| tous sur des capacités de mémoire | la procédure d'apprentissage, sur l'ensemble                      |
| aucun sur une capacité de mémoire | chaque exercice à son tour, un passage chacun, puis on recommence |
| un mélange                        | non construit : la routine est refusée                            |

**L'ouverture.** `opens` est un prédicat sur ce que le joueur sait, jamais sur ce qu'il a joué : des éléments acquis dans une capacité (un nombre, ou ceux qu'une correspondance désigne), un niveau d'exercice atteint, « et », « ou ». Une routine dont aucun exercice n'a rien à jouer n'est pas proposée : la routine des changements s'ouvre ainsi dès qu'un index est ouvert. `triadZoneOpen` et `gestureOpen` sont réécrits ainsi, puis supprimés.

**Dans le moteur.**

- Les sortes de séance (`learn`, `free`, `triads`, `triads-zone`, `gesture`, `exercise`) disparaissent. Une séance enregistre sa routine, ou son exercice quand elle vient de la Bibliothèque, et si elle est en jeu libre.
- « On change d'air » ne termine plus toute la séance : l'exercice bloqué en sort et se repose, la séance continue avec les autres.
- Un seul service donne, pour chaque routine, si elle est ouverte, ses révisions dues, si elle est au repos. Il remplace `triads()`, `gesture()` et `resting()`.
- Le bilan résume une séance par exercice et par portée ; le résumé du geste et celui d'un exercice deviennent le même.
- La carte du manche et les statistiques lisent les cartes des capacités dont l'ensemble est `note-on-string` ou `placed-note` ; elles ne nomment plus `locate`, `identify` ni les constantes du catalogue.

**L'accueil** liste les routines ouvertes, avec leurs révisions dues et les prochaines révisions. La section « Exercices », la tendance et l'écart au temps en sortent.

**La Bibliothèque** (le lien de navigation existant) liste tous les exercices du registre, avec ou sans routine. Chacun s'y joue seul : un exercice de mémoire en jeu libre, sur ses éléments, au niveau que chacun tient ; un autre comme une séance d'exercice aujourd'hui. Les trois exercices de rythme y vivent, sans routine.

## 9. La migration 13 et la sauvegarde 9

Une seule version de schéma pour tout le chantier, écrite au début (comme la version 8 pour le temps musical) : fonctions pures dans `storage/migrations/v13.ts`, appliquées par la mise à niveau Dexie et par l'import d'une sauvegarde ; la table des identifiants y est figée, avec un test qui la compare au catalogue.

| Ce qui change                    | Règle                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identifiants d'exercice          | `locate-neck` → `locate-note-string`, `identify-neck` → `identify-note`, `triads-anchor` → `chord-anchor`, `triads-zone` → `chord-zone`, `gesture-link` → `inversion-run`, `gesture-climb` → `grid-in-direction`, `gesture-zone` → `grid-in-zone`, `gesture-jam` → `grid-reading` ; dans les tentatives, les niveaux, les séances |
| `mechanic` → `skill`             | d'après l'exercice de la tentative ; un exercice hors du catalogue reçoit une capacité de son propre nom                                                                                                                                                                                                                          |
| cartes                           | le champ et le préfixe de clé suivent la capacité (`locate:` → `locate-note-string:`) ; le reste de la clé ne bouge pas                                                                                                                                                                                                           |
| clé d'un changement              | `climb:iohefy-a:3,2,1#3` → `iohefy-a#3` ; pour le lien, la clé devient la forme demandée, lue dans la tentative                                                                                                                                                                                                                   |
| clés des formes jouées en figure | la longueur du tour sort de la clé ; le rang `@occurrence` devient les cases                                                                                                                                                                                                                                                      |
| séances                          | la sorte devient la routine, l'exercice, le jeu libre                                                                                                                                                                                                                                                                             |
| table nouvelle                   | les fichiers importés (nom, texte, date)                                                                                                                                                                                                                                                                                          |

La sauvegarde passe en version 9 : elle porte les fichiers importés et refuse `mechanic`, les sortes de séance et les anciens identifiants ; une sauvegarde 8 passe par `v13.ts`.

Les exercices privés de l'auteur sont réécrits au nouveau format, hors du dépôt, avec une capacité du nom que la migration a donné à leurs tentatives.

## 10. Les trous de validation à combler

La validation court désormais au chargement, une fois, pour le catalogue comme pour un fichier importé (`validateExercise`, `presentationProblem`, `screenProblem`, `previewProblem`), et plus à chaque consigne. Avant qu'un auteur écrive un fichier, elle refuse aussi ce que la spec du temps musical avait laissé (« À régler avant que le chantier 2 charge des exercices de fichiers ») :

- une valeur de niveau qui ne convient pas à son lecteur (`'windows.perfectMs': 'x'`), un tempo de niveau d'élément qui n'est pas positif ;
- un chemin de niveau qui écrit `undefined` ; un niveau qui écrit un objet et l'un de ses sous-chemins ;
- `pacing.roundsPerBreath` à 0, négatif ou non entier ; un `params.pacing` qui n'est pas un objet ;
- un exercice de figures sans `roundsPerBreath`, qui ne respire ni ne finit.

S'y ajoutent les règles de cette spec : une référence absente ; une capacité de mémoire sans `directRecall` ; une clé de `items` que l'ensemble de la capacité ne lit pas ; une capacité de mémoire travaillée par un tour jugé au cycle ; une famille, un attribut, un filtre ou une correspondance qu'aucun étage n'a enregistré ; une routine qui mêle mémoire et sans mémoire.

Le moteur refuse toujours ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.

## 11. Preuves et tests

- **Le catalogue** : chaque fichier lu sans refus ; les plans compilés des exercices du catalogue restent ceux d'aujourd'hui (`rhythmCatalog.parity.spec.ts` et ses semblables, relus depuis les fichiers).
- **La frontière** : aucun identifiant d'exercice, de capacité, de routine ou de grille du catalogue n'apparaît dans `src/` hors des tests et des migrations ; le cœur n'importe ni le module guitare ni le module de musique.
- **Un faux instrument** joue un exercice de bout en bout dans un test, avec sa propre famille et son propre attribut, comme `thirdMechanic.spec.ts` le fait pour une mécanique.
- **Le banc ouvert** (`openness.spec.ts`) tire ses exercices des pièces enregistrées et joue tous ceux que les validateurs acceptent.
- **Les règles pédagogiques gardées** sont jouées de bout en bout, pas la parité avec l'ancien code : une triade nouvelle sondée sans aide, jamais le même voicing deux fois de suite, la zone ne demande qu'un accord acquis en ancrage et une autre forme que la dernière ; le sens qui tourne au bout du manche ; un passage injouable sauté.
- **La migration** : une base 12 réelle et une sauvegarde 8 passent en 13 et 9 ; les cartes gardent leur état FSRS ; les tables figées ont leur test.
- **En jeu** : chaque routine et un exercice importé sont joués au-delà de la respiration, micro simulé (`scripts/functional-ui.mjs`), avant de dire qu'ils marchent.

## Découpage en plans

Cinq plans, dans cet ordre ; chacun laisse l'application jouable.

1. Le format, le lecteur, le registre, le catalogue en fichiers, les refus et les trous de validation (§ 2, 3, 10). Les fichiers gardent `mechanic` ; `exercises.local/` reste, lu par le nouveau lecteur.
2. En deux plans.
   - 2a, fait : les capacités et les ensembles à la place des mécaniques ; la base 13 et la sauvegarde 9 (§ 4, 9).
   - 2b : l'import, l'usage de sa table et son écran ; la progression gardée sans définition ; la fin de `exercises.local/` (§ 3).
3. L'apprentissage en données (§ 5).
4. Les familles et les filtres ; les changements en données (§ 6, 7).
5. Les routines, l'accueil, la Bibliothèque (§ 8).

## Hors périmètre

- Un second instrument ; l'accordage en données (#27, #28).
- Le graphe des capacités, ses arêtes, le planificateur (chantier 5) ; une séance qui mêle exercices avec et sans mémoire.
- Le redessin des vues des changements et de la figure (plan visuel 3, #22).
- Ce que le capteur d'accords écoute en dedans (chantier 3).
- Les filtres « près d'un repère » et « pas encore joué » ; un contenu tiré de l'harmonie du moment ; les exercices d'improvisation, d'oreille et d'analyse qu'aucun juge ne lit.
- Les figures et les formes partagées entre exercices.
- La traduction des raisons de refus ; un dossier lié relu à chaque rechargement.
- Sortir les mesures et les douze notes du cœur ; le numéro de corde des notes d'une figure.
- Le format v1 et le système musical général, qui se pensent à part.

## Risques

- **Le modèle générique des changements** est la pièce la moins sûre : les deux vues lisent peut-être des champs qu'il n'a pas. Il sera repris avec le plan visuel 3 (C9).
- **La migration 13 est écrite avant les plans 3 à 5.** Elle fixe d'avance les clés des changements et la forme d'une séance ; une erreur se paie par une version 14.
- **Le mécanisme général d'aide** change ce que l'auteur vit dans les changements. S'il manque en jeu, la règle se rouvre en données, pas en code.
- **Le format instable** peut rendre illisible un fichier importé après une mise à jour. Le fichier est gardé et sa raison affichée ; rien n'est perdu.

## Questions laissées ouvertes

- La distinction entre capacités avec et sans mémoire, que l'auteur tient pour imaginaire : `memory` est une donnée, à reprendre avec le chantier 5.
- La clé `eighths@1` d'une figure porte un niveau d'exercice : relevé, non nettoyé.

## Réalisation (plan 1, 2026-11-18)

- L'import, sa table, l'écran « Fichiers importés » et la progression gardée sans définition passent au plan 2 : ils demandent la version 13 de la base.
- Au plan 1 les fichiers gardent `mechanic` et `version`, et aucun identifiant n'est renommé. Un fichier dont `skills` ou `routines` n'est pas vide est refusé en entier : ces listes ne sont pas encore lues.
- Un refus porte le fichier, la sorte d'objet, l'identifiant et la raison. Le champ reste dans la raison du validateur.
- Un accompagnement s'écrit `{ "clicks": { "beats", "accent"? }, "bars" }`, lu sur le mètre de l'exercice. Le paramètre que `round.accompaniment` nomme est un paramètre de premier niveau : un nom qui contient un point est refusé à la lecture.
- Les registres sont des listes vivantes de module, remplies une fois au démarrage par `loadDefinitions` et, pour les tests, par `src/lib/testing/setup.ts`. Le code de production les lit à l'appel, jamais à l'import d'un module.
- Les identifiants que le code nomme encore vivent dans `src/lib/domain/exercise/catalogIds.ts`, jusqu'aux plans qui mettent leurs lecteurs en données.
- L'ordre des exercices d'un fichier à l'autre suit les noms des fichiers ; rien ne le lit.
- Les refus s'affichent sur l'accueil en développement seulement ; en production, une ligne de console. L'écran vient avec l'import.
- La règle « un tour jugé au cycle exige `pacing.roundsPerBreath` » se lit sur `policy.unit`.
- À un niveau, seules les valeurs que le moteur lit à ce niveau sont vérifiées (tempo, fenêtres, respiration). `recallThresholdMs` et `learning.*` ne le sont que sur les paramètres de base.
- `overrideParams` refuse un chemin écrit `undefined`, et un chemin écrit avec l'un de ses sous-chemins.
- Laissé au plan 2, avant d'importer des fichiers non fiables : vérifier le type des clés de premier niveau d'un exercice (`presentation: 3`, `flow: "x"`, `pick`, `howTo`) et des paramètres des changements (`qualities`, `stringSets`) ; un garde général contre la lecture d'un registre à l'import d'un module de route ; le mode dégradé quand un fichier du catalogue est refusé en production (une séance de notes, de triades ou de geste s'ouvre alors sur une erreur brute).

## Réalisation (plan 2a, 2026-11-19)

Ce que le plan 2a a décidé contre la spec, ou en plus d'elle :

- Le plan 2 est coupé en deux. 2a : les capacités, les ensembles, la base 13, la sauvegarde 9. 2b : l'import, son écran, la progression gardée sans définition, la fin de `exercises.local/`. La table `definitionFiles` est créée en 2a, pour n'avoir qu'une version de schéma ; seule une sauvegarde la remplit jusqu'au plan 2b.
- Les onze capacités du catalogue et leurs noms sont ceux du plan. Les trois du rythme : « Tenir la pulsation sans le clic », « Tenir la pulsation sur un clic déplacé », « Tenir une figure contre la pulsation ».
- Huit mécaniques sont devenues sept ensembles. Les deux triades partagent `voicing-on-strings` et un seul présentateur : l'élément porte ou non une position, et c'est elle qui décide de ce que le capteur d'accords écoute. Une carte d'ancrage et une carte de zone du même voicing restent deux cartes, sous deux capacités.
- Un accord demandé « à une position » sur un élément qui n'en porte pas est jugé comme un accord demandé n'importe où.
- Les capteurs d'un exercice sont toujours ceux que son tour nomme, ceux de l'ensemble quand il n'en nomme aucun. Le décor, l'aperçu et « Joué juste » restent des valeurs par défaut de l'ensemble, que `flow` remplace.
- Les quatre exercices des changements gardent leur présentateur jusqu'au plan 4. Il est trouvé par la vue de l'exercice (`grid-scroll`, `link-lane`), et leur ensemble aussi (`exerciseItemSet`) : le lien travaille une capacité rangée dans `placed-voicing`, mais son tour lit encore un changement.
- Le rappel direct et la mémoire se lisent sur la capacité. Le tour de `identify-note` lit sa fenêtre dans `directRecall.withinMs`. `params.recallThresholdMs` et `params.ladders` ne sont plus lus.
- Un exercice qui travaille une capacité de mémoire avec un tour jugé au cycle est refusé.
- Les clés : un `placed-voicing` s'écrit `<voicing>@<cases>`, un `placed-shape` `<forme>@<première note>`, un `change` `<grille>#<rang>`. La longueur d'un tour sort de la clé : une entrée de `items` est une clé, ou `{ "item": "<clé>", "beats": 4 }`. `forms` est devenu `shapes`, `form-notes` `shape-notes`.
- Une séance stockée dit `routine`, `exercise` et `free`. Les routines ne sont pas encore des objets : leurs quatre identifiants (`notes`, `chords`, `chords-zone`, `changes`) sont des constantes du code jusqu'au plan 5, et la sorte de séance reste un type du code.
- La migration 13 a été écrite au fil des tâches qui changeaient ce qui est stocké, pas en une fois à la fin. Les identités des huit mécaniques y sont figées, pour relire les sauvegardes 1 à 8.
- Les données d'une tentative (`Attempt.data`) ne sont pas réécrites par la migration. Un niveau n'est pas nettoyé par sa clé : seul son exercice est renommé.
- Une tentative d'un exercice hors du catalogue reçoit une capacité du nom de l'exercice.
- Une tentative d'un exercice hors du catalogue qui travaillait une mécanique de mémoire est séparée de sa carte. La tentative prend la capacité du nom de l'exercice, la carte celle de la mécanique. L'auteur n'a pas de telle tentative.
- Une ligne que la migration ne sait pas ranger n'est jamais perdue, et un export des lignes que l'application ou la migration ont écrites se réimporte : une carte ou un niveau dont le nouveau nom est déjà pris garde l'ancien ; une tentative que rien ne nomme reçoit la capacité `unknown`. Une carte d'une capacité de mémoire dont la clé ne se lit pas par son ensemble reste refusée.
- À l'import d'une sauvegarde 9, une tentative n'est jamais refusée pour la clé de son élément : elle est un historique, et sa clé ne sert qu'à la ranger avec sa carte. Quand l'ensemble lit sa clé et que sa capacité a des cartes, ses données doivent encore correspondre à la clé. Une carte d'une capacité de mémoire dont la clé ne se lit pas est refusée : une séance la sert. La progression d'une capacité qu'aucun fichier chargé ne définit est acceptée.
- Le mot « mechanic » ne reste dans le code que là où il relit d'anciennes versions de la base ou d'anciens fichiers.

Laissé au plan 2b (le plan 2b l'a fait, sauf mention) :

- l'import et son écran, le dépôt des fichiers branché au démarrage, la progression sans définition ignorée par les écrans, la fin de `exercises.local/` : fait au plan 2b ;
- les trois points que le plan 1 laissait « au plan 2 ». Vérifier le type des clés de premier niveau d'un exercice et des paramètres des changements avant d'importer des fichiers non fiables : fait au plan 2b, sauf que les paramètres des changements sont contrôlés par vue (voir « Laissé au plan 4 »). Un garde général contre la lecture d'un registre à l'import d'un module de route : fait au plan 2b. Le mode dégradé quand un fichier du catalogue est refusé en production : passé au plan 5 (D9) ;
- les règles sur les identifiants : un identifiant ne contient ni `:` ni `#`, et `unknown` est réservé : fait au plan 2b (D1, qui est plus étroite : lettres, chiffres, `-`, `_` et `.`) ;
- les cartes dont la clé ne se lit plus par l'ensemble de leur capacité : elles seront gardées et ignorées : passé au plan 3 (D10) ;
- le contrôle d'une sauvegarde 9 lit le registre vivant. Il ne lit donc pas les fichiers que la sauvegarde elle-même porte : rien n'a changé ; une sauvegarde qui porte une progression sans définition s'importe, et ses fichiers se chargent après l'import (`reload`).

Laissé au plan 4 :

- deux ensembles portent l'identifiant `change`. Celui du registre lit `{ grid, index }`, celui des changements lit un changement complet ;
- les noms de l'ancien modèle encore dans le code : `VoicingFigureItem`, `FormFigureItem`, `TriadAnchor*`, `TriadZone*`, `ChordGridItem`.

## Réalisation (plan 2b, 2026-11-19)

Les onze décisions de ce plan :

- D1 : un identifiant (capacité, grille, exercice) est fait de lettres, de chiffres, de `-`, de `_` et de `.`, et commence par une lettre ou un chiffre. `unknown` est réservé, pour les capacités et les exercices.
  Un exercice ne peut pas non plus prendre l'ancien identifiant d'un des huit exercices que la migration 13 a renommés (`locate-neck`, `identify-neck`, `triads-anchor`, `triads-zone`, `gesture-link`, `gesture-climb`, `gesture-zone`, `gesture-jam`) : la sauvegarde refuse ces identifiants, et la progression d'un tel exercice ne pourrait plus être importée (`RESERVED_EXERCISE_IDS`).
- D2 : un fichier est rangé sous son nom, tel que le navigateur le donne. Un fichier du même nom remplace le premier ; la casse compte.
- D3 : un fichier de plus de `MAX_DEFINITION_FILE_CHARS` n'est pas rangé. Tout autre fichier l'est, même illisible : son refus s'affiche, et on le remplace par une version corrigée.
- D4 : l'origine d'un objet importé est le nom de son fichier ; celle d'un objet du catalogue reste `/catalog/<nom>.json`. Un fichier importé du nom d'un fichier du catalogue ne le remplace pas.
- D5 : le premier écran attend les fichiers importés. Si la lecture des fichiers importés échoue, l'application démarre avec le catalogue seul et le dit en un refus. Une base qui ne s'ouvre jamais, sans échouer, n'est pas couverte : le premier écran l'attend.
- D6 : supprimer un fichier demande une confirmation, qui dit que la progression est gardée. Remplacer un fichier n'en demande pas.
- D7 : l'accueil montre une ligne, dans toute construction, quand un fichier importé a un refus ; elle mène aux réglages. La liste des refus du catalogue reste réservée au développement.
- D8 : la doc du format s'appelle `docs/fichiers-de-definitions.md` (l'ancien `docs/exercices-locaux.md`, déplacé).
- D9 : le mode dégradé quand un fichier du catalogue est refusé en production passe au plan 5. Ici, une séance ne lit plus que les exercices de sa piste qui existent.
- D10 : les cartes dont la clé ne se lit plus par l'ensemble de leur capacité passent au plan 3.
- D11 : le dossier lié, relu à chaque rechargement, n'est pas construit. Un fichier retouché se réimporte.

Ce que l'exécution a décidé en plus :

- Les paramètres des changements sont contrôlés pour tout exercice des vues `grid-scroll` et `link-lane` : `params.rule` parmi link, climb, zone, jam ; `params.qualities` des qualités de triade (une autre qualité est refusée : le moteur ne sait pas encore la jouer en changement) ; `params.stringSets` des jeux de trois cordes, de la plus grave à la plus aiguë ; `params.grids` une liste d'identifiants.
- `createApp` ne charge le catalogue que si rien n'a encore été chargé ; le service recharge toujours tout (vider, puis remplir).
- Les opérations du service (lecture au démarrage, import, suppression, rechargement) passent l'une après l'autre. Si ranger ou supprimer un fichier échoue, la table est relue quand même, pour que les registres la suivent.
- Une séance dont l'exercice n'est défini par aucun fichier est refusée au départ, avec l'identifiant manquant. Les autres séances et l'accueil ne lisent que les exercices qui existent.
- Une sauvegarde qui porte une progression sans définition s'importe : rien dans `validateBackup` n'a changé.
- `docs/projet.md` n'est pas retouché par ce plan.

Laissé au plan 3 :

- les cartes d'une capacité de mémoire dont la clé ne se lit plus par l'ensemble de sa capacité (D10) : rien ne sert encore une carte d'une capacité importée ; le plan 3 construit le sujet d'apprentissage qui les ignorera.

Laissé au plan 4 :

- les contrôles des paramètres des changements, faits par vue (`grid-scroll`, `link-lane`), sont à refaire quand les changements deviennent des données.

Laissé au plan 5 :

- le mode dégradé quand un fichier du catalogue est refusé en production (D9) : il touche l'accueil et la composition des séances, que le plan 5 récrit.
