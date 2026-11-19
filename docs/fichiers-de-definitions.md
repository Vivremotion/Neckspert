# Fichiers de définitions

Les capacités, les grilles et les exercices s'écrivent dans des fichiers de définitions JSON. Les fichiers du catalogue, dans `catalog/`, partent avec l'application. Un joueur ajoute les siens par l'écran des réglages, et ils restent chez lui. Les deux ont le même format. Cette page décrit le format avec de la matière commune (des triades arpégées) ; vos propres exercices restent chez vous.

## Où et quand

- Un fichier de définitions peut tenir plusieurs capacités, exercices et grilles (voir « Le fichier »).
- On importe un fichier depuis les réglages, section « Fichiers importés » : choisir un ou plusieurs fichiers `.json`. Cela marche dans toute construction, en développement comme en production. Le fichier est gardé dans la base du navigateur, sous son nom, et lu à chaque démarrage : il suffit de l'importer une fois.
- Un fichier importé du même nom remplace le précédent, sans confirmation. Le nom est comparé tel quel, majuscules comprises. Pour corriger un fichier, on le réimporte.
- Supprimer un fichier demande une confirmation. Il retire ses capacités, ses grilles et ses exercices de l'application, mais la progression reste, et se retrouve si l'on réimporte un fichier qui les définit de nouveau. Une progression dont aucun fichier chargé ne donne la définition est gardée et ignorée par les écrans.
- Un fichier de plus d'un million de caractères n'est pas gardé. Tout autre fichier l'est, même illisible : son refus s'affiche, et on le remplace par une version corrigée.
- Vérifier un exercice a des limites, pour qu'un seul exercice ne coûte pas des secondes à vérifier à chaque démarrage. Le total d'un fichier n'est pas encore borné : un très gros fichier d'exercices aux limites peut prendre une demi-minute à charger. Un exercice est refusé s'il écrit plus de 100 niveaux (`levels`), une échelle (`params.ladder`) de plus de 100 niveaux, un niveau dont les `params` ont plus de 200 entrées, plus de 2 000 éléments (`items`), ou si ses éléments multipliés par ses niveaux demandent plus de 20 000 tours à vérifier. Le refus nomme le champ, le nombre écrit et la limite.
- La sauvegarde (réglages) emporte les fichiers importés avec la progression, et les rend à l'import.
- Au démarrage, `loadDefinitions` (`src/lib/composition/definitions.ts`) vide les registres de capacités, d'exercices et de grilles, puis les remplit : les fichiers de `catalog/`, puis les fichiers importés. Le premier écran attend cette lecture.
- Si la lecture des fichiers importés échoue, l'application démarre avec le catalogue seul et le dit par un refus, sous le nom `imported files` : `the imported files could not be read: <message>`. La section « Fichiers importés » des réglages montre ce refus au-dessus de la liste.
- Un exercice ou une grille valide se joue comme ceux du catalogue. Un exercice qui écrit une `round` avec une figure et des `levels` apparaît sur l'accueil, bloc « Exercices », et se joue par `/session?kind=exercise&exercise=<id>`.
- Si le chargement des fichiers importés ne s'est pas terminé la dernière fois, l'application démarre sans eux cette fois-là et le dit ; on peut alors supprimer le dernier fichier ajouté.
- Aucun dossier du dépôt n'est lu à la construction : un fichier privé se garde où l'on veut, hors du dépôt, et s'importe. Il n'entre jamais dans le catalogue ni dans la construction publiée.
- Un fichier importé n'est jamais exécuté, et ses textes s'affichent comme du texte.

## Le fichier

Un fichier de définitions est un objet JSON :

```
{ "format": 0, "skills": [], "grids": [], "exercises": [] }
```

- `format` vaut 0 : le format n'est pas encore stable et changera sans conversion.
- `skills`, `grids` et `exercises` sont des listes, facultatives ; un fichier peut en tenir plusieurs. `routines` est réservé : vide ou absent.
- Une capacité s'écrit `{ "id": "…", "name": { "fr": "…", "en": "…" }, "items": "<ensemble>", "memory": false }` ; une capacité de mémoire (`"memory": true`) écrit aussi `"directRecall": { "withinMs": 1500 }`. Les ensembles : `note-on-string`, `placed-note`, `voicing-on-strings`, `placed-voicing`, `placed-shape`, `change`, `figure`.
- Une clé inconnue au premier niveau, un texte qui n'est pas du JSON ou un fichier de plus d'un million de caractères refusent tout le fichier.
- Un `id` de capacité, de grille ou d'exercice est fait de lettres, de chiffres, de `-`, de `_` et de `.`, et commence par une lettre ou un chiffre. L'identifiant `unknown` est réservé (capacités et exercices) : la migration le donne aux tentatives que rien ne nomme. Un exercice ne peut pas non plus prendre l'ancien identifiant d'un exercice renommé par la migration 13 (`locate-neck`, `identify-neck`, `triads-anchor`, `triads-zone`, `gesture-link`, `gesture-climb`, `gesture-zone`, `gesture-jam`) : une sauvegarde de sa progression serait refusée.
- Dans un fichier, deux objets de même `id` dans une liste : le second est refusé. Un exercice et une grille peuvent partager un `id`.

