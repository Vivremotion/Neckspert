# Fichiers de définitions

Les capacités, les grilles, les exercices et les routines s'écrivent dans des fichiers de définitions JSON. Les fichiers du catalogue, dans `catalog/`, partent avec l'application. Un joueur ajoute les siens par l'écran des réglages, et ils restent chez lui. Les deux ont le même format. Cette page décrit le format avec de la matière commune (des triades arpégées) ; vos propres exercices restent chez vous.

## Où et quand

- Un fichier de définitions peut tenir plusieurs capacités, grilles, exercices et routines (voir « Le fichier »).
- On importe un fichier depuis les réglages, section « Fichiers importés » : choisir un ou plusieurs fichiers `.json`. Cela marche dans toute construction, en développement comme en production. Le fichier est gardé dans la base du navigateur, sous son nom, et lu à chaque démarrage : il suffit de l'importer une fois.
- Un fichier importé du même nom remplace le précédent, sans confirmation. Le nom est comparé tel quel, majuscules comprises. Pour corriger un fichier, on le réimporte.
- Supprimer un fichier demande une confirmation. Il retire ses capacités, ses grilles, ses exercices et ses routines de l'application, mais la progression reste, et se retrouve si l'on réimporte un fichier qui les définit de nouveau. Une progression dont aucun fichier chargé ne donne la définition est gardée et ignorée par les écrans.
- Un fichier de plus d'un million de caractères n'est pas gardé. Tout autre fichier l'est, même illisible : son refus s'affiche, et on le remplace par une version corrigée.
- Vérifier un exercice a des limites, pour qu'un seul exercice ne coûte pas des secondes à vérifier à chaque démarrage. Un exercice est refusé s'il écrit plus de 100 niveaux (`levels`), une échelle (`params.ladder`) de plus de 100 niveaux, un niveau dont les `params` ont plus de 200 entrées, plus de 2 000 éléments (`items`), ou si ses éléments (ou, sans éléments, ses figures) multipliés par ses niveaux demandent plus de 20 000 tours à vérifier. Le refus nomme le champ, le nombre écrit et la limite. Un fichier entier a en plus un budget de vérification (voir « Ce que vérifier un fichier peut coûter »).
- La sauvegarde (réglages) emporte les fichiers importés avec la progression, et les rend à l'import.
- Au démarrage, `loadDefinitions` (`src/lib/composition/definitions.ts`) vide les registres de capacités, de grilles, d'exercices et de routines, puis les remplit : les fichiers de `catalog/`, puis les fichiers importés. Le premier écran attend cette lecture.
- Si la lecture des fichiers importés échoue, l'application démarre avec le catalogue seul et le dit par un refus, sous le nom `imported files` : `the imported files could not be read: <message>`. La section « Fichiers importés » des réglages montre ce refus au-dessus de la liste.
- Un exercice ou une grille valide se joue comme ceux du catalogue. Un exercice importé se joue seul depuis la Bibliothèque, et dans la séance d'une routine qui le nomme ; une routine importée se montre sur l'accueil (voir « Jouer un fichier importé »).
- Si le chargement des fichiers importés ne s'est pas terminé la dernière fois, l'application démarre sans eux cette fois-là et le dit ; on peut alors supprimer le dernier fichier ajouté.
- Aucun dossier du dépôt n'est lu à la construction : un fichier privé se garde où l'on veut, hors du dépôt, et s'importe. Il n'entre jamais dans le catalogue ni dans la construction publiée.
- Un fichier importé n'est jamais exécuté, et ses textes s'affichent comme du texte.

## Le fichier

Un fichier de définitions est un objet JSON :

```
{ "format": 0, "skills": [], "grids": [], "exercises": [], "routines": [] }
```

- `format` vaut 0 : le format n'est pas encore stable et changera sans conversion.
- `skills`, `grids`, `exercises` et `routines` sont des listes, facultatives ; un fichier peut en tenir plusieurs.
- Une capacité s'écrit `{ "id": "…", "name": { "fr": "…", "en": "…" }, "items": "<ensemble>", "memory": false }` ; une capacité de mémoire (`"memory": true`) écrit aussi `"directRecall": { "withinMs": 1500 }`. Les ensembles : `note-on-string`, `placed-note`, `voicing-on-strings`, `placed-voicing`, `placed-shape`, `change`, `figure`.
- Une clé inconnue au premier niveau, un texte qui n'est pas du JSON ou un fichier de plus d'un million de caractères refusent tout le fichier.
- Un `id` de capacité, de grille ou d'exercice est fait de lettres, de chiffres, de `-`, de `_` et de `.`, et commence par une lettre ou un chiffre. L'identifiant `unknown` est réservé (capacités et exercices) : la migration le donne aux tentatives que rien ne nomme. Un exercice ne peut pas non plus prendre l'ancien identifiant d'un exercice renommé par la migration 13 (`locate-neck`, `identify-neck`, `triads-anchor`, `triads-zone`, `gesture-link`, `gesture-climb`, `gesture-zone`, `gesture-jam`) : une sauvegarde de sa progression serait refusée.
- Dans un fichier, deux objets de même `id` dans une liste : le second est refusé. Un exercice, une grille et une routine peuvent partager un `id` : chaque sorte a ses propres identifiants.

## Une grille

Une grille s'écrit `{ "id": "…", "title": "…", "beatsPerBar": 4, "bars": 12, "chords": [ … ] }`, chaque accord `{ "bar": 1, "beat": 1, "symbol": "F7" }`, avec de vrais symboles d'accords (`parseChordSymbol`). La première commence mesure 1, temps 1, et les accords vont dans l'ordre, dans la grille. Une grille écrit au plus 256 accords (`chords has <n> entries, more than 256`). Un exercice nomme ses grilles par leur `id` dans `passages.of.grid` (voir « Une suite de changements »).

Un exercice peut nommer une capacité ou une grille de n'importe quel fichier de sa source, quels que soient leurs noms : le catalogue est une source, les fichiers importés en sont une autre. Dans une source, les capacités de tous les fichiers, puis leurs grilles, rejoignent le registre avant qu'aucun exercice soit vérifié. Le catalogue est lu avant les fichiers importés : un fichier importé peut nommer une capacité ou une grille du catalogue, le catalogue jamais celles d'un fichier importé.

## Un exercice

C'est une `ExerciseDefinition` (`src/lib/domain/exercise/types.ts`) écrite en JSON, avec cinq écarts :

- `figures` : chaque figure s'écrit `{ "id": "…", "lilypond": "c4 c c c", "meter": { … } }`. Le LilyPond est le sous-ensemble strict de `parseLilyPond` (pas de `#` ni de `$`). `meter` est facultatif (4/4 par défaut) et s'écrit `{ "count": 3, "unit": "1/4", "grouping": [1, 1, 1] }`.
- `shapes` : chaque forme s'écrit `{ "id": "…", "symbol": "maj7", "lilypond": "c\\5 e\\4 g\\4 b\\3" }` (voir « Une forme déplacée d'accord en accord »).
- `items` : chaque entrée est une clé d'élément (`"…"`), ou une clé avec la longueur de son tour en temps (`{ "item": "…", "beats": 4 }`). La clé ne dit que l'élément ; la longueur appartient à l'entrée.
- `meter` au premier niveau s'écrit de la même façon (l'unité est une fraction écrite en texte).
- L'accompagnement (`round.accompaniment`, ou le paramètre qu'il nomme par `{ "param": "…" }`, dans `params` et dans les `params` de chaque niveau) s'écrit `{ "clicks": { "beats": [1, 2, 3, 4], "accent": [1] }, "bars": ["on", "on", "on", "off"] }` : les temps où le clic sonne, ceux qu'il accentue (facultatif), puis une mesure par entrée, `"off"` pour une mesure muette.
- Une clé inconnue au premier niveau refuse l'exercice, en la nommant.

Tout le reste doit déjà être du JSON simple : nombres, textes, listes, objets. Les clés connues sont `id`, `practices`, `params` (obligatoires), puis `tempo`, `chordDiagram`, `meter`, `flow`, `round`, `presentation`, `view`, `howTo`, `title`, `levels`, `figures`, `shapes`, `pick`, `items`, `passages`.

`practices` nomme la capacité que l'exercice travaille : elle doit être définie dans un fichier de la même source, ou du catalogue (voir « Une grille »). Un exercice privé écrit avant la version 13 ne retrouve sa progression que si sa capacité porte l'identifiant qu'avait l'exercice.

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

Un exercice de mémoire importé se joue dans la séance d'une routine qui le nomme (voir « Une routine »), ou seul, en jeu libre, depuis la Bibliothèque (voir « Jouer un fichier importé »).

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

