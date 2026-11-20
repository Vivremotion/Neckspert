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

Ce que la revue finale du plan a changé :

- Vérifier un exercice a des limites, pour qu'un seul exercice ne coûte pas des secondes à vérifier à chaque démarrage. Un exercice est refusé s'il écrit plus de 100 niveaux (`MAX_EXERCISE_LEVELS`), une échelle de plus de 100 niveaux (`MAX_LADDER_LEVELS`), un niveau dont les `params` ont plus de 200 entrées (`MAX_LEVEL_PARAMS`, pour les niveaux de l'exercice comme pour ceux de l'échelle), plus de 2 000 éléments (`MAX_EXERCISE_ITEMS`), ou si ses éléments multipliés par ses niveaux demandent plus de 20 000 tours à vérifier (`MAX_ROUND_CHECKS`). Chaque limite se vérifie avant le travail qu'elle borne, et le refus nomme le champ, le nombre écrit et la limite. Rien ne borne encore le total d'un fichier : un fichier à la taille limite, rempli d'exercices aux limites (88 exercices de 200 éléments et 100 niveaux), se charge en 28 secondes sur un ordinateur de bureau, à chaque démarrage (mesuré à la contre-revue). Ce n'est pas un blocage, la garde ci-dessous rend la main ; un budget par fichier, et la validation d'un exercice faite une fois au lieu de deux, sont laissés au plan 5, avant que le format soit public.
- Si le chargement des fichiers importés ne s'est pas terminé la dernière fois (l'application fermée ou bloquée pendant ce chargement), le démarrage suivant charge le catalogue seul. Les réglages listent quand même les fichiers importés, pour qu'on puisse en supprimer un, et un refus dit ce qui s'est passé. Le démarrage d'après essaie de nouveau ; un import, une suppression ou une sauvegarde importée rechargent les fichiers tout de suite.
- Un exercice ne peut pas prendre l'ancien identifiant d'un des huit exercices renommés par la migration 13 : sinon la sauvegarde de sa progression serait refusée.
- La section « Fichiers importés » des réglages montre, au-dessus de la liste, ce qui a empêché de charger les fichiers importés (lecture échouée, chargement pas terminé). L'accueil y mène déjà.

Laissé au plan 3 :

- les cartes d'une capacité de mémoire dont la clé ne se lit plus par l'ensemble de sa capacité (D10) : rien ne sert encore une carte d'une capacité importée ; le plan 3 construit le sujet d'apprentissage qui les ignorera.
  Fait au plan 3 (D10) : une sauvegarde qui porte une telle carte est acceptée ; le sujet d'apprentissage la garde et l'ignore tant qu'aucune liste ne la nomme.
- une sauvegarde importée sur un appareil qui n'a pas les fichiers apporte des cartes d'une capacité de mémoire importée sans les vérifier. Le sujet d'apprentissage doit traiter une telle carte comme peut-être illisible, ou la validation doit lire les fichiers de la sauvegarde elle-même. Lire ces fichiers mettrait aussi fin au refus à tort quand l'appareil tient un fichier qui définit la même capacité sur un autre ensemble.

Laissé au plan 4 :

- les contrôles des paramètres des changements, faits par vue (`grid-scroll`, `link-lane`), sont à refaire quand les changements deviennent des données.

Laissé au plan 5 :

- le mode dégradé quand un fichier du catalogue est refusé en production (D9) : il touche l'accueil et la composition des séances, que le plan 5 récrit.
- un identifiant que le catalogue prendrait un jour, et qu'un fichier de joueur utilise déjà, ferait refuser l'objet du joueur et donnerait sa progression rangée à celui du catalogue (un seul espace de noms, C7). Il faut choisir un préfixe réservé avant que le format quitte la version 0.
- le résumé d'une séance dont l'exercice a été supprimé montre le cadre des notes.

## Réalisation (plan 3, 2026-11-19)

Les dix décisions de ce plan :