## Une grille

Une grille s'écrit `{ "id": "…", "title": "…", "beatsPerBar": 4, "bars": 12, "chords": [ … ] }`, chaque accord `{ "bar": 1, "beat": 1, "symbol": "F7" }`, avec de vrais symboles d'accords (`parseChordSymbol`). La première commence mesure 1, temps 1, et les accords vont dans l'ordre, dans la grille. Un exercice de geste nomme ses grilles par leur `id` dans `params.grids` : la grille doit être définie dans un fichier, le sien ou un autre lu avant (le catalogue est lu avant les fichiers importés, et les fichiers importés dans l'ordre de leurs noms).

## Un exercice

C'est une `ExerciseDefinition` (`src/lib/domain/exercise/types.ts`) écrite en JSON, avec cinq écarts :

- `figures` : chaque figure s'écrit `{ "id": "…", "lilypond": "c4 c c c", "meter": { … } }`. Le LilyPond est le sous-ensemble strict de `parseLilyPond` (pas de `#` ni de `$`). `meter` est facultatif (4/4 par défaut) et s'écrit `{ "count": 3, "unit": "1/4", "grouping": [1, 1, 1] }`.
- `shapes` : chaque forme s'écrit `{ "id": "…", "symbol": "maj7", "lilypond": "c\\5 e\\4 g\\4 b\\3" }` (voir « Une forme déplacée d'accord en accord »).
- `items` : chaque entrée est une clé d'élément (`"…"`), ou une clé avec la longueur de son tour en temps (`{ "item": "…", "beats": 4 }`). La clé ne dit que l'élément ; la longueur appartient à l'entrée.
- `meter` au premier niveau s'écrit de la même façon (l'unité est une fraction écrite en texte).
- L'accompagnement (`round.accompaniment`, ou le paramètre qu'il nomme par `{ "param": "…" }`, dans `params` et dans les `params` de chaque niveau) s'écrit `{ "clicks": { "beats": [1, 2, 3, 4], "accent": [1] }, "bars": ["on", "on", "on", "off"] }` : les temps où le clic sonne, ceux qu'il accentue (facultatif), puis une mesure par entrée, `"off"` pour une mesure muette.
- Une clé inconnue au premier niveau refuse l'exercice, en la nommant.

Tout le reste doit déjà être du JSON simple : nombres, textes, listes, objets. Les clés connues sont `id`, `practices`, `params` (obligatoires), puis `tempo`, `chordDiagram`, `meter`, `flow`, `round`, `presentation`, `view`, `howTo`, `title`, `levels`, `figures`, `shapes`, `pick`, `items`.

`practices` nomme la capacité que l'exercice travaille : elle doit être définie dans un fichier, le sien ou un autre lu avant. Un exercice privé écrit avant la version 13 ne retrouve sa progression que si sa capacité porte l'identifiant qu'avait l'exercice.

**Un exercice de figure doit nommer sa vue** : `"view": "figure"`. Sans elle, un exercice qui écrit une présentation serait dessiné sur la piste (`lane`), qui ne dessine pas de figure.

## Exemple : arpèges de triades

Trois triades majeures sur les cordes 3-2-1, arpégées sur une figure de noires puis de croches, ♩ = 60. Le niveau d'aide écrit la tablature sous la figure. Le fichier entier :