**Ce que le joueur vit.** La séance des notes liste `identify-note` puis `locate-note-string` : si une note déjà placée peut se nommer, elle passe avant une nouvelle note à placer. Un élément n'est jamais demandé deux fois de suite. Une note n'attend plus que son « miroir » soit acquis (le miroir de « A, corde de E grave » était « E, corde de A »), la séance ne cherche plus une autre corde, et les notes des triades en cours d'apprentissage ne viennent plus en premier : rien de cela n'est calculé sur l'état du joueur, seule la liste décide. Cet ordre entre les exercices d'une séance est celui que la routine écrit (`exercises`) ; une routine dont deux exercices travaillent une même capacité est refusée au chargement.

**Refusé** (le refus nomme l'exercice et le champ ; les raisons sont dites comme le code les donne) :

- `an exercise that practises a skill with cards must list its items` : la capacité a des cartes et `items` manque.
- `items must be a list`, `items lists no item` : `items` n'est pas une liste, ou elle est vide. Le premier ne se voit que pour un exercice dont la capacité n'a pas de cartes ; avec des cartes, `items` absent donne d'abord « must list its items ».
- `items[<n>] repeats items[<m>]` : un élément écrit deux fois.
- Une clé que l'ensemble ne sait pas lire : le refus nomme l'entrée, `items[<n>] ("<clé>")`.
- `items[<n>] ("<clé>"): names grid "<grille>", which no file defines` : un changement (ensemble `change`) d'une grille qu'aucun fichier ne définit. Les grilles de tous les fichiers sont lues avant qu'un exercice soit vérifié.
- `params.learning must be an object`, `params.learning.presentAtOnce must be true or false`.
- `params.learning.enter must be { acquired: { skill, item } }` ; `params.learning.enter needs a skill with cards` (la capacité de l'exercice n'a pas de cartes) ; `params.learning.enter names skill "<id>", which no file read so far defines` ; `params.learning.enter names skill "<id>", which has no cards`.
- `params.learning.enter.acquired.item "<nom>" is no correspondence from <ensemble> to <ensemble>` : la correspondance n'existe pas entre ces deux ensembles.
- `params.learning.draw is gone: write params.learning.asks`.
- `params.learning.asks must be a selection` ; `params.learning.asks takes no order and no take: one member is drawn` ; `params.learning.asks takes no "of": a member of the card’s own item is asked` ; `params.learning.asks needs a set that can ask a member, which <ensemble> cannot` ; `params.learning.asks names family "<famille>", but <ensemble> asks members of <famille>`. Un problème du choix lui-même est dit sous `params.learning.asks.<champ>`, avec les raisons de « Un contenu écrit comme un choix », plus bas.

Une condition d'entrée qui nomme la capacité de l'exercice lui-même est acceptée : le moteur sait la jouer, et rien n'entre jamais.

## Un contenu écrit comme un choix

Une attente d'un tour dit ce que le tour accepte comme réponse. Elle l'écrit en choisissant des **membres** d'une **famille** : le tour accepte tout membre admis, et rien d'autre.

```json
"content": { "family": "chord-shapes", "where": [{ "at": { "item": "fret" } }] }
```

Un choix a cinq clés. Seule `family` est obligatoire.

- `family` : la famille. Une attente en a deux, `note-places` (les places d'une note sur le manche : une par corde et par case) et `chord-shapes` (les formes d'un accord sur des cordes voisines : une par octave où elle tient sur le manche). Une troisième, `grid-changes` (les changements d'une grille), ne sert qu'à lister les tours d'un passage (voir « Une suite de changements ») : elle ne reconnaît rien.
- `of` : le nom de ce qui donne l'**index** de la famille à partir de l'élément. Absent, c'est l'index que l'ensemble de l'élément donne à cette famille. Cinq noms existent : `note` (la note d'un élément de `note-on-string`, avec sa corde), `voicing` (l'accord d'un élément de `voicing-on-strings`), `root` (la fondamentale d'un voicing : la note de la corde qui porte le degré 1), `placed` (l'accord d'un élément de `placed-voicing`, avec ses degrés et ses cases : une seule forme) et `change-chord` (la triade du symbole d'un changement de grille, élément de `change`, sur la zone de cordes de son passage). L'index de `note-places` est une note, avec ou sans corde (un élément de `note-on-string` donne la note et sa corde) ; celui de `chord-shapes` est un accord sur des cordes, avec ou sans le degré de chaque corde (un élément de `voicing-on-strings` donne l'accord, ses cordes et ses degrés).

**Une zone de cordes.** Un index de `chord-shapes` sans degrés est une triade sur une **zone de cordes** : trois cordes voisines ou plus, écrites de la plus grave à la plus aiguë (`[4, 3, 2, 1]`). Ses formes sont celles des trois renversements serrés sur chaque groupe de trois cordes voisines de la zone : `[4, 3, 2, 1]` donne les groupes 4-3-2 et 3-2-1, `[3, 2, 1]` le seul groupe 3-2-1. Elles sont rangées par position sur le manche. Une zone de moins de trois cordes, des cordes qui ne se suivent pas ou un accord qui n'est pas une triade sont refusés (`chord-shapes needs three neighbouring strings or more and a triad`).

- `where` : une liste de **filtres**. Chacun restreint les membres admis.
- `order` : une liste d'**attributs** ; les membres admis sont rangés par le premier, puis par le suivant à égalité.
- `take` : le nombre de membres gardés après le rangement (un entier d'au moins 1). Absent, tous les membres admis sont gardés.

Un membre a quatre **attributs** : `strings` (ses cordes), `frets` (ses cases), `position` (sa case frettée la plus basse, 0 pour une forme à vide) et `pitch` (sa note la plus grave).

Les quatre **filtres** s'écrivent chacun comme un objet à une seule clé :

| Filtre                 | Écriture                                                                  | Ce qu'il admet                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dans une zone          | `{ "in": { "strings": [3, 2, 1], "frets": [5, 8] } }`                     | le membre dont chaque note est sur ces cordes et dans ces cases (une des deux bornes suffit). Une corde à vide compte dans une zone qui commence à la case 1, et dans aucune autre.                                                       |
| à une case             | `{ "at": 7 }`                                                             | le membre qui **couvre** cette case : elle est entre sa case la plus basse et sa plus haute, une corde à vide comptant pour la case 0                                                                                                     |
| au-delà du précédent   | `{ "position": { "beyond": "previous", "toward": "up", "turns": true } }` | le membre dont la position est plus haute (`"up"`) ou plus basse (`"down"`) que celle du précédent ; avec `turns`, quand plus rien n'est au-delà, le sens contraire. `toward` peut se lire dans un paramètre : `{ "param": "direction" }` |
| autre que le précédent | `{ "other": "previous" }`                                                 | tout membre sauf le précédent ; si rien d'autre ne reste (une seule forme), le précédent reste admis                                                                                                                                      |

Le précédent est donné par ce qui appelle : pour le choix de la consigne, la dernière forme demandée de cette carte ; pour un tour d'un passage, la dernière forme entendue dans ce passage (voir « Une suite de changements »). Sans précédent, `position` et `other` ne restreignent rien : c'est le cas du premier tour d'un passage, et de tout tour qui n'appartient pas à un passage. **L'ordre où les filtres sont écrits ne change rien** : le moteur applique toujours d'abord `in` et `at`, puis `position` (plusieurs `position` se croisent), puis `other`.

Une valeur d'un filtre s'écrit de trois façons : un nombre ou une liste écrits, `{ "param": "a.b" }` lue dans les paramètres du niveau, ou `{ "item": "fret" }` lue sur l'élément (`take` lit de même un paramètre). Deux valeurs se lisent sur un élément :

- `string`, la corde d'un élément de `note-on-string` ;
- `fret`, pour un élément de `voicing-on-strings` : la case que la consigne nomme. Si l'élément n'en nomme pas, c'est la place de la forme demandée : 0 pour une forme à vide, sinon sa position. Elle n'est absente que pour un élément sans position, et alors seulement le filtre ne restreint rien : il accepte le voicing partout.

Une zone dont une borne est lue (dans un paramètre ou sur l'élément) peut sortir à l'envers à un niveau ou pour un élément : la première case au-dessus de la seconde. Elle n'admet alors rien : toute réponse est fausse, et la consigne garde l'élément de la carte. Seule une zone écrite à l'envers, ou un paramètre qui tient une paire à l'envers, est refusée.

Dans le catalogue :

- `locate-note-string` : `{ "family": "note-places" }`, toute place de la note sur la corde demandée, quelle que soit l'octave.
- `chord-anchor` : `{ "family": "note-places", "of": "root" }` pour la fondamentale, puis `{ "family": "chord-shapes" }` pour l'accord.
- `chord-zone` : `{ "family": "chord-shapes", "where": [{ "at": { "item": "fret" } }] }`.

**Refusé** (le refus nomme le champ du choix ; les raisons sont dites comme le code les donne) :

- `must be a selection { family, of?, where?, order?, take? }` ; `<clé> is not a key of its place (known: …)` ; `family must name a family` ; `names family "<nom>", which is not registered`.
- `set <ensemble> gives no index of <famille>` ; `of "<nom>" gives no index of <famille> from <ensemble>`.
- `where must be a list of filters` ; `where[<i>] is no filter (in, at, position, other)` ; `where[<i>].in must be { strings?, frets? }` ; `where[<i>].position must be { beyond: "previous", toward: "up", "down" or { param }, turns?: true or false }` ; `where[<i>].other must be "previous", got …`.
- `where[<i>].at must be a number, got …` (de même pour `strings`, `frets`) ; `reads item value "<nom>", which <ensemble> does not have` ; `reads item value "<nom>", <sa forme>, where <la forme voulue> is needed` (par exemple `where[0].in.frets reads item value "fret", a number, where a pair of frets is needed`) ; une valeur lue dans un paramètre qu'un niveau n'écrit pas ou écrit d'une autre forme : `reads param "<chemin>", which no level of the exercise writes`, `…which <niveau> does not write`, `…which <niveau> gives as <valeur>, <pourquoi>`.
- `of must name an index derivation` ; `<champ>.param reads a param named by text`.
- `order must be a list of attribute names` ; `order names attribute "<nom>", which family "<famille>" does not have`.
- `take must be a positive whole number` ; `take must be a number, { param: path } or { item: name }` ; `take measures unknown item number "<nom>"`.
- `filter "in" has frets [<a>, <b>]: the first is above the second`.
- Un contenu qui n'est ni `null`, ni `{ "from": … }`, ni un choix : `must be null, { from: derivation } or a selection { family, of?, where?, order?, take? }`.

Trois limites s'ajoutent à celles de la section « Le fichier », pour qu'un choix ne coûte pas des secondes à vérifier à chaque niveau : au plus 16 filtres dans `where` (`has <n> filters, more than 16`), 8 attributs dans `order` (`names <n> attributes, more than 8`), et 64 attentes dans un tour (`round.expectations has <n> entries, more than 64`). Ces limites bornent un tour ; ce que coûte un fichier entier est borné par son budget de vérification (voir « Ce que vérifier un fichier peut coûter »).

Ce que le joueur ne voit pas changer : une note se reconnaît à sa hauteur seule (le capteur n'entend pas la corde), une forme à ce que le capteur d'accords décide. Les confusions (octave, corde, écart en cases ; autre octave, autre renversement, autre accord) sont celles d'avant. Un tour déjà joué garde son ancien contenu dans la tentative : il n'est pas rejugé.

## Une suite de changements : les passages

Un exercice de changements fait jouer une suite de tours enchaînés, sans silence entre eux : les changements d'une grille, ou les renversements d'un accord l'un après l'autre. Il l'écrit dans `passages`. Un **passage** est la suite des membres d'une famille pour un **index** que l'exercice liste ; chaque membre est l'élément d'un tour. Le catalogue en a quatre, dans `catalog/changes.json` : `inversion-run` (le lien), `grid-in-direction` (la montée), `grid-in-zone` (la zone) et `grid-reading` (la lecture).

La montée écrit :

```json
"passages": {
	"of": {
		"grid": ["iohefy-a", "blues-f"],
		"strings": [[3, 2, 1], [4, 3, 2]]
	},
	"members": { "family": "grid-changes" },
	"each": { "direction": ["up", "down"] },
	"opens": {
		"acquired": { "skill": "chord-anchor", "item": "voicing", "need": "every-group" }
	},
	"passes": 0.9,
	"scope": "grid"
}
```

et, dans l'attente de son tour, ce qu'un changement accepte :

```json
"content": {
	"family": "chord-shapes",
	"where": [
		{ "position": { "beyond": "previous", "toward": { "param": "direction" }, "turns": true } }
	]
}
```

Pour le joueur : il joue une grille entière sur un groupe de cordes, chaque accord sur une forme plus haute que la précédente (ou plus basse, la fois suivante), et repart dans l'autre sens quand le manche s'arrête.

### Les clés de `passages`

`of` et `members` sont obligatoires ; les autres clés sont facultatives. Une autre clé refuse l'exercice.

- **`of`** : des noms, chacun avec la liste de ses valeurs. Les index sont toutes les combinaisons d'une valeur de chaque liste : la montée a 2 grilles × 2 groupes de cordes, soit 4 index ; le lien, 24 accords × 2 groupes, soit 48. Une valeur est un texte, un nombre ou une liste de textes et de nombres ; elle ne contient ni `;` ni `=`. Deux valeurs d'une liste qui s'écrivent de même (`[3, 2, 1]` et `"3,2,1"`) sont refusées. Les noms que les familles lisent : `grid` (l'`id` d'une grille), `chord` (un symbole d'accord, écrit comme sur une grille : `C#m`), `strings` (une zone de cordes).
- **`members`** : un choix (voir « Un contenu écrit comme un choix »), sans `of` : l'index vient du passage. Deux familles savent donner des membres à partir d'un index de passage :
  - `grid-changes` : la grille que nomme `grid`, ses changements dans l'ordre (deux accords égaux de suite sont un seul changement). Chaque changement est un élément de l'ensemble `change`, de clé `<grille>#<rang>` (`iohefy-a#2`).
  - `chord-shapes` : la triade du symbole que nomme `chord`, sur la zone de cordes que nomme `strings` (dans `of`, sinon dans `params`). Chaque forme est un élément de l'ensemble `placed-voicing`.

  Les membres doivent être des éléments de l'ensemble de la capacité que l'exercice travaille. `andBack: true` fait le chemin du retour : les membres dans l'ordre, puis en sens inverse sans répéter le dernier (`a b c d` donne `a b c d c b a`). Le lien écrit `{ "family": "chord-shapes", "order": ["position"], "take": 4, "andBack": true }` : les quatre formes les plus graves de l'accord, en montant, puis le retour, sept mesures.

- **`each`** : les **paramètres de passage**. Chaque nom a une liste de valeurs (de 1 à 64). Au premier passage d'un index, chaque paramètre prend la première valeur de sa liste. Aux passages suivants, il prend la valeur qui vient après celle du dernier passage de cet index. À la fin de la liste, il revient à la première. Seul un choix lit un paramètre de passage : la valeur d'un filtre, `toward`, `take` (`{ "param": "direction" }`). Un nombre du tour (`prompt.lead`, `window.ms`) écrit `{ "param": <un paramètre de passage> }` est refusé : `round.prompt.lead reads param "<nom>", which the exercise does not give as a number (its params and their defaults)`. La montée alterne ainsi `up` et `down` sur chaque index ; la zone écrit sa liste de zones :

  ```json
  "each": {
  	"zone": [[1, 5], [6, 10], [11, 15], [3, 7], [8, 12], [13, 17], [5, 9], [10, 14], [2, 6], [7, 11], [12, 16], [4, 8], [9, 13]]
  }
  ```

  Un paramètre de passage n'a qu'une source : son nom ne peut pas être aussi écrit dans `params`, à un niveau de l'exercice ou de son échelle, être une clé de `of`, ni être un nom que le tour donne lui-même (`leadBeats`, `previewBeats`). Chacune de ses valeurs est vérifiée là où le tour la lit : une `direction` doit valoir `"up"` ou `"down"`, une zone être une paire de cases dans l'ordre.

- **`opens`** : l'**ouverture** d'un index. `{ "acquired": { "skill": "chord-anchor", "item": "voicing", "need": "every-group" } }`. Pour chaque changement du passage, on prend les formes que son contenu admet, sans ses filtres. On les groupe par leurs cordes. Chaque forme nomme une carte de la capacité `skill`, par la correspondance `item` (`voicing` : une forme placée nomme son voicing sur ses cordes, élément de `voicing-on-strings`). L'index est ouvert quand, pour chaque changement, ces cartes sont acquises dans chaque groupe (`"every-group"`, par défaut) ou dans un groupe au moins (`"one-group"`). La capacité doit avoir des cartes. Sans `opens`, tout index est ouvert. Le passage est lu avec chaque paramètre de passage à sa première valeur.
- **`again`** : `"until-passed"` fait revenir un passage raté, entier, sur le même index et avec les mêmes paramètres, après une mesure comptée, jusqu'à ce qu'il réussisse. Seul le lien l'écrit.
- **`restBars`** : des mesures de silence (de 0 à 16) avant la mesure comptée d'un passage qui en suit un autre dans la séance. Jamais avant le premier passage, ni avant un passage qui revient par `again`. Le lien écrit 1.
- **`passes`** : la part de tours justes qui fait réussir un passage, au-dessus de 0 et au plus 1 (1 par défaut). Les quatre exercices écrivent 0,9. Un tour qui n'a pas de tentative compte comme raté.
- **`scope`** : le nom d'une clé de `of` dont la valeur sépare les niveaux de l'exercice. Les trois exercices de grille écrivent `"scope": "grid"` : un blues et une ballade montent en tempo chacun de leur côté. Sans `scope`, l'exercice a un seul niveau (le lien).

Un exercice qui écrit `passages` n'écrit pas `items`, et sa capacité n'a pas de cartes.

### Ce qu'un changement accepte

Le contenu de l'attente du tour est un choix de la famille `chord-shapes`. Pour un changement de grille, son index est la triade du symbole du changement, sur la zone de cordes du passage (`strings` dans `of`, sinon dans `params`). Le catalogue écrit :

| Exercice            | Zone de cordes            | Filtres                                                                                       |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `inversion-run`     | celle de l'index          | aucun : l'élément est une forme placée, une seule est admise                                  |
| `grid-in-direction` | celle de l'index          | `{ "position": { "beyond": "previous", "toward": { "param": "direction" }, "turns": true } }` |
| `grid-in-zone`      | `"strings": [4, 3, 2, 1]` | `{ "in": { "frets": { "param": "zone" } } }`                                                  |
| `grid-reading`      | `"strings": [4, 3, 2, 1]` | aucun : toute forme de la triade sur les groupes 4-3-2 et 3-2-1                               |

- **Le précédent** d'un tour est la dernière forme **entendue** dans le passage : toute forme que la réponse nomme, même d'un autre accord, même ratée. C'est elle qui sonne encore. Le premier tour d'un passage n'a pas de précédent.
- **Le sens qui tourne.** Quand `position` avec `turns` ne trouve rien au-delà du précédent, il cherche dans l'autre sens. Si son `toward` lit un paramètre de passage (`{ "param": "direction" }`), ce paramètre tourne pour ce tour et pour le reste du passage. Le passage suivant du même index prend la valeur qui suit celle par laquelle celui-ci a commencé : l'alternance n'est pas dérangée.
- **Une zone de cases lue dans un paramètre** s'écrit `{ "in": { "frets": { "param": "zone" } } }`. L'écriture `{ "in": { "param": "zone" } }` est refusée.

### Ce que la séance joue

La séance d'une routine dont les exercices écrivent `passages` les joue chacun à son tour, dans l'ordre où la routine les liste. La routine « Changements » (`changes`) liste le lien, la montée, la zone et la lecture. Pour l'exercice dont c'est le tour, elle prend, parmi ses index ouverts, celui qui a été joué le moins récemment (à égalité, le premier écrit).

- Chaque passage commence par une mesure comptée, puis ses tours s'enchaînent sans silence.
- Un passage qui ne peut pas se jouer est sauté : il ne donne aucun membre, plus de 256, un de ses tours ne se compile pas, ou un de ses tours n'admet aucune forme (une zone où un accord n'a pas de forme). La séance essaie alors les valeurs suivantes des paramètres de passage de cet index ; un index sans aucun passage jouable est laissé de côté pour la séance, et un exercice sans index jouable aussi.
- Les essais ratés d'un index ont un prix borné : quand ses passages injouables ont coûté 1 000 unités de vérification (`MAX_PASSAGE_TRIES`, comptées comme au chargement, voir « Ce que vérifier un fichier peut coûter »), l'index est laissé de côté pour la séance, même s'il lui reste des valeurs à essayer. Un passage jouable est toujours servi, quel que soit son poids. La séance ne s'arrête faute de passage que lorsqu'il ne reste plus rien à jouer. Le pire cas connu : un fichier écrit de sept exercices aux passages lourds qui échouent tous fait attendre environ deux secondes, une fois, avant le premier passage.
- Une tentative de changement garde son passage (`data.passage` : son identité, son index, son rang, les valeurs de ses paramètres). Le moins récemment joué et la valeur suivante se relisent là. Les tentatives d'avant les passages ne la portent pas : au premier lancement, chaque index repart « jamais joué », la montée repart vers le haut, la zone de la première.
- Une fois la durée de la séance passée, ou dès que la séance juge le joueur fatigué, aucun passage ne commence ; celui qui est en cours va jusqu'au bout.
- « On change d'air » (voir « Les niveaux et l'aide ») peut arrêter un passage en son milieu.

Un exercice de passages d'un fichier importé se joue de la même façon : dans la séance d'une routine qui le nomme, ou seul, depuis la Bibliothèque (ses passages, sur ses index ouverts).

### Les niveaux et l'aide

Les niveaux de tempo s'écrivent comme pour tout exercice (`levels`) : les quatre exercices vont de ♩ = 80 à 120 de 5 en 5, chaque niveau passé après 10 changements justes de suite et quitté après 3 ratés de suite. Le niveau bouge à chaque changement jugé ; un nouveau tempo s'applique au passage suivant, après sa mesure comptée.

L'aide est un **niveau d'aide** écrit sous le niveau 1, avec l'anti-blocage. Les quatre exercices l'écrivent de la même façon :

```json
"levels": [
	{ "aid": true, "params": { "tempo": 80 } },
	{ "params": { "tempo": 80 }, "pass": { "successes": 10 }, "drop": { "failures": 3 } }
],
"flow": { "antiBlocking": true }
```

Dans le catalogue, les niveaux suivants (♩ = 85 à 120) s'écrivent de la même façon que le niveau 1, avec leur tempo.

- **Un niveau d'aide de l'exercice montre l'aide de sa consigne** (`presentation.aided`, voir « La consigne d'un passage »). Les quatre exercices écrivent `"aided": { "picture": "admitted" }` : sur le manche, les formes que le tour admet. À tout autre niveau, rien n'est dessiné. La règle est la même sur toutes les vues : `aided` se montre à un niveau d'aide de l'exercice, ou pour un élément servi aidé par l'échelle d'un exercice de mémoire. L'ancien paramètre `"shapes": true` n'existe plus : il n'est lu par rien, et un niveau qui l'écrit n'a pas d'aide de plus.
- **Ce que le joueur vit** : après trois ratés de suite au niveau 1, le niveau d'aide arrive au passage suivant, annoncé. Trois changements justes de suite le ramènent au niveau 1 (le niveau d'aide n'écrit ni `pass` ni `drop` : le moteur en compte trois). Un changement joué au niveau d'aide compte comme joué au niveau, pas comme aidé : c'est ce qui permet d'en remonter. Trois ratés de suite au niveau d'aide amènent « On change d'air » : juste après ce changement, au milieu du passage, cet exercice sort de la séance et se repose une heure ; pour un exercice de grille, seule la grille où il a bloqué sort. La séance continue avec les autres, et s'arrête quand il ne reste plus rien à jouer (voir « Une routine »). Le bloc « Changements » de l'accueil dit alors « On y revient plus tard ». Le repos ne change pas ce que la séance suivante pioche : lancée tout de suite, elle retombe d'abord sur cet exercice, à son niveau d'aide.
- **La lecture** (`grid-reading`) a son niveau d'aide comme les trois autres. Son aide dessine toutes les formes de l'accord sur les quatre cordes ré, sol, si, mi, puisque son tour n'a pas de filtre.

### La consigne d'un passage

Un exercice de passages écrit sa consigne dans `presentation`, avec les emplacements de tout exercice. Une vue de passage (voir « Les vues ») en lit cinq :

- `primary` : le grand mot du tour montré. Seule la vue du lien le montre.
- `secondary` : la ligne à côté de ce mot sur le lien ; le titre, en haut, sur la grille.
- `detail` : la ligne de consigne (les cordes, le sens, les cases). Une consigne vide ne s'affiche pas.
- `target` : les mots de **chaque tour** sur la ligne du passage, dits pour l'élément de ce tour. Sans `target`, ce sont ceux de `primary`. La grille les écrit dans ses cases, et pour l'accord du moment et celui d'« Ensuite ». Le lien les écrit sur la tuile du premier tour, et sur celle d'un tour qui ne monte ni ne descend.
- `aided` : l'aide, à un niveau d'aide de l'exercice. Seul le dessin `admitted` se voit sur une vue de passage.

`band`, `preview`, `fading` et `aided.line` sont acceptés, mais aucune vue de passage ne les montre.

Un champ entre accolades, comme `{symbol}`, vient de deux endroits.

**L'élément du tour** :

- un changement de grille (ensemble `change`) : `symbol`, l'accord écrit par la grille (« Dm7 ») ; `title`, le titre de la grille (« I Only Have Eyes for You »).
- une forme placée (ensemble `placed-voicing`, le lien) : `chord`, le nom de l'accord (« Ebm ») ; `quality`, sa qualité (« majeur », « mineur » ; « major », « minor » en anglais ; une autre qualité s'écrit par son nom de code, `maj7`) ; `strings`, ses cordes (« ré‑sol‑si »).

**Le contenu du tour**, quand une de ses attentes est un choix de la famille `chord-shapes` :

- `strings` : les cordes de la zone, de la plus grave à la plus aiguë, reliées par un trait d'union qui ne se coupe pas : « sol‑si‑mi », « ré‑sol‑si‑mi » (« G‑B‑E » en anglais).
- `frets` : les cases du filtre `in` (`{ "in": { "frets": … } }`) : « 1 à 5 » (« 1 to 5 »). Vide sans ce filtre.
- `toward` : le sens du filtre `position` : « ↑ en montant » ou « ↓ en descendant » (« ↑ going up », « ↓ going down »). Vide sans ce filtre. Il dit la valeur que le filtre lit : quand le sens tourne au bout du manche (voir « Le sens qui tourne »), il dit le nouveau sens.

Un champ de l'élément passe avant un champ du contenu de même nom : sur le lien, `{strings}` est celui de la forme (le même texte). Quand plusieurs attentes d'un tour ont un choix, un champ vient de la première qui le donne non vide.

Les quatre consignes du catalogue :

| Exercice            | `primary`  | `secondary` | `detail`                                                         | `target`   | `aided`                     |
| ------------------- | ---------- | ----------- | ---------------------------------------------------------------- | ---------- | --------------------------- |
| `inversion-run`     | `{chord}`  | `{quality}` | `{ "fr": "sur cordes {strings}", "en": "on strings {strings}" }` | `{chord}`  | `{ "picture": "admitted" }` |
| `grid-in-direction` | `{symbol}` | `{title}`   | `"{strings} · {toward}"`                                         | `{symbol}` | `{ "picture": "admitted" }` |
| `grid-in-zone`      | `{symbol}` | `{title}`   | `{ "fr": "cases {frets}", "en": "frets {frets}" }`               | `{symbol}` | `{ "picture": "admitted" }` |
| `grid-reading`      | `{symbol}` | `{title}`   | aucun                                                            | `{symbol}` | `{ "picture": "admitted" }` |

Pour le joueur : le lien montre « Ebm » en grand, « mineur », « sur cordes ré‑sol‑si » ; la montée, le titre de la grille et « sol‑si‑mi · ↑ en montant » ; la zone, « cases 1 à 5 » ; la lecture, le titre seul.

**Le dessin `admitted`** se dessine sur le manche. Il montre les formes que le contenu du tour admet, en notes nommées, et celles du tour suivant, en plus clair. Les formes du tour suivant sont choisies avec, pour forme d'avant, celle qui a été entendue une fois le tour jugé ; avant, c'est la forme d'avant du tour montré. Une case commune aux deux n'est dessinée qu'une fois, comme note du tour montré. Le manche dessine les cordes de la zone que le tour écrit : trois pour le lien et la montée, quatre pour la zone et la lecture. Il garde ainsi ses cordes d'un tour à l'autre. Au dernier tour d'un passage, il n'y a pas de tour suivant : seules les formes du tour montré sont dessinées. Le dessin n'a pas de légende. Il n'existe que pour un tour dont une attente est un choix de membres, et seules les vues de passage le dessinent : ailleurs, ou sous `fading`, il est refusé.

### Les vues

Deux vues dessinent un passage : `grid-scroll` (la grille) et `link-lane` (le lien). Elles lisent la consigne de l'exercice et la ligne de son passage : pour chaque tour, sa place en temps, ses mots (`target`, sinon `primary`) et son sens depuis le tour d'avant.

- **`grid-scroll`** : en haut, `secondary` et `detail`. Au milieu, l'accord du moment et celui d'« Ensuite » (les mots de leurs tours). Puis les mesures de la grille, une case par tour avec ses mots ; chaque case jugée prend sa marque. En bas, l'aide, sur toute la largeur de la vue.
- **`link-lane`** : en haut, `primary` en grand, `secondary` et `detail`. Puis une tuile par temps. Sur le premier temps de chaque tour : ↗ quand le tour monte, ↘ quand il descend, sinon son `target`. Puis l'aide.

Le sens se lit sur la position des membres de la famille du passage (`members`), d'un tour au suivant : plus haut, plus bas, ou à la même place. Les changements d'une grille (`grid-changes`) n'ont pas de position : sur `link-lane`, chaque tuile y écrirait son `target`.

Après un raté, les deux vues dessinent la forme entendue et la forme attendue, et disent l'écart (« pas plus haut », « hors de la zone »…). La forme attendue est la forme admise la plus proche de celle entendue, sinon de celle qui sonne encore, sinon la première admise.

Un exercice qui écrit `passages` et une `presentation`, sur l'une de ces deux vues, est dessiné ainsi. Un exercice de passages doit donc nommer sa vue (`"view": "grid-scroll"` ou `"view": "link-lane"`). Avec une consigne et sans `view`, il est dessiné sur `lane`, comme un tour seul : sans la ligne du passage, et sans aide.

### Refusé

Le refus nomme l'exercice et le champ ; les raisons sont dites comme le code les donne.

- `passages must be an object` ; `passages has an unknown key "<clé>"` ; `an exercise writes passages or items, not both` ; `passages needs a skill without cards`.
- `passages.of must map names to lists of values` ; `passages.of names no list of values` ; `passages.of.<nom> must be a list, not empty` ; `passages.of name "<nom>" may not hold ";" or "="` ; `passages.of.<nom>[<i>] must be a text, a number or a list of them` ; `passages.of.<nom>[<i>] may not hold ";" or "="` ; `passages.of.<nom>[<i>] has the key of passages.of.<nom>[<j>]`.
- `passages.of gives no index of <famille>: <raison>` : un index que la famille ne sait pas lire, par exemple `unknown grid "x"`, ou une zone de cordes qui manque (`no zone of strings: neither the passage nor the params give "strings"`).
- `passages.members must be a selection { family, where?, order?, take?, andBack? }` ; `passages.members.andBack must be true or false` ; `passages.members names family "<famille>", which gives no members from a passage’s index` ; `passages.members names family "<famille>", whose members are no items of <ensemble>` ; un problème du choix lui-même, sous `passages.members.<champ>`.
- `passages.each must map names to lists of values` ; `passages.each.<nom> must be a list, not empty` ; `passages.each.<nom> is a name the round gives` ; `passages.each.<nom> is also written in params` ; `passages.each.<nom> is also a key of passages.of` ; `passages.each.<nom> is also written at a level` ; une valeur qui ne convient pas là où le tour la lit : `reads param "<nom>", which passages.each.<nom>[<i>] gives as <valeur>, <pourquoi>`.
- `passages.opens must be { acquired: { skill, item, need? } }` ; `passages.opens.acquired.need must be "every-group" or "one-group"` ; `passages.opens names skill "<id>", which no file read so far defines` ; `passages.opens names skill "<id>", which has no cards` ; `passages.opens needs a round whose content is a selection` ; `passages.opens reads the members of family "<famille>", which are items of no set` ; `passages.opens needs the round’s contents to give members of one set` ; `passages.opens.acquired.item "<nom>" is no correspondence from <ensemble> to <ensemble>`.
- `passages.members[<rang>] ("<membre>") of index <clé> does not compile: <raison>` : le tour d'un membre du premier passage d'un index (chaque paramètre de passage à sa première valeur, les paramètres du niveau 1) ne se compile pas. Par exemple, un tour dont la longueur lit `{ "item": "beats" }`, que les formes du lien ne portent pas : `round.length.beats measures item number "beats": This item has no length in beats`. Un index dont le premier passage n'a aucun membre, ou ne se lit pas, n'est pas refusé : la séance le saute.
- `view "<vue>" draws a passage, and the exercise writes no passages` : `link-lane`, ou `grid-scroll` avec une `presentation`, nommée par un exercice qui n'écrit pas `passages`.
- `writes a round but no presentation, and <ensemble> draws no screen of its own` : un exercice de passages sans `presentation`. Aucun code ne dessine plus l'écran des changements : la consigne est obligatoire. Pour une grille, `<ensemble>` est `change` ; pour le lien, `placed-voicing`.
- `presentation.<emplacement> names field "<champ>", which neither <ensemble> nor <familles> has` : un champ que ni l'élément ni le contenu du tour ne donne. Par exemple, sur une grille : `which neither change nor chord-shapes has`.
- `presentation.aided.picture names picture "admitted", which draws the members its round admits, and no expectation of its round has a member content` : le dessin `admitted` sur un tour sans choix de membres (de même sous `fading.picture`).
- `presentation.aided.picture names picture "admitted", which only a view that draws a passage draws (grid-scroll, link-lane), and the exercise is drawn on "<vue>"` : le dessin `admitted` en aide d'un exercice qui n'est pas sur une vue de passage.
- `presentation.fading.picture names picture "admitted", which no view draws as a fading picture` : le dessin `admitted` sous `fading`. Aucune vue ne le dessine là.
- `passages.again must be "until-passed"` ; `passages.restBars must be a whole number from 0 to 16` ; `passages.passes must be a number above 0 and at most 1` ; `passages.scope must name a key of passages.of` ; `passages.scope names "<nom>", which passages.of does not write`.

Les limites, chacune vérifiée avant le travail qu'elle borne : 500 index (`passages.of gives <n> indices, more than 500`, ou `passages.of gives more than 500 indices` quand le produit dépasse la limite avant la dernière liste), 64 valeurs par paramètre de passage (`passages.each.<nom> has <n> values, more than 64`), 256 membres par passage (`passages.members gives <n> members for index <clé>, more than 256`, comptés sans les filtres ni la prise qui lisent un paramètre de passage, pour borner tous les passages de l'index) et 256 accords par grille. Les tours compilés au chargement sont au plus 5 000, comptés avant d'en compiler un (`passages gives <n> rounds to check in the first passage of each index, more than 5000`).

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

`flow.demonstration: false` retire l'écoute de la première rencontre, qui dure autant que le contenu : 49 mesures à ♩ = 70 feraient 2 min 48 avant la première note. La vue `figure` garde l'écran à sa taille : la partition défile dans son cadre et suit la ligne jouée, et au-delà de 8 mesures elle est gravée plus petit. Un tour tient au plus 1 024 mesures et 1 024 notes (voir « Ce que vérifier un fichier peut coûter ») : un thème de plusieurs centaines de notes tient en un tour.

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

## Une routine : une entrée de l'accueil

Une **routine** est une entrée de l'accueil : un titre, et les exercices qu'une séance joue ensemble. Elle s'écrit dans la liste `routines` d'un fichier. Le catalogue en écrit quatre, toutes dans `catalog/routines.json`. La zone des triades :

```json
{
	"id": "chords-zone",
	"title": { "fr": "Triades vers une case", "en": "Triads around a fret" },
	"exercises": ["chord-zone"],
	"howTo": {
		"fr": "« C · vers la case 5 » : quand la case atteint le trait, plaque l’accord…",
		"en": "…"
	},
	"opens": { "acquired": { "skill": "chord-anchor", "atLeast": 6 } }
}
```

### Les clés

`id`, `title` et `exercises` sont obligatoires ; `howTo` et `opens` sont facultatives. Une autre clé refuse la routine.

- **`id`** : il s'écrit comme les autres identifiants (lettres, chiffres, `-`, `_`, `.`). Les routines ont leurs propres identifiants : une routine peut porter l'`id` d'un exercice. C'est lui que l'adresse d'une séance nomme : `/session?routine=<id>`.
- **`title`** : `{ "fr": "…", "en": "…" }`, deux textes non vides. C'est le titre du bloc sur l'accueil, et l'en-tête de l'écran de jeu (les écrans des changements et des figures ne montrent pas encore cet en-tête).
- **`exercises`** : les identifiants des exercices, de 1 à 32, chacun une fois. L'ordre compte : c'est l'ordre où ils introduisent, ou l'ordre où ils jouent à tour de rôle (voir « Ce qu'une séance joue »).
- **`howTo`** : `{ "fr": "…", "en": "…" }`, la consigne de l'écran de départ, quand le premier exercice joué n'écrit pas la sienne (son `howTo`). Sans elle, l'écran donne la phrase générale.
- **`opens`** : l'**ouverture**, ce que le joueur doit savoir pour que la routine soit proposée (voir « L'ouverture »). Sans elle, la routine est ouverte.

Les quatre routines du catalogue, dans l'ordre de l'accueil :

| `id`          | `title`               | `exercises`                                                          | `opens`                                                     |
| ------------- | --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `notes`       | Apprentissage (Learn) | `identify-note`, `locate-note-string`                                | aucune                                                      |
| `chords`      | Triades               | `chord-anchor`                                                       | aucune                                                      |
| `chords-zone` | Triades vers une case | `chord-zone`                                                         | `{ "acquired": { "skill": "chord-anchor", "atLeast": 6 } }` |
| `changes`     | Changements           | `inversion-run`, `grid-in-direction`, `grid-in-zone`, `grid-reading` | aucune                                                      |

Chacune écrit aussi son `howTo` : le texte que l'écran de départ montrait pour elle.

### Ce qu'une séance joue

La routine n'écrit pas comment sa séance pioche : cela se déduit de ses exercices.

| Les exercices de la routine                             | La séance                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| tous sur une capacité de mémoire                        | la procédure d'apprentissage, sur les éléments de leurs listes (voir « Un exercice de mémoire »)      |
| tous sur une capacité sans mémoire, avec `passages`     | chaque exercice à son tour, un passage chacun, puis on recommence (voir « Une suite de changements ») |
| un mélange, ou un exercice sans mémoire sans `passages` | refusé au chargement                                                                                  |

- **Mémoire.** Entre les exercices, le premier listé qui a un élément prêt introduit. `notes` liste `identify-note` avant `locate-note-string` : nommer une note déjà placée passe avant une nouvelle note à placer. La séance lit les cartes des capacités de ses exercices, et celles que leur condition d'entrée nomme (`params.learning.enter`) : `chord-zone` lit les cartes de `chord-anchor`.
- **Passages.** Les exercices jouent dans l'ordre de la liste. `changes` : le lien, la montée, la zone, la lecture.
- Les exercices de rythme n'ont ni mémoire ni passages : ils ne forment pas de routine, ils se jouent seuls.
- Une séance dure cinq minutes, comme toutes les séances.
- Une séance de routine écoute avec les capteurs des exercices de **toutes** les routines, pas seulement des siens : ce que les autres capteurs entendent reste gardé sur les tentatives. Un exercice joué seul n'ouvre que ses propres capteurs.

### L'ouverture

`opens` s'écrit sous l'une de quatre formes :

- `{ "acquired": { "skill": "<capacité>", "atLeast": 6 } }` : au moins 6 cartes acquises dans cette capacité. Ne comptent que les cartes acquises que la liste d'un exercice nomme. Une capacité sans mémoire n'a pas de cartes : rien n'y est jamais acquis.
- `{ "level": { "exercise": "<exercice>", "scope": "<portée>", "atLeast": 2 } }` : le niveau d'exercice atteint, au moins le niveau 2. Le niveau 1 compte 1 ; un niveau d'aide ne compte jamais. `scope` est facultative : sans elle, c'est le niveau de l'exercice sans portée ; avec elle, celui de cette portée (`"blues-f"` pour une grille). Un exercice qui n'écrit pas de `levels` n'a pas de niveau : la forme n'est jamais vraie.
- `{ "all": [ … ] }` : toutes les formes de la liste sont vraies.
- `{ "any": [ … ] }` : au moins une l'est.

`atLeast` est un entier d'au moins 1. Les formes s'emboîtent :

```json
"opens": {
	"any": [
		{ "acquired": { "skill": "chord-anchor", "atLeast": 6 } },
		{ "level": { "exercise": "grid-reading", "scope": "blues-f", "atLeast": 2 } }
	]
}
```

Une ouverture a au plus 16 termes (chaque forme compte, `all` et `any` comprises) et 4 étages (la forme du dessus est le premier). Chaque limite se vérifie avant de lire plus loin.

**Quand une routine se montre.** L'accueil montre une routine quand tous ses exercices sont définis, que son ouverture est vraie, et qu'un de ses exercices a quelque chose à jouer :

- une routine de mémoire : un élément est prêt à être introduit, ou le joueur a déjà une carte d'un de ses exercices ;
- une routine de passages : un de ses exercices a un index ouvert (voir `passages.opens`). `changes` n'écrit donc pas d'ouverture : elle se montre dès qu'un index l'est.

Une routine de mémoire reste montrée dès que le joueur a une carte d'un de ses exercices, quelle que soit son ouverture : une entrée déjà jouée ne disparaît pas. L'adresse `/session?routine=<id>` ne lit pas l'ouverture : elle lance la routine, même fermée.

### Sur l'accueil

- Les blocs sont dans l'ordre où les routines sont lues : celles du catalogue, dans l'ordre de `catalog/routines.json`, puis celles des fichiers importés, fichier par fichier dans l'ordre de leurs noms, chacune dans l'ordre de sa liste.
- Un bloc porte le titre de la routine. Une routine de mémoire dit ses révisions : « N révisions dues », sinon « Prochaines révisions · … », sinon rien quand aucune carte n'est apprise. Une routine de passages n'a pas cette ligne.
- « On y revient plus tard » s'ajoute quand un de ses exercices se repose (voir plus bas).
- Un bloc lance `/session?routine=<id>`. La touche Espace et « Commencer » lancent la première routine montrée.
- L'accueil ne montre que les routines ouvertes, et rien d'autre : ni la liste des exercices, ni l'écart au temps, ni sa tendance. Quand aucune routine n'est ouverte, il dit « Rien à jouer pour l'instant », avec un lien vers la Bibliothèque, sans « Commencer ».
- Une routine dont l'ouverture ne peut pas se calculer (un fichier abîmé d'une façon que le chargement n'a pas vue) est tenue pour fermée : elle n'apparaît pas, et seule une ligne de la console le dit (`[home] <id>: cannot tell whether it opens`). Les autres routines restent, et ses exercices restent dans la Bibliothèque.

### « On change d'air » dans une séance de plusieurs exercices

Un exercice qui écrit `flow.antiBlocking` peut bloquer : quand il échoue encore à son niveau d'aide le plus bas, c'est « On change d'air » (pour les changements, trois ratés de suite au niveau d'aide). Dans une séance de passages, l'exercice bloqué sort de la séance, sur sa portée (la valeur de `passages.scope` où il a bloqué : pour un exercice de grille, la grille), et se repose une heure. La séance continue avec les autres :

