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

Trois limites s'ajoutent à celles de la section « Le fichier », pour qu'un choix ne coûte pas des secondes à vérifier à chaque niveau : au plus 16 filtres dans `where` (`has <n> filters, more than 16`), 8 attributs dans `order` (`names <n> attributes, more than 8`), et 64 attentes dans un tour (`round.expectations has <n> entries, more than 64`). Ces limites bornent un tour, pas un fichier : un exercice qui écrit le plus d'éléments, de niveaux et d'attentes permis peut encore prendre une dizaine de secondes à charger.

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

- **`each`** : les **paramètres de passage**. Chaque nom a une liste de valeurs (de 1 à 64). Au premier passage d'un index, chaque paramètre prend la première valeur de sa liste. Aux passages suivants, il prend la valeur qui vient après celle du dernier passage de cet index. À la fin de la liste, il revient à la première. Le tour lit un paramètre de passage comme un autre : `{ "param": "direction" }`. La montée alterne ainsi `up` et `down` sur chaque index ; la zone écrit sa liste de zones :

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

La séance « Geste » joue les quatre exercices du catalogue, chacun à son tour, dans l'ordre du lien, de la montée, de la zone et de la lecture. Pour l'exercice dont c'est le tour, elle prend, parmi ses index ouverts, celui qui a été joué le moins récemment (à égalité, le premier écrit).

- Chaque passage commence par une mesure comptée, puis ses tours s'enchaînent sans silence.
- Un passage qui ne peut pas se jouer est sauté : il ne donne aucun membre, plus de 256, ou un de ses tours n'admet aucune forme (une zone où un accord n'a pas de forme). La séance essaie alors les valeurs suivantes des paramètres de passage de cet index ; un index sans aucun passage jouable est laissé de côté pour la séance, et un exercice sans index jouable aussi.
- Une tentative de changement garde son passage (`data.passage` : son identité, son index, son rang, les valeurs de ses paramètres). Le moins récemment joué et la valeur suivante se relisent là. Les tentatives d'avant les passages ne la portent pas : au premier lancement, chaque index repart « jamais joué », la montée repart vers le haut, la zone de la première.
- Une fois la durée de la séance passée, ou dès que la séance juge le joueur fatigué, aucun passage ne commence ; celui qui est en cours va jusqu'au bout.
- « On change d'air » (voir « Les niveaux et l'aide ») peut arrêter un passage en son milieu.

La séance « Geste » ne joue que ces quatre exercices. Un fichier importé peut écrire `passages` : il est chargé et vérifié, mais aucune séance de changements ne joue encore les passages d'un fichier importé. Ce sera le rôle des routines. Un tel exercice qui écrit aussi un tour à figure et des niveaux apparaît sous « Exercices », mais sa séance ne démarre pas : il n'écrit pas d'`items`, et sa figure ne peut pas se lire sur ses éléments (seul l'ensemble `figure` le permet, et ses membres ne sont pas des éléments de `figure`). Au démarrage, la séance d'exercice s'arrête sur l'erreur `<id>: writes no items, and its round reads no figure on its items`.

### Les niveaux et l'aide

Les niveaux de tempo s'écrivent comme pour tout exercice (`levels`) : les quatre exercices vont de ♩ = 80 à 120 de 5 en 5, chaque niveau passé après 10 changements justes de suite et quitté après 3 ratés de suite. Le niveau bouge à chaque changement jugé ; un nouveau tempo s'applique au passage suivant, après sa mesure comptée.

L'aide est un **niveau d'aide** écrit sous le niveau 1, avec l'anti-blocage :

```json
"levels": [
	{ "aid": true, "params": { "tempo": 80, "shapes": true } },
	{ "params": { "tempo": 80 }, "pass": { "successes": 10 }, "drop": { "failures": 3 } }
],
"flow": { "antiBlocking": true }
```

Dans le catalogue, les niveaux suivants (♩ = 85 à 120) s'écrivent de la même façon que le niveau 1, avec leur tempo.

- **`"shapes": true`** fait dessiner la forme à jouer. Sur la grille, au changement suivant : pour la montée, la forme admise la plus proche de celle qui sonne, dans le sens de la montée ; pour la zone, la plus grave admise. Sur le lien, les notes de la forme à jouer et de la suivante, sur le manche. À tout autre niveau, rien n'est dessiné.
- **Ce que le joueur vit** : après trois ratés de suite au niveau 1, le niveau d'aide arrive au passage suivant, annoncé. Trois changements justes de suite le ramènent au niveau 1 (le niveau d'aide n'écrit ni `pass` ni `drop` : le moteur en compte trois). Un changement joué au niveau d'aide compte comme joué au niveau, pas comme aidé : c'est ce qui permet d'en remonter. Trois ratés de suite au niveau d'aide amènent « On change d'air » : la séance entière s'arrête, au milieu du passage, les autres exercices compris, et cet exercice se repose une heure (il reste jouable depuis l'accueil).
- **La lecture** (`grid-reading`) n'écrit ni niveau d'aide ni anti-blocage : aucune aide n'y est dessinée aujourd'hui. Son aide viendra avec le modèle générique du plan 4c.