```json
{
	"format": 0,
	"skills": [
		{
			"id": "arpeges-de-triades",
			"name": {
				"fr": "Arpéger une triade",
				"en": "Arpeggiate a triad"
			},
			"items": "placed-voicing",
			"memory": false
		}
	],
	"exercises": [
		{
			"id": "arpeges-de-triades",
			"title": {
				"fr": "Arpèges de triades",
				"en": "Triad arpeggios"
			},
			"practices": "arpeges-de-triades",
			"view": "figure",
			"tempo": 60,
			"params": {
				"figure": "quarters",
				"window": {
					"ms": 80
				},
				"feedback": "every-cycle",
				"listen": "free",
				"cursor": true,
				"thresholds": {
					"regularity": 40,
					"holdOffset": 60,
					"holdDrift": 25,
					"precision": 60
				},
				"pacing": {
					"roundsPerBreath": 3,
					"breathMinMs": 4000
				}
			},
			"figures": [
				{
					"id": "quarters",
					"lilypond": "c4 c c c"
				},
				{
					"id": "eighths",
					"lilypond": "c8 c c c c c c c"
				}
			],
			"items": [
				{ "item": "C|maj|3:1,2:3,1:5@5-5-3", "beats": 4 },
				{ "item": "F|maj|3:1,2:3,1:5@10-10-8", "beats": 4 },
				{ "item": "G|maj|3:1,2:3,1:5@12-12-10", "beats": 4 }
			],
			"round": {
				"expectations": [
					{
						"figure": {
							"param": "figure"
						},
						"at": {
							"bars": 0
						},
						"sensor": "note",
						"content": {
							"from": "voicing-notes",
							"pattern": [1, 2, 3, 2]
						},
						"window": {
							"param": "window"
						}
					}
				],
				"length": {
					"beats": {
						"item": "beats"
					}
				},
				"handover": "end",
				"policy": {
					"unit": "cycle",
					"verdict": "cycle",
					"correction": false,
					"pairing": {
						"mode": "alignment"
					}
				}
			},
			"presentation": {
				"primary": "{chord}",
				"secondary": "{strings}"
			},
			"levels": [
				{
					"aid": true,
					"params": {
						"notation.tab": true
					}
				},
				{
					"params": {
						"figure": "quarters"
					}
				},
				{
					"params": {
						"figure": "eighths"
					}
				}
			]
		}
	]
}
```

Chaque entrée de `items` donne une clé d'élément de l'ensemble `placed-voicing` et la longueur de son tour en temps (`"beats"`), que le tour lit par `{ "item": "beats" }`. La clé est `<voicing>@<cases>` : le voicing s'écrit `<racine>|<qualité>|<corde>:<degré>,…`, par exemple `C|maj|3:1,2:3,1:5`, puis viennent les cases de ses notes, dans l'ordre de ses cordes, séparées par `-` (`5-5-3`). Des cases où le voicing ne tombe pas refusent l'exercice (`the voicing has no place at frets 9-9-9`), comme une clé qui finit encore par une longueur (`…@5-5-3@4`). Une entrée sans `beats` est une clé seule ; un tour qui lit la longueur de son élément la refuse, en nommant `items[i]` et le niveau. Un `beats` qui n'est pas un nombre positif refuse l'exercice en nommant `items[i].beats`. `"content": { "from": "voicing-notes" }` fait jouer à chaque note de la figure la note du voicing donnée par `pattern` (1 = la plus grave).

## Un exercice de mémoire

Une capacité de mémoire (`"memory": true`) a une carte par élément : la séance introduit les éléments un à un, les fait revenir, les révise. L'exercice qui la travaille écrit lui-même ce qu'il introduit, dans quel ordre et à quelle condition. Le moteur n'a aucune liste en code.

Aucune séance ne joue encore un exercice de mémoire importé : il est chargé, vérifié, et attend la Bibliothèque.

**La liste.** Un exercice dont la capacité a des cartes écrit `items` : c'est obligatoire. L'ordre de la liste est l'ordre d'introduction : la séance prend le premier élément de la liste qui n'a pas encore de carte, puis le suivant. Un élément ne s'écrit qu'une fois.

- Un exercice ne demande que les éléments de sa liste. Une carte de sa capacité que la liste ne nomme pas est gardée, mais ignorée : elle n'est pas révisée et n'est comptée nulle part : ni dans la séance, ni sur l'accueil, ni sur la carte du manche. Si l'on remet l'élément dans la liste, sa carte reprend là où elle en était.
- Deux exercices sur la même capacité partagent les cartes des éléments qu'ils nomment tous les deux.
- La clé d'un élément s'écrit comme son ensemble l'écrit ; une autre graphie lisible est rangée sous la clé de l'ensemble (`6:05` se range sous `6:5`).
- Les listes du catalogue sont l'ordre d'aujourd'hui. Notes : les notes naturelles puis les altérées, en alternant les cordes de la 6 à la 1, les naturelles sur un repère d'abord sur chaque corde. Accords : un groupe de cordes après l'autre, les fondamentales naturelles puis altérées depuis do, majeur puis mineur, les trois renversements en montant le manche.

**Les réglages d'apprentissage** s'écrivent dans `params.learning`. Tous sont facultatifs.

