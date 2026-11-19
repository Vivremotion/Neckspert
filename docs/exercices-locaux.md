# Exercices locaux

Les exercices privés s'écrivent dans des fichiers de définitions JSON, dans le dossier `exercises.local/`, à la racine du dépôt. Le dossier est dans `.gitignore` : rien de ce qu'il contient n'est versionné ni publié. Les fichiers du catalogue, dans `catalog/`, ont le même format. Cette page décrit le format avec de la matière commune (des triades arpégées) ; vos propres exercices restent chez vous.

## Où et quand

- Un fichier de définitions `exercises.local/<nom>.json` peut tenir plusieurs exercices et plusieurs grilles (voir « Le fichier »).
- Les exercices locaux n'existent **qu'en développement** (`npm run dev`). Les fichiers sont lus comme du texte au build de développement (`import.meta.glob('/exercises.local/*.json', { query: '?raw' })` dans `createApp`, derrière `import.meta.env.DEV`) : enregistrez le fichier et la page se recharge. Un build de production (`npm run build`) ne les lit pas et n'en emporte rien : un exercice privé ne part jamais avec l'application publiée.
- Au démarrage, `loadDefinitions` (`src/lib/composition/definitions.ts`) lit les fichiers de `catalog/`, puis les fichiers locaux, et remplit les registres d'exercices et de grilles : un exercice ou une grille valide se joue comme ceux du catalogue. Un exercice qui écrit une `round` avec une figure et des `levels` apparaît sur l'accueil, bloc « Exercices », et se joue par `/session?kind=exercise&exercise=<id>`.

## Le fichier

Un fichier de définitions est un objet JSON :

```
{ "format": 0, "skills": [], "grids": [], "exercises": [] }
```

- `format` vaut 0 : le format n'est pas encore stable et changera sans conversion.
- `skills`, `grids` et `exercises` sont des listes, facultatives ; un fichier peut en tenir plusieurs. `routines` est réservé : vide ou absent.
- Une capacité s'écrit `{ "id": "…", "name": { "fr": "…", "en": "…" }, "items": "<ensemble>", "memory": false }` ; une capacité de mémoire (`"memory": true`) écrit aussi `"directRecall": { "withinMs": 1500 }`. Les ensembles : `note-on-string`, `placed-note`, `voicing-on-strings`, `placed-voicing`, `placed-shape`, `change`, `figure`.
- Une clé inconnue au premier niveau, un texte qui n'est pas du JSON ou un fichier de plus d'un million de caractères refusent tout le fichier.
- Dans un fichier, deux objets de même `id` dans une liste : le second est refusé. Un exercice et une grille peuvent partager un `id`.

## Une grille

Une grille s'écrit `{ "id": "…", "title": "…", "beatsPerBar": 4, "bars": 12, "chords": [ … ] }`, chaque accord `{ "bar": 1, "beat": 1, "symbol": "F7" }`, avec de vrais symboles d'accords (`parseChordSymbol`). La première commence mesure 1, temps 1, et les accords vont dans l'ordre, dans la grille. Un exercice de geste nomme ses grilles par leur `id` dans `params.grids` : la grille doit être définie dans un fichier, le sien ou un autre lu avant (le catalogue est lu avant les fichiers locaux).

## Un exercice

C'est une `ExerciseDefinition` (`src/lib/domain/exercise/types.ts`) écrite en JSON, avec cinq écarts :

- `figures` : chaque figure s'écrit `{ "id": "…", "lilypond": "c4 c c c", "meter": { … } }`. Le LilyPond est le sous-ensemble strict de `parseLilyPond` (pas de `#` ni de `$`). `meter` est facultatif (4/4 par défaut) et s'écrit `{ "count": 3, "unit": "1/4", "grouping": [1, 1, 1] }`.
- `shapes` : chaque forme s'écrit `{ "id": "…", "symbol": "maj7", "lilypond": "c\\5 e\\4 g\\4 b\\3" }` (voir « Une forme déplacée d'accord en accord »).
- `items` : chaque entrée est une clé d'élément (`"…"`), ou une clé avec la longueur de son tour en temps (`{ "item": "…", "beats": 4 }`). La clé ne dit que l'élément ; la longueur appartient à l'entrée.
- `meter` au premier niveau s'écrit de la même façon (l'unité est une fraction écrite en texte).
- L'accompagnement (`round.accompaniment`, ou le paramètre qu'il nomme par `{ "param": "…" }`, dans `params` et dans les `params` de chaque niveau) s'écrit `{ "clicks": { "beats": [1, 2, 3, 4], "accent": [1] }, "bars": ["on", "on", "on", "off"] }` : les temps où le clic sonne, ceux qu'il accentue (facultatif), puis une mesure par entrée, `"off"` pour une mesure muette.
- Une clé inconnue au premier niveau refuse l'exercice, en la nommant.

Tout le reste doit déjà être du JSON simple : nombres, textes, listes, objets. Les clés connues sont `id`, `practices`, `params` (obligatoires), puis `tempo`, `chordDiagram`, `meter`, `flow`, `round`, `presentation`, `view`, `howTo`, `title`, `levels`, `figures`, `shapes`, `pick`, `items`.