- la ligne d'état dit « On change d'air : <exercice> » (et la grille), jusqu'au premier tour de l'exercice suivant ;
- l'exercice sorti ne revient pas dans cette séance ; une autre grille du même exercice, si ;
- la séance s'arrête quand il ne reste plus rien à jouer ; le bilan nomme chaque exercice sorti, dans l'ordre, tant que la séance est gardée en mémoire. Quand tous sont sortis, il dit « On change d'air » une seule fois, avec ce qui casse et « Essaie plutôt ».

La fatigue peut finir la séance avant : un joueur qui commence bien puis rate (vingt points de moins entre ses six premières réponses et ses six dernières, sur douze réponses) voit sa séance finir sur la fatigue, et aucun exercice ne sort.

Le repos ne change pas ce que la séance suivante pioche. Seule la séance de passages sait laisser un exercice de côté. Ailleurs, « On change d'air » finit la séance, comme avant : un exercice de rythme joué seul, ou un exercice de mémoire qui écrirait `flow.antiBlocking` (aucun du catalogue ne l'écrit).

### Le jeu libre, et un exercice joué seul

- **Le jeu libre d'une routine** : `/session?routine=<id>&free=1`, pour une routine de mémoire seulement. Vingt consignes tirées au hasard parmi les éléments que ses exercices listent, qu'ils aient une carte ou non, chacune au niveau que l'élément tient. L'en-tête dit « Jeu libre ». Une tentative sur une carte apprise et laissée assez longtemps compte à froid. Aucun lien ne mène plus à ce jeu libre : l'adresse marche toujours, et la Bibliothèque joue chaque exercice de mémoire seul, en jeu libre. Une routine de passages en jeu libre ne se lance pas : `Routine <id> is not played freely: its exercises have no memory`.
- **Un exercice joué seul** : `/session?exercise=<id>`, pour tout exercice qu'un fichier définit ; c'est l'adresse où mène la Bibliothèque. Il n'ouvre que ses propres capteurs. L'en-tête porte son `title`, sinon le nom de sa capacité.
  - Un exercice de mémoire se joue en jeu libre, sur les seuls éléments de sa liste ; l'en-tête dit « Jeu libre · <titre> », et son bilan est celui du jeu libre.
  - Un exercice de passages joue ses passages, sur ses index ouverts.
  - Un autre exercice se joue comme une séance d'exercice : il faut un tour à figure, des `levels`, une capacité sans mémoire et des éléments ou des figures à servir. Sinon : `Exercise <id> is not played in an exercise session`.