- `presentAtOnce` (`true` par défaut) : après une sonde manquée, la présentation aidée vient tout de suite. À `false`, elle attend ; les accords l'écrivent, parce qu'ils sonnent encore.
- `enter` : une condition d'entrée. Un élément n'entre dans la liste d'introduction que lorsque la carte qu'il nomme dans une autre capacité est **acquise**. `acquired.skill` est cette capacité, `acquired.item` la **correspondance** qui passe de l'élément de l'exercice à l'élément de l'autre capacité. Acquis a une seule règle : la carte porte la marque d'acquise, ou une tentative de son histoire la qualifie. Sans `enter`, un élément entre dès son tour dans la liste.
- `asks` : ce que la consigne demande d'une carte, quand c'est une forme parmi plusieurs (il remplace l'ancien `draw`, qui nommait un tirage écrit en code). C'est un choix (voir « Un contenu écrit comme un choix »), sans `of`, sans `order`, sans `take` : `{ "family": "chord-shapes", "where": [{ "other": "previous" }] }`. Pour le joueur : la forme demandée est tirée au hasard parmi les formes admises du voicing de la carte, jamais la dernière demandée s'il en reste une autre ; la consigne nomme alors la case de cette forme. Seul un ensemble qui sait demander un membre le permet (aujourd'hui `voicing-on-strings`, famille `chord-shapes`) ; une autre famille, ou un ensemble qui ne sait pas, est refusé.

Les correspondances enregistrées :

| Nom          | De l'ensemble… | …vers l'ensemble | Ce qu'elle dit                                            |
| ------------ | -------------- | ---------------- | --------------------------------------------------------- |
| `same`       | un ensemble    | le même          | le même élément, dans une autre capacité du même ensemble |
| `same-place` | `placed-note`  | `note-on-string` | la note qui sonne à cet endroit, sur la même corde        |

Ainsi, `identify-note` (nommer la note d'une case) n'introduit une case que lorsque `locate-note-string` a acquis la note qui s'y joue ; `chord-zone` (jouer un accord près d'une case) n'introduit un voicing que lorsque `chord-anchor` l'a acquis. Dans le catalogue :

```json
"learning": {
	"enter": { "acquired": { "skill": "locate-note-string", "item": "same-place" } }
}
```

pour `identify-note`, et

```json
"learning": {
	"enter": { "acquired": { "skill": "chord-anchor", "item": "same" } },
	"asks": { "family": "chord-shapes", "where": [{ "other": "previous" }] },
	"presentAtOnce": false
}
```

pour `chord-zone`.

**Ce que le joueur vit.** La séance des notes liste `identify-note` puis `locate-note-string` : si une note déjà placée peut se nommer, elle passe avant une nouvelle note à placer. Un élément n'est jamais demandé deux fois de suite. Une note n'attend plus que son « miroir » soit acquis (le miroir de « A, corde de E grave » était « E, corde de A »), la séance ne cherche plus une autre corde, et les notes des triades en cours d'apprentissage ne viennent plus en premier : rien de cela n'est calculé sur l'état du joueur, seule la liste décide. Cet ordre entre les exercices d'une séance reste en code jusqu'aux routines (plan 5) ; deux exercices d'une même séance sur une même capacité sont refusés par la séance.

