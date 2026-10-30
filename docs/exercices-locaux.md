# Exercices locaux

Un exercice privé est un fichier JSON dans le dossier `exercises.local/`, à la racine du dépôt. Le dossier est dans `.gitignore` : rien de ce qu'il contient n'est versionné ni publié. Cette page décrit le format avec de la matière commune (des triades arpégées) ; vos propres exercices restent chez vous.

## Où et quand

- Un fichier par exercice : `exercises.local/<nom>.json`.
- Les fichiers sont lus **au build** (`import.meta.glob('/exercises.local/*.json')` dans `createApp`) : en développement, enregistrez le fichier et la page se recharge ; en production, il faut reconstruire.
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

1. `exerciseFromJson` : un objet, des clés connues, des figures en LilyPond qui se lisent.
2. L'identifiant n'est pas déjà pris (par le catalogue ou par un fichier précédent) et la mécanique existe.
3. `validateExercise` : ce que le moteur ne sait pas jouer (tempo, niveaux, figures, tour…).
4. `presentationProblem`, `screenProblem`, `previewProblem` : ce que l'écran ne sait pas dessiner (champ inconnu, vue inconnue…).

Le moteur refuse ce qu'il ne peut pas jouer, jamais ce qui manque d'intérêt pédagogique.

## Comment un refus se montre

Un fichier refusé n'arrête jamais l'application.

- **En développement** : l'accueil liste les fichiers refusés avec la raison du validateur (en français et en anglais), et la console les reprend.
- **En production** : `console.error` seulement, sous la forme `[exercises.local] <fichier> refused: <raison>`.

La raison nomme l'exercice et le champ, par exemple `mon-exercice: tempo must be a positive number, got -3`.
