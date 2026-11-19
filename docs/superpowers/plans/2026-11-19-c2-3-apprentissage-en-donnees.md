# Chantier 2, plan 3 : l'apprentissage en données — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ce qu'une séance de mémoire introduit, dans quel ordre et à quelle condition est écrit dans l'exercice. `neckSubject`, `triadSubject` et les générateurs d'ordre du code disparaissent ; un seul sujet d'apprentissage est construit à partir des données.

**Architecture:**

- **L'exercice écrit ses éléments** (`items`, une liste) : son ordre est l'ordre d'introduction. Un script écrit une fois les listes du catalogue à partir de l'ordre statique d'aujourd'hui.
- **L'exercice écrit sa condition d'entrée** (`params.learning.enter`) : un élément n'entre que si un autre, désigné par une correspondance enregistrée, est acquis dans une capacité nommée.
- **Un seul sujet** (`exerciseSubject`) lit ces données pour les exercices d'une séance. La procédure d'apprentissage (`createLearningProcedure`) garde ses catégories, ses seuils et ses échelles.
- **Le cœur garde une seule règle de voisinage** : jamais le même élément deux fois de suite.

**Tech Stack:** TypeScript, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie.

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 5 ; § 4 pour les capacités partagées ; « Réalisation (plan 2b) », « Laissé au plan 3 »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Ce que le joueur perd est décidé par l'auteur, et rien d'autre ne change** : une note n'attend plus son miroir ; « une autre corde de préférence » disparaît ; les notes des triades en cours ne passent plus devant ; les fondamentales des triades ne sont plus triées par ce que le joueur sait déjà. Tout le reste d'une séance (catégories, sonde, présentation aidée, échelles, seuils, consolidation, jamais le même élément deux fois) est identique.
- **Une progression n'est jamais perdue** : une carte que plus aucune liste ne nomme est gardée et ignorée.
- **Rien de stocké ne change de forme** : base 13, sauvegarde 9.
- **Le cœur ne nomme ni exercice, ni capacité, ni ensemble** (tests de frontière existants).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.**
- **Aucun ordre ni préférence calculés sur l'état du joueur** (spec § 5).
- **Rien de privé dans le dépôt.**
- **Vocabulaire** : « élément » / `item` ; « capacité » / `skill` ; « ensemble » / `ItemSet` ; « correspondance » / `correspondence` ; « condition d'entrée » / `enter` ; « acquis » / `acquired`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                              | Sorte                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| la liste `items` d'un exercice de mémoire, son ordre                               | donnée                                            |
| `params.learning.enter`, `params.learning.presentAtOnce`                           | donnée                                            |
| une correspondance entre deux ensembles (`same`, `same-place`)                     | primitive, enregistrée par ensemble               |
| « jamais le même élément deux fois de suite »                                      | primitive du cœur                                 |
| le tirage d'une autre place pour `chord-zone` (`params.learning.draw`)             | exception, supprimée au plan 4 (les filtres)      |
| l'ordre des exercices dans une séance (`identify-note` avant `locate-note-string`) | exception, en code jusqu'au plan 5 (les routines) |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Un exercice de mémoire ne demande que les éléments de sa liste.** Une carte de sa capacité que la liste ne nomme pas est gardée et ignorée : ni révisée, ni comptée dans la séance. Deux exercices sur une même capacité partagent les cartes des éléments qu'ils nomment tous les deux.
- **D2 — Un exercice de mémoire sans liste est refusé** : il n'a rien à demander.
- **D3 — Les listes du catalogue sont l'ordre statique d'aujourd'hui.** Notes : les naturelles puis les altérées, en alternant les cordes de 6 à 1, les naturelles sur un repère d'abord sur chaque corde. Accords : groupe de cordes par groupe de cordes, les fondamentales naturelles puis altérées depuis do, majeur puis mineur, les trois renversements en montant le manche.
- **D4 — La correspondance « la note au même endroit » s'appelle `same-place`** (d'un élément de `placed-note` vers celui de `note-on-string`). `same` désigne le même élément, entre deux capacités du même ensemble.
- **D5 — « Acquis » a une seule règle pour une condition d'entrée** : celle de `isAcquired` (la carte porte `acquiredAt`, ou une tentative de son histoire la qualifie). Les notes lisaient `acquiredAt` seul.
- **D6 — Entre les exercices d'une séance, le premier listé qui a un élément prêt introduit.** La séance des notes liste `identify-note` puis `locate-note-string` : nommer une note déjà placée passe avant une nouvelle note, comme aujourd'hui. Cet ordre reste en code jusqu'aux routines (plan 5).
- **D7 — Le tirage de `chord-zone` (une autre forme que la dernière demandée, et une case qu'elle couvre) devient un tirage enregistré, nommé par l'exercice** (`params.learning.draw: "another-place"`). C'est une exception : le plan 4 le remplace par deux filtres.
- **D8 — Une confusion se lit sur la tentative** (`data.confusion` non nul), pour toute capacité. **L'aide qui s'efface** se lit sur la présentation (`presentation.fading`).
- **D9 — `stringSets` et `qualities` quittent les paramètres de `chord-anchor` et `chord-zone`** si plus rien ne les lit.
- **D10 — Une carte dont la clé ne se lit plus est acceptée à l'import d'une sauvegarde**, gardée et ignorée (D10 du plan 2b).

## Review Focus

1. **Un joueur en cours d'apprentissage** : ses cartes en cours, dues ou acquises sont servies comme avant le plan ; une note qui attendait son miroir entre à son tour dans la liste (Task 4).
2. **Une liste qui nomme un élément illisible, deux fois le même, ou vide** : refusée au chargement, avec l'élément nommé (Task 2 ; l'illisible et le vide le sont déjà).
3. **Une condition d'entrée qui ne s'ouvre jamais** (capacité sans carte) : la séance n'introduit rien, sert ses révisions, et une séance qui n'a rien à demander finit sur le bilan (Task 3).
4. **Une liste retouchée** : un élément retiré dont la carte est due n'est plus servi, sa carte reste ; remis, il revient (Task 3).
5. **Deux exercices d'une séance sur la même capacité** : le sujet refuse de se construire, en nommant la capacité (Task 3).