- Une adresse qui ne nomme ni une routine ni un exercice définis dit « Séance introuvable », avec un lien « Retour à l'accueil ». L'ancien paramètre `kind` n'est plus lu : `?kind=learn` est introuvable, mais `?kind=exercise&exercise=<id>` joue l'exercice. Une adresse qui nomme une routine et un exercice ne lit que la routine.

### Ce qui est lu, et dans quel ordre

Dans une source (le catalogue, puis les fichiers importés), les routines sont lues après les exercices de **tous** les fichiers. Une routine peut donc nommer un exercice de n'importe quel fichier de sa source. Une routine d'un fichier importé peut nommer un exercice du catalogue ; une routine du catalogue, jamais un exercice d'un fichier importé. Une routine qui nomme un exercice refusé est refusée.

### Refusé

Le refus nomme la routine et le champ ; les raisons sont dites comme le code les donne.

À la lecture :

- `a routine must be a JSON object` ; `unknown key "<clé>"` ; un `id` mal écrit (comme pour les autres objets).
- `title must be { fr, en }, each a text not empty` (de même pour `howTo`).
- `exercises must be a list of exercise ids` ; `exercises is empty` ; `exercises has <n> entries, more than 32` (mesuré avant de lire les entrées) ; `exercises[<i>] must be a string` ; `exercises[<i>] lists "<id>" a second time`.
- `opens must be one of { acquired }, { level }, { all }, { any }` (le chemin nommé : `opens.any[1] must be …`) ; `opens.acquired must be { skill, atLeast }` ; `opens.acquired: unknown key "<clé>"` ; `opens.acquired.atLeast must be a positive integer` ; `opens.acquired.skill must be a string` ; `opens.level.exercise must be a string` ; `opens.level.scope must be a string` ; `opens.all must be a list` ; `opens.all is empty` (de même pour `any`) ; `opens has more than 16 terms` ; `opens is deeper than 4 levels`.

