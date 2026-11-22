# Chantier 2, plan 2a : les capacités et les ensembles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le mot « mécanique » quitte les données, le stockage et le code. Une capacité, écrite dans un fichier, dit ce qu'un exercice travaille ; un ensemble, enregistré par le code, dit de quoi sont faits ses éléments. La base passe en version 13 et la sauvegarde en version 9.

**Architecture:**

- **La capacité est une donnée** (`skills` d'un fichier de définitions) : `id`, `name`, `items` (un nom d'ensemble), `memory`, `directRecall`. Un exercice écrit `practices`.
- **L'ensemble est du code** (`domain/sets/`, `application/sets/`) : la clé d'un élément et sa lecture, ses champs, ses capteurs par défaut, ce qu'une tentative en garde. Sept ensembles remplacent huit mécaniques.
- **Un élément servi porte sa capacité** (`PlannedItem.skill`) ; le code trouve l'ensemble par le registre des capacités. Cartes et tentatives sont rangées par capacité.
- **Une seule migration** (`storage/migrations/v13.ts`), pure, pour la base et pour l'import d'une sauvegarde 8 ; les identités d'avant y sont figées pour relire les vieux fichiers.

**Tech Stack:** TypeScript, Svelte 5 (runes), SvelteKit, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie, `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (C3, C6, C7 ; § 1, 2, 4, 9 ; « Réalisation (plan 1) »). **Inventaire du code** : `<workspace>/inventory.md` (où vit chaque usage de « mechanic », avec fichier et ligne ; le contrôleur le donne à chaque tâche).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan, pas avant.
- **Ce que le joueur vit ne change pas.** Mêmes exercices, mêmes consignes, mêmes verdicts, même progression après migration. Les plans compilés du rythme (`rhythmExercises.parity.spec.ts` et son instantané) ne bougent pas d'un octet.
- **L'instantané du catalogue** (`src/lib/testing/__snapshots__/catalogFrozen.spec.ts.snap`) n'est régénéré que dans les tâches qui le disent (1, 3, 4 et 7), et seulement pour les champs que la tâche nomme : son diff est relu ligne à ligne et cité dans le rapport.
- **Rien de privé dans le dépôt** : ni le contenu ni les identifiants de `exercises.local/`.
- **Une progression n'est jamais perdue** : une ligne que la migration ne sait pas lire est gardée, jamais supprimée.
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.**
- **Vocabulaire** (spec § 1) : « capacité » / `skill` ; « ensemble » / `ItemSet` ; « élément » / `item` ; « forme » / `shape`. À la fin du plan, une recherche de `mechanic` dans `src`, `catalog` et les docs vivantes ne trouve plus que `storage/migrations/`, `storage/legacy/`, `validateBackup.ts` (vieux fichiers) et leurs tests.
- **Code en anglais, interface en français et en anglais**, jamais sous 16 px.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Le plan 2 de la spec est coupé en deux.** 2a : capacités, ensembles, migration 13, sauvegarde 9. 2b : l'import, son écran, la progression sans définition, la fin de `exercises.local/`. La table des fichiers importés est créée ici (une seule version de schéma), remplie en 2b.
- **D2 — Les noms des onze capacités du catalogue** (identifiant, nom français, nom anglais, ensemble, mémoire, rappel direct) :

  | `id`                  | fr                                           | en                                  | `items`              | `memory` | `withinMs` |
  | --------------------- | -------------------------------------------- | ----------------------------------- | -------------------- | -------- | ---------- |
  | `locate-note-string`  | Trouver une note sur une corde               | Find a note on a string             | `note-on-string`     | oui      | 1500       |
  | `identify-note`       | Nommer une note                              | Name a note                         | `placed-note`        | oui      | 3000       |
  | `chord-anchor`        | Ancrer un accord sur sa fondamentale         | Anchor a chord on its root          | `voicing-on-strings` | oui      | 1500       |
  | `chord-zone`          | Jouer un accord près d'une case              | Play a chord near a fret            | `voicing-on-strings` | oui      | 1500       |
  | `inversion-run`       | Enchaîner les renversements d'un accord      | Run through a chord's inversions    | `placed-voicing`     | non      |            |
  | `grid-in-direction`   | Jouer une grille en montant ou en descendant | Play a grid going up or down        | `change`             | non      |            |
  | `grid-in-zone`        | Jouer une grille dans une zone               | Play a grid in a zone               | `change`             | non      |            |
  | `grid-reading`        | Lire une grille                              | Read a grid                         | `change`             | non      |            |
  | `inner-pulse`         | Tenir la pulsation sans le clic              | Keep the pulse without the click    | `figure`             | non      |            |
  | `displaced-pulse`     | Tenir la pulsation sur un clic déplacé       | Keep the pulse on a displaced click | `figure`             | non      |            |
  | `figure-independence` | Tenir une figure contre la pulsation         | Hold a figure against the pulse     | `figure`             | non      |            |

- **D3 — Huit mécaniques deviennent sept ensembles.** `locate` → `note-on-string` ; `identify` → `placed-note` ; `triad-anchor` et `triad-zone` → `voicing-on-strings` ; `chord-grid` → `change` ; `figure` → `figure` ; `voicing-figure` → `placed-voicing` ; `form-figure` → `placed-shape`.
- **D4 — Les deux triades partagent un ensemble et un présentateur.** L'élément est `{ voicingKey, position?, fret? }` ; la carte n'en garde que `voicingKey`. Le capteur d'accords écoute la forme à `position` quand l'élément en a une, sinon la forme la plus basse à toute octave. Une tentative garde la donnée de l'ancrage quand son tour a deux attentes (la fondamentale puis l'accord), sinon celle d'une attente seule. La forme stockée de `Attempt.data` ne change pas.
- **D5 — Les capteurs viennent toujours du tour** quand il en nomme : ce que `exercisePresenter` fait déjà pour une séance d'exercice vaut pour toutes. Le décor, l'aperçu et « Joué juste » restent des valeurs par défaut de l'ensemble, que `flow` remplace.
- **D6 — Les changements gardent leur présentateur jusqu'au plan 4.** Il est enregistré par vue (`grid-scroll`, `link-lane`), pas par ensemble, et porte sa propre fonction de clé : la forme demandée pour le lien (un `placed-voicing`), `<grille>#<rang>` pour une grille (un `change`).
- **D7 — Les identités des huit mécaniques sont figées** dans `migrations/v13.ts`. La validation des sauvegardes 1 à 8 les lit, plus le code vivant.
- **D8 — `params.ladders` disparaît.** Un exercice travaille une seule capacité : `params.ladder` suffit, aucun fichier n'écrit `ladders`.
- **D9 — Le tour de `identify-note` lit sa fenêtre dans `{ "param": "directRecall.withinMs" }`**, que les paramètres résolus tirent de la capacité. `params.recallThresholdMs` disparaît des fichiers.
- **D10 — Une séance enregistre `routine`, `exercise` ou les deux champs absents, et `free`.** Les routines n'existent pas encore comme objets (plan 5) : leurs quatre identifiants (`notes`, `chords`, `chords-zone`, `changes`) sont des constantes de `catalogIds.ts`, et `sessionKindOf(record)` rend aux lecteurs l'ancienne sorte de séance jusqu'au plan 5.
- **D11 — Une sauvegarde 9 peut porter la progression d'une capacité qu'aucun fichier chargé ne définit.** Sa forme est vérifiée ; la clé de son élément ne l'est que si la capacité est connue.
- **D12 — `forms` devient `shapes`, `form-notes` devient `shape-notes`.** La clé d'un `placed-voicing` est `<voicing>@<cases>` (`C|maj|3:1,2:3,1:5@5-5-3`) ; celle d'un `placed-shape` est `<forme>@<première note>`. La longueur d'un tour sort de la clé : une entrée de `items` s'écrit `"<clé>"` ou `{ "item": "<clé>", "beats": 4 }`.