## File Structure

| Fichier                                      | Rôle                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/sets/correspondences.ts`     | les correspondances enregistrées entre ensembles                                                                                                |
| `src/lib/domain/sets/draws.ts`               | les tirages enregistrés (un seul, provisoire)                                                                                                   |
| `src/lib/domain/learning/params.ts`          | modifié : `enter`, `presentAtOnce`, `draw` lus de l'exercice (`exerciseLearningOf`)                                                             |
| `src/lib/domain/learning/exerciseSubject.ts` | le sujet construit des données                                                                                                                  |
| `src/lib/domain/learning/subject.ts`         | modifié : `neighbours` et `prefers` sortent de l'interface                                                                                      |
| `catalog/notes.json`, `catalog/chords.json`  | les listes, les conditions d'entrée                                                                                                             |
| supprimés                                    | `progress/neckSubject.ts`, `progress/introduction.ts`, `triads/triadSubject.ts`, `triads/introduction.ts`, `triads/notes.ts`, `music/mirror.ts` |

---

### Task 1: Ce qu'un exercice de mémoire écrit de son apprentissage

**Files:**

- Create: `src/lib/domain/sets/correspondences.ts`, `correspondences.spec.ts`, `src/lib/domain/sets/draws.ts`, `draws.spec.ts`
- Modify: `src/lib/domain/learning/params.ts`, `params.spec.ts`, `src/lib/application/definitions/checks.ts`, `checks.spec.ts`

**Interfaces:**

```ts
// domain/sets/correspondences.ts
export interface Correspondence {
	/** The item of the other set an item names; null when it names none. */
	of(item: unknown): unknown | null;
}
/** The correspondence `name` from set `from` to set `to` (set ids); null when none is registered. `same` holds between any set and itself. */
export function correspondence(name: string, from: string, to: string): Correspondence | null;
export const CORRESPONDENCE_NAMES: readonly string[]; // 'same', 'same-place'