**Refusé** (le refus nomme l'exercice et le champ ; les raisons sont dites comme le code les donne) :

- `an exercise that practises a skill with cards must list its items` : la capacité a des cartes et `items` manque.
- `items must be a list`, `items lists no item` : `items` n'est pas une liste, ou elle est vide. Le premier ne se voit que pour un exercice dont la capacité n'a pas de cartes ; avec des cartes, `items` absent donne d'abord « must list its items ».
- `items[<n>] repeats items[<m>]` : un élément écrit deux fois.
- Une clé que l'ensemble ne sait pas lire : le refus nomme l'entrée, `items[<n>] ("<clé>")`.
- `params.learning must be an object`, `params.learning.presentAtOnce must be true or false`.
- `params.learning.enter must be { acquired: { skill, item } }` ; `params.learning.enter needs a skill with cards` (la capacité de l'exercice n'a pas de cartes) ; `params.learning.enter names skill "<id>", which no file read so far defines` ; `params.learning.enter names skill "<id>", which has no cards`.
- `params.learning.enter.acquired.item "<nom>" is no correspondence from <ensemble> to <ensemble>` : la correspondance n'existe pas entre ces deux ensembles.
- `params.learning.draw is gone: write params.learning.asks`.
- `params.learning.asks must be a selection` ; `params.learning.asks takes no order and no take: one member is drawn` ; `params.learning.asks takes no "of": a member of the card’s own item is asked` ; `params.learning.asks needs a set that can ask a member, which <ensemble> cannot` ; `params.learning.asks names family "<famille>", but <ensemble> asks members of <famille>`. Un problème du choix lui-même est dit sous `params.learning.asks.<champ>`, avec les raisons de la section suivante.

Une condition d'entrée qui nomme la capacité de l'exercice lui-même est acceptée : le moteur sait la jouer, et rien n'entre jamais.

## Un contenu écrit comme un choix

Une attente d'un tour dit ce que le tour accepte comme réponse. Elle l'écrit en choisissant des **membres** d'une **famille** : le tour accepte tout membre admis, et rien d'autre.

```json
"content": { "family": "chord-shapes", "where": [{ "at": { "item": "fret" } }] }
```

Un choix a cinq clés. Seule `family` est obligatoire.

- `family` : la famille. Il y en a deux, `note-places` (les places d'une note sur le manche : une par case où elle sonne) et `chord-shapes` (les formes d'un accord sur des cordes voisines : une par octave où elle tient sur le manche).
- `of` : le nom de ce qui donne l'**index** de la famille à partir de l'élément. Absent, c'est l'index que l'ensemble de l'élément donne à cette famille. Trois noms existent : `note` (la note d'un élément de `note-on-string`, avec sa corde), `voicing` (l'accord d'un élément de `voicing-on-strings`) et `root` (la fondamentale d'un voicing : la note de la corde qui porte le degré 1). L'index de `note-places` est une note, avec ou sans corde (un élément de `note-on-string` donne la note et sa corde) ; celui de `chord-shapes` est un accord sur des cordes, avec ou sans le degré de chaque corde (un élément de `voicing-on-strings` donne l'accord, ses cordes et ses degrés).
- `where` : une liste de **filtres**. Chacun restreint les membres admis.
- `order` : une liste d'**attributs** ; les membres admis sont rangés par le premier, puis par le suivant à égalité.
- `take` : le nombre de membres gardés après le rangement (un entier d'au moins 1). Absent, tous les membres admis sont gardés.

Un membre a quatre **attributs** : `strings` (ses cordes), `frets` (ses cases), `position` (sa case frettée la plus basse, 0 pour une forme à vide) et `pitch` (sa note la plus grave).

Les quatre **filtres** s'écrivent chacun comme un objet à une seule clé :

| Filtre                 | Écriture                                                                  | Ce qu'il admet                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dans une zone          | `{ "in": { "strings": [3, 2, 1], "frets": [5, 8] } }`                     | le membre dont chaque note est sur ces cordes et dans ces cases (une des deux bornes suffit) ; une corde à vide compte dans une zone qui commence à la case 1, et dans aucune autre |
| à une case             | `{ "at": 7 }`                                                             | le membre qui **couvre** cette case : elle est entre sa case la plus basse et sa plus haute, une corde à vide comptant pour la case 0                                               |
| au-delà du précédent   | `{ "position": { "beyond": "previous", "toward": "up", "turns": true } }` | le membre dont la position est plus haute (`"up"`) ou plus basse (`"down"`) que celle du précédent ; avec `turns`, quand plus rien n'est au-delà, le sens contraire                 |
| autre que le précédent | `{ "other": "previous" }`                                                 | tout membre sauf le précédent ; si rien d'autre ne reste (une seule forme), le précédent reste admis                                                                                |

Le précédent est donné par ce qui appelle : pour le choix de la consigne, la dernière forme demandée de cette carte. Sans précédent, `position` et `other` ne restreignent rien. **L'ordre où les filtres sont écrits ne change rien** : le moteur applique toujours d'abord `in` et `at`, puis `position` (plusieurs `position` se croisent), puis `other`.

Une valeur d'un filtre s'écrit de trois façons : un nombre ou une liste écrits, `{ "param": "a.b" }` lue dans les paramètres du niveau, ou `{ "item": "fret" }` lue sur l'élément (`fret` et `string` : la case que la consigne nomme, la corde de l'élément ; `take` lit de même un paramètre). Un filtre dont la valeur lue sur l'élément est absente ne restreint rien : un élément de `chord-zone` sans case demandée accepte le voicing partout.

Dans le catalogue :

- `locate-note-string` : `{ "family": "note-places" }`, toute place de la note sur la corde demandée, quelle que soit l'octave.
- `chord-anchor` : `{ "family": "note-places", "of": "root" }` pour la fondamentale, puis `{ "family": "chord-shapes" }` pour l'accord.
- `chord-zone` : `{ "family": "chord-shapes", "where": [{ "at": { "item": "fret" } }] }`.

**Refusé** (le refus nomme le champ du choix ; les raisons sont dites comme le code les donne) :

- `must be a selection { family, of?, where?, order?, take? }` ; `<clé> is not a key of its place (known: …)` ; `family must name a family` ; `names family "<nom>", which is not registered`.
- `set <ensemble> gives no index of <famille>` ; `of "<nom>" gives no index of <famille> from <ensemble>`.
- `where must be a list of filters` ; `where[<i>] is no filter (in, at, position, other)` ; `where[<i>].in must be { strings?, frets? }` ; `where[<i>].position must be { beyond: "previous", toward: "up" or "down", turns?: true or false }` ; `where[<i>].other must be "previous", got …`.
- `where[<i>].at must be a number, got …` (de même pour `strings`, `frets`) ; `reads item value "<nom>", which <ensemble> does not have` ; `reads item value "<nom>", a number, where a list of numbers is needed` ; une valeur lue dans un paramètre qu'un niveau n'écrit pas ou écrit d'une autre forme : `reads param "<chemin>", which no level of the exercise writes`, `…which <niveau> does not write`, `…which <niveau> gives as <valeur>, <pourquoi>`.
- `order must be a list of attribute names` ; `order names attribute "<nom>", which family "<famille>" does not have`.
- `take must be a positive whole number` ; `take must be a number, { param: path } or { item: name }` ; `take measures unknown item number "<nom>"`.
- `filter "in" has frets [<a>, <b>]: the first is above the second`.
- Un contenu qui n'est ni `null`, ni `{ "from": … }`, ni un choix : `must be null, { from: derivation } or a selection { family, of?, where?, order?, take? }`.

