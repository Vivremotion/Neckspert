# Exercices locaux

Un exercice privé est un fichier JSON dans le dossier `exercises.local/`, à la racine du dépôt. Le dossier est dans `.gitignore` : rien de ce qu'il contient n'est versionné ni publié. Cette page décrit le format avec de la matière commune (des triades arpégées) ; vos propres exercices restent chez vous.

## Où et quand

- Un fichier par exercice : `exercises.local/<nom>.json`.
- Les exercices locaux n'existent **qu'en développement** (`npm run dev`). Les fichiers sont lus comme du texte au build de développement (`import.meta.glob('/exercises.local/*.json', { query: '?raw' })` dans `createApp`, derrière `import.meta.env.DEV`) : enregistrez le fichier et la page se recharge. Un build de production (`npm run build`) ne les lit pas et n'en emporte rien : un exercice privé ne part jamais avec l'application publiée.
- Les exercices valides rejoignent le catalogue (`registerExercises`) : ils se jouent comme ceux du code. Un exercice qui écrit une `round` avec une figure et des `levels` apparaît sur l'accueil, bloc « Exercices », et se joue par `/session?kind=exercise&exercise=<id>`.

## Le format

C'est une `ExerciseDefinition` (`src/lib/domain/exercise/types.ts`) écrite en JSON, avec trois écarts :

- `figures` : chaque figure s'écrit `{ "id": "…", "lilypond": "c4 c c c", "meter": { … } }`. Le LilyPond est le sous-ensemble strict de `parseLilyPond` (pas de `#` ni de `$`). `meter` est facultatif (4/4 par défaut) et s'écrit `{ "count": 3, "unit": "1/4", "grouping": [1, 1, 1] }`.
- `meter` au premier niveau s'écrit de la même façon (l'unité est une fraction écrite en texte).
- Une clé inconnue au premier niveau refuse le fichier, en la nommant.

Tout le reste doit déjà être du JSON simple : nombres, textes, listes, objets. Les clés connues sont `id`, `version`, `mechanic`, `params` (obligatoires), puis `tempo`, `chordDiagram`, `meter`, `flow`, `round`, `presentation`, `view`, `howTo`, `title`, `levels`, `figures`, `pick`, `items`.

**Un exercice de figure doit nommer sa vue** : `"view": "figure"`. Sans elle, un exercice qui écrit une présentation serait dessiné sur la piste (`lane`), qui ne dessine pas de figure.

## Exemple : arpèges de triades

Trois triades majeures sur les cordes 3-2-1, arpégées sur une figure de noires puis de croches, ♩ = 60. Le niveau d'aide écrit la tablature sous la figure.

```json
{
	"id": "arpeges-de-triades",
	"version": 1,
	"title": {
		"fr": "Arpèges de triades",
		"en": "Triad arpeggios"
	},
	"mechanic": "voicing-figure",
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
	"items": ["C|maj|3:1,2:3,1:5@0@4", "F|maj|3:1,2:3,1:5@0@4", "G|maj|3:1,2:3,1:5@0@4"],
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
```

Les `items` sont des clés de la mécanique (`voicing-figure` : `<forme>@<occurrence>@<temps>`, la forme s'écrivant `<racine>|<qualité>|<corde>:<degré>,…`, par exemple `C|maj|3:1,2:3,1:5`, puis l'occurrence de la forme sur le manche, puis la longueur du tour en temps). `"content": { "from": "voicing-notes" }` fait jouer à chaque note de la figure la note de la forme donnée par `pattern` (1 = la plus grave).

## Comment un fichier est vérifié

Pour chaque fichier, dans l'ordre du nom :

1. Le texte se lit en JSON (une virgule oubliée refuse le fichier, avec la position de l'erreur), puis `exerciseFromJson` : un objet, des clés connues, des figures en LilyPond qui se lisent.
2. L'identifiant n'est pas déjà pris (par le catalogue ou par un fichier précédent) et la mécanique existe.
3. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, tour…), et chaque élément de `items` : sa clé se lit par la mécanique, et le tour se compile sur lui à chaque niveau (une occurrence que le manche n'a pas, une note de `pattern` au-delà de la forme refusent le fichier en nommant `items[i]` et le niveau).
4. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…).

Le moteur refuse ce qu'il ne peut pas jouer, jamais ce qui manque d'intérêt pédagogique.

## Comment un refus se montre

Un fichier refusé n'arrête jamais l'application.

L'accueil liste les fichiers refusés avec la raison du validateur (en français et en anglais), et la console les reprend sous la forme `[exercises.local] <fichier> refused: <raison>`.

La raison nomme l'exercice et le champ, par exemple `mon-exercice: tempo must be a positive number, got -3`.

## Écrire une figure à partir d'un export Guitar Pro

Un export MusicXML de Guitar Pro 8 se convertit en LilyPond (le sous-ensemble de `parseLilyPond`), et les accords d'une partie d'accompagnement se listent mesure par mesure. Le script ne lit que le fichier que vous lui donnez ; ce qu'il en tire reste chez vous, dans `exercises.local/`.

```
npm run musicxml -- <fichier.musicxml> --part P1      # la mélodie de la partie P1, en LilyPond
npm run musicxml -- <fichier.musicxml> --shapes P2    # les formes de la partie P2
```

- **Mélodie** : une partie à une voix. La hauteur est celle de la corde à vide (accordage standard) plus la case : l'export écrit la guitare une octave plus haut, la tablature dit ce qui sonne. Chaque note garde sa corde (`c'4\2`). Les liaisons (`~`) et les triolets (`\tuplet 3/2 { … }`) sont repris ; une mesure par ligne, `|` à la fin. Une levée est complétée par des silences devant ses notes, pour que les mesures tombent juste. Les altérations sont écrites en dièses, ou en bémols si l'armure est en bémols. La corde et la case sont lues aussi dans les instructions `<?GP …?>` de Guitar Pro. Un `<forward>` est lu comme un silence.
- **Formes** : une ligne par accord, `mesure beat`, puis les cases des cordes de la plus grave à la plus aiguë (`x` : corde non jouée), puis les clés `corde:case` (`5:3 4:2 3:0`) à recopier dans une clé de forme. La mesure est celle de l'export (la levée est la mesure 0) ; `beat` compte en temps à partir de 1.
- **Avertissements** (sur la sortie d'erreur, rien n'est refusé) : un accord dans une partie mélodique (seule la première note est gardée), une deuxième voix (aussi dans une partie d'accords : seule la première voix est positionnée), une appogiature, un triolet que sa marque de fin ne ferme pas, une technique non convertie (marteau, tiré, tiré de corde, harmonique, glissé, ornement…), un accordage qui n'est pas le standard. Le doublon de la portée de tablature (voix 5) est ignoré sans bruit.
- Le script n'a pas de dépendance : il lit le XML avec un petit lecteur de balises. Il ne comprend pas une deuxième portée de notation, ni un changement de mesure en cours de morceau.