// domain/sets/draws.ts
/** What a prompt asks of a card's item: the item, with what the draw adds. `previous`: the item last asked of this card, null before any. */
export type Draw = (item: unknown, previous: unknown | null, random: () => number) => unknown;
/** The draw `name` of set `set`; null when none is registered. */
export function drawNamed(name: string, set: string): Draw | null; // 'another-place' on 'voicing-on-strings'

// domain/learning/params.ts
export interface EntryCondition {
	acquired: { skill: SkillId; item: string };
}
/** What an exercise writes of its learning (`params.learning`), over the defaults. */
export interface ExerciseLearning extends ItemLearning {
	enter?: EntryCondition;
	/** true by default: the aided presentation follows its missed probe at once. */
	presentAtOnce: boolean;
	draw?: string;
}
export function exerciseLearningOf(definition: ExerciseDefinition): ExerciseLearning;
```

- `same-place` : de `{ string, fret }` (`placed-note`) vers `{ string, pitch }` (`note-on-string`), par `pitchOnString`.
- `another-place` reprend le calcul de `zoneItem` (`src/lib/domain/triads/triadSubject.ts`) : une forme autre que celle de `previous`, et une case qu'elle couvre. Il ne garde aucun état : `previous` lui est passé. `triadSubject` n'est pas touché dans cette tâche.
- `itemLearningOf` reste, lu par la procédure.
- Les contrôles vivent dans `definitionChecks` (ils lisent le registre des capacités).

- [ ] **Step 1: Écrire les tests qui échouent.** `draws.spec.ts` : les cas de tirage de `triadSubject.spec.ts`, réécrits sur `drawNamed` (jamais la dernière forme quand une autre existe ; la seule forme quand il n'y en a qu'une ; une case que la forme couvre ; sans `previous`). `correspondences.spec.ts` : `same-place` sur trois cases ; `same` entre un ensemble et lui-même ; `same` entre deux ensembles différents : null ; un nom inconnu : null. `params.spec.ts` : les défauts, chaque champ écrit. Refus, un test par ligne, sur un exercice lu d'un fichier :

| Écrit                                                                   | Raison                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `params.learning: 3`                                                    | `params.learning must be an object`                                                                  |
| `params.learning.presentAtOnce: 3`                                      | `params.learning.presentAtOnce must be true or false`                                                |
| `params.learning.enter: 3`, `enter: {}`, `enter.acquired: { skill: 3 }` | `params.learning.enter must be { acquired: { skill, item } }`                                        |
| `enter` sur un exercice dont la capacité n'a pas de mémoire             | `params.learning.enter needs a skill with cards`                                                     |
| `enter.acquired.skill` qu'aucun fichier lu jusque-là ne définit         | `params.learning.enter names skill "x", which no file read so far defines`                           |
| `enter.acquired.skill` sans mémoire                                     | `params.learning.enter names skill "x", which has no cards`                                          |
| `enter.acquired.item: "nope"`                                           | `params.learning.enter.acquired.item "nope" is no correspondence from placed-note to note-on-string` |
| `params.learning.draw: 3`                                               | `params.learning.draw must be a string`                                                              |
| `params.learning.draw: "nope"`                                          | `params.learning.draw "nope" is no draw of voicing-on-strings`                                       |

Une clé de `params.learning` qu'aucune pièce ne lit passe, comme tout paramètre.

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; le catalogue se charge toujours sans refus.
- [ ] **Step 5: Commit** — `feat: read an entry condition and a draw from an exercise's learning`

### Task 2: Les listes du catalogue

**Files:**

- Create: `src/lib/testing/catalogItems.spec.ts`
- Modify: `catalog/notes.json`, `catalog/chords.json`, `src/lib/testing/__snapshots__/catalogFrozen.spec.ts.snap`, `src/lib/application/definitions/checks.ts`, `checks.spec.ts`, `src/lib/testing/randomExercise.ts`