`practices` nomme la capacité que l'exercice travaille : elle doit être définie dans un fichier, le sien ou un autre lu avant.

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

## Une forme déplacée d'accord en accord

`voicing-figure` joue les notes d'un accord, une par corde. Une **forme** est une suite de notes écrite une fois, chacune sur sa corde, avec autant de notes par corde qu'il en faut, et déplacée d'un accord à l'autre : c'est la mécanique `form-figure`.

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

Les fichiers du catalogue d'abord, puis les fichiers locaux, chacun dans l'ordre du nom :

1. Le texte se lit en JSON (une virgule oubliée refuse le fichier, avec la position de l'erreur), puis l'enveloppe (voir « Le fichier »).
2. Chaque grille se lit (`gridFromJson`) et chaque exercice (`exerciseFromJson` : un objet, des clés connues, des figures et des formes en LilyPond qui se lisent, l'accompagnement écrit).
3. Les grilles du fichier rejoignent le registre, puis ses exercices sont vérifiés dans l'ordre des étapes qui suivent, et seul le premier problème est dit. D'abord, la mécanique existe.
4. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, formes, tour…), et chaque entrée de `items` : sa longueur, si elle en donne une, est un nombre positif, sa clé se lit par la mécanique (des cases où le voicing ne tombe pas la refusent), et le tour se compile sur lui à chaque niveau (une note de `pattern` au-delà du voicing ou de la forme, une forme sortie du manche refusent l'exercice en nommant `items[i]` et le niveau).
5. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…).
6. Les grilles qu'un exercice de geste nomme sont définies par un fichier lu jusque-là.
7. L'identifiant n'est pas déjà pris, par le catalogue ou par un fichier lu avant : le refus nomme le fichier qui le tient.

Le moteur refuse ce qu'il ne peut pas jouer, jamais ce qui manque d'intérêt pédagogique.

## Comment un refus se montre

Un refus n'arrête jamais l'application. Il porte sur un fichier entier (illisible, enveloppe fausse) ou sur un seul objet : le reste du fichier est gardé.

En développement, l'accueil liste les refus (en français et en anglais) : `<fichier> : <raison>` pour un fichier, ``<fichier>, exercice `<id>` : <raison>`` ou ``<fichier>, grille `<id>` : <raison>`` pour un objet. La console les reprend sous la forme `[exercises.local] <fichier> refused: <raison>` ou `[exercises.local] <fichier>, exercise <id> refused: <raison>` (`[catalog]` pour un fichier du catalogue).

La raison nomme le champ, par exemple `tempo must be a positive number, got -3`.

## Écrire une figure à partir d'un export Guitar Pro

Un export MusicXML de Guitar Pro 8 se convertit en LilyPond (le sous-ensemble de `parseLilyPond`), et les accords d'une partie d'accompagnement se listent mesure par mesure. Le script ne lit que le fichier que vous lui donnez ; ce qu'il en tire reste chez vous, dans `exercises.local/`.

```
npm run musicxml -- <fichier.musicxml> --part P1      # la mélodie de la partie P1, en LilyPond
npm run musicxml -- <fichier.musicxml> --shapes P2    # les voicings de la partie P2
```

- **Mélodie** : une partie à une voix. La hauteur est celle de la corde à vide (accordage standard) plus la case : l'export écrit la guitare une octave plus haut, la tablature dit ce qui sonne. Chaque note garde sa corde (`c'4\2`). Les liaisons (`~`) et les triolets (`\tuplet 3/2 { … }`) sont repris ; une mesure par ligne, `|` à la fin. Une levée est complétée par des silences devant ses notes, pour que les mesures tombent juste. Les altérations sont écrites en dièses, ou en bémols si l'armure est en bémols. La corde et la case sont lues aussi dans les instructions `<?GP …?>` de Guitar Pro. Un `<forward>` est lu comme un silence.
- **Voicings** : une ligne par accord, `mesure beat`, puis les cases des cordes de la plus grave à la plus aiguë (`x` : corde non jouée), puis les clés `corde:case` (`5:3 4:2 3:0`) à recopier dans une clé de voicing. La mesure est celle de l'export (la levée est la mesure 0) ; `beat` compte en temps à partir de 1.
- **Avertissements** (sur la sortie d'erreur, rien n'est refusé) : un accord dans une partie mélodique (seule la première note est gardée), une deuxième voix (aussi dans une partie d'accords : seule la première voix est positionnée), une appogiature, un triolet que sa marque de fin ne ferme pas, une technique non convertie (marteau, tiré, tiré de corde, harmonique, glissé, ornement…), un accordage qui n'est pas le standard. Le doublon de la portée de tablature (voix 5) est ignoré sans bruit.
- Le script n'a pas de dépendance : il lit le XML avec un petit lecteur de balises. Il ne comprend pas une deuxième portée de notation, ni un changement de mesure en cours de morceau.