## Review Focus

1. **Une base 12 réelle** avec des cartes et des tentatives des huit mécaniques passe en 13 sans perdre une ligne ni un état FSRS, et une sauvegarde 8 donne la même chose par l'import (Task 8).
2. **Une tentative d'un exercice hors du catalogue** (un exercice privé) garde sa ligne et reçoit une capacité du nom de l'exercice (Task 8).
3. **Une carte d'ancrage et une carte de zone du même voicing** restent deux cartes, sous deux capacités, après la fusion des deux mécaniques en un ensemble (Task 5).
4. **Un fichier dont un exercice nomme une capacité absente, ou une capacité un ensemble inconnu,** est refusé objet par objet avec sa raison (Task 1).
5. **Une sauvegarde 8 exportée avant ce plan** se réimporte après lui, y compris ses clés de formes jouées en figure (Task 8).

## File Structure

| Fichier                                                                        | Rôle                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/lib/domain/skill/` (`types.ts`, `fromJson.ts`, `registry.ts`, `index.ts`) | la capacité : son type, sa lecture, son registre                           |
| `src/lib/domain/sets/` (remplace `domain/mechanics/`)                          | les sept identités d'ensemble et leur registre `ITEM_SETS`                 |
| `src/lib/application/sets/` (remplace `application/mechanics/`)                | les présentateurs par ensemble, `VIEW_PRESENTERS` pour les changements     |
| `src/lib/domain/exercise/catalogIds.ts`                                        | les identifiants que le code nomme encore : exercices, capacités, routines |
| `src/lib/infrastructure/storage/migrations/v13.ts`                             | les identités figées d'avant, la migration 12 → 13, la sauvegarde 8 → 9    |
| `src/lib/infrastructure/storage/db.ts`, `validateBackup.ts`, `DexieBackup.ts`  | la version 13, la table `definitionFiles`, la sauvegarde 9                 |
| `catalog/*.json`                                                               | les onze capacités ; `practices` ; les huit identifiants renommés          |

---

### Task 1: Les capacités écrites dans les fichiers

**Files:**

- Create: `src/lib/domain/skill/types.ts`, `fromJson.ts`, `registry.ts`, `index.ts`, leurs specs ; `src/lib/domain/sets/names.ts`
- Modify: `src/lib/domain/definitions/file.ts`, `register.ts`, leurs specs ; `src/lib/application/definitions/checks.ts` ; `src/lib/composition/definitions.ts` ; `src/lib/ui/screens/home/messages.ts`, `HomeScreen.svelte` ; `catalog/*.json` ; `src/lib/composition/catalogFiles.spec.ts` ; `src/lib/testing/emptyRegistries.spec.ts`

**Interfaces:**

- Produces:

```ts
// domain/sets/names.ts
export const ITEM_SET_NAMES = [
	'note-on-string',
	'placed-note',
	'voicing-on-strings',
	'placed-voicing',
	'placed-shape',
	'change',
	'figure'
] as const;
export type ItemSetName = (typeof ITEM_SET_NAMES)[number];

// domain/skill/types.ts
export type SkillId = string;
export interface SkillDefinition {
	id: SkillId;
	name: { fr: string; en: string };
	/** The registered set its items belong to. */
	items: string;
	/** With cards (FSRS), or measured by its attempts alone. */
	memory: boolean;
	/** What counts as a direct recall; a memory skill writes it. */
	directRecall?: { withinMs: number };
}
// domain/skill/fromJson.ts — throws an Error naming the field
export function skillFromJson(json: unknown): SkillDefinition;
// domain/skill/registry.ts
export function registerSkill(skill: SkillDefinition, origin: string): string | null;
export function allSkills(): readonly SkillDefinition[];
export function skillById(id: SkillId): SkillDefinition; // `Unknown skill: <id>`, `… (no definition is loaded)` when empty
export function hasSkill(id: SkillId): boolean;
export function clearSkills(): void;
```

- `DefinitionKind` gagne `'skill'` ; `DefinitionFile` gagne `skills: SkillDefinition[]` ; un fichier se lit capacités, grilles, puis exercices. `skills` non vide n'est plus refusé ; `routines` l'est toujours.
- `ExerciseDefinition` gagne `practices?: SkillId` (facultatif dans cette tâche). `definitionChecks` refuse un exercice dont `practices` nomme une capacité absente : `practices names skill "<id>", which no file read so far defines`.
- Les quatre fichiers du catalogue gagnent leurs capacités (D2) et chaque exercice son `practices` ; `mechanic` et `version` restent.
- Messages de l'accueil pour la sorte `skill` : fr ``<fichier>, capacité `<id>` : <raison>``, en ``<file>, skill `<id>`: <reason>``.

- [ ] **Step 1: Écrire les tests qui échouent**

`skill/fromJson.spec.ts`, un test par ligne :

| Écrit                               | Erreur                                            |
| ----------------------------------- | ------------------------------------------------- |
| `[]`, `null`                        | `a skill must be a JSON object`                   |
| une clé `level`                     | `unknown key "level"`                             |
| `id: ''`                            | `id must be a string, not empty`                  |
| `name: 'x'`, ou `name.en` absent    | `name must be { fr, en }`                         |
| `items: 'cards'`                    | `items must name a registered set, got "cards"`   |
| `memory: 'yes'`                     | `memory must be true or false`                    |
| `memory: true` sans `directRecall`  | `directRecall is required for a memory skill`     |
| `directRecall: { withinMs: 0 }`     | `directRecall.withinMs must be a positive number` |
| `memory: false` avec `directRecall` | lu tel quel (pas d'erreur)                        |

`skill/registry.spec.ts` : mêmes cas que `exercise/registry.spec.ts`. `file.spec.ts` : `skills` lu, une capacité refusée garde les autres objets, deux capacités du même `id`. `register.spec.ts` : une capacité est enregistrée avant l'exercice du même fichier qui la nomme ; collision d'`id` entre deux fichiers. `checks.spec.ts` : la raison ci-dessus. `catalogFiles.spec.ts` : zéro refus, `allSkills()` rend les onze `id` de D2, chaque exercice du catalogue a un `practices` enregistré. `emptyRegistries.spec.ts` : le registre des capacités démarre vide.

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter**, puis écrire les capacités et les `practices` dans `catalog/`.
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; `catalogFrozen.spec.ts` montre un diff : régénérer l'instantané **pour le seul champ `practices` ajouté à chaque exercice** (`npx vitest run src/lib/testing/catalogFrozen.spec.ts -u`), et citer `git diff --stat` de l'instantané dans le rapport (11 lignes ajoutées).
- [ ] **Step 5: Commit** — `feat: write the skills an exercise practises in definition files`

### Task 2: Les identités d'avant, figées pour les vieux fichiers

**Files:**

- Create: `src/lib/infrastructure/storage/migrations/v13.ts`, `v13.spec.ts`
- Modify: `src/lib/infrastructure/storage/validateBackup.ts`, `validateBackup.spec.ts`

**Interfaces:**

- Produces, dans `v13.ts` :

```ts
/** What a mechanic was up to version 12: its id, whether it had cards, its item keys. Frozen. */
export interface MechanicV12 {
	id: string;
	cards: boolean;
	itemKey(item: unknown): string;
	parseItem(key: string): unknown;
	cardItem?(item: unknown): unknown;
}
export const MECHANICS_V12: readonly MechanicV12[]; // the eight, in today's order
```

- `validateBackup.ts` vérifie les fichiers de version 1 à 8 avec `MECHANICS_V12` (et l'identité `rhythm-figure` déjà figée), plus avec `MECHANIC_RULES`.

- [ ] **Step 1: Écrire les tests qui échouent** — `v13.spec.ts` : pour chacune des huit, un aller-retour de clé sur un exemple (`6:F`, `5:8`, `D|maj|3:5,2:1,1:3`, `climb:iohefy-a:3,2,1#2`, `silent-bars@2`, `D|maj|3:5,2:1,1:3@0@4`, `maj7@d@4`) ; un test « garde-fou » qui compare, pour ces exemples, `MECHANICS_V12` à `MECHANIC_RULES` vivant (il disparaît à la Task 5, avec le code vivant). `validateBackup.spec.ts` reste vert sans changement d'attente.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Les fonctions figées recopient la logique de clé de chaque mécanique ; elles peuvent appeler les lecteurs de musique (`parseVoicingKey`, `parseLocateItem`, `parseNoteName`), qui ne changent pas.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `refactor: freeze the item keys of version 12 for old backups`