- [ ] **Step 1: Écrire les tests qui échouent.** `catalogItems.spec.ts`, tant que les générateurs existent :
  - `items` de `locate-note-string` égale `introductionOrder()` en clés de `note-on-string` (66) ;
  - `items` de `identify-note` : les mêmes places, dans le même ordre, en clés de `placed-note` (66) ;
  - `items` de `chord-anchor` et de `chord-zone` égalent `triadIntroductionOrder(triadParams(…), new Set())` en clés de voicing (144) ;
  - `identify-note` écrit `"learning": { "enter": { "acquired": { "skill": "locate-note-string", "item": "same-place" } } }` ;
  - `chord-zone` écrit `"learning": { "enter": { "acquired": { "skill": "chord-anchor", "item": "same" } }, "draw": "another-place", "presentAtOnce": false }` ; `chord-anchor` écrit `"learning": { "presentAtOnce": false }`.

  Et deux refus nouveaux, pour un exercice dont la capacité a des cartes :

| Écrit                     | Raison                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| pas d'`items`             | `an exercise that practises a skill with cards must list its items` |
| deux fois le même élément | `items[5] repeats items[1]`                                         |

Un exercice sans mémoire garde le droit de répéter un élément (une suite de formes) et de ne pas écrire de liste.

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Écrire les listes** avec un script lancé une fois et non commité (il imprime les quatre listes à partir des générateurs ; les coller dans les deux fichiers, à la suite des champs existants). Puis les deux refus. `randomExercise.ts` donne une liste à tout exercice de mémoire qu'il tire. L'instantané du catalogue est régénéré pour ces seuls champs (`items`, `params.learning`) : lire son diff ligne à ligne et citer son `git diff --stat` dans le rapport.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: write in the catalog the items its memory exercises introduce`

### Task 3: Le sujet construit des données

**Files:**

- Create: `src/lib/domain/learning/exerciseSubject.ts`, `exerciseSubject.spec.ts`
- Modify: `src/lib/domain/learning/subject.ts`, `procedure.ts`, `index.ts`, `src/lib/domain/progress/order.ts`, leurs specs

**Interfaces:**

```ts
// domain/learning/exerciseSubject.ts
/**
 * The learning subject of a session's memory exercises, read from their data. `exercises` in the
 * order they introduce: the first with a ready item does. Throws when two practise one skill.
 */
export function exerciseSubject(input: {
	exercises: readonly ExerciseDefinition[];
	/** Stored attempts: the item last asked of each card, for a draw. */
	attempts: readonly Attempt[];
}): LearningSubject;
```

- `LearningSubject` perd `neighbours` et `prefers`. La procédure tient elle-même « jamais la même carte deux fois de suite » (`allowedAfter` compare les clés de carte) ; `order.ts` perd le miroir et la préférence.
- `owns(card)` : la capacité est celle d'un des exercices **et** la clé de l'élément est dans sa liste (D1).
- `nextNew` : pour chaque exercice dans l'ordre, le premier élément de sa liste sans carte, non bloqué, dont la condition d'entrée est remplie (`isAcquired` de la carte que la correspondance désigne, lue dans tout le magasin) ; sinon l'exercice suivant.
- `presentsAtOnce` : faux dès qu'un exercice de la séance écrit `presentAtOnce: false`.
- `confused` : `attempt.data?.confusion != null`. `fadingAid(skill)` : la présentation de l'exercice écrit `fading`.
- `promptItem` : le tirage de l'exercice, avec l'élément de la dernière tentative de cette carte (puis celui du dernier tirage de la séance).

- [ ] **Step 1: Écrire les tests qui échouent** — sur des exercices écrits dans le test (deux capacités de test, `registerTestSkills`) : l'ordre de la liste ; un élément bloqué laisse passer le suivant ; la condition d'entrée fermée puis ouverte ; Review Focus 3, 4, 5 ; `presentsAtOnce` ; `confused` ; `fadingAid` ; le tirage reçoit le dernier élément demandé. `procedure.*.spec.ts` : jamais la même carte deux fois de suite, sans miroir ni préférence.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** `neckSubject` et `triadSubject` restent jusqu'à la Task 4 ; leurs `neighbours` et `prefers` tombent ici.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: build the learning subject from the exercises' data`

