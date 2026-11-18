# Chantier 2, plan 1 : le format et le catalogue en fichiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les exercices et les grilles du catalogue quittent le TypeScript pour des fichiers JSON du dépôt, lus et validés au démarrage par un seul lecteur, qui lit aussi les fichiers locaux de développement et dit pourquoi il refuse un objet.

**Architecture:**

- **Un fichier de définitions** est `{ "format": 0, "grids": [], "exercises": [] }`. Un lecteur pur (`domain/definitions/`) le transforme en objets et en refus ; il ne lève jamais.
- **Deux registres vivants** (`domain/exercise/registry.ts`, `domain/grid/registry.ts`) remplacent les constantes du catalogue. La composition les remplit au démarrage ; un fichier de mise en place les remplit pour les tests.
- **Le catalogue** est le dossier `catalog/` à la racine, embarqué dans toute construction par `import.meta.glob`. Un instantané pris avant le déplacement prouve que rien n'a changé.
- **Le code de production lit le registre à l'appel**, jamais à l'import d'un module.

**Tech Stack:** TypeScript, Svelte 5 (runes), SvelteKit (`ssr = false`), Vite (`import.meta.glob`), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (C1, C2, C7, C8, C11 ; § 2, 3, 10 ; « Découpage en plans », plan 1).

## Global Constraints