### Task 3: Une tentative, une carte, un élément servi portent leur capacité

**Files:**

- Create: `src/lib/domain/skill/bridge.ts` (provisoire, supprimé à la Task 5)
- Modify: `src/lib/domain/types.ts`, `src/lib/domain/exercise/types.ts`, `fromJson.ts`, et tout lecteur ou écrivain de `mechanic` hors `storage/migrations`, `storage/legacy` et les contrôles des vieux fichiers de `validateBackup.ts` (inventaire § 1, 3, 4) ; `catalog/*.json` ; `src/lib/domain/exercise/catalogIds.ts`

**Interfaces:**

- `PlannedItem.mechanic`, `CardState.mechanic`, `Attempt.mechanic`, `NewCard.mechanic`, `CardRef.mechanic` deviennent `skill: SkillId`. `cardKey(skill, itemKey)` ; `parseCardKey` rend `{ skill, itemKey }`.
- `ExerciseDefinition` : `practices: SkillId` obligatoire ; `mechanic` et `version` disparaissent du type, de `exerciseFromJson` (une clé `mechanic` ou `version` est une clé inconnue) et des fichiers du catalogue.
- `LearningSubject` : chaque paramètre `mechanic` devient `skill`.
- `catalogIds.ts` gagne `LOCATE_SKILL_ID = 'locate-note-string'`, `IDENTIFY_SKILL_ID = 'identify-note'`, `CHORD_ANCHOR_SKILL_ID = 'chord-anchor'`, `CHORD_ZONE_SKILL_ID = 'chord-zone'`, `CHANGE_SKILL_IDS = ['inversion-run', 'grid-in-direction', 'grid-in-zone', 'grid-reading'] as const`. Toute comparaison à un littéral de mécanique (`'locate'`, `'identify'`, `'triad-anchor'`, `'triad-zone'`, `'chord-grid'`) devient une comparaison à ces constantes.
- Le pont provisoire, seul endroit où le code traduit encore une capacité en mécanique :