Une fois les exercices lus :

- `exercises[<i>]: no file defines the exercise "<id>"`.
- `exercises[<i>] practises a skill without memory, exercises[0] one with memory: a routine does not mix them` (ou l'inverse).
- `exercises[<i>] practises the skill "<id>", as exercises[<j>] does` : deux exercices d'une routine ne travaillent jamais la même capacité.
- `exercises[<i>]: "<id>" practises a skill without memory and writes no passages`.
- `opens.acquired.skill: no file defines the skill "<id>"` ; `opens.level.exercise: no file defines the exercise "<id>"`, avec le chemin de la forme (`opens.any[1].acquired.skill: …`).
- `this id is already defined in <fichier>` : une routine de même `id` a déjà été lue.

Le moteur refuse ce qu'il ne sait pas jouer : une routine qui ne mène à rien d'intéressant n'est pas refusée pour autant.

## Jouer un fichier importé

Une fois le fichier importé et accepté, rien d'autre n'est à faire :

- **Ses routines** se montrent sur l'accueil, après celles du catalogue, dès qu'elles sont ouvertes (voir « Sur l'accueil »). Elles se lancent comme celles du catalogue.
- **Ses exercices** se jouent seuls depuis la Bibliothèque (le lien « Bibliothèque » de la navigation, `/library`). Ils se jouent aussi dans la séance d'une routine qui les nomme, du même fichier ou d'un autre fichier importé.

### La Bibliothèque

La Bibliothèque liste tous les exercices chargés, du catalogue et des fichiers importés, avec ou sans routine. Elle ne trie pas, ne filtre pas et ne recommande rien. Son ordre est celui des routines dans l'ordre où elles sont lues, les fermées comprises (l'accueil, lui, ne montre que les ouvertes), chaque routine avec ses exercices dans l'ordre où elle les écrit, chaque exercice une fois ; puis les exercices qu'aucune routine ne liste, dans l'ordre où ils sont lus.

Pour chaque exercice, une ligne dit :

- son titre (`title`, sinon le nom de sa capacité) ;
- sous le titre, les titres des routines qui le listent ; « On y revient plus tard » quand il se repose après « On change d'air » ; « Rien à jouer pour l'instant » quand il n'a rien à jouer maintenant ;
- quand il a quelque chose à jouer, son titre est un lien vers `/session?exercise=<id>`, avec la durée de la séance.

« Rien à jouer pour l'instant » veut dire, selon la sorte d'exercice :

- **Un exercice de mémoire** a toujours quelque chose à jouer : sa liste `items` est obligatoire. Il se joue en jeu libre, sur les éléments de sa liste.
- **Un exercice de passages** n'a rien à jouer tant qu'aucun de ses index n'est ouvert (voir `passages.opens`). Dès qu'un index s'ouvre, le lien vient. Un index ouvert dont aucun passage ne se joue lance une séance qui finit aussitôt sur le bilan.
- **Un autre exercice** se joue comme une séance d'exercice : il lui faut un tour à figure, des `levels`, une capacité sans mémoire, et des éléments ou des figures à servir. Sans cela, il n'a jamais rien à jouer seul.
- **Un exercice dont on ne peut pas dire s'il se joue** (le calcul de son ouverture échoue, d'une façon que le chargement n'a pas vue) est listé sans lien, avec « Rien à jouer pour l'instant », et une ligne de la console le dit (`[library] <id>: cannot tell whether it plays`). Les autres exercices restent listés.

Quand une partie du catalogue n'a pas pu être chargée, l'accueil le dit en une ligne, dans toute construction : « Une partie du catalogue n'a pas pu être chargée. » L'accueil et la Bibliothèque listent ce qui reste.

## Comment un fichier est vérifié

Les fichiers du catalogue d'abord, puis les fichiers importés ; dans chaque source, les fichiers dans l'ordre de leur nom :

1. Le texte se lit en JSON (une virgule oubliée refuse le fichier, avec la position de l'erreur), puis l'enveloppe (voir « Le fichier »).
2. Chaque capacité se lit (`skillFromJson`), chaque grille (`gridFromJson`), chaque exercice (`exerciseFromJson` : un objet, des clés connues, des figures et des formes en LilyPond qui se lisent, l'accompagnement écrit) et chaque routine (`routineFromJson` : sa forme, ses limites).
3. Les capacités de tous les fichiers de la source, puis leurs grilles, rejoignent le registre ; ensuite seulement, les exercices de chaque fichier sont vérifiés dans l'ordre des étapes qui suivent, et seul le premier problème est dit. D'abord, la capacité que l'exercice nomme dans `practices` est définie par un fichier lu jusque-là, et l'application sait montrer son ensemble.
4. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, formes, tour, passages…), et chaque entrée de `items` : sa longueur, si elle en donne une, est un nombre positif, sa clé se lit par l'ensemble de sa capacité (des cases où le voicing ne tombe pas la refusent), et le tour se compile sur lui à chaque niveau (une note de `pattern` au-delà du voicing ou de la forme, une forme sortie du manche refusent l'exercice en nommant `items[i]` et le niveau). Un exercice sans `items` ni `passages`, dont le tour lit sa figure sur l'élément, a chacune des figures qu'il sert compilée à chaque niveau (`figures ("<id>") does not compile at exercise level <l>: …`, ou `no figure fits the round at exercise level <l>` quand aucune figure ne remplit le tour à ce niveau).
5. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…). La consigne est d'abord lue dans sa forme, avant ses champs (voir « Une consigne mal écrite »).
6. L'ouverture des passages (`passages.opens`) nomme une capacité définie, qui a des cartes, et une correspondance qui existe. Les grilles que nomment les passages sont vérifiées avec eux, à l'étape 4.
7. L'identifiant n'est pas déjà pris, par le catalogue ou par un fichier lu avant : le refus nomme le fichier qui le tient. Pour une capacité ou une grille, ce contrôle se fait quand elle rejoint le registre (étape 3), avant que les exercices du fichier soient vérifiés.
8. Une fois les exercices de tous les fichiers de la source vérifiés, les routines de chaque fichier : ses exercices existent, ne mêlent pas mémoire et sans mémoire, ne travaillent pas deux fois une capacité, écrivent `passages` quand ils sont sans mémoire, et son ouverture nomme des capacités et des exercices définis (`routineProblem`). Puis son identifiant, comme à l'étape 7.