- D1 : un exercice de mémoire ne demande que les éléments de sa liste. Une carte de sa capacité que la liste ne nomme pas est gardée et ignorée (ni révisée, ni comptée dans la séance). Deux exercices sur une même capacité partagent les cartes des éléments qu'ils nomment tous les deux.
- D2 : un exercice de mémoire sans liste est refusé : il n'a rien à demander.
- D3 : les listes du catalogue sont l'ordre statique d'aujourd'hui. Notes : les naturelles puis les altérées, en alternant les cordes de 6 à 1, les naturelles sur un repère d'abord sur chaque corde. Accords : groupe de cordes par groupe de cordes, les fondamentales naturelles puis altérées depuis do, majeur puis mineur, les trois renversements en montant le manche.
- D4 : la correspondance « la note au même endroit » s'appelle `same-place` (d'un élément de `placed-note` vers celui de `note-on-string`). `same` désigne le même élément, entre deux capacités du même ensemble.
- D5 : « acquis » a une seule règle pour une condition d'entrée, celle de `isAcquired` (la carte porte `acquiredAt`, ou une tentative de son histoire la qualifie). Les notes lisaient `acquiredAt` seul.
- D6 : entre les exercices d'une séance, le premier listé qui a un élément prêt introduit. La séance des notes liste `identify-note` puis `locate-note-string` : nommer une note déjà placée passe avant une nouvelle note, comme aujourd'hui. Cet ordre reste en code jusqu'aux routines (plan 5).
- D7 : le tirage de `chord-zone` (une autre forme que la dernière demandée, et une case qu'elle couvre) devient un tirage enregistré, nommé par l'exercice (`params.learning.draw: "another-place"`). C'est une exception : le plan 4 le remplace par deux filtres.
- D8 : une confusion se lit sur la tentative (`data.confusion` non nul), pour toute capacité. L'aide qui s'efface se lit sur la présentation (`presentation.fading`).
- D9 : `stringSets` et `qualities` quittent les paramètres de `chord-anchor` et `chord-zone` : plus rien ne les lit, les candidats du capteur d'accords viennent du voicing demandé.
- D10 : une carte dont la clé ne se lit plus par l'ensemble de sa capacité est acceptée à l'import d'une sauvegarde, gardée et ignorée. Une carte mal formée en elle-même reste refusée.

Ce que l'exécution a décidé en plus :

- Une condition d'entrée qui nomme la capacité de l'exercice lui-même est acceptée : le moteur sait la jouer (rien n'entre jamais), il ne la refuse donc pas.
- Le tirage reçoit l'élément de la dernière tentative de la carte qui en porte un (une tentative sans élément est sautée), puis ce qu'il a tiré dans la séance.
- Un élément listé est rangé sous la clé que son ensemble écrit (`6:05` se lit et s'écrit `6:5`).
- Vérifier les éléments listés d'un exercice ne recalcule plus ses paramètres pour chaque élément et chaque niveau : ils sont résolus une fois par niveau, le temps d'une vérification (environ 20 µs par tour, ce que les limites du plan 2b supposent). Les éléments d'un exercice qui écrit une échelle sont vérifiés au premier niveau de l'échelle.
- `exerciseSubject.ts` vit dans `domain/learning/` ; le test de frontière de ce dossier lui accorde, à lui seul, sept modules précis (les ensembles, les capacités, l'exercice). La procédure reste aussi fermée qu'avant.
- Deux écarts acceptés avec l'ancien code : une confusion ne se lit que si la tentative en porte une (l'ancien sujet des notes comptait comme confuse une tentative sans ce champ, par accident) ; la condition d'entrée de `identify-note` lit l'histoire de la carte comme `acquiredAt` (D5), ce qui ne se voit que sur d'anciennes lignes.
- L'accueil, la carte du manche et la prochaine révision du bilan ne comptent plus que les cartes qu'une séance peut servir (celles que la liste d'un exercice nomme) : une carte hors liste ne s'affiche plus comme « due » pour toujours.
- Ce que le joueur perd, décidé par l'auteur : une note n'attend plus que son miroir soit acquis, « une autre corde si possible » disparaît, les notes des triades en cours d'apprentissage ne viennent plus en premier, les fondamentales des triades ne sont plus triées par ce que le joueur sait déjà. Tout le reste d'une séance (catégories, sonde, présentation aidée, échelles, seuils, consolidation, jamais le même élément deux fois de suite) est inchangé.
- `order.ts`, `neckSubject`, `triadSubject`, les générateurs d'ordre, `mirror.ts` (sauf `openPitch`, déplacé dans `music/fretboard.ts`), `triadParams` et `triadVoicings` sont supprimés ; un test de frontière interdit que leurs noms reviennent.
- Après la revue finale : un exercice dont la capacité a des cartes n'est pas proposé comme séance d'exercice, tant que la Bibliothèque n'existe pas (`exerciseSessionExercises` le laisse de côté, et `startExercise` le refuse). Il est chargé et vérifié, mais aucune séance ne le joue. Sans ce garde, un exercice importé sur une capacité de mémoire, avec une figure et des niveaux, apparaissait sur l'accueil et levait une erreur à son premier tour jugé.
- La revue finale a aussi resserré : deux graphies d'un même élément dans une liste sont refusées comme un doublon ; une carte que nulle liste ne nomme ne compte plus pour ouvrir la zone des triades ; une séance d'ancrage n'exige plus l'exercice de la zone, ni l'inverse (chacune exige le sien).
- Mesure : le catalogue se charge en 4 à 9 ms environ (1 à 3 ms avant), et la suite de tests est environ 8 % plus lente.

Ce qui diffère du § 5, que celui-ci ne dit pas (le § 5 reste tel quel) :

- Un script a écrit les listes une fois, à partir de l'ancien ordre statique (D3) ; il n'a pas été gardé. Les listes sont maintenant des données du catalogue, et rien n'en garde la trace en code.
- Le § 5 écrit `learning: {…}` ; le code lit `params.learning`.
- Le § 5 écrit `learning: { enter: … }` pour `chord-zone` seul. `chord-zone` écrit aussi `draw` et `presentAtOnce: false` ; `chord-anchor` écrit `presentAtOnce: false` ; `identify-note` écrit `enter`.
- Le § 5 nomme la correspondance de `identify-note` « la note d'une case » : elle s'appelle `same-place` (D4).
- Le § 5 ne dit pas que « acquis » est la règle de `isAcquired` (D5), ni l'ordre entre les exercices d'une séance (D6), ni le tirage de `chord-zone` (D7), ni que la liste est obligatoire (D2) et que ce qu'elle ne nomme pas est ignoré (D1).
- Le § 5 range « confusion » et « aide qui s'efface » parmi ce qui est déjà en données ou lu sur la tentative : c'est fait ainsi (D8), la présentation portant l'aide.
- Le § 5 dit « il ne reste aucune préférence ni aucun ordre calculé sur l'état du joueur » : c'est vrai du sujet ; le tirage de `chord-zone` en garde une mémoire (la dernière forme demandée), jusqu'au plan 4.

Laissé au plan 4 :

- le tirage `another-place` devient deux filtres (« à une case », « autre que le précédent ») et disparaît ; `domain/sets/draws.ts` lit encore `domain/triads/position.ts` : fait au plan 4a (D6, `params.learning.asks`, le registre des tirages est supprimé) ;
- `voicing-on-strings` garde une clé telle qu'elle est écrite : si des cordes écrites dans un autre ordre étaient acceptées, une liste importée pourrait faire deux cartes pour un même voicing : fait au plan 4a (l'ensemble lit une clé écrite autrement comme sa forme canonique) ;
- `itemsProblem` lit l'ensemble de l'exercice (`exerciseItemSet`) alors que le sujet lit celui de la capacité (`setOfSkill`) : ils ne diffèrent que pour un exercice de mémoire sur une vue de changements : encore ouvert, laissé au plan 4b.

Laissé au plan 5 :

- l'ordre des exercices d'une séance (`identify-note` avant `locate-note-string`) est encore dans `createAppServices` ; il passe à la routine. Deux exercices d'une séance sur une même capacité : le sujet refuse de se construire ; la routine devra le refuser au chargement ;
- les décomptes de l'accueil ne consultent que les quatre exercices du catalogue : il faudra l'union de tous les exercices qui travaillent une capacité, quand la Bibliothèque jouera des exercices de mémoire importés ;
- les statistiques de l'accueil lisent les tentatives par capacité, quel que soit l'exercice ;
- le jeu libre et la carte du manche prennent encore leurs places dans le code (`practiceCards()`, `LEARNABLE_FRETS`), égales aux listes d'aujourd'hui ;
- le jeu libre d'un exercice de mémoire importé déplace-t-il les cartes partagées ? C'est la décision de l'auteur.
- toujours du plan 2b : une sauvegarde importée sur un appareil qui n'a pas les fichiers apporte des cartes d'une capacité importée sans contrôle ; depuis ce plan elles sont gardées et ignorées tant qu'aucune liste ne les nomme.

## Réalisation (plan 4a, 2026-11-19)

Les dix décisions de ce plan :

- D1 : un choix s'écrit comme au § 7 : `{ "family", "of", "where", "order", "take" }`. Seule `family` est obligatoire.
- D2 : `of` nomme ce qui donne l'index à partir de l'élément (`note`, `voicing`, `root`). Absent : l'index que l'ensemble de l'élément donne à cette famille.
- D3 : l'index de `note-places` est une note, avec ou sans corde ; celui de `chord-shapes` est un accord sur des cordes, avec ou sans le degré de chaque corde.
- D4 : les filtres s'écrivent `{ "in": { "strings", "frets" } }`, `{ "at": <case> }`, `{ "position": { "beyond": "previous", "toward": "up" | "down", "turns": true } }` et `{ "other": "previous" }`. Une valeur est écrite, `{ "param" }` ou `{ "item" }` ; une valeur lue sur l'élément et absente laisse le filtre sans effet.
- D5 : « le précédent » est donné par qui appelle (le dernier membre demandé pour le tirage ; pour un passage, au plan 4b, le dernier entendu). Sans précédent, `position` et `other` ne restreignent rien.
- D6 : le tirage de `chord-zone` s'écrit `params.learning.asks`, un choix ; `draw` et le registre des tirages disparaissent.
- D7 : un membre se reconnaît à ce que le capteur rend : la hauteur seule pour une note, l'identité décidée par le capteur d'accords pour une forme.
- D8 : les confusions restent celles d'avant, dites par la famille.
- D9 : les juges `note` et `chord-voicing` et les dérivations `note-of-item`, `voicing-root`, `voicing-anywhere`, `voicing-at-position` sont supprimés. `name` et `pitch` restent ; `chord-grid` reste jusqu'au plan 4b.
- D10 : un plan de tour déjà stocké garde son ancien contenu, n'est pas réécrit et n'est rien rejugé (l'oracle de diagnostic laisse de côté un plan d'une sorte supprimée).

Ce que l'exécution a décidé en plus :

- Les filtres s'appliquent dans un ordre fixe du cœur, quel que soit l'ordre où ils sont écrits : `in` et `at`, puis `position` (le sens qui tourne est jugé sur ce que `in` et `at` ont laissé ; plusieurs `position` se croisent), puis `other`.
- `other` laisse le précédent admis quand rien d'autre ne reste (une seule forme), comme le tirage de `chord-zone`.
- `at` admet le membre qui couvre la case (entre sa case la plus basse et sa plus haute, une corde à vide comptant pour 0). La première écriture disait « une case du membre est celle-là » : la comparaison exhaustive l'a démentie, 44 bonnes réponses auraient été refusées.
- La valeur `fret` d'un élément de `voicing-on-strings` est la case que la consigne nomme ; sans elle, la place de la forme demandée (0 pour une forme à vide, sinon sa position) ; absente sans position : le filtre tombe et le voicing est accepté partout.
- Le précédent est un membre entier, de cet index ou d'un autre ; une famille redonne un membre à partir de son identité (`Family.member(id)`) et dit ce qu'une tentative garde d'une réponse (`Family.answer`).
- La validation et la compilation d'un choix ont leur module (`domain/exercise/selection/`), appelé par le tour et par `params.learning.asks`. Deux limites : 16 filtres, 8 attributs d'ordre (`MAX_SELECTION_FILTERS`, `MAX_SELECTION_ORDER`). Une prise lue dans un paramètre est vérifiée à chaque niveau, comme les valeurs des filtres.
- Un ensemble dit la famille dont il sait demander un membre (`ItemSet.asks`) ; `asks` sur une autre famille, avec un `of`, un `order` ou un `take` est refusé au chargement.
- `voicing-on-strings` lit une clé de voicing écrite autrement comme sa forme canonique : un élément, une carte.
- Une charge utile de note sans hauteur est jugée fausse, sans réponse ni confusion.
- Le présentateur de `voicing-on-strings` reçoit les attentes compilées du tour et donne au capteur d'accords les membres admis ; les sosies autour sont ceux d'avant.
- Mesuré avant de supprimer les anciens juges : 20 427 cas (élément, attente, réponse), 1 472 attentes du capteur d'accords et 85 492 comparaisons de mots et de dessins après un raté, aucune différence.

Ce que la revue finale a changé :

- Une zone dont une borne est lue, dans un paramètre ou sur l'élément, peut sortir à l'envers à un niveau ou pour un élément. Elle n'admet alors rien : la réponse est fausse, et la consigne garde l'élément de la carte. Le chargement refuse toujours une zone écrite à l'envers, et un paramètre qui tient une paire à l'envers.
- Un voicing qui n'est pas une triade serrée sur trois cordes n'a pas de sosies : le capteur d'accords n'attend que les formes admises.
- Un voicing sans forme sur le manche ne dessine rien : la consigne aidée garde ses mots, sans dessin.
- Après un accord raté, la forme attendue est la forme admise la plus proche de celle entendue, choisie parmi les formes admises seulement.
- Un tour écrit au plus 64 attentes (`MAX_ROUND_EXPECTATIONS`). Le contrôle par niveau des paramètres qu'un choix lit se fait une fois par tour pour chaque chemin lu. Ce qui reste coûteux : la limite des tours à vérifier (`MAX_ROUND_CHECKS`, 20 000) compte les tours, pas leurs attentes. Un exercice aux deux limites (20 000 tours à vérifier, 64 attentes chacun) peut prendre une dizaine de secondes à charger ; mesuré : 5,2 secondes pour 66 éléments au pire cas d'un tour. Ce n'est pas un blocage (la garde du plan 2b rend la main). Le budget par fichier laissé au plan 5 doit compter les tours multipliés par leurs attentes.

Ce qui diffère du § 6, que celui-ci ne dit pas (le § 6 reste tel quel) :

- Le § 6 dit qu'un seul juge remplace `note`, `chord-voicing` et `chord-grid` : `member` remplace les deux premiers ; `chord-grid` attend le plan 4b.
- Le § 6 dit « prendre : tout membre qui reste, ou seulement le premier » : `take` est un nombre (entier, d'au moins 1), lu écrit, dans un paramètre ou mesuré sur l'élément.
- Le § 6 dit que les filtres s'additionnent, chacun comparant un attribut à une valeur : ils s'écrivent chacun à sa façon (D4) et s'appliquent dans un ordre fixe.
- Le § 6 nomme `grid-changes` parmi les familles : elle n'est pas enregistrée, c'est le plan 4b.
- Le § 6 dit que la série tient la liste des membres entendus et que le contexte la passe au juge : le plan 4a ne donne au juge que le dernier membre (`previous`) ; la liste du passage est au plan 4b.
- Le § 6 dit « plus aucun sélecteur n'écrit `previous` ou `direction` sur les éléments » : vrai du plan 4a pour les notes et les triades ; le sélecteur du geste en écrit encore, jusqu'au plan 4b.
- Les attributs `strings` et `frets` d'un membre sont des listes ; `position` et `pitch` des nombres. Un attribut liste se compare par son plus petit élément (`order`, `position`).

Laissé au plan 4b :

- La famille `grid-changes`, le passage (`passages` : `of`, `members`, `each`, `opens`), les quatre exercices des changements en données, le juge `chord-grid` remplacé par `member` : fait au plan 4b.
- Le sens qui tourne « pour le reste du passage » : le filtre ne dit pas s'il a tourné ; qui appelle porte le sens. La montée cherche « au-delà » sur tous les groupes de cordes de l'élément alors qu'un index de `chord-shapes` n'en a qu'un : le tour se décide sur leur union, ou l'index prend plusieurs groupes. Fait au plan 4b : `select` dit si le sens a tourné, la source de passages fait tourner le paramètre de passage (D9), et l'index prend une zone de cordes (D3).
- La confusion de `chord-shapes` pour un index sans degrés (tous les renversements) est sommaire. Fait au plan 4b : celle des changements d'avant (aucun accord, autre accord, autre qualité, autre groupe de cordes, puis ce que demande le filtre qui a refusé : hors zone, pas plus haut, pas plus bas).
- Un cache des membres admis par contenu, si une mesure montre un coût (la lecture en direct rejuge à chaque réveil). Toujours ouvert : aucune mesure ne l'a demandé.
- `itemsProblem` contre l'ensemble du sujet (voir le plan 3). Fait au plan 4b : l'ensemble d'un exercice est celui de sa capacité (`exerciseItemSet` lit `setOfSkill`), les changements n'ayant plus d'ensemble trouvé par leur vue.
- Deux écritures du § 7 sont refusées aujourd'hui : `{ "in": { "param": "zone" } }` (une zone entière lue dans un paramètre) et `"toward": { "param": "direction" }`, avec `andBack`. Au plan 4b, `toward` lit un paramètre et `andBack` est ouvert ; la zone s'écrit `{ "in": { "frets": { "param": "zone" } } }`, l'écriture du § 7 reste refusée (D11).
- Le compilateur ne peut pas encore recevoir un membre précédent (`compileSelection`). Un membre précédent devrait être gardé dans un plan par son identité, et retrouvé par `Family.member`. Fait au plan 4b : le tour d'un passage porte l'identité du membre entendu avant lui (`passage.previous`), que `compileSelection` retrouve par `Family.member`.
- Les paramètres d'un passage (`each`) doivent entrer dans ce que voient le contrôle par niveau et les paramètres du tour. Fait au plan 4b : chaque valeur est vérifiée là où le tour la lit, et le tour les lit comme ses paramètres.
- L'index de `chord-shapes` sans degrés demande exactement trois cordes voisines. Pour une zone de cordes, il faudrait des membres sur chaque groupe de trois cordes voisines. Fait au plan 4b (D3).
- `admitted` ne dit pas si le sens a tourné. Fait au plan 4b : `select` le dit, et `refusedBy` nomme le filtre qui a refusé un membre.
- Les vues et le capteur doivent lire partout les membres admis : quand un filtre n'admet aucune forme, ou en admet plusieurs, un bon voicing joué à une octave non admise n'a pas de confusion. Fait au plan 4b pour les changements : le présentateur et le capteur lisent les membres admis, et la confusion dit le filtre qui a refusé. Pour les triades, rien n'a changé.
- `INDEX_DERIVATIONS` est la table de la guitare telle quelle ; elle est à réunir avec celle de `grid-changes`. Toujours ouvert : `grid-changes` n'a pas besoin de dérivation d'index, ses membres viennent du passage ; les dérivations de passage, elles, réunissent la guitare et la musique (`PASSAGE_DERIVATIONS`). `INDEX_DERIVATIONS` reste la table de la guitare, qui a gagné `placed` et `change-chord`.
- `MEMBER_VIEWS` est un registre par famille. Inchangé au plan 4b.

Fait dans ce plan : le nombre d'attentes d'un tour est borné (64), voir plus haut.

## Réalisation (plan 4b, 2026-11-19)

Les douze décisions de ce plan :

- D1 : `passages` s'écrit comme au § 7, `{ "of", "members", "each", "opens" }`, plus `again`, `restBars` et `passes` (D5, D6).
- D2 : les index d'un exercice sont toutes les combinaisons d'une valeur de chaque liste de `of`. La montée écrit deux grilles et deux groupes de cordes : quatre index. Une valeur qui ne multiplie pas les index s'écrit dans `params` : la zone de cordes de `grid-in-zone` et de `grid-reading`, `"strings": [4, 3, 2, 1]`.
- D3 : une zone de cordes est une liste de cordes voisines, trois ou plus. Les formes de `chord-shapes` sont celles de chaque groupe de trois cordes voisines de la zone : `[4, 3, 2, 1]` donne les groupes 4-3-2 et 3-2-1.
- D4 : le lien liste ses vingt-quatre accords dans `of.chord` (`C`, `Cm`, `C#`, `C#m`…), écrits une fois.
- D5 : un passage raté revient quand l'exercice l'écrit, `"again": "until-passed"`. Seul le lien l'écrit : un blues raté ne revient pas en boucle.
- D6 : `passes` est la part de changements justes qui fait réussir un passage (0,9 dans le catalogue) ; `restBars`, les mesures de silence avant la mesure comptée d'un passage (1 pour le lien).
- D7 : les zones de `grid-in-zone` sont les treize zones de cinq cases d'avant, dans l'ordre d'avant, écrites dans `each.zone`.
- D8 : une tentative de changement range son passage dans ses données (`data.passage` : son identité, son index, son rang, les valeurs de ses paramètres de passage). Les tentatives d'avant ce plan ne sont pas relues : au premier lancement, chaque index repart « jamais joué », la montée repart vers le haut, la zone de la première. Les niveaux de tempo sont gardés.
- D9 : quand le filtre « au-delà du précédent » tourne, la source fait tourner le paramètre de passage qu'il lit, pour ce changement et ceux qui restent.
- D10 : l'ouverture d'un index s'écrit `"opens": { "acquired": { "skill", "item", "need" } }`. Pour chaque changement, les formes que son contenu admet sans filtre sont groupées par leurs cordes ; l'index est ouvert quand les cartes qu'elles nomment sont acquises dans chaque groupe (`every-group`) ou dans un groupe au moins (`one-group`). `item` nomme la correspondance d'une forme vers l'élément de la capacité (`voicing`).
- D11 : `toward` lit un paramètre (`{ "param": "direction" }`). Un paramètre de passage ne se lit que dans une sélection : la valeur d'un filtre, `toward`, `take`. Un nombre du tour (`prompt.lead`, `window.ms`) écrit `{ "param": <un paramètre de passage> }` est refusé. La zone de cases s'écrit `{ "in": { "frets": { "param": "zone" } } }` ; l'écriture `{ "in": { "param": "zone" } }` du § 7 reste refusée.
- D12 : à un niveau qui écrit `"shapes": true`, les deux vues dessinent l'aide d'avant : la forme à jouer sur la grille ; sur le lien, les notes des formes sur le manche. Remplacée au plan 4c par sa D6 : un niveau d'aide de l'exercice montre `presentation.aided`, et `shapes` est parti.

Ce que l'exécution a décidé en plus :

- `passages.scope` nomme la clé de `of` dont la valeur sépare les niveaux de l'exercice (`"scope": "grid"` pour les trois exercices de grille). Sans elle, l'exercice a un seul niveau. Le cœur n'a pas à connaître le mot « grille ».
- Chaque contrôle est borné avant le travail qu'il borne : 500 index (`MAX_PASSAGE_INDICES`), 64 valeurs par paramètre de passage (`MAX_PASSAGE_EACH`), 256 membres par passage (`MAX_PASSAGE_MEMBERS`), 256 accords par grille (`MAX_GRID_CHANGES`, vérifié à la lecture de la grille), 16 mesures de silence (`MAX_REST_BARS`). Les membres d'un index sont comptés sans les filtres ni la prise qui lisent un paramètre de passage : le compte borne tous les passages de cet index.
- Un paramètre de passage n'a qu'une source. Un nom de `each` aussi écrit dans `params`, à un niveau de l'exercice ou de son échelle, qui est une clé de `of`, ou que le tour donne lui-même (`leadBeats`, `previewBeats`) est refusé. Ainsi aucune préséance n'est à décider, et aucune valeur non vérifiée n'arrive au compilateur.
- L'index de la famille se lit avec les paramètres de l'exercice à son niveau 1, jamais avec les paramètres de passage : tous les passages d'un index ont les mêmes membres avant filtre.
- « Entendu », c'est toute forme que la réponse nomme, quel que soit son accord : la forme d'un accord faux devient le précédent, comme avant. C'est elle qui sonne encore.
- `restBars` vient avant tout passage qui en suit un autre dans la séance, sauf celui qui revient par `again`. Le lien se reposait ainsi avant tout passage de la séance qui n'était pas enchaîné.
- Le capteur d'accords n'entend pas une forme admise qui sonne les mêmes notes que celle qui sonne encore. C'est une règle du capteur (« l'accord précédent qui sonne n'est jamais candidat »), tenue par le présentateur ; le juge, lui, n'a pas changé.
- Dans une source (le catalogue, puis les fichiers importés), les capacités de tous les fichiers, puis leurs grilles, rejoignent le registre avant qu'aucun exercice soit vérifié. Un exercice peut nommer une capacité ou une grille d'un autre fichier, quel que soit son nom. Un fichier importé `a.json` qui nomme une capacité de `b.json` est donc accepté ; `catalog/changes.json` garde son nom.
- Le niveau d'aide n'écrit ni `pass` ni `drop`. Le moteur compte alors trois réussites de suite, sans autre aide, pour revenir au niveau 1. L'ancienne aide partait après un passage réussi ; dix réussites de suite la garderaient bien plus longtemps.
- Un changement joué au niveau d'aide porte l'aide `'aid-level'`, qui compte comme le niveau lui-même, pas comme une aide : sans cela, personne ne remonterait du niveau d'aide. Cette règle vaut maintenant pour tout exercice (`aidedBeyondLevel` lit `levelAided`).
- `grid-reading` n'écrit ni niveau d'aide ni `flow.antiBlocking` dans ce plan, contrairement au § 7 (« chaque exercice ») : son aide ne dessinait rien, un niveau d'aide n'aurait fait qu'annoncer une aide absente, puis arrêter la séance. L'ancienne lecture n'avait pas d'aide non plus. Le dessin des membres admis vient avec le modèle générique du plan 4c, qui décidera alors de son niveau d'aide.
- Le bilan d'une séance de changements dit « On change d'air » et nomme l'exercice (et la grille) qui se repose, tant que la séance est encore en mémoire (`SessionSummary.gesture.changeOfAir`).
- Deux dérivations d'index s'ajoutent à la guitare : `placed` (une forme placée : son voicing et ses cases) et `change-chord` (la triade du symbole d'un changement, sur la zone de cordes du passage, sinon des paramètres).
- La vue `link-lane` trouve encore son présentateur par la vue (`VIEW_PRESENTERS` n'a plus qu'elle) : ses formes sont des éléments de `placed-voicing`, que les figures présentent autrement. Les trois exercices de grille trouvent le leur par l'ensemble `change`.
- La consigne de la grille se lit dans les paramètres de passage par leur nom : `direction` pour la montée, `zone` pour la zone, aucun des deux pour la lecture. C'est une exception du présentateur, jusqu'au modèle générique.
- « On change d'air », décidé sur un exercice, arrête la séance juste après le tour qui bloque, quel que soit l'exercice qui vient ensuite. L'écran de jeu et le bilan nomment l'exercice (et la grille) qui se repose.
- Deux portes fermées. Un exercice qui écrit `passages` n'apparaît pas sous « Exercices », et la liste ne garde que ce que la séance d'exercice sait servir : les éléments écrits, sinon des figures lues sur les éléments. La vue `link-lane` dessine un passage : un exercice qui n'écrit pas `passages` ne peut pas la nommer (refus `view "link-lane" draws a passage, and the exercise writes no passages`).
- Au chargement, le tour de chaque membre du premier passage de chaque index (chaque paramètre de passage à sa première valeur) est compilé. Un tour qui ne compile pas est un refus qui nomme le membre et l'index. Le compte des tours est borné avant de compiler : 5 000 (`MAX_PASSAGE_ROUND_CHECKS`), plus bas que les 20 000 des éléments, car un tour de changement coûte plus cher. Le catalogue en compile 408 (lien 336, montée 36, zone 18, lecture 18), en quelques millisecondes. Un index dont le premier passage n'a pas de membre, ou ne se lit pas, reste à la source, qui le saute en jeu. En jeu, la source compile aussi le tour entier de chaque membre : un passage dont un tour ne compile pas est sauté, jamais une erreur.
- La jouabilité, l'ouverture et le tournant se lisent au niveau 1. Un niveau qui change un paramètre que le contenu lit est joué sans cette vérification.

La preuve, avant le remplacement de l'ancienne règle :

- Une comparaison exhaustive de l'ancien et du nouveau, sur tous les changements du catalogue. Passages : 56 index, 660 tours. Jugement : 736 854 cas (lien 365 460, montée 82 532, zone 268 229, lecture 20 633), plus les tournants de la montée. Ouverture : 11 200 verdicts sur 200 tirages de cartes acquises. Aucune différence de passage, de verdict, de confusion, de membres admis (identités et ordre), de tournant ni d'ouverture.
- Capteur d'accords : 10 788 paires, 518 différences connues, toutes sur le lien, toutes expliquées par la règle de la forme qui sonne encore. Le présentateur garde cette règle : sur les 10 788 paires, il rend ce que rendait l'ancien.
- De bout en bout, l'ancien sélecteur et la nouvelle source joués côte à côte, sur 1 680 tours et trois façons de jouer : mêmes exercices, mêmes éléments, mêmes portées, mêmes mesures comptées et de silence, mêmes sens, mêmes zones, même précédent, même fin de séance. Seule l'aide est laissée de côté, par décision.
- Ce que l'ancienne règle décidait reste figé dans une table (`src/lib/testing/catalogChanges.spec.ts`), qui ne dépend plus d'aucune fonction supprimée.

Ce qui change pour le joueur (le tableau du § 7), et rien d'autre :

- Un passage n'est plus aidé « la première fois et après un passage raté », ni le lien « après 2 ratés dans un tour ». Le lien, la montée et la zone écrivent un niveau d'aide sous leur niveau 1, et `flow.antiBlocking` : trois ratés de suite au niveau 1 y font descendre, au passage suivant, annoncé ; la forme à jouer est alors dessinée ; trois réussites de suite ramènent au niveau 1.
- Un tour de lien raté n'est plus rejoué aussitôt, enchaîné, sans sa forme la plus grave : il revient entier, après une mesure comptée.
- Les zones de `grid-in-zone` sont une liste écrite.
- Un changement resté sans tentative (une pause qui laisse tomber le tour en cours) compte maintenant comme raté pour `passes` : la part de changements justes d'un passage se compte sur toute sa longueur.

### En attendant le plan 5

Trois ratés de suite au niveau 1 amènent le niveau d'aide au passage suivant. Trois ratés de suite au niveau d'aide amènent « On change d'air ». Aujourd'hui cela arrête toute la séance des changements, tout de suite, et met cet exercice au repos une heure (`BLOCK_REST_MS`). Un joueur qui ne réussit rien au lien finit donc sa séance après dix changements : un passage de sept changements, puis trois changements au niveau d'aide. Dans l'application, avec un micro qui n'entend rien, la séance s'arrête 37 secondes après « Commencer » ; l'écran de jeu montre « On change d'air » une seconde, puis le bilan, qui le dit et nomme l'exercice.

Le § 8 a déjà décidé la suite : l'exercice bloqué sort de la séance et se repose, la séance continue avec les autres. Le plan 5 le construit, avec les routines. D'ici là, deux choses à savoir :

- La séance suivante, lancée tout de suite, retombe d'abord sur l'exercice au repos, à son niveau d'aide : trois ratés de plus l'arrêtent encore. Le repos ne change pas ce que la séance pioche, et l'accueil ne le montre pas pour « Changements ».
- Reste à décider, au plan 5 : une séance doit-elle laisser de côté un exercice au repos tant qu'un autre a quelque chose à jouer ?

Laissé au plan 4c, et ce qu'il en est advenu :

- Un seul modèle générique pour les deux vues (`grid-scroll`, `link-lane`), construit par le cœur à partir du passage ; les modèles `GridStageModel` et `LinkLaneModel` et les présentateurs des changements qui les construisent disparaissent. Fait au plan 4c (D1) : les modèles sont partis ; les présentateurs restent pour le capteur d'accords et la tentative, sans rien dessiner.
- L'aide comme dessin des membres admis, et alors le niveau d'aide de la lecture. Fait au plan 4c (D5, D7).
- « Geste » devient « Changements » : la sorte de séance `'gesture'`, l'entrée de l'accueil, le bilan. Fait pour les mots de l'écran (l'accueil, l'en-tête du jeu, D8). La sorte de séance et le bilan restent au plan 5.
- La fin de `domain/gesture/`, qui ne garde que le bilan (`summary.ts`, qui lit `data.passage`, et à défaut ce que gardaient les tentatives d'avant). Laissée au plan 5, avec le bilan.
- `LinkLaneModel.following` est toujours vide : un tour raté ne s'enchaîne plus. Le champ part avec le modèle générique. Fait au plan 4c : parti avec `LinkLaneModel`.

Encore ouvert :

- La séance « Changements » ne joue que les quatre exercices du catalogue. Un fichier importé peut écrire `passages` : il est chargé et vérifié, mais aucune séance ne joue encore les passages d'un fichier importé (les routines, plan 5), et il n'apparaît pas sous « Exercices ».
- Le travail de la source pour chaque passage servi n'est pas borné (plan 5, avant qu'une séance joue des passages importés).
- Le banc ouvert (`openness.spec.ts`) ne tire aucun exercice à passages (plan 5).
- Les limites bornent le nombre de tours vérifiés au chargement, pas leur coût. Un fichier qui écrit à la fois le plus de tours de passage (5 000, `MAX_PASSAGE_ROUND_CHECKS`), le plus d'attentes par tour (64) et le plus de filtres par choix (16) est accepté après une demi-minute de chargement (28 secondes mesurées). Le budget par fichier du plan 5 doit compter les tours, leurs attentes et leurs filtres.
- Une séance enregistrée avant ce plan ne montre pas la forme attendue dans son bilan.

## Réalisation (plan 4c, 2026-11-19)

Les neuf décisions de ce plan, telles que le code les tient :

- D1 : un seul modèle pour les deux vues, `PassageStageModel` (`application/presentation/passageStage.ts`). Il porte la consigne du tour montré, la ligne du passage (`rounds` : pour chaque tour, sa place en temps, ses mots, son sens depuis le tour d'avant), le rang du tour montré, l'aide, le verdict et ses ratés. La grille le dessine en cases, le lien en tuiles et en flèches. `GridStageModel` et `LinkLaneModel` sont partis, avec ce que les présentateurs dessinaient (`stageOf`, `feedback`).
- D2 : les mots viennent de la `presentation`, dans les emplacements qui existaient : `primary`, `secondary`, `detail`, `target`, `aided`. Aucun emplacement nouveau. La grille ne montre pas `primary` : son accord du moment et celui d'« Ensuite » sont les mots de leurs tours (`target`, sinon `primary`), lus à chaque temps.
- D3 : la famille `chord-shapes` donne trois champs, nommés pour ce qu'ils disent : `{strings}` (« sol‑si‑mi »), `{frets}` (« 1 à 5 », vide sans zone de cases) et `{toward}` (« ↑ en montant », « ↓ en descendant », vide sans sens). Un changement de grille donne `{symbol}` et `{title}` ; une forme placée gagne `{quality}` (« mineur »).
- D4 : le sens d'un tour au suivant (`up`, `down`, `same`, ou rien) se lit sur l'attribut `position` de la famille du passage. Les changements d'une grille n'ont pas de position, donc pas de sens.
- D5 : l'aide est le dessin `admitted`. Sur le manche, il montre les formes admises au tour montré, et en plus clair celles du tour suivant. Le tour suivant est préparé avec la forme entendue une fois le tour jugé, sinon avec la forme d'avant du tour montré.
- D6 : un niveau d'aide de l'exercice montre `presentation.aided`. Le paramètre `shapes: true` est parti. La règle est la même sur toutes les vues : la consigne est aidée quand l'élément est servi aidé, ou joué à un niveau d'aide de l'exercice (`isAided`, dans `presentPrompt`).
- D7 : la lecture écrit son niveau d'aide, `{ "aid": true, "params": { "tempo": 80 } }`, et `flow.antiBlocking`, comme les trois autres.
- D8 : « Geste » s'écrit « Changements » (« Changes » en anglais) sur l'accueil et dans l'en-tête du jeu. Le code garde `'gesture'`. L'en-tête du jeu ne nomme la séance que dans le monde calme (`lane`, `answer-keys`) ; les vues des changements sont encore dans le monde pixel : en jeu, le mot ne se voit donc pas aujourd'hui.
- D9 : un passage portait déjà ses éléments (`PlannedItem.passage.items`) avant ce plan. Le modèle s'en sert, et refuse un tour qui viendrait sans eux. La ligne d'un passage se calcule une fois, et ses mots une fois par langue ; elle est oubliée avec le passage.

Ce que l'exécution a décidé en plus :

- Un champ du contenu se lit sur la première attente du tour qui le donne, et non sur la seule première attente qui a un choix. Un tour qui demande une note puis un accord donne ainsi les `{frets}` de l'accord. Le refus d'un champ inconnu nomme l'ensemble et toutes les familles du tour. Un champ de l'élément passe avant un champ du contenu de même nom.
- Un raté de changement et un raté de triade ne se disent pas de la même façon : la forme attendue n'est pas choisie pareil, et seule la triade donne une correction en mots. Le code les distingue par la présence de « précédent » (`previous`) dans le contenu : seul un contenu préparé dans un passage le porte. Une triade jouée dans un passage serait donc dite comme un changement.
- Le dessin du manche nomme les cordes qu'il dessine (`strings`) : celles de la zone que l'exercice écrit. Trois pour le lien et la montée, quatre pour la zone et la lecture. Le manche garde ainsi ses cordes d'un changement à l'autre.
- Sur le lien, une tuile dont le sens est « même place » écrit ses mots, comme le premier tour. Aucun passage du catalogue ne le fait.
- À un niveau d'aide, la consigne est dite comme pour un élément servi aidé.
- Un exercice de passages sans `presentation` est refusé au chargement (`writes a round but no presentation, and change draws no screen of its own`) : aucun présentateur ne dessine plus son écran. `SetPresenter.feedback` est parti. `SetPresenter.stageOf` reste, comme chemin général d'un présentateur qui dessinerait son propre écran ; aucun présentateur de l'application ne s'en sert plus.
- Les présentateurs des changements gardent ce que le capteur d'accords et la tentative demandent. L'attente du lien donne au capteur son seul accord, et non chaque forme de son tour : les candidats sont les mêmes.
- Le test ouvert essaie 300 exercices tirés au hasard au lieu de 200, car les nouveaux champs changent ce que le hasard donne. Un exercice écrit à la main y garde le cas d'une figure à hauteurs jugée par l'alignement.
- Après la revue finale :
  - La consigne est aidée par une seule règle, pour toutes les vues (D6).
  - Le dessin `admitted` est refusé au chargement en aide d'un exercice qui n'est pas sur une vue de passage : `presentation.aided.picture names picture "admitted", which only a view that draws a passage draws (grid-scroll, link-lane), and the exercise is drawn on "<vue>"`. Sous `fading`, il est refusé partout : `presentation.fading.picture names picture "admitted", which no view draws as a fading picture`.
  - Les mots d'un tour sur la ligne du passage sont son `target`, sinon son `primary`.
  - Un champ du contenu vient de la première attente qui le donne non vide.
  - Un élément de l'ensemble `change` qui nomme une grille qu'aucun fichier ne définit est refusé au chargement : `items[<n>] ("<clé>"): names grid "<grille>", which no file defines`.
  - L'aide de la grille a sa propre ligne, sous les cases, sur toute la largeur de la vue. Une case du manche n'est jamais plus étroite que sa note et son numéro : les numéros ne se touchent plus.
  - La ligne d'un passage additionne ses longueurs sans arrondi, et le lien trouve la tuile d'un tour à une erreur d'arrondi près. Un tour qui commence entre deux temps n'a pas de tuile sur le lien.

La preuve, avant de supprimer les anciens modèles :

- Une comparaison de l'ancien modèle et du nouveau, sur tous les passages du catalogue : chaque index, chaque valeur de chaque paramètre de passage. 84 passages (lien 48, montée 8, zone 26, lecture 2), 660 tours, 22 336 affichages comparés, en français et en anglais, au niveau 1 et au niveau d'aide (la lecture n'en avait pas encore), avant le jugement et après chaque sorte de jugement. Aucune différence de mot, de place, de case, de tuile, de sens, de rang, de raté ni d'aide. L'aide du lien a les mêmes notes. Celle des grilles contient toujours l'ancienne forme. La seule différence est la ligne des cordes du lien, décidée (plus bas).
- Sa limite : pour les ratés, la comparaison vérifie que les deux côtés appellent la même règle (`expectedShape`). La règle elle-même est tenue par `src/lib/testing/catalogChanges.spec.ts`.
- Puis la comparaison a été figée en table : 22 passages, 495 lignes (`src/lib/testing/catalogPassageStage.spec.ts`), qui ne dépend d'aucun modèle supprimé. Six lignes s'y sont ajoutées à la fin du plan : l'aide de la lecture, qu'elle n'avait pas quand la comparaison tournait.

Ce qui change pour le joueur, et rien d'autre :

- L'aide des grilles dessine sur le manche toutes les formes admises au changement montré et au suivant. Avant, elle dessinait une seule forme, choisie par le code, dans un dessin d'accord. Elle se voit aussi au dernier changement d'un passage, avec les seules formes de ce changement.
- L'aide des grilles a sa propre ligne, sous les cases, sur toute la largeur de la vue. Avant, elle tenait dans la petite place d'un dessin d'accord.
- L'aide des grilles n'a plus de légende : « Forme suivante » est parti. Le manche montre les formes de maintenant et d'ensuite, et l'écran de jeu ne porte pas de mots qui expliquent.
- L'en-tête du lien écrit ses cordes comme la voie des triades : « sur cordes sol‑si‑mi », sur une ligne. Avant : « sur cordes », puis « sol · si · mi » dessous.
- La lecture a son niveau d'aide et l'anti-blocage. Trois ratés de suite au niveau 1 amènent le niveau d'aide au passage suivant, annoncé ; toutes les formes de l'accord sur les quatre cordes ré, sol, si, mi sont alors dessinées. Trois changements justes de suite ramènent au niveau 1. Trois ratés de suite au niveau d'aide amènent « On change d'air ».
- « Geste » s'écrit « Changements ».

Laissé au plan 5 :

- La sorte de séance `'gesture'`, `AppServices.gesture()`, `SessionSummary.gesture` et `src/lib/domain/gesture/summary.ts` : les routines, et un seul bilan.
- `VIEW_PRESENTERS` : le présentateur du lien est encore trouvé par sa vue.
- Le banc ouvert ne tire toujours aucun exercice à passages.
- Tout ce que dit « En attendant le plan 5 » du plan 4b tient toujours.

### À regarder par l'auteur

- Un manche qui nomme ses cordes les écrit « mi si sol », dans la langue du joueur ; le manche d'une figure écrit E B G, les notes à vide. C'était déjà ainsi avant ce plan ; les deux sont maintenant dans un seul composant (`NeckPicture`).
- Le manche de l'aide du lien est dessiné par le dessin de manche commun, dont la largeur a une limite. Avant, il prenait toute la largeur de la vue. Dans l'aperçu, à la taille d'un écran d'ordinateur, il se lit bien.
- Sur un manche, une case ne fait jamais moins de 32 px de large. Un manche trop large pour l'écran défile de côté : au premier changement d'une montée, au niveau d'aide, le manche va de la case 0 à la case 16 ou plus ; sur un téléphone, une partie des formes est hors de l'écran. La règle vaut pour tous les manches (l'aide du lien, le manche d'une figure) ; sur un écran d'ordinateur rien ne change pour eux.
- Au premier changement d'une montée, rien n'a encore été entendu : toutes les formes de l'accord sont admises, pour ce changement et pour le suivant. Le manche de l'aide est alors chargé. C'est ce que le § 7 écrit ; à voir à l'écran.
- Sur la piste du lien, un tour qui commence entre deux temps n'a pas de tuile. Aucun passage du catalogue n'en a.

## Réalisation (plan 5a, 2026-11-19)

Le plan 5 de cette spec a été coupé en deux. Le plan 5a, celui-ci, fait le moteur : les routines en données, les séances par routine ou par exercice, la fin des sortes de séance et des identifiants du catalogue dans le code. Le plan 5b fera le reste du § 8 : le bilan unique, l'accueil sans « Exercices », la Bibliothèque, et le durcissement (voir « Laissé au plan 5b »).

Les onze décisions de ce plan, telles que le code les tient :

- D1 : la routine s'écrit comme au § 8, `{ "id", "title", "exercises", "opens" }`, plus `howTo` (D10). Le catalogue en écrit quatre, toutes dans un seul fichier, `catalog/routines.json`, et non chacune dans le fichier de ses exercices : l'ordre de ce fichier est celui de l'accueil (`notes`, `chords`, `chords-zone`, `changes`). `notes` s'appelle « Apprentissage », « Learn » en anglais, comme l'accueil l'écrivait.
- D2 : dans une routine de mémoire, le premier exercice listé qui a un élément prêt introduit. `notes` liste `identify-note` puis `locate-note-string`.
- D3 : trois sortes de routines sont refusées au chargement : celle qui mêle des exercices sur des capacités avec et sans mémoire, celle dont deux exercices travaillent la même capacité, celle dont un exercice sans mémoire n'écrit pas `passages`. Les exercices de rythme se jouent donc seuls.
- D4 : l'ouverture a quatre formes, `acquired`, `level`, `all`, `any`. Au plus 16 termes et 4 étages. `acquired` compte les cartes marquées acquises qu'une séance peut servir ; `level` compte le niveau 1 pour 1, et un niveau d'aide ne compte jamais. `chords-zone` s'ouvre à six triades acquises en ancrage. « Une fois ouverte, elle le reste » est tenu autrement que le plan le disait : une routine de mémoire reste montrée dès que le joueur a une carte d'un de ses exercices, quelle que soit son ouverture.
- D5 : l'accueil montre une routine quand tous ses exercices sont définis, que son ouverture est vraie et qu'elle a quelque chose à jouer (une carte, ou un élément prêt à être introduit ; pour des passages, un index ouvert), ou quand elle tient déjà une carte (D4). `changes` n'écrit pas d'ouverture. L'adresse d'une routine ne lit pas l'ouverture : elle lance la routine même fermée.
- D6 : une séance se lance par `/session?routine=<id>` (avec `&free=1` pour le jeu libre, et seulement `1`) ou par `/session?exercise=<id>`. Une adresse qui ne mène nulle part dit « Séance introuvable » avec un lien « Retour à l'accueil » : elle ne renvoie pas d'elle-même à l'accueil. Les anciennes adresses `?kind=learn`, `?kind=free` et `?kind=exercise` seul tombent là ; `kind` n'est plus lu. Une adresse qui nomme une routine et un exercice ne lit que la routine.
- D7 : le jeu libre d'une routine de mémoire tire vingt consignes parmi les éléments que ses exercices listent, chacune au niveau que l'élément tient. Le lien « Bibliothèque » mène au jeu libre de la première routine dont tous les exercices sont de mémoire, lue dans le registre : aujourd'hui `notes`. Un exercice de mémoire joué seul se joue en jeu libre sur ses seuls éléments ; un exercice de passages joué seul passe par la source de passages ; un exercice de figures, comme avant.
- D8 : « On change d'air » fait sortir l'exercice bloqué, sur sa portée, quand la source de la séance sait le laisser de côté : c'est la source de passages seule. La séance continue avec les autres et finit quand il ne reste plus rien. Ailleurs (la procédure d'apprentissage, le jeu libre, la séance d'un exercice de rythme), la séance finit comme avant. Un écart avec la lettre de D8 (« dans une séance d'un seul exercice, rien ne change ») : un exercice de grille joué seul ne laisse de côté que la grille où il a bloqué, et son autre grille continue. Le repos ne change pas ce que la séance suivante pioche.
- D9 : une séance de routine ouvre les capteurs des exercices de toutes les routines enregistrées, celles des fichiers importés comprises. Pour le catalogue, ce sont les huit exercices d'avant. Un exercice joué seul n'ouvre que les siens.
- D10 : l'en-tête du jeu porte le titre de la routine, ou celui de l'exercice joué seul (sinon le nom de sa capacité). « Jeu libre » seul pour une routine en jeu libre, « Jeu libre · <titre> » pour un exercice de mémoire joué seul. La consigne de départ vient du premier exercice, sinon de la routine (`howTo`), sinon de la phrase générale. Les quatre routines écrivent les textes d'avant, mot pour mot.
- D11 : aucun identifiant du catalogue n'est écrit dans `src/` hors des tests et des migrations ; un test de frontière le tient, en lisant les identifiants dans `catalog/` même (`src/lib/testing/catalogIdsBoundary.spec.ts`). Il laisse aussi de côté les anciennes étapes de la base et de la sauvegarde (les dossiers `legacy/`) et les données des tests du stockage (`src/lib/infrastructure/storage/testing/`). Le mot `chords` y est permis là où il est la clé des accords d'une grille (`src/lib/domain/grid/fromJson.ts`). Le manche se lit par ensemble (`note-on-string`, `placed-note`) ; le jeu libre et la carte prennent leurs places dans les listes des exercices ; les pages de démonstration choisissent dans le registre. Les constantes des tests vivent dans `src/lib/testing/catalogIds.ts`.

Ce que l'exécution a décidé en plus :

- Les routines sont lues après les exercices de tous les fichiers de leur source. Une routine importée peut nommer un exercice du catalogue ; une routine qui nomme un exercice refusé est refusée. Les routines ont leurs propres identifiants : une routine peut porter l'`id` d'un exercice.
- L'ordre de l'accueil est l'ordre où les routines sont lues : le catalogue, puis les fichiers importés dans l'ordre de leurs noms. Une routine importée se montre et se lance comme celles du catalogue.
- Une seule ligne de révisions pour toute routine de mémoire : « N révisions dues », sinon « Prochaines révisions · … », sinon rien. Une routine de passages n'en a pas.
- Les révisions d'une routine sont celles des cartes de ses propres exercices. La séance `chords` ne lit plus les cartes ni les tentatives de la zone : la procédure ne s'en servait pas, rien de ce qu'elle pioche ne change. Le bilan d'une séance de triades ne compte que les cartes de son exercice : l'ancrage ne compte plus celles de la zone, ni la zone celles de l'ancrage.
- Une routine dont un exercice n'est plus défini n'est pas montrée, et sa séance ne se lance pas : l'erreur nomme l'exercice. L'ancienne séance « Changements » jouait ceux des quatre qui restaient.
- Le bilan d'un exercice de mémoire joué seul est celui du jeu libre : toutes ses tentatives, pas de « Prochaines révisions ». Le bilan d'un exercice de passages joué seul est celui des changements.
- Le niveau atteint (`levelReached`) n'est écrit que pour un exercice joué seul, pas en jeu libre, et dont le premier élément n'a pas de portée.
- L'exercice qui sort a sa propre ligne dans l'écran de jeu, à côté d'une annonce de niveau : les deux se voient. La ligne disparaît quand le premier tour de l'exercice suivant s'ouvre. Pour un changement d'accord, c'est un peu avant la fin de la mesure comptée.
- Une limite connue : un tour préparé à l'avance (les tours de rythme) qui bloque arrête encore toute la séance. Aucun exercice qui sait sortir ne se prépare à l'avance aujourd'hui.
- Les quatre exercices des changements écrivent leur nom court en `title` (« Relier les formes », « Contrainte de déplacement », « Rester dans une zone », « Jam ») : le bilan et l'écran de jeu les lisent là. L'instantané du catalogue a changé pour ces quatre titres, en plus des quatre routines.
- Le bilan des changements laisse de côté les tentatives d'un exercice qu'aucun fichier ne définit plus comme exercice de passages, au lieu de lever une erreur.
- La carte du manche dessine une case vide là où une corde n'a pas une place qu'une autre a, et dit « Aucune case à montrer » quand aucun exercice ne liste de place.
- Le jeu libre tire maintenant dans l'ordre des listes des exercices, puis mélange : pour un même hasard, la suite tirée n'est plus celle d'avant. Ce sont les mêmes éléments, avec les mêmes chances.
- Le test de frontière ne cherche que des textes entiers entre guillemets : `notes`, `chords`, `changes` sont des mots courants, et chercher plus loin signalerait les textes de l'écran. Un identifiant caché dans un texte plus long n'est pas vu.
- Pendant le plan, l'accueil a lancé les séances par les anciennes sortes, le temps qu'une séance sache partir d'une routine. Ce passage provisoire a été retiré.

Ce qui change pour le joueur, et rien d'autre :

- Le bloc « Triades » dit « N révisions dues » ; avant, « N révisions de triades dues ».
- Les deux blocs des triades montrent « Prochaines révisions · … » quand rien n'est dû.
- Un bloc dit « On y revient plus tard » quand un de ses exercices se repose. « Changements » ne le disait pas.
- « On change d'air » ne finit plus la séance des changements : l'exercice bloqué sort, la ligne d'état le nomme (« On change d'air : Relier les formes »), les autres continuent, et le bilan nomme chaque exercice sorti.
- L'en-tête de la zone des triades dit « Triades vers une case » ; avant, « Triades · zone ».
- Le bilan d'une séance de triades ne compte que les cartes de son exercice : l'ancrage ne compte plus celles de la zone, ni la zone celles de l'ancrage.
- Les quatre exercices des changements sont nommés par leur nom court sur l'écran de jeu, comme dans le bilan.
- L'en-tête d'un exercice de mémoire joué seul dit « Jeu libre · <titre> » (le nom de sa capacité quand l'exercice n'écrit pas de titre).
- Les adresses : `/session?routine=…`, `/session?exercise=…`. Une ancienne adresse dit « Séance introuvable ».
- Tout exercice se joue seul par son adresse, un exercice de mémoire ou de passages compris. L'accueil ne les propose pas encore (plan 5b).
- Une routine d'un fichier importé se montre sur l'accueil et se joue.
- La carte du manche, avec un fichier importé qui liste des places inégales : des cases vides au lieu d'une erreur.

### À regarder par l'auteur

- Les chiffres de l'accueil (l'écart au temps, sa tendance) et les médianes du bilan comptent les tentatives de toute capacité sur `note-on-string` ou `placed-note`, une capacité importée comprise. La carte du manche, elle, ne dessine que les cartes de la première capacité de chaque ensemble.
- La progression d'une capacité du manche qu'aucun fichier ne définit plus est gardée, et n'est plus comptée dans ces chiffres.
- Au niveau d'aide du lien, les notes d'un accord écrit avec un bémol sont écrites depuis son nom en dièse : « F## A# D# » sous l'en-tête « Eb ». C'était déjà ainsi avant ce plan ; vu dans l'aperçu.

### À décider par l'auteur

- La fatigue arrête une séance de changements avant que le niveau d'aide puisse venir : un joueur qui commence bien puis rate (une baisse de vingt points entre ses six premières réponses et les six dernières, sur douze réponses) voit sa séance finir sur la fatigue. Seul un joueur qui rate dès les premiers changements voit l'exercice bloqué sortir et les autres continuer. C'était déjà ainsi avant ce plan. La fatigue doit-elle continuer d'arrêter une séance de changements à ce moment-là ?
- Une séance doit-elle laisser de côté un exercice au repos tant qu'un autre a quelque chose à jouer ? Aujourd'hui non : le repos ne change rien à ce que la séance suivante pioche. Lancée tout de suite, elle retombe sur l'exercice au repos, à son niveau d'aide.
- Une routine d'exercices sans mémoire et sans passages (des exercices de rythme) est refusée. Faut-il une séance qui les enchaîne ?
- `catalog/routines.json` est un cinquième fichier du catalogue, là où le § 2 en comptait quatre. L'autre voie aurait été un rang écrit sur chaque routine.
- D9 : une séance de routine ouvre les capteurs des exercices de toutes les routines. Faut-il n'ouvrir que les siens ?
- Le jeu libre garde sa règle : une tentative sur une carte apprise et laissée assez longtemps compte à froid. Le jeu libre d'un exercice de mémoire, importé ou non, fait donc avancer les cartes qu'il partage avec d'autres exercices (la question du plan 3).

### Laissé au plan 5b

- Un seul bilan, par exercice et par portée ; la fin de `src/lib/domain/gesture/` (`SessionSummary.gesture`, `summary.ts`). Le bilan d'une séance dont la routine ou l'exercice n'est plus défini retombe sur ce que ses tentatives disent, le bilan des notes quand rien ne nomme la routine ni l'exercice.
- L'accueil sans « Exercices », sans la tendance ni l'écart au temps. `AppServices.resting(ids)` sert encore aux blocs « Exercices ».
- La Bibliothèque : tous les exercices du registre, chacun joué seul. Le lien « Bibliothèque » mène encore au jeu libre des notes.
- Le mode dégradé quand un fichier du catalogue est refusé en production.
- Un budget par fichier, qui compte les tours, leurs attentes et leurs filtres ; la validation d'un exercice faite une fois au lieu de deux.
- Le travail de la source de passages pour chaque passage servi, à borner.
- Le banc ouvert (`openness.spec.ts`), qui ne tire encore ni exercice à passages ni routine.
- Un préfixe réservé aux identifiants du catalogue, avant que le format quitte la version 0.
- `VIEW_PRESENTERS` : le présentateur du lien est encore trouvé par sa vue.
- Le bilan d'une ancienne séance compte encore les cartes d'une capacité qu'aucun exercice enregistré ne travaille.
- Les révisions dues d'une routine comptent les cartes que ses propres exercices listent ; un bilan compte celles que liste n'importe quel exercice enregistré de la capacité.
- Si `routines()` échoue, une alerte remplace tout l'accueil. Il faudrait une garde par routine.

### Le sort des lignes « au plan 5 » des « Réalisation » précédentes

- Plan 2a, « les routines ne sont pas encore des objets ; la sorte de séance reste un type du code » : fait (D1, D6).
- Plan 2a et 2b (D9), le mode dégradé quand un fichier du catalogue est refusé : au plan 5b.
- Plan 2b, le budget par fichier et la validation faite une fois : au plan 5b.
- Plan 2b, un préfixe réservé aux identifiants du catalogue : au plan 5b.
- Plan 2b, le bilan d'une séance dont l'exercice a été supprimé montre le bilan des notes : toujours vrai quand rien ne nomme la routine ni l'exercice ; au plan 5b, avec le bilan unique.
- Plan 3, D6, l'ordre entre les exercices d'une séance en code : fait, c'est l'ordre de la routine (D2).
- Plan 3, deux exercices d'une séance sur une même capacité : fait, la routine est refusée au chargement (D3).
- Plan 3, les décomptes de l'accueil ne consultent que les quatre exercices du catalogue : fait, une carte est servie dès qu'un exercice enregistré de sa capacité la liste.
- Plan 3, les statistiques de l'accueil lisent les tentatives par capacité : fait, elles lisent les capacités des deux ensembles du manche (voir « À regarder par l'auteur »).
- Plan 3, le jeu libre et la carte prennent leurs places dans le code : fait (D11).
- Plan 3, le jeu libre d'un exercice de mémoire importé déplace-t-il les cartes partagées : reste à l'auteur (voir « À décider par l'auteur »).
- Plan 3 (du plan 2b), une sauvegarde importée sur un appareil sans les fichiers apporte des cartes non vérifiées : inchangé, au plan 5b.
- Plan 4b, « En attendant le plan 5 » : fait, l'exercice bloqué sort et la séance continue (D8) ; l'accueil montre le repos. La question reste à l'auteur.
- Plan 4b, la sorte de séance `'gesture'` : faite. Le bilan et la fin de `domain/gesture/` : au plan 5b.
- Plan 4b, aucune séance ne joue les passages d'un fichier importé : fait, par une routine ou seul. Un tel exercice n'est toujours pas sous « Exercices ».
- Plan 4b, le travail de la source par passage non borné : au plan 5b.
- Plan 4b, le banc ouvert sans exercice à passages : au plan 5b.
- Plan 4b, le budget par fichier qui compte tours, attentes et filtres : au plan 5b.
- Plan 4c, `AppServices.gesture()` et la sorte `'gesture'` : faits (`routines()`). `SessionSummary.gesture` et `summary.ts` : au plan 5b.
- Plan 4c, `VIEW_PRESENTERS` : au plan 5b.
- Plan 4c, le banc ouvert : au plan 5b.
- Plan 4c, « tient toujours » : ce n'est plus vrai, voir le plan 4b ci-dessus.

## Réalisation (plan 5b, 2026-11-20)

Le plan 5b est le dernier du chantier. Il fait le reste du § 8 : un seul bilan, l'accueil sans « Exercices », la Bibliothèque. Il durcit ce qui devait l'être avant qu'un fichier importé joue vraiment : le budget de vérification d'un fichier, le travail borné de la source de passages, le banc ouvert qui tire des passages et des routines.

Avant la première tâche, une décision d'ordre : la Bibliothèque a été construite avant l'accueil. Sinon, entre les deux, les exercices de rythme n'auraient plus été joignables.

Les décisions de ce plan, telles que le code les tient :

- D1 : un bilan, une forme. `SessionSummary.exercises` a une ligne par exercice et par portée joués : les tours joués et réussis, les tours réussis avec une aide au-delà de leur niveau (« dont N avec aide »), le niveau atteint, le tempo du premier et du dernier tour, les passages réussis sur joués, « On change d'air » quand l'exercice est sorti. Les ratés à contester et, tant que la séance est en mémoire, ses séries et les tours à réécouter restent, pour tout exercice. Une séance de mémoire garde en tête son bloc d'avant. Le niveau n'est dit que pour l'exercice joué seul dont le tour écrit une figure : les niveaux des changements sont leurs tempos, déjà dits. Le calcul vit dans `src/lib/domain/session/played.ts`, les ratés dans `misses.ts` ; `GestureSummary`, `ExerciseSummary` et `src/lib/domain/gesture/` sont partis.
- D2 : un exercice qu'aucun fichier ne définit plus garde sa ligne, avec son identifiant pour titre. Le bilan et l'accueil comptent les mêmes cartes, celles que listent les exercices de la séance : une seule fonction le fait pour les deux (`cardsListedBy`).
- D3 : l'accueil liste les routines ouvertes, dans l'ordre du registre, et rien d'autre ; Espace lance la première. Deux lignes d'état : un fichier importé refusé, comme avant, et, nouvelle, dans toute construction, « Une partie du catalogue n'a pas pu être chargée. ». Une routine dont le calcul échoue est fermée et notée dans la console ; les autres restent.
- D4 : l'écart au temps et sa tendance ne sont montrés nulle part. `homeStats()`, `HomeStats`, `computeHomeStats`, la tendance et `isNeck` sont supprimés. La page « Progrès » garde la carte du manche.
- D5b : le lien « Bibliothèque » mène à la Bibliothèque. Le jeu libre mêlé des notes n'a plus de lien ; son adresse, `/session?routine=<id>&free=1`, marche toujours.
- D5 : la Bibliothèque (`/library`) liste tous les exercices du registre. Pour chacun : son titre (celui de l'exercice, sinon le nom de sa capacité), les routines qui le listent, « On y revient plus tard » quand il se repose, et un lien pour le jouer seul. Un exercice qui n'a rien à jouer maintenant est listé sans lien, avec « Rien à jouer pour l'instant ». Aucun tri, aucun filtre, aucune recommandation. L'ordre a été changé pendant l'exécution (plus bas).
- D6 : `AppServices.library()` remplace `resting(ids)`. Jouable veut dire : un exercice de mémoire qui liste des éléments, un exercice de passages dont un index est ouvert, ou un exercice que la séance d'exercice sait servir. La Bibliothèque lit la même règle que `startExercise` pour savoir comment l'exercice se joue seul (`aloneSourceOf`, dans `domain/exercise/registry.ts`), et demande en plus un index ouvert à un exercice de passages ; `startExercise` ne le demande pas. Le bilan lit encore `exerciseSessionExercises()` pour les liens de « Essaie plutôt ».
- D7 : chaque fichier a un budget de vérification de 300 000 unités (`MAX_FILE_CHECK_COST`, `domain/exercise/checkCost.ts`). Un tour compilé au chargement pèse 1, plus une unité par attente, plus une par filtre de ses choix, plus les paramètres qu'il recopie. Une figure compte ses notes. Les niveaux comptent tout ce que leur lecture peut recopier, au pire. Le compte est vérifié avant chaque travail qu'il paie. Au-delà, l'exercice en cours et les suivants du même fichier sont refusés : `this file asks more checking than a start can afford (cost <n>, at most 300000)`. Les limites par tours (`MAX_ROUND_CHECKS`, `MAX_PASSAGE_ROUND_CHECKS`) restent. Le fichier du plan 4b, qui chargeait en 28 secondes, est refusé avec cette phrase. Un fichier du catalogue coûte moins de 1 % du budget. Le but est qu'aucun fichier accepté ne se charge en plus de deux secondes environ. Trois tours de revue ont chacun trouvé un fichier accepté plus lent, écrit pour l'être (5,8 secondes, puis 16, puis 3,3 à 6,3), et chaque fois la règle a été resserrée. Le but tient sur tous les fichiers écrits pour être lents que les revues ont essayés, mais il n'est pas prouvé.
- D8 : la source de passages borne son travail. Chaque fois que la séance cherche le passage suivant, les essais ratés d'un index sont comptés en unités, comme au chargement ; passé 1 000 unités (`MAX_PASSAGE_TRIES`, `domain/session/passageSource.ts`), l'index est laissé de côté pour la séance. Le plan écrivait « un nombre fixé d'essais par passage servi » : la règle a été écrite autrement (plus bas).
- D9 : une consigne mal écrite est refusée en mots, avec l'emplacement nommé : un emplacement d'une seule langue, un nombre, un objet sans texte, `aided` ou `fading` écrits comme un texte. Avant, sa lecture levait une erreur.
- D10 : le banc ouvert (`openness.spec.ts`) tire aussi des exercices à passages et des routines, de mémoire et de passages. Il joue tous ceux que les validateurs acceptent par les vrais services (`startExercise`, `startRoutine`), avec de bonnes réponses et sans réponse. Il n'a trouvé aucun défaut dans le code de l'application.

Ce que l'exécution a décidé en plus :

- La Bibliothèque range les exercices dans l'ordre des routines telles qu'elles sont lues, les fermées comprises (`libraryOrder` ; l'accueil, lui, ne montre que les ouvertes), chaque routine avec ses exercices dans l'ordre où elle les écrit, chaque exercice une fois ; puis ceux qu'aucune routine ne liste, dans l'ordre où ils sont lus. L'ordre du registre suivait les noms des fichiers, par hasard. C'est un ordre de présentation, pas un classement.
- Un exercice dont on ne peut pas dire s'il se joue (le calcul de son ouverture échoue) est listé sans lien et noté dans la console. Le reste de la Bibliothèque s'affiche.
- `startExercise` lance encore un exercice de passages sans index ouvert : sa séance finit aussitôt sur le bilan. La Bibliothèque ne lui donne pas de lien.
- Sans routine ouverte, l'accueil n'a pas de « Commencer » : le bouton ne ferait rien. Le lien vers la Bibliothèque le remplace.
- « dont N avec aide » compte les tours réussis joués avec une aide au-delà de leur niveau : c'est le nombre que le bilan du rythme montrait.
- Un exercice joué seul sans aucun tour n'a de ligne que si son niveau se dit (un exercice de figures).
- Un exercice de passages qu'aucun fichier ne définit plus n'a pas de décompte de passages, puisque son seuil est inconnu ; sa ligne dit ses changements.
- Une séance qui finit sur « On change d'air » le dit une seule fois, avec le nom de l'exercice, ce qui casse et « Essaie plutôt ».
- Le budget compte tout ce que la lecture d'un niveau peut recopier : chaque valeur qu'il écrit à sa taille entière, et sous chaque clé où entre un de ses chemins tout ce que les paramètres et le niveau du dessous y tiennent. C'est une borne haute, pas un compte exact : compter trop est accepté, compter trop peu ne l'est pas. Sans cela, un fichier de 52 kB se chargeait en 16 secondes, puis d'autres en 3,3 et 6,3 secondes.
- Un tour à figure tient au plus 1 024 notes une fois sa figure répétée (`MAX_FIGURE_ROUND_NOTES`), toutes ses figures comptées, vérifié avant que la figure soit répétée, au chargement comme en jeu. La raison est le juge : son alignement des attaques, plus ancien que ce chantier, prend environ une demi-seconde pour 1 000 notes, 3,7 secondes pour 2 000, 26 secondes pour 4 000. Un thème de plusieurs centaines de notes reste un seul tour. Le compte arrondit à la boucle entière : un tour dont la dernière boucle est coupée peut être refusé à quelques notes de 1 024. Cette règle remplace une première règle du plan, qui ne bornait pas les notes d'un tour à figure.
- Un tour dure au plus 1 024 mesures (`MAX_ROUND_BARS`), vérifié dès que sa longueur est connue, au chargement comme en jeu : `round.length spans <n> bars, more than the 1024 a round may span`. Rien ne bornait la longueur d'un tour ; une séance dure cinq minutes, et 1 024 mesures durent 51 minutes à ♩ = 80. Une mesure muette écrite au-delà du tour est refusée : `round.mutedBars writes bar <b>, past the round's <n> bars`.
- Le chargement compile chaque figure qu'un exercice sans éléments listés peut servir, à chaque niveau de l'exercice, compté dans le budget et dans `MAX_ROUND_CHECKS`. Ce qui est accepté au chargement ne doit pas échouer en jeu.
- Deux cas restent non vérifiés au chargement : un niveau d'échelle au-dessus du premier qui change la longueur d'un tour à figure, et le tour d'un passage à un autre niveau, ou avec d'autres valeurs de ses paramètres, que les premiers. Aucun exercice du catalogue ne le fait. Un tel tour, s'il ne se compile pas, échoue en jeu sur une erreur que la séance ne rattrape pas ; les deux limites, 1 024 mesures et 1 024 notes, le font échouer vite.
- La source sert toujours un passage jouable, quel que soit son poids. Son budget ne paie que ce qu'elle dépense sur des passages injouables. Elle ne répond « plus rien » que lorsqu'il ne reste rien à jouer. Aucune borne ne coupe une recherche du passage suivant : la couper ferait finir une séance qui a encore quelque chose à jouer. Le prix connu : un fichier écrit de sept exercices aux passages lourds qui échouent tous fait attendre environ deux secondes, une fois par séance.
- Les changements d'une grille sont lus une fois par grille (`gridChanges`), et non à chaque attente : c'était l'essentiel des 28 secondes.
- `aided` ou `fading` écrits comme un texte sont refusés, pas devinés : un texte ne dit pas s'il est une ligne ou un dessin.
- Le banc a ses propres capacités de passages. Il compte ce qu'il refuse, et les tours qu'il laisse sans vérifier, avec la raison de chacun ; chaque refus doit nommer un champ ; une partie jouée sans réponse doit finir d'elle-même ; un exercice avec anti-blocage joué seul sans réponse doit finir par « On change d'air ».
- `scripts/functional-ui.mjs` visite maintenant l'accueil, la Bibliothèque, chaque routine du catalogue, un exercice de chaque sorte et un fichier importé par les réglages, avec un micro simulé. Il n'a pas été lancé.

Ce qui change pour le joueur, et rien d'autre :

- Le bilan a une seule forme pour toute séance, et tous les nombres d'avant y sont. Ce qu'il montre en plus : la ligne d'un exercice de rythme dit son tempo ; une séance de changements encore en mémoire montre ses séries, à réécouter ; une ligne de changements peut dire « dont N avec aide » ; une séance de changements dont tous les exercices sont sortis propose « Essaie plutôt ».
- Un exercice qu'aucun fichier ne définit plus a sa ligne dans le bilan, sous son identifiant.
- L'accueil ne montre que les routines ouvertes. « Exercices », l'écart au temps et sa tendance sont partis, et l'écart au temps ne se voit plus nulle part.
- Sans routine ouverte, l'accueil dit « Rien à jouer pour l'instant », avec un lien vers la Bibliothèque.
- Quand une partie du catalogue n'a pas pu être chargée, l'accueil le dit en une ligne, dans toute construction ; l'accueil et la Bibliothèque listent ce qui reste.
- Une routine dont l'ouverture ne se calcule pas disparaît de l'accueil, et seule la console le dit ; ses exercices restent dans la Bibliothèque.
- Le lien « Bibliothèque » mène à la Bibliothèque : les onze exercices du catalogue et ceux des fichiers importés, chacun jouable seul. Les trois exercices de rythme y sont, sans routine. Le jeu libre mêlé des notes n'a plus de lien.
- Un exercice dont on ne peut pas dire s'il se joue est listé sans lien.
- Un fichier trop coûteux à vérifier est refusé avec une phrase qui le dit. Un fichier écrit pour être lent ne ralentit que le démarrage de celui qui l'importe, et un chargement qui ne s'est pas terminé est sauté une fois au démarrage suivant. Une consigne mal écrite est refusée en mots.

### À décider par l'auteur

Les questions du plan 5a restent (voir « État du chantier 2 »). Ce plan en ajoute trois :

- Les ajouts du bilan unique (le tempo du rythme, les séries des changements, « dont N avec aide », « Essaie plutôt » après les changements) sont à voir à l'écran ; chacun s'enlève en une ligne.
- L'ordre de la Bibliothèque (les routines de l'accueil, puis le reste) a été choisi pendant l'exécution.
- D4 retire l'écart au temps et sa tendance « pour l'instant » : leur place, s'ils reviennent, reste à décider.

### Le sort des lignes « Laissé au plan 5b » du plan 5a

- Un seul bilan, la fin de `src/lib/domain/gesture/` : fait (D1). Le bilan d'une séance dont la routine ou l'exercice n'est plus défini dit ce que ses tentatives disent (D2) ; le bloc des notes reste quand rien ne dit ce qu'elle a joué.
- L'accueil sans « Exercices », sans la tendance ni l'écart au temps ; `resting(ids)` : fait (D3, D4, D6).
- La Bibliothèque : faite (D5, D5b).
- Le mode dégradé quand un fichier du catalogue est refusé en production : fait. La ligne de l'accueil le dit, une garde par routine et par exercice de la Bibliothèque évite qu'une erreur emporte tout, et l'accueil comme la Bibliothèque listent ce qui reste (essayé avec `catalog/rhythm.json` illisible).
- Un budget par fichier : fait (D7). La validation d'un exercice faite une fois au lieu de deux : non. L'aperçu vérifie encore chaque exercice une seconde fois ; le budget compte les deux fois.
- Le travail de la source de passages : borné (D8).
- Le banc ouvert : il tire maintenant des exercices à passages et des routines (D10).
- Un préfixe réservé aux identifiants du catalogue : non, il reste à l'auteur.
- `VIEW_PRESENTERS` : inchangé, le présentateur du lien est encore trouvé par sa vue.
- Le bilan d'une ancienne séance qui comptait les cartes d'une capacité qu'aucun exercice enregistré ne travaille : fait, il ne compte que les cartes que listent les exercices de la séance (D2).
- Les révisions dues d'une routine et celles du bilan comptées autrement : fait, une seule fonction (D2).
- Une alerte à la place de tout l'accueil quand `routines()` échoue : fait, une garde par routine. Une lecture des données qui échoue donne encore l'alerte.

## État du chantier 2

Le chantier a eu neuf plans : 1, 2a, 2b, 3, 4a, 4b, 4c, 5a et 5b. Tous sont faits sur la branche `chantier-2-no-exercices-in-code`, qui n'est pas fusionnée. Cette section dit, pour chaque partie de la spec, ce qui était demandé et ce qui est construit, puis ce qui reste ouvert. Les décisions prises sans l'auteur sont dites dans chaque « Réalisation » ci-dessus. Un relevé de toutes, plan par plan, existe aussi hors du dépôt (`.superpowers/sdd/decisions-chantier-2.md`) ; cette section se lit sans lui.

### Section par section

- **§ 2, les objets et les fichiers.** Demandé : un fichier `{ "format": 0, "skills", "grids", "exercises", "routines" }`, des identifiants par sorte d'objet, un catalogue en fichiers. Fait : le format et sa lecture (`src/lib/domain/definitions/`), décrits dans `docs/fichiers-de-definitions.md` (qui remplace `docs/exercices-locaux.md`) ; les sept ensembles (`src/lib/domain/sets/`) ; les onze capacités du catalogue ; des identifiants faits de lettres, de chiffres, de `-`, de `_` et de `.`, `unknown` et les huit anciens identifiants réservés. Écart : le catalogue tient en cinq fichiers (`catalog/`), `routines.json` en plus des quatre.
- **§ 3, charger, importer, refuser.** Demandé : un catalogue embarqué, des fichiers importés depuis les réglages, un seul registre, des refus lisibles, une progression gardée sans définition. Fait : le catalogue est lu sans refus par un test ; les fichiers importés sont rangés dans la table `definitionFiles`, relus à chaque démarrage, emportés par la sauvegarde, d'au plus un million de caractères ; les registres sont remplis par `loadDefinitions` (`src/lib/composition/definitions.ts`) ; un refus nomme le fichier, l'objet et le champ, dans les réglages et par une ligne de l'accueil ; une progression sans définition est gardée et ignorée ; un chargement interrompu est sauté une fois ; le catalogue amputé se dit sur l'accueil ; chaque fichier a son budget de vérification. `exercises.local/` a disparu.
- **§ 4, les capacités dans le moteur.** Demandé : les mécaniques coupées en capacités et en ensembles. Fait : la capacité est une donnée, l'ensemble du code (`src/lib/domain/sets/`, présentateurs dans `src/lib/application/sets/`) ; les cartes et les tentatives sont rangées par capacité ; un exercice de mémoire avec un tour jugé au cycle est refusé. Reste : le présentateur du lien est trouvé par sa vue (`VIEW_PRESENTERS`).
- **§ 5, l'apprentissage en données.** Demandé : un seul sujet construit à partir des données. Fait : `exerciseSubject` (`src/lib/domain/learning/exerciseSubject.ts`) ; les listes `items` du catalogue, dans l'ordre d'avant ; `params.learning.enter` (correspondances `same` et `same-place`), `presentAtOnce` et `asks` ; les générateurs d'ordre et le miroir supprimés (C12).
- **§ 6, familles, filtres, zones.** Demandé : des familles, trois opérations, un seul juge de contenu. Fait : `note-places`, `chord-shapes` et `grid-changes` (`src/lib/domain/families/`, un cœur qui ne connaît aucun instrument) ; les choix et leurs quatre filtres (`src/lib/domain/exercise/selection/`) ; le juge `member` (`src/lib/domain/judges/member.ts`), qui remplace `note`, `chord-voicing` et `chord-grid`. « Près d'un repère » et « pas encore joué » attendent leur exercice.
- **§ 7, les changements en données.** Demandé : les quatre exercices en données, un modèle générique pour leurs deux vues. Fait : `passages` (`src/lib/domain/exercise/passage/`) ; la source de passages (`src/lib/domain/session/passageSource.ts`) ; les quatre exercices dans `catalog/changes.json`, chacun avec son niveau d'aide et l'anti-blocage ; un seul modèle pour les deux vues (`src/lib/application/presentation/passageStage.ts`) ; `gestureSelector.ts` et `src/lib/domain/gesture/` supprimés. Écart : une zone de cases s'écrit `{ "in": { "frets": { "param": "zone" } } }`, l'écriture du § 7 reste refusée.
- **§ 8, routines, accueil, Bibliothèque.** Demandé : les routines, plus de sortes de séance, un exercice bloqué qui sort, un seul bilan, l'accueil des routines, la Bibliothèque. Fait : les routines en données (`src/lib/domain/routine/`, `catalog/routines.json`) ; une séance part d'une routine ou d'un exercice ; « On change d'air » fait sortir un exercice de passages et la séance continue ; `routines()` dit l'accueil ; un seul bilan (`src/lib/domain/session/played.ts`) ; la carte du manche lue par ensemble ; l'accueil des routines ouvertes ; la Bibliothèque (`/library`, `src/lib/ui/screens/library/`). Écart : hors d'une séance de passages, « On change d'air » finit la séance, comme avant.
- **§ 9, la migration 13 et la sauvegarde 9.** Fait au plan 2a (`src/lib/infrastructure/storage/migrations/v13.ts`), essayé sur une base 12 (`db.spec.ts`) et une sauvegarde 8 (`v13.spec.ts`). Aucune version depuis : la base reste à 13, la sauvegarde à 9.
- **§ 10, les trous de validation.** Fait : la validation court au chargement, pour le catalogue comme pour chaque fichier importé (`src/lib/application/definitions/checks.ts`), et plus à chaque consigne ; chaque trou que la spec liste est refusé ; chaque limite est vérifiée avant le travail qu'elle borne ; un fichier entier a son budget. Reste : un exercice est vérifié deux fois, l'aperçu le revérifiant.
- **§ 11, preuves et tests.** Fait : le catalogue lu sans refus ; les plans du rythme figés (`rhythmExercises.parity.spec.ts`) et ceux des changements en tables (`catalogChanges.spec.ts`, `catalogPassageStage.spec.ts`) ; la frontière des identifiants (`catalogIdsBoundary.spec.ts`) et celle du cœur des familles ; un ensemble que le cœur ne connaît pas joué de bout en bout (`thirdSet.spec.ts`) ; le banc ouvert, qui tire des exercices, des exercices à passages et des routines ; les règles gardées jouées de bout en bout (`triadsSession.spec.ts`, la source de passages) ; la migration. En partie : aucun test ne joue de bout en bout un faux instrument avec sa propre famille et son propre attribut (une famille de test ne sert qu'à la ligne d'un passage, dans `passageStage.spec.ts`) ; le script de jeu `scripts/functional-ui.mjs` a été étendu, jamais lancé.

### Ce qui reste ouvert, pour l'auteur

- Les noms du format ont été choisis sans l'auteur : `family`, `of`, `where`, `order`, `take`, `asks` ; `passages` et ses clés (`members`, `andBack`, `each`, `opens`, `need`, `again`, `restBars`, `passes`, `scope`) ; les champs `{strings}`, `{frets}`, `{toward}` ; le dessin `admitted` ; les clés d'une routine (`title`, `exercises`, `howTo`, `opens`). Ils sont à relire avant que le format quitte la version 0.
- Un préfixe réservé aux identifiants du catalogue reste à choisir avant que le format quitte la version 0. Sans lui, un identifiant que le catalogue prendrait un jour, déjà pris par un fichier de joueur, ferait refuser l'objet du joueur et donnerait sa progression à celui du catalogue.
- Des changements visibles sont à regarder à l'écran : l'aide des grilles (toutes les formes admises, sans légende, sur sa propre ligne), l'en-tête du lien sur une ligne, un manche qui défile de côté sur un téléphone, le manche chargé au premier changement d'une montée (plan 4c) ; l'accueil, la Bibliothèque, son ordre, et les ajouts du bilan unique (plan 5b).
- La fatigue arrête une séance de changements avant que le niveau d'aide puisse venir. Doit-elle continuer de le faire ?
- Une séance doit-elle laisser de côté un exercice au repos tant qu'un autre a quelque chose à jouer ? Aujourd'hui, la séance suivante retombe sur lui, à son niveau d'aide.
- Le jeu libre d'un exercice de mémoire, importé ou non, fait avancer les cartes qu'il partage avec d'autres exercices. Est-ce voulu ?
- Une séance de routine ouvre les capteurs des exercices de toutes les routines (D9 du plan 5a). Faut-il n'ouvrir que les siens ?
- `catalog/routines.json` est un cinquième fichier du catalogue. L'autre voie était un rang écrit sur chaque routine.
- Une routine d'exercices sans mémoire et sans passages, comme des exercices de rythme, est refusée. Faut-il une séance qui les enchaîne ?
- Au niveau d'aide du lien, les notes d'un accord écrit avec un bémol sont écrites depuis son nom en dièse (« F## A# D# » sous « Eb »).
- Un manche qui nomme ses cordes les écrit « mi si sol », dans la langue du joueur ; le manche d'une figure écrit E B G.
- La carte du manche ne dessine que les cartes de la première capacité de chaque ensemble, alors que les médianes du bilan comptent les tentatives de toute capacité sur `note-on-string` ou `placed-note`.
- L'écart au temps et sa tendance ne se voient plus nulle part (D4 du plan 5b) : leur place, s'ils reviennent, reste à décider.

### Ce qui reste à faire, hors de ce chantier

- Rendre moins chère la recherche du juge, l'alignement des attaques d'un tour, puis relever ou retirer la limite de 1 024 notes par tour.
- Vérifier un exercice une seule fois au chargement, au lieu de deux.
- Rattraper en jeu l'erreur d'un tour qui ne se compile pas, et sauter ce tour : les deux chemins que le chargement ne vérifie pas finissent aujourd'hui la séance sur une erreur.
- Trouver le présentateur du lien par son ensemble, et non par sa vue (`VIEW_PRESENTERS`).
- Une sauvegarde importée sur un appareil qui n'a pas les fichiers apporte des cartes d'une capacité importée sans contrôle ; elles sont gardées et ignorées tant qu'aucune liste ne les nomme. Lire les fichiers que la sauvegarde porte réglerait aussi le refus à tort d'une capacité définie sur un autre ensemble.
- Un tour préparé à l'avance (les tours de rythme) qui bloque arrête encore toute la séance.
- Un faux instrument joué de bout en bout dans un test, avec sa propre famille et son propre attribut (§ 11).
- Un cache des membres admis par contenu, si une mesure le demande ; `INDEX_DERIVATIONS` reste la table de la guitare ; `MEMBER_VIEWS` reste un registre par famille.
- Sur la piste du lien, un tour qui commence entre deux temps n'a pas de tuile.
- Une séance enregistrée avant les passages ne montre pas la forme attendue dans son bilan.
- Lancer `scripts/functional-ui.mjs` et corriger ce qu'il trouve (voir plus bas).
- Les questions que la spec laisse ouvertes : la distinction entre capacités avec et sans mémoire, à reprendre avec le chantier 5 ; la clé `eighths@1` d'une figure, qui porte un niveau d'exercice.
- Tout ce que la spec met hors périmètre : un second instrument, le graphe des capacités, le redessin des vues des changements et de la figure, ce que le capteur d'accords écoute en dedans, les filtres qui attendent leur exercice, les figures et les formes partagées, la traduction des raisons de refus, un dossier lié relu à chaque rechargement, les mesures et les douze notes hors du cœur, le format v1.

### Avant de fusionner

L'auteur seul peut faire ceci :

- Jouer avec la vraie guitare : tout a été vérifié avec un micro simulé.
- Importer une sauvegarde de production dans l'aperçu de la branche.
- Lancer `scripts/functional-ui.mjs` : étendu au plan 5b, il n'a jamais été lancé.
- Refaire, dans le dépôt principal, la vérification « rien de privé dans la construction » : le worktree du chantier n'a pas les fichiers privés.
- Relire `docs/projet.md`, que les plans n'ont pas touché : la ligne 39 dit encore que les exercices privés s'écrivent en local, en développement seul (`docs/exercices-locaux.md`), et la ligne 135 que le catalogue est écrit en TypeScript.
- Décider la fusion.