- **Branche et vérification :** branche `plan/c2-1-format-catalogue`, worktree `.worktrees/c2-1-format-catalogue`, partie de `main` après fusion de la spec. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme (`expect.requireAssertions`). Rien n'est poussé.
- **Aucun changement de comportement en jeu.** Les onze exercices et les deux grilles restent ceux d'aujourd'hui, à l'identique : l'instantané de la Task 1 ne se régénère jamais (`-u` interdit après la Task 1).
- **Rien de stocké ne change.** Pas de version Dexie, pas de version de sauvegarde, aucun identifiant renommé, `mechanic` et `version` restent dans les définitions : c'est le plan 2.
- **Rien de privé dans le dépôt.** `exercises.local/` reste hors git ; ni son contenu ni ses identifiants n'apparaissent dans un test, un message de commit ou ce plan.
- **Le format est instable** : `"format": 0`. Un fichier d'un autre format est refusé.
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.**
- **Vocabulaire** (spec § 1) : « élément » / `item`, « grille » / `grid`, « refus » / `refusal`, « registre » / `registry`, « fichier de définitions » / `definition file`. Le mot « catalogue » ne désigne plus que le dossier `catalog/`.
- **Code en anglais, textes d'interface en français et en anglais** (`defineMessages`), jamais sous 16 px.
- **Commits :** Conventional Commits en minuscules, impératif, orientés comportement ; terminés par la ligne `Co-Authored-By` de la session qui exécute.

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — L'import passe au plan 2.** Ranger un fichier importé demande une table nouvelle, donc la version 13 de la base. La spec veut une seule version de schéma pour tout le chantier, écrite au plan 2. Ce plan garde `exercises.local/` en développement, lu par le nouveau lecteur. L'écran « Fichiers importés » et la progression gardée sans définition suivent l'import au plan 2. La spec est amendée (« Découpage en plans »).
- **D2 — Les fichiers gardent `mechanic` et `version`.** `practices`, les capacités et les renommages d'identifiants arrivent ensemble au plan 2, avec le code qui les lit. Le format connaît déjà les listes `skills` et `routines`, mais refuse un fichier où elles ne sont pas vides : « pas encore lues ».
- **D3 — Un refus dit le fichier, la sorte d'objet, l'identifiant et la raison.** Le champ reste dans la raison du validateur (`params.pacing.roundsPerBreath must be…`). Le sortir à part demanderait de récrire les 1 100 lignes des validateurs.
- **D4 — Un accompagnement s'écrit `{ "clicks": { "beats": [1, 2, 3, 4], "accent": [1] }, "bars": ["on", "on", "on", "off"] }`.** Aujourd'hui un fichier ne peut pas en écrire : c'est un objet du code, avec ses fractions. Le lecteur le construit avec `clickAccompaniment`, sur le mètre de l'exercice.
- **D5 — Le registre est une liste vivante de module**, remplie une fois au démarrage, pas un service injecté partout. C'est ce que fait déjà `registerExercises`. Le code de production le lit à l'appel ; un test l'établit.
- **D6 — Les identifiants que le code nomme encore** vivent dans un seul fichier, `domain/exercise/catalogIds.ts`. Chacun en sortira avec le plan qui met son lecteur en données (plans 3 à 5).
- **D7 — Les quatre fichiers du catalogue sont écrits à la main** depuis le TypeScript. Il n'existe pas d'écriture d'une figure en LilyPond ; l'instantané attrape toute erreur de copie.
- **D8 — L'ordre des exercices entre fichiers est celui des noms de fichiers.** Rien ne lit cet ordre d'une famille à l'autre ; dans un fichier, l'ordre écrit est gardé (les exercices de rythme sur l'accueil).
- **D9 — Les fichiers privés de l'auteur sont réemballés** par l'exécutant (`{ "format": 0, "exercises": [ … ] }`, contenu inchangé), sur place, sans commit.

## Review Focus

1. **Un fichier du catalogue refusé en production** (mauvaise fusion) : l'application démarre, les autres fichiers se chargent, le refus est écrit dans la console (Task 9).
2. **Un fichier vide, `null`, une liste, ou `"format": "0"`** : refusé avec sa raison, jamais une erreur levée (Task 4).
3. **Un exercice qui nomme une grille qu'aucun fichier ne définit** : refusé au chargement en nommant la grille, au lieu de planter en jeu (Task 5).
4. **Le registre lu avant tout chargement** : l'erreur dit qu'aucune définition n'est chargée (Task 5), et aucun module de production ne le lit à l'import (Task 7).
5. **Un niveau qui écrit une valeur que son lecteur ne sait pas lire** : refusé au chargement, en nommant le niveau et le chemin (Task 10).

## File Structure

| Fichier                                                            | Rôle                                                                                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog/notes.json`, `chords.json`, `changes.json`, `rhythm.json` | les données : 11 exercices, 2 grilles                                                                                                                                         |
| `src/lib/domain/definitions/file.ts`                               | lire un fichier : objets et refus                                                                                                                                             |
| `src/lib/domain/definitions/register.ts`                           | lire des fichiers dans l'ordre et remplir les registres                                                                                                                       |
| `src/lib/domain/exercise/registry.ts`                              | le registre des exercices (remplace `catalog.ts`)                                                                                                                             |
| `src/lib/domain/grid/registry.ts`                                  | le registre des grilles (remplace `grid/catalog.ts`)                                                                                                                          |
| `src/lib/domain/grid/fromJson.ts`                                  | une grille écrite en JSON                                                                                                                                                     |
| `src/lib/domain/exercise/fromJson.ts`                              | modifié : l'accompagnement écrit                                                                                                                                              |
| `src/lib/domain/exercise/catalogIds.ts`                            | les identifiants que le code nomme encore                                                                                                                                     |
| `src/lib/application/definitions/checks.ts`                        | ce que l'application exige d'un exercice (les quatre validateurs, la mécanique connue, les grilles nommées)                                                                   |
| `src/lib/composition/catalogFiles.ts`                              | le `import.meta.glob` du catalogue                                                                                                                                            |
| `src/lib/composition/definitions.ts`                               | charger le catalogue puis les fichiers locaux (remplace `localExercises.ts`)                                                                                                  |
| `src/lib/testing/setup.ts`                                         | charge le catalogue avant chaque fichier de test                                                                                                                              |
| `src/lib/testing/catalog.ts`                                       | les constantes du catalogue pour les tests                                                                                                                                    |
| Supprimés                                                          | `domain/exercise/catalog.ts`, `domain/exercise/rhythmCatalog.ts`, `domain/grid/catalog.ts`, `composition/localExercises.ts`, les définitions de `domain/gesture/exercises.ts` |

---

## Partie A — Le filet et le lecteur

### Task 1: Figer le catalogue d'aujourd'hui

**Files:**

- Create: `src/lib/testing/catalogFrozen.spec.ts` (et son instantané)

**Interfaces:**

- Consumes: `EXERCISES` (`$lib/domain/exercise`), `GRIDS` (`$lib/domain/grid`).
- Produces: l'instantané que les Tasks 8 et 9 doivent laisser intact.

- [ ] **Step 1: Écrire le test de caractérisation**

```ts
const IDS = [
	'locate-neck',
	'identify-neck',
	'triads-anchor',
	'triads-zone',
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam',
	'rhythm-silent-bars',
	'rhythm-two-four',
	'rhythm-offbeats'
];
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

it('holds exactly the eleven exercises', () => {
	expect(EXERCISES.map((exercise) => exercise.id).sort()).toEqual([...IDS].sort());
});
it.each(IDS)('keeps %s as it is', (id) => {
	expect(plain(EXERCISES.find((exercise) => exercise.id === id))).toMatchSnapshot();
});
it.each(['iohefy-a', 'blues-f'])('keeps the grid %s as it is', (id) => {
	expect(plain(GRIDS.find((grid) => grid.id === id))).toMatchSnapshot();
});
```

`plain` passe par JSON : les fractions s'écrivent `"1/4"`, l'ordre des clés ne compte pas (l'instantané les trie).

- [ ] **Step 2: Lancer, vérifier que l'instantané est écrit**

Run: `npx vitest run src/lib/testing/catalogFrozen.spec.ts`
Expected: PASS, `13 written`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/testing/catalogFrozen.spec.ts src/lib/testing/__snapshots__
git commit -m "test: freeze the catalog before it moves to files"
```

### Task 2: Un accompagnement écrit dans un fichier

**Files:**

- Modify: `src/lib/domain/exercise/fromJson.ts`
- Test: `src/lib/domain/exercise/fromJson.spec.ts`

**Interfaces:**

- Consumes: `clickAccompaniment`, `METER_4_4` (`$lib/domain/time`).
- Produces: `exerciseFromJson` rend un `Accompaniment` partout où le fichier écrit `{ clicks: { beats, accent? }, bars }` : dans `round.accompaniment` quand il n'est pas `{ param }` ; sinon dans `params[P]` et dans `levels[i].params[P]`, `P` étant le paramètre que `round.accompaniment` nomme.

- [ ] **Step 1: Écrire les tests qui échouent**

Partir de `arpeggioJson()` du fichier de test, avec `round.accompaniment: { param: 'accompaniment' }`.

```ts
it('reads a click accompaniment written in a param and in a level', () => {
	const exercise = exerciseFromJson({
		...withAccompanimentParam(),
		params: {
			...BASE_PARAMS,
			accompaniment: {
				clicks: { beats: [1, 2, 3, 4], accent: [1] },
				bars: ['on', 'on', 'on', 'off']
			}
		},
		levels: [{ params: { accompaniment: { clicks: { beats: [2, 4] }, bars: ['on'] } } }]
	});
	expect(exercise.params.accompaniment).toEqual(
		clickAccompaniment({
			meter: METER_4_4,
			beats: [1, 2, 3, 4],
			accent: [1],
			bars: ['on', 'on', 'on', 'off']
		})
	);
	expect(exercise.levels?.[0].params?.accompaniment).toEqual(
		clickAccompaniment({ meter: METER_4_4, beats: [2, 4], accent: [], bars: ['on'] })
	);
});
it('reads an accompaniment written in the round, on the exercise meter', () => {
	/* meter 3/4, beats [1, 2, 3] */
});
it('refuses an accompaniment that is not written as clicks', () => {
	expect(() =>
		exerciseFromJson({
			...withAccompanimentParam(),
			params: { ...BASE_PARAMS, accompaniment: { bars: ['on'] } }
		})
	).toThrow('params.accompaniment must be { clicks: { beats, accent? }, bars }');
});
it('names the level of a beat outside the bar', () => {
	/* levels[0].params.accompaniment, beats [5] */
	expect(read).toThrow('levels[0].params.accompaniment: beat 5 is not in a bar of 4 beats');
});
it('leaves alone a param no accompaniment reads', () => {
	/* params.accompaniment stays as written when round.accompaniment is absent */
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/lib/domain/exercise/fromJson.spec.ts`
Expected: FAIL (l'accompagnement reste l'objet écrit).

- [ ] **Step 3: Implémenter dans `fromJson.ts`**

`accompanimentFromJson(value: unknown, meter: Meter, where: string): Accompaniment`, appelé après `meterFromJson`. Une clé inconnue de `clicks` ou de l'accompagnement est refusée en la nommant.

- [ ] **Step 4: Lancer, vérifier que tout passe**

Run: `npx vitest run src/lib/domain/exercise/fromJson.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: write a click accompaniment in an exercise file"
```

### Task 3: Une grille écrite en JSON

**Files:**

- Create: `src/lib/domain/grid/fromJson.ts`, `src/lib/domain/grid/fromJson.spec.ts`
- Modify: `src/lib/domain/grid/index.ts` (export)

**Interfaces:**

- Consumes: `gridChanges`, `parseChordSymbol` (`$lib/domain/grid`).
- Produces: `gridFromJson(json: unknown): ChordGrid`, qui lève une `Error` nommant le champ.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
const BLUES = {
	id: 'blues',
	title: 'Blues',
	beatsPerBar: 4,
	bars: 2,
	chords: [
		{ bar: 1, beat: 1, symbol: 'F7' },
		{ bar: 2, beat: 1, symbol: 'Bb7' }
	]
};

it('reads a grid', () => expect(gridFromJson(BLUES)).toEqual(BLUES));
it('refuses what is no object', () =>
	expect(() => gridFromJson([])).toThrow('a grid must be a JSON object'));
it('refuses an unknown key', () =>
	expect(() => gridFromJson({ ...BLUES, tempo: 80 })).toThrow('unknown key "tempo"'));
it('refuses an empty id', () =>
	expect(() => gridFromJson({ ...BLUES, id: '' })).toThrow('id must be a string'));
it('refuses another bar length', () =>
	expect(() => gridFromJson({ ...BLUES, beatsPerBar: 3 })).toThrow('beatsPerBar must be 4'));
it('refuses bars that are no positive integer', () =>
	expect(() => gridFromJson({ ...BLUES, bars: 0 })).toThrow('bars must be a positive integer'));
it('names the chord whose symbol does not read', () => {
	const chords = [BLUES.chords[0], { bar: 2, beat: 1, symbol: 'H7' }];
	expect(() => gridFromJson({ ...BLUES, chords })).toThrow(/^chords\[1\]\.symbol: /);
});
it('refuses a grid that does not start on bar 1, beat 1', () => {
	expect(() => gridFromJson({ ...BLUES, chords: [{ bar: 2, beat: 1, symbol: 'F7' }] })).toThrow(
		'must start on bar 1, beat 1'
	);
});
```

- [ ] **Step 2: Lancer, vérifier l'échec** — `npx vitest run src/lib/domain/grid/fromJson.spec.ts`, FAIL (module absent).
- [ ] **Step 3: Implémenter `gridFromJson`** : formes d'abord, puis chaque symbole par `parseChordSymbol`, puis `gridChanges(grid)` pour les règles de place (son message est repris tel quel).
- [ ] **Step 4: Lancer, vérifier que tout passe.**
- [ ] **Step 5: Commit** — `git commit -m "feat: read a chord grid written as json"`

### Task 4: Lire un fichier de définitions

**Files:**

- Create: `src/lib/domain/definitions/file.ts`, `src/lib/domain/definitions/file.spec.ts`, `src/lib/domain/definitions/index.ts`

**Interfaces:**

- Consumes: `exerciseFromJson`, `gridFromJson`.
- Produces:

```ts
export const DEFINITION_FORMAT = 0;
export const MAX_DEFINITION_FILE_CHARS = 1_000_000;
export type DefinitionKind = 'file' | 'grid' | 'exercise';
export interface Refusal {
	file: string;
	kind: DefinitionKind;
	id: string | null;
	reason: string;
}
export interface DefinitionFile {
	grids: ChordGrid[];
	exercises: ExerciseDefinition[];
	refusals: Refusal[];
}
/** Never throws. A `file` refusal means nothing of the file was read. */
export function readDefinitionFile(file: string, text: string): DefinitionFile;
```

- [ ] **Step 1: Écrire les tests qui échouent**, un par ligne de ce tableau, avec la raison exacte :

| Texte du fichier                                     | Refus (`kind`, `id`, `reason`)                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| plus de `MAX_DEFINITION_FILE_CHARS` caractères       | `file`, `null`, `the file is longer than 1000000 characters`                  |
| `''` ou `{"format": 0,`                              | `file`, `null`, commence par `the file is not JSON: `                         |
| `null`, `[]`, `"x"`                                  | `file`, `null`, `the file must be a JSON object { format, grids, exercises }` |
| `{}`                                                 | `file`, `null`, `format must be 0, got undefined`                             |
| `{"format": "0"}`                                    | `file`, `null`, `format must be 0, got "0"`                                   |
| `{"format": 0, "exercices": []}`                     | `file`, `null`, `unknown key "exercices"`                                     |
| `{"format": 0, "exercises": {}}`                     | `file`, `null`, `exercises must be a list`                                    |
| `{"format": 0, "skills": [{}]}` (de même `routines`) | `file`, `null`, `skills are not read by this version`                         |
| une grille que `gridFromJson` refuse                 | `grid`, son `id` s'il est un texte, la raison de `gridFromJson`               |
| un exercice que `exerciseFromJson` refuse            | `exercise`, son `id` s'il est un texte, la raison                             |
| deux exercices du même `id`                          | le second : `exercise`, l'`id`, `this id is used twice in the file`           |

Et trois tests de réussite : `{"format": 0}` rend trois listes vides ; `skills: []` et `routines: []` passent ; un fichier d'une grille valide, d'un exercice valide et d'un exercice refusé rend la grille, l'exercice valide et un seul refus.

- [ ] **Step 2: Lancer, vérifier l'échec** — `npx vitest run src/lib/domain/definitions/file.spec.ts`
- [ ] **Step 3: Implémenter `readDefinitionFile`.** Une raison qui commence par `<id>: ` perd ce préfixe : l'identifiant est déjà dans le refus.
- [ ] **Step 4: Lancer, vérifier que tout passe.**
- [ ] **Step 5: Commit** — `git commit -m "feat: read a definition file into objects and refusals"`

### Task 5: Les registres, et ce que l'application exige d'un exercice

**Files:**

- Create: `src/lib/domain/exercise/registry.ts`, `src/lib/domain/grid/registry.ts`, `src/lib/domain/definitions/register.ts`, `src/lib/application/definitions/checks.ts`, et leurs specs
- Modify: `src/lib/domain/exercise/catalog.ts`, `src/lib/domain/grid/catalog.ts` (ne gardent que les constantes), `src/lib/domain/exercise/index.ts`, `src/lib/domain/grid/index.ts`, `src/lib/composition/localExercises.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte`, les specs qui lisent `EXERCISES` ou `GRIDS` (dont `src/lib/testing/catalogFrozen.spec.ts`, dont l'instantané ne bouge pas)

**Interfaces:**

- Produces:

```ts
// domain/exercise/registry.ts
/** Null: registered. Else the origin that already holds this id; nothing changes. */
export function registerExercise(exercise: ExerciseDefinition, origin: string): string | null;
export function allExercises(): readonly ExerciseDefinition[];
export function exerciseById(id: ExerciseId): ExerciseDefinition;
export function exerciseSessionExercises(): readonly ExerciseDefinition[];
export function clearExercises(): void;

// domain/grid/registry.ts
export function registerGrid(grid: ChordGrid, origin: string): string | null;
export function allGrids(): readonly ChordGrid[];
export function gridById(id: string): ChordGrid;
export function clearGrids(): void;

// domain/definitions/register.ts
export interface DefinitionChecks {
	exercise(exercise: ExerciseDefinition): string | null;
}
/** Files in the order of their names; in a file, grids then exercises. Never throws. */
export function registerFiles(
	files: Readonly<Record<string, string>>,
	checks: DefinitionChecks
): Refusal[];

// application/definitions/checks.ts
export const SESSION_SENSORS = ['note', 'tap', 'chord', 'attack'];
export function definitionChecks(
	presenters?: Readonly<Record<string, MechanicPresenter>>
): DefinitionChecks;
```

- Jusqu'à la Task 9, les deux registres sont amorcés au chargement du module par les constantes du code, sous l'origine `'catalog'`. `EXERCISES`, `GRIDS` et `registerExercises` disparaissent : leurs lecteurs passent à `allExercises()`, `allGrids()`, `registerExercise`.

- [ ] **Step 1: Écrire les tests qui échouent**

`registry.spec.ts` (exercices, et le même pour les grilles) :

```ts
it('registers an exercise once', () => {
	clearExercises();
	expect(registerExercise(A, 'a.json')).toBeNull();
	expect(registerExercise({ ...A }, 'b.json')).toBe('a.json');
	expect(allExercises()).toEqual([A]);
});
it('says that nothing is loaded when the registry is empty', () => {
	clearExercises();
	expect(() => exerciseById('x')).toThrow('Unknown exercise: x (no definition is loaded)');
});
it('names an unknown exercise', () =>
	expect(() => exerciseById('x')).toThrow('Unknown exercise: x'));
```

`register.spec.ts`, les registres vidés d'abord, `checks` acceptant tout sauf mention :

```ts
it('reads the files in the order of their names', () => {
	/* b.json then a.json given: a's exercise comes first */
});
it('refuses an id another file holds, naming it', () => {
	/* a.json and b.json define exercise "x" */
	expect(refusals).toEqual([
		{ file: 'b.json', kind: 'exercise', id: 'x', reason: 'this id is already defined in a.json' }
	]);
});
it('lets a grid and an exercise share an id', () => {
	/* no refusal, both registered */
});
it('keeps the valid objects of a file that holds a refused one', () => {
	/* checks.exercise refuses "bad" */
});
it('checks an exercise after the grids of its file are registered', () => {
	/* the check calls gridById(...) without throwing */
});
it('never throws on a file that is no JSON', () => {
	/* one file refusal, the next file still read */
});
```

`checks.spec.ts` :

```ts
it('accepts every exercise of the catalog', () => {
	/* definitionChecks().exercise(e) is null for allExercises() */
});
it('refuses an unknown mechanic', () =>
	expect(check({ ...LOCATE, mechanic: 'nope' })).toBe('mechanic "nope" is unknown'));
it('refuses a grid no file defines', () => {
	/* a chord-grid exercise whose params.grids is ['nowhere'] */
	expect(check(exercise)).toBe('params.grids names grid "nowhere", which no file defines');
});
it('gives the reason of the first validator that refuses', () => {
	/* tempo: -3 → the validateExercise message */
});
```

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** `definitionChecks` enchaîne, dans cet ordre : la mécanique connue des présentateurs, `validateExercise(exercise, { sensors: SESSION_SENSORS })`, `presentationProblem`, `screenProblem`, `previewProblem`, puis les grilles de `readGestureParams` pour la mécanique `chord-grid`. `composition/localExercises.ts` garde son comportement en appelant `definitionChecks()` et `registerExercise` (il disparaît à la Task 9).
- [ ] **Step 4: Lancer toute la suite** — `npm test && npm run check`, PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor: hold exercises and grids in live registries"`

---

## Partie B — Le déplacement

### Task 6: Les tests prennent le catalogue à un seul endroit

**Files:**

- Create: `src/lib/testing/catalog.ts`
- Modify: chaque `*.spec.ts` et chaque fichier de `src/lib/testing/` qui importe une constante du catalogue

**Interfaces:**

- Produces: `$lib/testing/catalog` exporte `LOCATE_NECK`, `IDENTIFY_NECK`, `TRIADS_ANCHOR`, `TRIADS_ZONE`, `GESTURE_EXERCISES`, `GESTURE_LINK`, `GESTURE_CLIMB`, `GESTURE_ZONE`, `GESTURE_JAM`, `RHYTHM_EXERCISES`, `RHYTHM_SILENT_BARS`, `RHYTHM_TWO_FOUR`, `RHYTHM_OFFBEATS`, `IOHEFY_A`, `BLUES_F`. Pour l'instant, il les réexporte du code.

- [ ] **Step 1: Créer `src/lib/testing/catalog.ts`** avec ces quinze réexports.
- [ ] **Step 2: Récrire les imports** des specs et de `src/lib/testing/` : ces quinze noms viennent de `$lib/testing/catalog`, plus d'ailleurs.
- [ ] **Step 3: Vérifier qu'il n'en reste aucun**

Run: `grep -rlwE "LOCATE_NECK|IDENTIFY_NECK|TRIADS_ANCHOR|TRIADS_ZONE|GESTURE_(EXERCISES|LINK|CLIMB|ZONE|JAM)|RHYTHM_(EXERCISES|SILENT_BARS|TWO_FOUR|OFFBEATS)|IOHEFY_A|BLUES_F" src --include='*.spec.ts' | xargs grep -LE "testing/catalog'"`
Expected: aucune ligne.

- [ ] **Step 4: Lancer toute la suite** — `npm test && npm run check`, PASS.
- [ ] **Step 5: Commit** — `git commit -m "test: take the catalog constants from one test module"`

### Task 7: Le code de production lit le registre à l'appel

**Files:**

- Create: `src/lib/domain/exercise/catalogIds.ts`, `src/lib/testing/lateRead.svelte.spec.ts`
- Modify: `src/lib/domain/progress/neck.ts`, `src/lib/domain/progress/stats.ts`, `src/lib/domain/gesture/summary.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/ui/play/demo/DemoPlaySession.svelte.ts`, `src/lib/ui/play/demo/demoGestureSeries.ts`, `src/lib/ui/play/answer/DemoIdentifySession.svelte.ts`, `src/routes/dev/rhythm/+page.svelte`

**Interfaces:**

- Produces:

```ts
// domain/exercise/catalogIds.ts — the catalog ids the code still names (D6)
export const LOCATE_NECK_ID = 'locate-neck';
export const IDENTIFY_NECK_ID = 'identify-neck';
export const TRIADS_ANCHOR_ID = 'triads-anchor';
export const TRIADS_ZONE_ID = 'triads-zone';
/** In the order of the ladder. */
export const GESTURE_EXERCISE_IDS = [
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam'
] as const;
```

- [ ] **Step 1: Écrire le test qui échoue**

```ts
const MODULES: [string, () => Promise<unknown>][] = [
	['neck', () => import('$lib/domain/progress/neck')],
	['stats', () => import('$lib/domain/progress/stats')],
	['gesture summary', () => import('$lib/domain/gesture/summary')],
	['app services', () => import('$lib/application/services/createAppServices')],
	['demo play session', () => import('$lib/ui/play/demo/DemoPlaySession.svelte')],
	['demo gesture series', () => import('$lib/ui/play/demo/demoGestureSeries')],
	['demo identify session', () => import('$lib/ui/play/answer/DemoIdentifySession.svelte')]
];
it.each(MODULES)('%s imports with empty registries', async (_name, load) => {
	clearExercises();
	clearGrids();
	await expect(load()).resolves.toBeDefined();
});
```

- [ ] **Step 2: Lancer, vérifier l'échec** — `npx vitest run --project client src/lib/testing/lateRead.svelte.spec.ts` : FAIL sur `demoGestureSeries` et `DemoIdentifySession` (lecture au niveau du module).
- [ ] **Step 3: Implémenter.** Chaque fichier remplace sa constante par `exerciseById(<ID>)` ou `gridById(…)` dans la fonction qui s'en sert ; `createAppServices` garde `deps.exercise ?? exerciseById` ; plus aucun module de production n'importe une définition du catalogue.
- [ ] **Step 4: Vérifier**

Run: `npm test && npm run check`
Run: `grep -rnwE "LOCATE_NECK|IDENTIFY_NECK|TRIADS_ANCHOR|TRIADS_ZONE|GESTURE_(EXERCISES|LINK|CLIMB|ZONE|JAM)|RHYTHM_(EXERCISES|SILENT_BARS|TWO_FOUR|OFFBEATS)|IOHEFY_A|BLUES_F" src --include='*.ts' --include='*.svelte' | grep -vE "\.spec\.|/testing/|domain/exercise/(catalog|rhythmCatalog)\.ts|domain/gesture/(exercises|index)\.ts|domain/grid/(catalog|index)\.ts|domain/exercise/index\.ts"`
Expected: PASS, puis aucune ligne.

- [ ] **Step 5: Commit** — `git commit -m "refactor: read the registries when a session starts, not at import"`

### Task 8: Le catalogue écrit en fichiers

**Files:**

- Create: `catalog/notes.json`, `catalog/chords.json`, `catalog/changes.json`, `catalog/rhythm.json`, `src/lib/composition/catalogFiles.ts`, `src/lib/composition/catalogFiles.spec.ts`

**Interfaces:**

- Consumes: `registerFiles`, `definitionChecks`, `readDefinitionFile`.
- Produces:

```ts
// composition/catalogFiles.ts — keys are '/catalog/<name>.json'
export const CATALOG_FILES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'/catalog/*.json',
	{ eager: true, query: '?raw', import: 'default' }
);
```

Contenu des fichiers, chacun `{ "format": 0, … }` :

| Fichier        | `grids`               | `exercises`, dans cet ordre                                    |
| -------------- | --------------------- | -------------------------------------------------------------- |
| `notes.json`   |                       | `locate-neck`, `identify-neck`                                 |
| `chords.json`  |                       | `triads-anchor`, `triads-zone`                                 |
| `changes.json` | `iohefy-a`, `blues-f` | `gesture-link`, `gesture-climb`, `gesture-zone`, `gesture-jam` |
| `rhythm.json`  |                       | `rhythm-silent-bars`, `rhythm-two-four`, `rhythm-offbeats`     |

Chaque exercice est écrit en entier : ce que les fonctions du code calculaient (`leadsLadder()`, `beatRound(…)`, `tempoLevels(80, 120, 5, 10, 3)`, `gridRound()`, `runsOf(4)`) est déplié en données ; les constantes sont remplacées par leur valeur (`RECALL_THRESHOLD_MS` = 1500, `IDENTIFY_RECALL_THRESHOLD_MS` = 3000) ; les figures sont le texte LilyPond du code (`{ "id", "lilypond" }`) ; les accompagnements prennent la forme de la Task 2.

- [ ] **Step 1: Écrire les tests qui échouent**

`catalogFiles.spec.ts` (il reste après ce plan) :

```ts
it('holds the four files', () => {
	expect(Object.keys(CATALOG_FILES).sort()).toEqual([
		'/catalog/changes.json',
		'/catalog/chords.json',
		'/catalog/notes.json',
		'/catalog/rhythm.json'
	]);
});
it('loads without a single refusal', () => {
	clearExercises();
	clearGrids();
	expect(registerFiles(CATALOG_FILES, definitionChecks())).toEqual([]);
	expect(allExercises()).toHaveLength(11);
	expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
});
```

Dans le même fichier, un bloc provisoire que la Task 9 retire, `describe('parity with the code')` : après le chargement ci-dessus, pour chaque identifiant, `expect(plain(exerciseById(id))).toEqual(plain(<la constante de $lib/testing/catalog>))`, et de même pour les deux grilles, avec `plain = (value) => JSON.parse(JSON.stringify(value))`.

- [ ] **Step 2: Lancer, vérifier l'échec** — FAIL : `CATALOG_FILES` est vide.
- [ ] **Step 3: Écrire les quatre fichiers**, un exercice à la fois, en relançant le test : son message montre le premier écart.
- [ ] **Step 4: Lancer** — `npx vitest run src/lib/composition/catalogFiles.spec.ts`, PASS ; `npx prettier --check catalog`, PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: write the catalog as definition files"`

### Task 9: La bascule

**Files:**

- Create: `src/lib/composition/definitions.ts`, `src/lib/composition/definitions.spec.ts`, `src/lib/testing/setup.ts`, `src/lib/testing/emptyRegistries.spec.ts`
- Modify: `vite.config.ts`, `src/lib/composition/createApp.ts`, `src/lib/testing/catalog.ts`, `src/lib/composition/catalogFiles.spec.ts`, `src/lib/domain/exercise/registry.ts`, `src/lib/domain/grid/registry.ts`, `src/lib/domain/gesture/exercises.ts`, `src/routes/+page.svelte`, `src/lib/ui/screens/home/HomeScreen.svelte`, `src/lib/ui/screens/home/messages.ts`, `docs/exercices-locaux.md`, `CLAUDE.md`
- Delete: `src/lib/domain/exercise/catalog.ts`, `src/lib/domain/exercise/rhythmCatalog.ts`, `src/lib/domain/grid/catalog.ts`, `src/lib/composition/localExercises.ts`, `src/lib/composition/localExercises.spec.ts`, `src/lib/composition/loadLocalExercises.spec.ts`, `src/lib/domain/exercise/catalogRegister.spec.ts`

**Interfaces:**

- Produces:

```ts
// composition/definitions.ts
/**
 * Fills the registries once: the catalog, then the local files. Each refusal goes to
 * `console.error`, as `[catalog] <file> …` or `[exercises.local] <file> …`. Called again, it
 * returns what the first call refused.
 */
export function loadDefinitions(input: {
	catalog: Readonly<Record<string, string>>;
	local?: Readonly<Record<string, string>>;
}): Refusal[];
export function refusedDefinitions(): readonly Refusal[];
```

- `src/lib/testing/setup.ts` appelle `loadDefinitions({ catalog: CATALOG_FILES })` ; `vite.config.ts` le déclare en `setupFiles` des deux projets.
- `src/lib/testing/catalog.ts` lit le registre : `export const LOCATE_NECK = exerciseById('locate-neck')`, etc. ; `GESTURE_EXERCISES` et `RHYTHM_EXERCISES` sont des listes dans l'ordre d'aujourd'hui.
- Messages de l'accueil (`refusedTitle`, `refusedWhy`) :

| Refus      | fr                                        | en                                    |
| ---------- | ----------------------------------------- | ------------------------------------- |
| titre      | `Fichiers refusés`                        | `Files refused`                       |
| `file`     | `<fichier> : <raison>`                    | `<file>: <reason>`                    |
| `exercise` | ``<fichier>, exercice `<id>` : <raison>`` | ``<file>, exercise `<id>`: <reason>`` |
| `grid`     | ``<fichier>, grille `<id>` : <raison>``   | ``<file>, grid `<id>`: <reason>``     |

Un refus sans identifiant lisible s'écrit sans la partie entre accents graves. L'accueil ne montre toujours les refus qu'en développement.

- [ ] **Step 1: Écrire les tests qui échouent**

`definitions.spec.ts` (chaque test vide les registres et recharge le module, `vi.resetModules()`) :

```ts
it('loads the catalog, then the local files', () => {
	/* a local exercise is registered after the eleven */
});
it('refuses a local id the catalog holds', () => {
	/* reason: 'this id is already defined in /catalog/notes.json' */
});
it('starts with the other files when a catalog file is refused', () => {
	/* catalog: { '/catalog/a.json': 'not json', '/catalog/b.json': valid } → b's exercise is registered */
	expect(errors).toEqual(['[catalog] /catalog/a.json refused: the file is not JSON: …']);
});
it('reports a refused local file without throwing', () => {
	/* '[exercises.local] …' */
});
it('reads the files once', () => {
	/* a second call registers nothing more and returns the same refusals */
});
```

`emptyRegistries.spec.ts` : après `vi.resetModules()`, un import neuf de `$lib/domain/exercise/registry` et de `$lib/domain/grid/registry` rend `allExercises()` et `allGrids()` vides.

Dans `HomeScreen.svelte.spec.ts`, les trois phrases du tableau.

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter la bascule**, dans cet ordre :
  1. `definitions.ts`, `setup.ts`, `setupFiles` ;
  2. `createApp` appelle `loadDefinitions({ catalog: CATALOG_FILES, local })`, `local` étant le `import.meta.glob('/exercises.local/*.json', …)` d'aujourd'hui, toujours derrière `import.meta.env.DEV` ;
  3. `testing/catalog.ts` lit le registre ;
  4. les registres ne sont plus amorcés ; les fichiers de la liste « Delete » partent ; `gesture/exercises.ts` ne garde que `GestureParams`, `readGestureParams`, `gestureElements` et ce qu'ils lisent ;
  5. dans `catalogFiles.spec.ts`, le bloc provisoire `parity with the code` part ; `catalogFrozen.spec.ts` ne change pas : il lit les registres, que la mise en place remplit désormais ;
  6. l'accueil reçoit `refusedDefinitions()` ;
  7. les cas des specs supprimées qui ne sont pas déjà dans `file.spec.ts`, `register.spec.ts` ou `checks.spec.ts` y sont ajoutés avant la suppression.
- [ ] **Step 4: Réemballer les fichiers privés** (D9) : chaque `exercises.local/*.json` devient `{ "format": 0, "exercises": [ <son contenu d'avant> ] }`. Ne rien commiter de ce dossier. Vérifier en développement que l'accueil ne liste aucun refus.
- [ ] **Step 5: Mettre les docs à jour.** `docs/exercices-locaux.md` : l'enveloppe du fichier, plusieurs objets par fichier, les grilles, l'accompagnement écrit, les refus par objet. `CLAUDE.md` : les phrases qui décrivent `exercises.local/`, `readLocalExercises`, `registerExercises`, `rhythmCatalog.ts` et le catalogue en code.
- [ ] **Step 6: Vérifier**

Run: `npm test && npm run check && npm run lint`
Run: `npx vitest run src/lib/testing/catalogFrozen.spec.ts` — Expected: PASS, `0 written`, `0 updated`.
Run: `grep -rnE "rhythmCatalog|localExercises|registerExercises|readLocalExercises|\bEXERCISES\b|\bGRIDS\b" src docs/exercices-locaux.md CLAUDE.md | grep -v "docs/superpowers"`
Expected: aucune ligne.

- [ ] **Step 7: Commit** — `git commit -m "feat: load the catalog from its files at startup"`

---

## Partie C — Ce que le lecteur doit encore refuser

### Task 10: Les trous de validation

**Files:**

- Modify: `src/lib/domain/exercise/validate.ts`, `src/lib/domain/exercise/levels.ts` si besoin, `src/lib/application/presentation/presentPrompt.ts`
- Test: `src/lib/domain/exercise/validate.spec.ts`, `src/lib/application/presentation/presentPrompt.spec.ts`, `src/lib/application/definitions/checks.spec.ts`

**Interfaces:**

- Produces: `validateExercise` refuse les cas ci-dessous ; `presentPrompt` ne revalide plus la présentation à chaque consigne.

- [ ] **Step 1: Écrire un test par ligne.** Chaque test part d'un exercice que `validateExercise` accepte et n'y change que ce que la ligne dit. Un test qui passe déjà reste, comme garde.

| Ce que l'exercice écrit                                                    | Le message contient                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| niveau d'exercice `{ params: { 'windows.perfectMs': 'x' } }`               | `levels[0]` et `windows.perfectMs`                                      |
| niveau d'échelle `{ params: { tempo: -3 } }`                               | `ladder` et `tempo must be a positive number`                           |
| niveau `{ params: { cursor: undefined } }`                                 | `levels[0]` et `"cursor" is undefined`                                  |
| niveau `{ params: { windows: { perfectMs: 60 }, 'windows.lateMs': 200 } }` | `levels[0] writes "windows" and its sub-path "windows.lateMs"`          |
| `params.pacing.roundsPerBreath` à 0, à −1, à 1,5                           | `params.pacing.roundsPerBreath must be a positive integer`              |
| niveau `{ params: { 'pacing.roundsPerBreath': 0 } }`                       | `levels[0]` et `pacing.roundsPerBreath`                                 |
| `params.pacing: 3`                                                         | `params.pacing must be an object`                                       |
| tour jugé au cycle (`policy.unit: 'cycle'`) sans `pacing.roundsPerBreath`  | `params.pacing.roundsPerBreath is required for a round judged by cycle` |

Dans `checks.spec.ts` : une présentation qui nomme un champ inconnu est refusée par `definitionChecks()`. Dans `presentPrompt.spec.ts` : le test qui attendait une erreur de `presentPrompt` sur une présentation invalide affirme désormais `presentationProblem`.

- [ ] **Step 2: Lancer, noter ceux qui échouent.**
- [ ] **Step 3: Implémenter.** Les valeurs d'un niveau se vérifient sur les paramètres résolus à ce niveau (`resolvedParamsOf`), avec les contrôles déjà écrits pour les paramètres de base, pour que niveaux et base ne divergent pas. `presentPrompt` perd son appel à `presentationProblem`.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`, PASS ; `catalogFiles.spec.ts` reste vert (le catalogue passe les nouveaux contrôles).
- [ ] **Step 5: Commit** — `git commit -m "fix: refuse at load what an exercise file could break in play"`

### Étape jouable — tout se joue comme avant

- [ ] `npm run build` réussit ; `grep -rl "rhythm-offbeats" build` trouve un fichier ; `grep -rl "exercises.local" build` n'en trouve aucun.
- [ ] `scripts/functional-ui.mjs` passe, serveurs lancés comme son en-tête le dit.
- [ ] En développement, micro simulé, au-delà de la première respiration : une séance de notes, une séance de triades, un exercice de rythme, un exercice local.
- [ ] L'auteur joue une séance de chaque sorte sur l'aperçu local (`scripts/preview.mjs`), avec ses exercices privés.

## Avant de fusionner

- [ ] Revue de la branche entière (`requesting-code-review`), une seule vague de corrections.
- [ ] `npm test && npm run check && npm run lint` verts ; l'instantané de la Task 1 n'a jamais été régénéré (`git log -p -- src/lib/testing/__snapshots__` ne montre que sa création).
- [ ] La section « Réalisation » de la spec dit ce que le plan a décidé contre elle.
- [ ] Accord de l'auteur, puis fusion `--no-ff`. Rien n'est poussé sans demande.