Deux limites s'ajoutent à celles de la section « Le fichier », pour qu'un choix ne coûte pas des secondes à vérifier à chaque niveau : au plus 16 filtres dans `where` (`has <n> filters, more than 16`) et 8 attributs dans `order` (`names <n> attributes, more than 8`).

Ce que le joueur ne voit pas changer : une note se reconnaît à sa hauteur seule (le capteur n'entend pas la corde), une forme à ce que le capteur d'accords décide. Les confusions (octave, corde, écart en cases ; autre octave, autre renversement, autre accord) sont celles d'avant. Un tour déjà joué garde son ancien contenu dans la tentative : il n'est pas rejugé.

## Une forme déplacée d'accord en accord

L'ensemble `placed-voicing` joue les notes d'un accord, une par corde. Une **forme** est une suite de notes écrite une fois, chacune sur sa corde, avec autant de notes par corde qu'il en faut. Elle est déplacée d'un accord à l'autre : c'est l'ensemble `placed-shape`.

Ce qui change par rapport à l'exemple précédent (le reste s'écrit de la même façon) :

Le fichier définit une capacité sur l'ensemble `placed-shape` (`"items": "placed-shape"`), que l'exercice nomme :

```json
{
	"practices": "forme-deplacee",
	"shapes": [
		{
			"id": "maj7",
			"symbol": "maj7",
			"lilypond": "c\\5 e\\4 g\\4 b\\3"
		}
	],
	"items": [
		{ "item": "maj7@c", "beats": 4 },
		{ "item": "maj7@f", "beats": 2 },
		{ "item": "maj7@bes", "beats": 4 }
	],
	"presentation": {
		"primary": "{chord}"
	}
}
```

et, dans `round.expectations`, `"content": { "from": "shape-notes" }`.

- **La forme** (`shapes`) : `id` la nomme, `symbol` est ce que le nom de l'accord ajoute à sa première note, `lilypond` donne ses notes dans l'ordre, chacune avec son numéro de corde. Le rythme vient de la figure : une durée écrite est ignorée, et rien ne remplit de mesure. Un silence, une liaison, un triolet, une barre de mesure ou une note sans corde refusent l'exercice, en nommant la forme et la position dans le texte.
- **L'élément** (`items`) : la clé `<forme>@<première note>`, avec la longueur du tour dans l'entrée (`"beats"`). La première note est une note LilyPond seule, sans durée ni corde (`d`, `g,`, `bes'`). La forme est déplacée pour commencer sur elle : toutes ses notes bougent du même intervalle et gardent leur corde. L'exemple joue do 3 (`c`), fa 3 (`f`), puis si♭ 3 (`bes`). Les temps sont la longueur du tour, comme pour les voicings.
- **Le nom de l'accord** (`{chord}` dans la présentation) : la première note telle qu'elle est écrite, sans son octave, puis le `symbol` : `bes` donne `Bbmaj7`, `as` donne `Abmaj7`, `es` donne `Ebmaj7`, `fis` donne `F#maj7`.
- **Les notes jouées** : `shape-notes` donne la liste des notes de la forme déplacée. Sans `pattern`, elles se jouent dans l'ordre et bouclent ; `pattern` choisit parmi elles (1 = la première note de la forme). Sur un changement de 2 temps, une figure de noires joue les deux premières notes (sa dernière boucle est coupée).
- **Chaque accord repart de la première note** de sa forme. Un arpège qui continue d'un accord à l'autre n'existe pas encore.
- **Refusé** : deux formes de même `id`, un `id` qui contient `@` (le séparateur des clés), une forme sans note, une note que sa corde ne peut pas donner telle qu'elle est écrite. Quand le tour dérive `shape-notes`, aussi un élément qui nomme une forme absente ou que son déplacement fait sortir du manche (sous la corde à vide ou au-delà de la case 24). Le refus nomme `shapes[i]` ou `items[i]`. Un tour qui ne dérive pas ses notes n'en a pas besoin : l'élément passe, et `{chord}` dit la note seule si la forme est absente.
- **Après un tour raté**, la respiration dit les fausses notes en mots : pas de dessin d'accord, qui ne sait pas montrer plusieurs notes sur une corde. Un niveau d'aide peut écrire `"notation.tab": true` pour la tablature.
- **Le nom des notes** suit la forme : une note garde sa place dans la forme écrite. Sur E♭, la tierce de `g b d f` s'appelle G et la septième D♭, jamais D♯ ni C♯.