```ts
// domain/skill/bridge.ts — removed by Task 5
/** The mechanic whose code still plays this skill. */
export function mechanicOfSkill(skill: SkillId): string;
```

Sa table : les onze capacités de D2 vers leur mécanique d'aujourd'hui (les quatre des changements vers `chord-grid`, les trois du rythme vers `figure`) ; pour une autre capacité, l'ensemble de `skillById(skill).items` par la table D3 lue à l'envers (`voicing-on-strings` → `triad-anchor`). Les registres par mécanique (`MECHANIC_RULES`, `MECHANIC_PRESENTERS`, `ITEM_FIELDS`, les `reads`) ne changent pas dans cette tâche : leurs lecteurs passent par le pont.

- [ ] **Step 1: Écrire les tests qui échouent** — `bridge.spec.ts` (les onze, plus une capacité inventée sur `placed-shape` → `form-figure`) ; dans `fromJson.spec.ts` : `practices` obligatoire (`practices must be a string`), `mechanic` et `version` refusés comme clés inconnues ; dans `checks.spec.ts` : l'ancien test « mechanic unknown » devient « la capacité est absente ».
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Renommer le champ partout ; les valeurs écrites sont des identifiants de capacité. Les fabriques de test (`src/lib/testing/`, `storage/testing/fixtures.ts`) écrivent `skill`. Les tests des migrations 8 à 12 gardent leurs lignes d'époque avec `mechanic`.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. Régénérer `catalogFrozen` pour les seuls champs `mechanic` et `version` retirés (22 lignes en moins) ; l'instantané de parité du rythme ne bouge pas. `grep -rnw "mechanic" src --include='*.ts' --include='*.svelte' | grep -vE "storage/(migrations|legacy)/|validateBackup|domain/mechanics/|application/mechanics/|skill/bridge|\.spec\."` ne rend que des commentaires à mettre à jour dans cette tâche.
- [ ] **Step 5: Commit** — `refactor: key cards, attempts and served items by the skill they practise`