### Les vues

Un exercice de grille prend la vue `grid-scroll` ; le lien, la vue `link-lane`. La consigne de la grille se lit dans les paramètres de passage par leur nom : un paramètre `direction` dit le sens de la montée, un paramètre `zone` dit les cases ; sans l'un ni l'autre, la grille se joue sans consigne.

### Refusé

Le refus nomme l'exercice et le champ ; les raisons sont dites comme le code les donne.

- `passages must be an object` ; `passages has an unknown key "<clé>"` ; `an exercise writes passages or items, not both` ; `passages needs a skill without cards`.
- `passages.of must map names to lists of values` ; `passages.of names no list of values` ; `passages.of.<nom> must be a list, not empty` ; `passages.of name "<nom>" may not hold ";" or "="` ; `passages.of.<nom>[<i>] must be a text, a number or a list of them` ; `passages.of.<nom>[<i>] may not hold ";" or "="` ; `passages.of.<nom>[<i>] has the key of passages.of.<nom>[<j>]`.
- `passages.of gives no index of <famille>: <raison>` : un index que la famille ne sait pas lire, par exemple `unknown grid "x"`, ou une zone de cordes qui manque (`no zone of strings: neither the passage nor the params give "strings"`).
- `passages.members must be a selection { family, where?, order?, take?, andBack? }` ; `passages.members.andBack must be true or false` ; `passages.members names family "<famille>", which gives no members from a passage’s index` ; `passages.members names family "<famille>", whose members are no items of <ensemble>` ; un problème du choix lui-même, sous `passages.members.<champ>`.
- `passages.each must map names to lists of values` ; `passages.each.<nom> must be a list, not empty` ; `passages.each.<nom> is a name the round gives` ; `passages.each.<nom> is also written in params` ; `passages.each.<nom> is also a key of passages.of` ; `passages.each.<nom> is also written at a level` ; une valeur qui ne convient pas là où le tour la lit : `reads param "<nom>", which passages.each.<nom>[<i>] gives as <valeur>, <pourquoi>`.
- `passages.opens must be { acquired: { skill, item, need? } }` ; `passages.opens.acquired.need must be "every-group" or "one-group"` ; `passages.opens names skill "<id>", which no file read so far defines` ; `passages.opens names skill "<id>", which has no cards` ; `passages.opens needs a round whose content is a selection` ; `passages.opens reads the members of family "<famille>", which are items of no set` ; `passages.opens needs the round’s contents to give members of one set` ; `passages.opens.acquired.item "<nom>" is no correspondence from <ensemble> to <ensemble>`.
- `passages.again must be "until-passed"` ; `passages.restBars must be a whole number from 0 to 16` ; `passages.passes must be a number above 0 and at most 1` ; `passages.scope must name a key of passages.of` ; `passages.scope names "<nom>", which passages.of does not write`.

Les limites, chacune vérifiée avant le travail qu'elle borne : 500 index (`passages.of gives <n> indices, more than 500`, ou `passages.of gives more than 500 indices` quand le produit dépasse la limite avant la dernière liste), 64 valeurs par paramètre de passage (`passages.each.<nom> has <n> values, more than 64`), 256 membres par passage (`passages.members gives <n> members for index <clé>, more than 256`, comptés sans les filtres ni la prise qui lisent un paramètre de passage, pour borner tous les passages de l'index) et 256 accords par grille.

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

Les fichiers du catalogue d'abord, puis les fichiers importés ; dans chaque source, les fichiers dans l'ordre de leur nom :

1. Le texte se lit en JSON (une virgule oubliée refuse le fichier, avec la position de l'erreur), puis l'enveloppe (voir « Le fichier »).
2. Chaque capacité se lit (`skillFromJson`), chaque grille (`gridFromJson`) et chaque exercice (`exerciseFromJson` : un objet, des clés connues, des figures et des formes en LilyPond qui se lisent, l'accompagnement écrit).
3. Les capacités de tous les fichiers de la source, puis leurs grilles, rejoignent le registre ; ensuite seulement, les exercices de chaque fichier sont vérifiés dans l'ordre des étapes qui suivent, et seul le premier problème est dit. D'abord, la capacité que l'exercice nomme dans `practices` est définie par un fichier lu jusque-là, et l'application sait montrer son ensemble.
4. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, formes, tour, passages…), et chaque entrée de `items` : sa longueur, si elle en donne une, est un nombre positif, sa clé se lit par l'ensemble de sa capacité (des cases où le voicing ne tombe pas la refusent), et le tour se compile sur lui à chaque niveau (une note de `pattern` au-delà du voicing ou de la forme, une forme sortie du manche refusent l'exercice en nommant `items[i]` et le niveau).
5. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…).
6. L'ouverture des passages (`passages.opens`) nomme une capacité définie, qui a des cartes, et une correspondance qui existe. Les grilles que nomment les passages sont vérifiées avec eux, à l'étape 4.
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