### Task 4: Les séances sur le sujet des données, et la fin de l'ancien code

**Files:**

- Modify: `src/lib/application/services/createAppServices.ts`, `src/lib/domain/progress/plans.ts`, `src/lib/testing/{randomExercise,triadsSeries,notesSeries}.ts`, les specs de séries (`series/triadsSession.spec.ts`, celles des notes), `src/lib/domain/progress/index.ts`, `src/lib/domain/triads/index.ts`, `src/lib/domain/music/index.ts`
- Delete: `src/lib/domain/progress/neckSubject.ts`, `introduction.ts`, `src/lib/domain/triads/triadSubject.ts`, `introduction.ts`, `notes.ts`, `src/lib/domain/music/mirror.ts`, leurs specs, `src/lib/testing/catalogItems.spec.ts`

- La séance des notes : `exerciseSubject({ exercises: [identify, locate], attempts })` (D6). Les séances d'accords : `[anchor]` ou `[zone]`, avec les cartes et tentatives des deux capacités dans le magasin.
- `triadParams`, `triadVoicings`, `stringSets` et `qualities` des deux exercices d'accords : supprimés si plus rien ne les lit (D9) ; `randomExercise.ts` lit la liste du catalogue.

- [ ] **Step 1: Écrire les tests qui échouent** — une séance des notes de bout en bout sur une base de joueur en cours (cartes dues, en apprentissage, acquises) : Review Focus 1 ; une note dont le miroir est fragile est introduite à son tour ; les triades ne changent plus l'ordre des notes. `triadsSession.spec.ts` garde ses règles (sonde, présentation au tour suivant, jamais deux fois le même voicing, la zone ne demande que l'acquis de l'ancre, une autre forme que la dernière). Un test de frontière : `src/lib/domain/learning/` et `application/` ne nomment plus `neckSubject` ni `triadSubject` ; `grep -rn "isMirrorPair\|mirrorItems\|triadNotesToLearn\|introductionOrder\|MARKER_FRETS" src` est vide.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter et supprimer.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `refactor: play the notes and the chords on the subject built from data`

### Task 5: Les cartes que plus rien ne lit

**Files:**

- Modify: `src/lib/infrastructure/storage/validateBackup.ts`, `validateBackup.spec.ts`, `src/lib/application/services/orphanProgress.spec.ts`

- [ ] **Step 1: Écrire les tests qui échouent** — une sauvegarde 9 avec une carte d'une capacité de mémoire enregistrée dont la clé ne se lit pas par son ensemble : acceptée, gardée telle quelle (D10) ; une carte mal formée en elle-même reste refusée. Une base avec une telle carte et une carte hors liste : `homeStats`, `neckMap`, le bilan et une séance de chaque sorte tiennent, la carte n'est ni servie ni comptée due.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `fix: keep and ignore a card no list names`

### Task 6: Les docs

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- [ ] **Step 1:** `docs/fichiers-de-definitions.md` : la liste d'un exercice de mémoire, `params.learning` (`enter`, `presentAtOnce`, `draw` avec la mention « provisoire »), les correspondances, les refus.
- [ ] **Step 2:** `CLAUDE.md` : les phrases devenues fausses (« Sessions », « Skills, item sets and exercises », la règle du miroir, `neckSubject`, `triadSubject`).
- [ ] **Step 3:** la spec : « Réalisation (plan 3) » — D1 à D10 une ligne chacune, ce que l'exécution a décidé en plus, ce qui est laissé aux plans 4 et 5.
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `docs: say how a memory exercise writes what it introduces`

### Étape jouable

- [ ] Dans l'aperçu, sur la base de l'aperçu (joueur en cours) : une séance des notes et une séance de triades au-delà de la première respiration, micro simulé, sans erreur de console ; l'accueil, la carte et le bilan tiennent.