### Task 4: Le rappel direct et la mémoire viennent de la capacité

**Files:**

- Modify: `src/lib/domain/exercise/recall.ts`, `levels.ts`, `ladder.ts`, `validate.ts`, `round/` ; `src/lib/domain/learning/` ; `src/lib/domain/progress/neckSubject.ts`, `src/lib/domain/triads/triadSubject.ts` ; `src/lib/application/session/AttemptRecorder.ts` ; `src/lib/application/services/createAppServices.ts` ; `catalog/notes.json`, `catalog/chords.json` ; leurs specs

**Interfaces:**

- `directRecallOf(skill: SkillDefinition): DirectRecall | null` remplace la lecture de `params.recallThresholdMs`. `recallThresholdOf(definition)` disparaît.
- Les paramètres résolus d'un élément (`roundParamsOf`) portent `directRecall.withinMs`, tiré de la capacité de l'exercice ; le tour de `identify-neck` écrit `"window": { "ms": { "param": "directRecall.withinMs" } }` (D9). `recallThresholdMs` sort des quatre exercices du catalogue.
- Un élément a des cartes quand `skillById(skill).memory` : `AttemptRecorder` et tout lecteur de `learner` lisent la capacité. Le champ `learner` des identités n'est plus lu (il disparaît à la Task 5).
- `ladderOf(definition)` : un seul argument ; `params.ladders` n'est plus lu (D8).
- `validateExercise` refuse un exercice dont la capacité a `memory: true` et dont le tour est jugé au cycle : `practices a memory skill with a round judged by cycle`.

- [ ] **Step 1: Écrire les tests qui échouent** — le rappel direct lu sur la capacité (`recall.spec.ts`) ; la fenêtre du tour d'identification compilée à 3000 ms depuis la capacité ; un exercice de mémoire à tour de cycle refusé ; `ladders` ignoré.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. Régénérer `catalogFrozen` pour les seuls `recallThresholdMs` retirés et la fenêtre du tour d'identification ; les plans compilés des notes et des triades (les specs de série) gardent leurs attentes.
- [ ] **Step 5: Commit** — `refactor: read direct recall and memory from the skill`

### Task 5: Sept ensembles à la place de huit mécaniques

**Files:**

- Move: `src/lib/domain/mechanics/` → `src/lib/domain/sets/` ; `src/lib/application/mechanics/` → `src/lib/application/sets/`
- Delete: `src/lib/domain/skill/bridge.ts`, `src/lib/application/sets/exercisePresenter.ts`
- Modify: tout ce qui importe ces dossiers ; `src/lib/application/session/thirdMechanic.spec.ts` → `thirdSet.spec.ts` ; `src/lib/infrastructure/storage/migrations/v13.spec.ts` (le garde-fou de la Task 2 part)

**Interfaces:**

```ts
// domain/sets/types.ts
/** What the code knows of the items of a registered set: their key and what a card keeps. */
export interface ItemSet<I = unknown> {
	id: ItemSetName | string;
	itemKey(item: I): string;
	parseItem(key: string): I;
	cardItem?(item: I): unknown;
}
// domain/sets/index.ts
export const ITEM_SETS: readonly ItemSet[]; // the seven of ITEM_SET_NAMES
export function itemSet(id: string): ItemSet; // `Unknown item set: <id>`
export function setOfSkill(skill: SkillId): ItemSet; // itemSet(skillById(skill).items)

// application/sets/types.ts — MechanicPresenter renamed
export interface SetPresenter<I = any, A = any> {
	set: ItemSet<I>;
	scene;
	sensors;
	previewBeats?;
	feedback?;
	contestable?;
	answerChoices?;
	debugLines?;
	expectation?;
	stageOf?;
	attemptData?;
}
// application/sets/index.ts
export const SET_PRESENTERS: Readonly<Record<string, SetPresenter>>; // by set id
/** The gesture's presenter until plan 4, by the view of the exercise (D6). */
export const VIEW_PRESENTERS: Readonly<Record<string, SetPresenter>>; // 'grid-scroll', 'link-lane'
export function presenterOf(definition: ExerciseDefinition, presenters?, views?): SetPresenter;
```