### Des marques pendant le jeu

Un niveau qui écrit `"liveMarks": true` marque sous la ligne jouée ce qui a été entendu de chaque note, avec les formes du bilan, sans chiffres : un point juste et en place, ◀ ou ▶ juste mais en avance ou en retard, une croix pour une fausse note, un rond vide pour une note non reconnue, un losange pour une note en trop. Une note juste est marquée dès qu'elle est lue ; une fausse note et un silence attendent la fin de la zone d'écoute de la note, le temps qu'une lecture tardive arrive (la latence du capteur, plus 200 ms).

Absent, rien ne s'affiche. Comme tout paramètre, un niveau peut le retirer : `{ "params": { "liveMarks": false } }`.

Le bilan reste le verdict : pendant le jeu, le moteur ne cherche pas de temps perdu ou ajouté. Si tu en perds un, les marques montrent une suite de ronds et de notes en trop là où le bilan dira « temps perdu ».

### Voir venir l'accord suivant

Un niveau qui écrit `"nextBeats": 2` montre ce qui vient, pendant les 2 derniers temps de chaque tour : `→ Gm7` à côté de l'accord joué, et, si le niveau dessine le manche, les notes de l'accord suivant en plus pâle. Sur un changement de 2 temps ou moins, c'est donc visible d'un bout à l'autre. Le manche couvre dès le début les cases des deux accords : les notes ne bougent pas quand les suivantes apparaissent.

Absent ou à 0, rien ne s'affiche. Comme tout paramètre, un niveau peut le changer ou le retirer : `{ "params": { "nextBeats": 0 } }`.

### Une aide qui part et qui revient

Un niveau qui écrit `"neck": true` dessine sur le manche toutes les notes que son tour dérive de son élément, nommées à leur case : la forme entière, même sur un changement qui n'en joue que deux. Une figure écrite note à note (`{ "from": "figure" }`) n'a rien à y dessiner.

Pour que l'aide parte quand la grille entière est jouée juste et revienne après trois échecs, elle s'écrit comme un niveau ordinaire, le premier :

```json
"flow": { "levelChange": "next-round" },
"levels": [
	{ "params": { "tempo": 60, "neck": true }, "pass": { "successes": 42 } },
	{ "params": { "tempo": 60 }, "pass": { "successes": 42 }, "drop": { "failures": 3 } }
]
```

- **`pass` compte les tours justes d'affilée** : 42 tours sur une grille de 42 changements, c'est chaque changement une fois. Une faute repart de zéro. Le compte se garde d'une séance à l'autre.
- **`"aid": true` ne convient pas ici** : on ne descend jamais à un tel niveau en échouant, seul l'anti-blocage (`flow.antiBlocking`) y mène.
- **`flow.levelChange`** dit quand un niveau atteint s'applique : à la respiration (`"breath"`, par défaut) ou au tour enchaîné suivant (`"next-round"`), sans rien annoncer. Un niveau d'un autre tempo attend toujours la respiration : le tempo ne change pas sous les doigts.
- Un tour est jugé après sa fin : l'aide revient une ou deux mesures après le troisième échec.

### Un morceau entier

`flow.demonstration: false` retire l'écoute de la première rencontre, qui dure autant que le contenu : 49 mesures à ♩ = 70 feraient 2 min 48 avant la première note. La vue `figure` garde l'écran à sa taille : la partition défile dans son cadre et suit la ligne jouée, et au-delà de 8 mesures elle est gravée plus petit.

### Écrire les notes d'une forme

Les octaves sont absolues, et la marque change à chaque do :

| Écrit                   | Notes                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `c,` à `b,`             | do 2 à si 2 (à la guitare, à partir de `e,`, la corde 6 à vide) |
| `c` à `b` (sans marque) | do 3 à si 3                                                     |
| `c'` à `b'`             | do 4 à si 4                                                     |
| `c''` à `b''`           | do 5 à si 5                                                     |

Les cordes à vide sont donc, de la 6 à la 1 : `e,` `a,` `d` `g` `b` `e'`.