Le moteur refuse ce qu'il ne peut pas jouer, jamais ce qui manque d'intérêt pédagogique.

### Une consigne mal écrite

Chaque emplacement de texte de `presentation` (`primary`, `secondary`, `detail`, `target`, `band`, `preview`) s'écrit comme un texte, ou comme `{ "fr": "…", "en": "…" }` avec les deux langues. Un emplacement écrit dans une seule langue, un nombre ou un objet sans texte est refusé en mots, avec l'emplacement nommé :

- `presentation must be an object` ;
- `presentation.<emplacement> must be a text or { fr, en }` ;
- `presentation.aided must be { line?, picture? }` : `aided` écrit comme un texte est refusé, parce qu'il ne dit pas s'il est une ligne ou un dessin. On écrit `{ "picture": "admitted" }` ou `{ "line": "…" }` ;
- `presentation.aided.line must be a text or { fr, en }` ; `presentation.aided.picture must name a picture` ;
- `presentation.fading must be { picture }, naming a picture` : `fading` écrit comme un texte, ou sans nom de dessin.

## Ce que vérifier un fichier peut coûter

Vérifier un fichier compile des tours : ceux de chaque élément à chaque niveau, ceux du premier passage de chaque index, ceux des figures qu'un exercice sert. Pour borner ce travail, chaque fichier a un **budget de vérification** de 300 000 unités (`MAX_FILE_CHECK_COST`).