- `presenterOf` : le présentateur de la vue de l'exercice s'il y en a un, sinon celui de l'ensemble de sa capacité ; puis ses capteurs sont ceux que le tour nomme quand il en nomme (D5). `SessionDeps.mechanics` devient `SessionDeps.presenters` ; `SeriesItems.presenterOf(item)` passe par l'exercice de l'élément.
- Les tables : `ITEM_FIELDS`, `PICTURES[*].reads`, `CONTENT_DERIVATIONS[*].reads`, `ITEM_NUMBERS[*].reads`, `ITEM_FIGURES[*].reads` sont indexées ou listées par identifiant d'ensemble (D3). Les champs de `voicing-on-strings` sont l'union de ceux des deux triades ; `{around}` est vide pour un élément sans position.
- `voicing-on-strings` suit D4. Le présentateur des changements suit D6 et garde, dans cette tâche, la clé d'aujourd'hui (`<élément>#<rang>`) : elle change à la Task 6.
- Le champ `learner` disparaît des identités.
- `thirdSet.spec.ts` joue de bout en bout un ensemble inventé et une capacité inventée par les registres, sans toucher au code du moteur.

- [ ] **Step 1: Écrire les tests qui échouent** — `sets/index.spec.ts` : les sept identifiants, `setOfSkill('chord-zone')` et `setOfSkill('chord-anchor')` rendent le même ensemble ; `application/sets/index.spec.ts` : `presenterOf` pour un exercice de vue `link-lane`, pour `chord-zone`, et les capteurs du tour ; une spec de série (dans `series/triadsSession.spec.ts`) : une carte d'ancrage et une carte de zone du même voicing restent deux cartes, de clés `chord-anchor:<voicing>` et `chord-zone:<voicing>`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter**, dans cet ordre : déplacer les dossiers et renommer les types ; fusionner les deux triades ; indexer les tables par ensemble ; `presenterOf` ; supprimer le pont, `exercisePresenter` et `learner`.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. Aucun instantané ne bouge. `grep -rniE "mechanic" src catalog --include='*.ts' --include='*.svelte' --include='*.json' | grep -vE "storage/(migrations|legacy)/|validateBackup"` ne rend rien.
- [ ] **Step 5: Commit** — `refactor: let seven item sets replace the eight mechanics`

### Task 6: Des clés qui ne disent que l'élément

**Files:**

- Modify: `src/lib/domain/sets/` (`placedVoicing.ts`, `placedShape.ts`, `change.ts` — les fichiers issus de `voicingFigure.ts`, `formFigure.ts`, `chordGrid.ts`), `src/lib/domain/derivations/index.ts`, `src/lib/domain/exercise/types.ts`, `fromJson.ts`, `validate.ts`, `src/lib/application/session/series/itemSource.ts`, `src/lib/application/sets/` (le présentateur des changements), `src/lib/testing/arpeggioExercise.ts` et les fabriques qui écrivent ces clés, `docs/exercices-locaux.md`

**Interfaces (D12):**

- `placed-voicing` : élément `{ voicing: string; frets: readonly number[]; beats?: number }`, clé `<voicing>@<cases jointes par ->` ; `parseItem` refuse des cases où le voicing ne tombe pas (`the voicing has no place at frets 9-9-9`).
- `placed-shape` : élément `{ shape: string; first: string; beats?: number }`, clé `<shape>@<first>`.
- `change` : clé `<grille>#<rang>` ; `parseItem` rend `{ grid, index }`. La fonction de clé du présentateur des changements rend la forme demandée (`item.shape`) pour le lien, `<grille>#<rang>` sinon.
- `ExerciseDefinition.items?: readonly (string | { item: string; beats: number })[]` ; `shapes` remplace `forms` (type `ExerciseShape`) ; la dérivation `shape-notes` remplace `form-notes` ; `{ "item": "beats" }` lit la longueur de l'entrée.
- La doc dit les nouvelles écritures, avec son exemple d'arpèges réécrit.