Les altérations s'écrivent `is` pour le dièse et `es` pour le bémol, collées à la lettre : `fis`, `bes`, `cis'`. `es` et `as` seuls sont mi♭ et la♭.

## Comment un fichier est vérifié

Les fichiers du catalogue d'abord, puis les fichiers importés, chacun dans l'ordre du nom :

1. Le texte se lit en JSON (une virgule oubliée refuse le fichier, avec la position de l'erreur), puis l'enveloppe (voir « Le fichier »).
2. Chaque capacité se lit (`skillFromJson`), chaque grille (`gridFromJson`) et chaque exercice (`exerciseFromJson` : un objet, des clés connues, des figures et des formes en LilyPond qui se lisent, l'accompagnement écrit).
3. Les capacités et les grilles du fichier rejoignent le registre, puis ses exercices sont vérifiés dans l'ordre des étapes qui suivent, et seul le premier problème est dit. D'abord, la capacité que l'exercice nomme dans `practices` est définie par un fichier lu jusque-là, et l'application sait montrer son ensemble.
4. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, formes, tour…), et chaque entrée de `items` : sa longueur, si elle en donne une, est un nombre positif, sa clé se lit par l'ensemble de sa capacité (des cases où le voicing ne tombe pas la refusent), et le tour se compile sur lui à chaque niveau (une note de `pattern` au-delà du voicing ou de la forme, une forme sortie du manche refusent l'exercice en nommant `items[i]` et le niveau).
5. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…).
6. Les grilles qu'un exercice de geste nomme sont définies par un fichier lu jusque-là.
7. L'identifiant n'est pas déjà pris, par le catalogue ou par un fichier lu avant : le refus nomme le fichier qui le tient. Pour une capacité ou une grille, ce contrôle se fait quand elle rejoint le registre (étape 3), avant que les exercices du fichier soient vérifiés.

Le moteur refuse ce qu'il ne peut pas jouer, jamais ce qui manque d'intérêt pédagogique.

## Comment un refus se montre

Un refus n'arrête jamais l'application. Il porte sur un fichier entier (illisible, enveloppe fausse) ou sur un seul objet : le reste du fichier est gardé.

- Dans les réglages, la section « Fichiers importés » liste chaque fichier avec ce qu'il a donné (capacités, grilles, exercices) et ses refus : `<fichier> : <raison>` pour un fichier, ``<fichier>, capacité `<id>` : <raison>``, ``<fichier>, exercice `<id>` : <raison>`` ou ``<fichier>, grille `<id>` : <raison>`` pour un objet (en anglais, `file`, `skill`, `exercise`, `grid`).
- Sur l'accueil, dans toute construction, une ligne dit qu'un fichier importé a un problème et mène aux réglages. La liste des refus du catalogue n'est montrée qu'en développement.
- La console reprend chaque refus sous la forme `[imported] <fichier> refused: <raison>` ou `[imported] <fichier>, exercise <id> refused: <raison>` (`skill`, `grid` pour une capacité, une grille), `[catalog]` pour un fichier du catalogue.

La raison nomme le champ, par exemple `tempo must be a positive number, got -3`.

## Écrire une figure à partir d'un export Guitar Pro

Un export MusicXML de Guitar Pro 8 se convertit en LilyPond (le sous-ensemble de `parseLilyPond`), et les accords d'une partie d'accompagnement se listent mesure par mesure. Le script ne lit que le fichier que vous lui donnez ; ce qu'il en tire se colle dans un fichier de définitions, qui reste chez vous.

```
npm run musicxml -- <fichier.musicxml> --part P1      # la mélodie de la partie P1, en LilyPond
npm run musicxml -- <fichier.musicxml> --shapes P2    # les voicings de la partie P2
```

- **Mélodie** : une partie à une voix. La hauteur est celle de la corde à vide (accordage standard) plus la case : l'export écrit la guitare une octave plus haut, la tablature dit ce qui sonne. Chaque note garde sa corde (`c'4\2`). Les liaisons (`~`) et les triolets (`\tuplet 3/2 { … }`) sont repris ; une mesure par ligne, `|` à la fin. Une levée est complétée par des silences devant ses notes, pour que les mesures tombent juste. Les altérations sont écrites en dièses, ou en bémols si l'armure est en bémols. La corde et la case sont lues aussi dans les instructions `<?GP …?>` de Guitar Pro. Un `<forward>` est lu comme un silence.
- **Voicings** : une ligne par accord, `mesure beat`, puis les cases des cordes de la plus grave à la plus aiguë (`x` : corde non jouée), puis les clés `corde:case` (`5:3 4:2 3:0`) à recopier dans une clé de voicing. La mesure est celle de l'export (la levée est la mesure 0) ; `beat` compte en temps à partir de 1.
- **Avertissements** (sur la sortie d'erreur, rien n'est refusé) : un accord dans une partie mélodique (seule la première note est gardée), une deuxième voix (aussi dans une partie d'accords : seule la première voix est positionnée), une appogiature, un triolet que sa marque de fin ne ferme pas, une technique non convertie (marteau, tiré, tiré de corde, harmonique, glissé, ornement…), un accordage qui n'est pas le standard. Le doublon de la portée de tablature (voix 5) est ignoré sans bruit.
- Le script n'a pas de dépendance : il lit le XML avec un petit lecteur de balises. Il ne comprend pas une deuxième portée de notation, ni un changement de mesure en cours de morceau.