- **Ce qui compte.** Un tour pèse 1, plus une unité par attente, plus une par filtre de ses choix, plus les paramètres qu'il recopie (16 entrées font une unité). Une figure compte aussi ses notes, une fois répétée sur la longueur du tour. Les niveaux comptent tout ce que leur lecture peut recopier : chaque valeur qu'un niveau écrit, à sa taille entière, et, sous chaque clé où entre un de ses chemins, tout ce que les paramètres de l'exercice et le niveau du dessous y tiennent. Ce compte peut être plus haut que le travail fait : c'est voulu, il ne doit jamais être plus bas.
- **Quand.** Le compte est vérifié avant chaque travail qu'il paie. L'écran vérifie un exercice une seconde fois (l'aperçu) : cette seconde fois compte aussi.
- **Le refus.** Le premier exercice qui ferait passer le budget, et tous ceux qui le suivent dans le même fichier, sont refusés avec la même phrase : `this file asks more checking than a start can afford (cost <n>, at most 300000)`. Les capacités, les grilles et les exercices déjà acceptés du fichier restent.
- **Un budget par fichier.** Le catalogue et chaque fichier importé ont chacun le leur. Le nombre de fichiers importés n'est pas borné : un démarrage coûte la somme. Un fichier du catalogue coûte aujourd'hui moins de 1 % du budget.
- **Ce qui n'est pas promis.** Le but : aucun fichier accepté ne se charge en plus de deux secondes environ. Trois revues ont chacune trouvé un fichier accepté plus lent, écrit pour l'être, et chaque fois la règle a été resserrée ; le but tient sur tous les fichiers essayés depuis, mais il n'est pas prouvé. Un fichier lent ne ralentit que le démarrage de celui qui l'importe, et un chargement qui ne s'est pas terminé est sauté une fois au démarrage suivant (voir « Où et quand »).
- Les limites d'un exercice (100 niveaux, 2 000 éléments, 20 000 tours à vérifier…) restent. Un exercice qui écrit à la fois 100 niveaux, une échelle de 100 niveaux et une soixantaine de paramètres ou plus à chaque niveau est toujours refusé par le budget.

**La longueur d'un tour.** Un tour dure au plus 1 024 mesures (`MAX_ROUND_BARS`), vérifié dès que sa longueur est connue, au chargement comme en jeu : `round.length spans <n> bars, more than the 1024 a round may span`. Rien ne bornait la longueur d'un tour ; une séance dure cinq minutes, et 1 024 mesures durent 51 minutes à ♩ = 80. Une mesure muette écrite au-delà des mesures du tour est refusée : `round.mutedBars writes bar <b>, past the round's <n> bars`. Au chargement, ces refus sont précédés de ce qui a été compilé : l'élément et le niveau (`items[<i>] (<clé>) does not compile at exercise level <l>: …`), la figure et le niveau (`figures ("<id>") …`), ou le membre d'un passage (`passages.members[<rang>] …`).

**Les notes d'un tour à figure.** Une fois sa figure répétée sur la longueur du tour, un tour tient au plus 1 024 notes (`MAX_FIGURE_ROUND_NOTES`), toutes ses figures comptées ; une figure qui couvrirait plus de 1 024 mesures est refusée de même. La raison : le juge aligne les attaques jouées sur les notes attendues, et ce travail grandit bien plus vite que le nombre de notes (environ une demi-seconde pour 1 000 notes, 3,7 secondes pour 2 000, 26 secondes pour 4 000). Un thème entier de plusieurs centaines de notes tient encore en un tour. Le compte se fait avant que la figure soit répétée, au chargement comme en jeu, et il arrondit à la boucle entière : un tour dont la dernière boucle est coupée peut être refusé à quelques notes de 1 024. Le refus : `round.expectations[<i>].figure would give <notes> notes over <bars> bars, more than the 1024 notes a figure round may hold`, ou, pour une figure suivante du même tour, `… more than the <reste> notes its round may still hold (at most 1024)`. Au chargement, quand c'est le reste du budget qui est plus petit, le refus est la phrase du budget.

**Ce que le chargement ne compile pas.** Deux cas ne sont pas vérifiés au chargement :

- un niveau d'échelle au-dessus du premier qui change la longueur d'un tour à figure (le chargement compile les éléments au premier niveau de l'échelle) ;
- le tour d'un passage à un autre niveau que le niveau 1, ou avec d'autres valeurs de ses paramètres de passage que les premières.

Aucun exercice du catalogue ne fait l'un ou l'autre. Un tel tour, s'il ne se compile pas, échoue en jeu sur une erreur que la séance ne rattrape pas. Les deux limites, 1 024 mesures et 1 024 notes, le font échouer vite.

## Comment un refus se montre

Un refus n'arrête jamais l'application. Il porte sur un fichier entier (illisible, enveloppe fausse) ou sur un seul objet : le reste du fichier est gardé.

- Dans les réglages, la section « Fichiers importés » liste chaque fichier avec ce qu'il a donné (capacités, grilles, exercices, routines) et ses refus : `<fichier> : <raison>` pour un fichier, ``<fichier>, capacité `<id>` : <raison>``, ``<fichier>, exercice `<id>` : <raison>``, ``<fichier>, grille `<id>` : <raison>`` ou ``<fichier>, routine `<id>` : <raison>`` pour un objet (en anglais, `file`, `skill`, `exercise`, `grid`, `routine`).
- Sur l'accueil, dans toute construction, une ligne dit qu'un fichier importé a un problème et mène aux réglages. La liste des refus du catalogue n'est montrée qu'en développement.
- La console reprend chaque refus sous la forme `[imported] <fichier> refused: <raison>` ou `[imported] <fichier>, exercise <id> refused: <raison>` (`skill`, `grid`, `routine` pour une capacité, une grille, une routine), `[catalog]` pour un fichier du catalogue.

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