- [ ] **Step 1: Écrire les tests qui échouent** — aller-retour de clé pour les trois ensembles ; les refus ci-dessus ; une entrée `{ item, beats }` servie avec sa longueur ; un `beats` qui n'est pas positif refusé en nommant `items[i].beats` ; l'exemple de la doc accepté par `definitionChecks` (le test existant de `definitions.spec.ts`).
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. Aucun instantané ne bouge (le catalogue n'écrit ni `items`, ni `shapes`).
- [ ] **Step 5: Commit** — `refactor: keep a turn's length and a shape's rank out of item keys`

### Task 7: Les huit exercices prennent le nom de leur capacité, la séance dit sa routine

**Files:**

- Modify: `catalog/*.json`, `src/lib/domain/exercise/catalogIds.ts`, `src/lib/testing/catalog.ts`, `src/lib/ui/screens/summary/messages.ts`, `src/lib/domain/types.ts`, `src/lib/application/session/SessionController.svelte.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/domain/progress/stats.ts`, les lecteurs de `SessionRecord.kind` et `.exerciseId` (inventaire § 4 et 10), les specs et fabriques qui écrivent ces identifiants

**Interfaces:**

- Identifiants d'exercice : `locate-neck` → `locate-note-string`, `identify-neck` → `identify-note`, `triads-anchor` → `chord-anchor`, `triads-zone` → `chord-zone`, `gesture-link` → `inversion-run`, `gesture-climb` → `grid-in-direction`, `gesture-zone` → `grid-in-zone`, `gesture-jam` → `grid-reading`. Les constantes de `catalogIds.ts` gardent leurs noms, leurs valeurs changent. Les trois exercices de rythme gardent les leurs.
- `SessionRecord` : `kind` et `exerciseId` disparaissent ; `routine?: string`, `exercise?: ExerciseId`, `free?: true` (D10). `catalogIds.ts` gagne `ROUTINE_NOTES_ID = 'notes'`, `ROUTINE_CHORDS_ID = 'chords'`, `ROUTINE_CHORDS_ZONE_ID = 'chords-zone'`, `ROUTINE_CHANGES_ID = 'changes'`.

```ts
// domain/types.ts — until plan 5
/** The kind of session a record came from: learn, free, triads, triads-zone, gesture, exercise. */
export function sessionKindOf(
	record: Pick<SessionRecord, 'routine' | 'exercise' | 'free'>
): SessionKind;
export function sessionOriginOf(
	kind: SessionKind,
	exercise?: ExerciseId
): Pick<SessionRecord, 'routine' | 'exercise' | 'free'>;
```

`learn` → `{ routine: 'notes' }` ; `free` → `{ routine: 'notes', free: true }` ; `triads` → `{ routine: 'chords' }` ; `triads-zone` → `{ routine: 'chords-zone' }` ; `gesture` → `{ routine: 'changes' }` ; `exercise` → `{ exercise: <id> }`. Un enregistrement qu'aucune ligne ne décrit est lu `exercise`.

- [ ] **Step 1: Écrire les tests qui échouent** — l'aller-retour des six sortes par les deux fonctions ; `catalogFiles.spec.ts` attend les huit nouveaux identifiants ; une spec de série vérifie qu'une séance de triades écrit `routine: 'chords'` et aucune `kind`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. Régénérer `catalogFrozen` : ses titres et les huit `id` changent, rien d'autre (renommer les huit entrées de l'instantané, le contenu de chaque exercice ne bouge que par son `id`).
- [ ] **Step 5: Commit** — `refactor: name eight exercises after their skill and record a session's routine`

### Task 8: La base en version 13, la sauvegarde en version 9

**Files:**

- Modify: `src/lib/infrastructure/storage/migrations/v13.ts`, `v13.spec.ts`, `db.ts`, `db.spec.ts`, `validateBackup.ts`, `validateBackup.spec.ts`, `DexieBackup.ts`, `DexieBackup.spec.ts`, `src/lib/domain/types.ts` (`BackupFile`), `src/lib/application/ports/repositories.ts`, `src/lib/testing/fakes.ts`
- Create: `src/lib/infrastructure/storage/DexieDefinitionFileRepository.ts`, `storage/testing/definitionFileRepositoryContract.ts`, leurs specs ; `src/lib/infrastructure/storage/fixtures/backup-v8.json`

**Interfaces:**

```ts
// migrations/v13.ts — pure, frozen
export const EXERCISE_IDS_V13: Readonly<Record<string, string>>; // the eight renames
export const SKILL_OF_MECHANIC_V13: Readonly<Record<string, string>>; // locate, identify, triad-anchor, triad-zone → their skill
export const SKILL_OF_EXERCISE_V13: Readonly<Record<string, string>>; // the eleven catalog exercises (new ids) → their skill
export function cardToV13(card: Row): Row;
export function attemptToV13(attempt: Row): Row;
export function levelStateToV13(state: Row): Row;
export function sessionToV13(session: Row): Row;
export interface BackupV9 extends Row {
	version: 9;
	definitionFiles: Row[];
}
export function backupV8ToV9(backup: BackupV8): BackupV9;

// application/ports/repositories.ts
export interface DefinitionFileRecord {
	name: string;
	text: string;
	importedAt: number;
}
export interface DefinitionFileRepositoryPort {
	all(): Promise<DefinitionFileRecord[]>; // by name
	put(file: DefinitionFileRecord): Promise<void>; // replaces the file of the same name
	delete(name: string): Promise<void>;
}
```

Les règles, une par ligne à tester :

| Ligne                                            | Règle                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| carte                                            | `skill` = `SKILL_OF_MECHANIC_V13[mechanic]` ; la clé prend ce préfixe, son reste ne bouge pas ; l'état FSRS et les dates sont recopiés tels quels |
| tentative                                        | `exerciseId` renommé ; `skill` = `SKILL_OF_EXERCISE_V13[exerciseId]`, sinon l'identifiant de l'exercice ; `mechanic` retiré                       |
| clé d'une tentative de `chord-grid`              | lien : la forme demandée (`data.item.shape`) ; grille : `<grille>#<rang>` (la grille est le deuxième morceau de `data.item.element`)              |
| clé d'une tentative de `voicing-figure`          | `<voicing>@<cases>` : les cases de l'occurrence de rang `occurrence` ; la longueur sort                                                           |
| clé d'une tentative de `form-figure`             | `<forme>@<première note>` ; la longueur sort                                                                                                      |
| tentative illisible (clé ou données inattendues) | gardée : `skill` et `exerciseId` posés, la clé reprend son reste d'origine sous le nouveau préfixe                                                |
| niveau                                           | `exerciseId` renommé ; `item` nettoyé comme une clé du même exercice                                                                              |
| séance                                           | `kind`, `exerciseId` → `routine`, `exercise`, `free` (Task 7) ; `executions[].exerciseId` renommé                                                 |
| réglages                                         | inchangés                                                                                                                                         |

- Dexie 13 : `stores` gagne `definitionFiles: 'name'` ; la mise à niveau applique ces fonctions à chaque table ; les niveaux, dont la clé primaire change, sont vidés puis récrits.
- `BackupFile.version` vaut 9 et porte `definitionFiles`. `validateBackup` : une version 8 passe par `backupV8ToV9` ; une version 9 refuse `mechanic`, `kind` et les anciens identifiants d'exercice ; D11 pour une capacité inconnue.
- `fixtures/backup-v8.json` : une sauvegarde 8 écrite pour le test, avec une carte et une tentative de chacune des quatre mécaniques de mémoire, une tentative de chacune des quatre règles des changements, une de `figure`, une de `voicing-figure`, une de `form-figure` sous un identifiant d'exercice hors catalogue (`my-arpeggios`), des niveaux, une séance de chaque sorte. Matière commune seulement.

- [ ] **Step 1: Écrire les tests qui échouent** — `v13.spec.ts` : une ligne du tableau par test, avec ses valeurs avant et après ; les tables figées comparées au catalogue vivant (les huit renommages, les onze capacités) ; `voicingOccurrences` épinglé sur trois exemples que la clé nettoyée lit. `db.spec.ts` : une base 12 semée passe en 13, mêmes comptes de lignes, état FSRS identique, table `definitionFiles` vide. `validateBackup.spec.ts` : `backup-v8.json` importé donne les mêmes lignes que la base migrée ; les refus de la version 9. Le contrat du dépôt des fichiers : vide, `put` puis `all` par nom, `put` remplace, `delete`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: migrate stored progress to skills in database 13 and backup 9`

### Task 9: Les mots et les docs

**Files:**

- Modify: `CLAUDE.md`, `src/lib/infrastructure/CLAUDE.md`, `src/lib/ui/CLAUDE.md` si elles nomment une mécanique, `docs/exercices-locaux.md`, `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (« Réalisation (plan 2a) » et « Découpage en plans »), les commentaires du code

- [ ] **Step 1: Vérifier qu'il ne reste rien** — `grep -rniE "mechanic|mécanique" src catalog CLAUDE.md docs/exercices-locaux.md docs/projet.md | grep -vE "storage/(migrations|legacy)/|validateBackup"` : chaque ligne rendue est récrite (« capacité », « ensemble », `skill`, `set`), sauf `docs/projet.md`, que ce plan ne touche pas (noter ses lignes dans le rapport).
- [ ] **Step 2: Mettre à jour `CLAUDE.md`** : les paragraphes « Mechanics and exercises », « Storage » (version 13, sauvegarde 9, la table `definitionFiles`), « Sessions » ; seulement les phrases devenues fausses.
- [ ] **Step 3: Écrire « Réalisation (plan 2a) »** dans la spec : les douze décisions de ce plan en une ligne chacune, et ce qui est laissé au plan 2b.
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check catalog CLAUDE.md docs/exercices-locaux.md`.
- [ ] **Step 5: Commit** — `docs: say skill and item set where the code said mechanic`

### Étape jouable

- [ ] `npm run build` réussit.
- [ ] En développement, micro simulé : une séance de notes, de triades, de triades vers une case si elle est ouverte, des changements si elle est ouverte, un exercice de rythme, chacune au-delà du premier tour.
- [ ] Une copie de la base de l'auteur (une sauvegarde exportée depuis l'application en production, importée dans l'aperçu) garde ses cartes, ses révisions dues et ses niveaux. Sans cette sauvegarde, le dire dans la passation.
