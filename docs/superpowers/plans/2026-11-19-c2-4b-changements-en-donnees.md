# Chantier 2, plan 4b : les changements en données, le moteur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les quatre exercices des changements (`inversion-run`, `grid-in-direction`, `grid-in-zone`, `grid-reading`) écrivent en données ce qu'ils jouent et ce qu'ils acceptent : leurs passages, leurs paramètres de passage, leur ouverture, le contenu de chaque changement. Une source générique de passages remplace `gestureSelector`, et le juge « membre d'une famille » remplace `chord-grid`. `GestureRule` disparaît.

**Architecture:**

- **Un passage** est la suite des membres d'une famille pour un index que l'exercice liste (`passages`). Chaque membre est l'élément d'un tour.
- **Les paramètres de passage** (`each`) prennent la valeur suivante de leur liste à chaque passage du même index. Leur dernière valeur se relit dans les tentatives.
- **Le contexte** : la source tient les membres entendus dans le passage ; le compilateur du tour reçoit le dernier comme « précédent ». Le juge reste pur.
- **L'ouverture** d'un index est un prédicat sur les cartes acquises, écrit dans `passages.opens`.
- **Les écrans ne changent pas dans ce plan** : `grid-scroll` et `link-lane` gardent leurs modèles, que leur présentateur construit maintenant à partir du passage et de ses paramètres, plus de la règle. Le modèle générique, le renommage « Geste » → « Changements » et le bilan sont le plan 4c.

**Tech Stack:** TypeScript, Svelte 5, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 7 ; § 6 pour le contexte ; « Réalisation (plan 4a) », « Laissé au plan 4b »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Ce qui change pour le joueur est ce que la spec a décidé (§ 7, « Les règles autour du passage »), et rien d'autre** :
  - un passage n'est plus aidé « la première fois et après un passage raté », ni le lien « après 2 ratés dans un tour » : chaque exercice écrit un niveau d'aide sous son niveau 1, qui dessine les formes admises, et `flow.antiBlocking` ; trois ratés de suite au niveau 1 y font descendre ;
  - un tour de lien raté n'est plus rejoué aussitôt, enchaîné, sans sa forme la plus grave : il revient entier, après une mesure comptée ;
  - les zones de `grid-in-zone` sont une liste écrite.
    Tout le reste est identique : ce qu'un changement accepte, ses confusions, les candidats du capteur d'accords, l'enchaînement des tours d'un passage, la mesure de silence du lien, le sens qui alterne et qui tourne au bout du manche, l'index joué le moins récemment, l'ouverture par index, le seuil de réussite d'un passage, les niveaux de tempo par grille.
- **Avant de supprimer l'ancien juge, une comparaison exhaustive** de l'ancien et du nouveau sur tous les changements du catalogue (comme au plan 4a) : jugement, confusion, candidats du capteur. Une différence ne s'accepte pas dans une tâche : elle remonte.
- **Rien de stocké ne change de forme** : base 13, sauvegarde 9. Une tentative garde sa clé (`<grille>#<rang>` ; pour le lien, le voicing placé). Les données d'une nouvelle tentative portent le passage (D7) ; celles d'avant restent telles quelles.
- **Le cœur ne nomme ni famille, ni ensemble, ni exercice, ni instrument** (tests de frontière existants, étendus à la source de passages).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.** Chaque contrôle est borné avant le travail qu'il borne.
- **Instantanés** : celui du catalogue change dans la Task 5 pour les quatre exercices des changements ; celui des plans du rythme ne change pas.
- **Rien de privé dans le dépôt.**
- **Vocabulaire** : « passage » / `passage` ; « index » / `index` ; « paramètre de passage » / `each` ; « changement » / `change` ; « ouverture » / `opens` ; « précédent » / `previous` ; « entendu » / `heard`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                                                                                                | Sorte                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| le passage, ses index, ses paramètres qui tournent, l'index joué le moins récemment, un passage injouable sauté, le contexte des membres entendus    | primitive du cœur                                |
| la famille `grid-changes` ; `chord-shapes` sur une zone de cordes ; les confusions d'une forme refusée par un filtre                                 | primitive enregistrée (la musique, l'instrument) |
| `passages` (`of`, `members`, `each`, `opens`, `again`, `restBars`, `passes`), le contenu de chaque changement, le niveau d'aide, `flow.antiBlocking` | donnée de l'exercice                             |
| les deux modèles d'écran `GridStageModel` et `LinkLaneModel`, construits par leur présentateur                                                       | exception, remplacée au plan 4c                  |
| les données des tentatives de changements d'avant ce plan, que la source ne relit pas                                                                | exception assumée (D8)                           |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — `passages` s'écrit comme au § 7** : `{ "of", "members", "each", "opens" }`, plus `again`, `restBars` et `passes` (D5, D6).
- **D2 — Les index d'un exercice sont le produit des listes de `of`.** `"of": { "grid": ["iohefy-a", "blues-f"], "strings": [[3, 2, 1], [4, 3, 2]] }` donne quatre index. Une valeur qui ne multiplie pas les index s'écrit dans `params` (la zone de cordes de `grid-in-zone` et de `grid-reading` : `"strings": [4, 3, 2, 1]`).
- **D3 — Une zone de cordes est une liste de cordes voisines** ; les formes de `chord-shapes` sont celles de chaque groupe de trois cordes voisines de la zone. `[4, 3, 2, 1]` donne les groupes 4-3-2 et 3-2-1.
- **D4 — Le lien liste ses accords** : `"of": { "chord": ["C", "Cm", "C#", "C#m", "D", …], "strings": […] }`, les vingt-quatre symboles d'aujourd'hui, écrits une fois par un script.
- **D5 — Un passage raté revient quand l'exercice l'écrit** : `"again": "until-passed"`. Seul `inversion-run` l'écrit. La spec dit « un passage raté revient, après une mesure comptée » dans la ligne du lien ; je ne l'étends pas aux grilles, où un blues raté reviendrait en boucle.
- **D6 — `passes` est la part de changements justes qui fait réussir un passage** (0,9 dans le catalogue) ; `restBars`, les mesures de silence avant la mesure comptée d'un nouvel index (1 pour le lien).
- **D7 — Les zones de `grid-in-zone` sont les treize zones de cinq cases d'aujourd'hui, dans l'ordre d'aujourd'hui** : `[1, 5], [6, 10], [11, 15], [3, 7], [8, 12], [13, 17], [5, 9], [10, 14], [2, 6], [7, 11], [12, 16], [4, 8], [9, 13]`.
- **D8 — Une nouvelle tentative de changement range son passage dans ses données** (`data.passage` : son identité, son index, son rang, les valeurs de ses paramètres). La source ne relit pas les tentatives de changements d'avant ce plan : au premier lancement, chaque index repart « jamais joué », le sens de la montée repart vers le haut, la zone de la première. Les niveaux de tempo, eux, sont gardés.
- **D9 — Le sens qui tourne se garde pour le reste du passage** : quand le filtre « au-delà du précédent » tourne, la source change le paramètre de passage qu'il lit, pour les changements qui restent.
- **D10 — L'ouverture d'un index s'écrit** `"opens": { "acquired": { "skill": "chord-anchor", "item": "voicing", "need": "every-group" } }` : pour chaque changement du passage, les formes que son contenu admet sans filtre sont regroupées par leurs cordes ; l'index est ouvert quand, pour chaque changement, les voicings de chaque groupe (`every-group`) ou d'un groupe au moins (`one-group`) sont acquis dans la capacité nommée. `item` nomme la correspondance d'une forme vers l'élément de cette capacité.
- **D11 — Le filtre `toward` lit un paramètre** (`"toward": { "param": "direction" }`), et un paramètre de passage se lit comme un paramètre de l'exercice. La zone de cases s'écrit `{ "in": { "frets": { "param": "zone" } } }` ; l'écriture `{ "in": { "param": "zone" } }` du § 7 n'est pas ouverte.
- **D12 — À un niveau d'aide, les deux vues dessinent l'aide qu'elles dessinent aujourd'hui** (la forme à jouer ; pour le lien, les notes des formes sur le manche). Le niveau l'écrit : `"shapes": true`.

## Review Focus

1. **Un changement accepté hier et refusé aujourd'hui, ou l'inverse** : pour chaque changement de chaque passage du catalogue, dans chaque contexte (aucun précédent, chaque forme précédente possible, chaque sens, chaque zone), le nouveau juge rend le même verdict et la même confusion que l'ancien (Task 5).
2. **Un passage qui ne peut pas se jouer** (une zone où un accord n'a aucune forme, une grille dont un symbole n'a pas de triade) : sauté, sans erreur ; si tous le sont, l'exercice n'a rien à jouer et la séance passe au suivant (Task 3).
3. **Le joueur qui reprend après ce plan** : ses niveaux de tempo par grille sont là ; la rotation repart (D8) ; une séance démarre (Task 3).
4. **Trois ratés de suite au niveau 1** : le niveau d'aide arrive au passage suivant, annoncé, la forme dessinée ; trois réussites le font remonter (Task 6).
5. **Un fichier importé qui écrit `passages`** avec une famille, un index, un paramètre ou une ouverture que rien ne lit, ou des listes énormes : refusé au chargement avec le champ nommé, ou borné (Task 2).

## File Structure

| Fichier                                         | Rôle                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/domain/families/music/gridChanges.ts`  | la famille `grid-changes`                                                                                                                                                                        |
| `src/lib/domain/families/guitar/chordShapes.ts` | modifié : une zone de cordes, les confusions d'une forme refusée                                                                                                                                 |
| `src/lib/domain/families/core/select.ts`        | modifié : dire pourquoi un membre est refusé, et si le sens a tourné                                                                                                                             |
| `src/lib/domain/exercise/passage/`              | `types.ts`, `validate.ts`, `indices.ts`, `opens.ts` : le passage écrit en données                                                                                                                |
| `src/lib/domain/session/passageSource.ts`       | la source de passages                                                                                                                                                                            |
| `catalog/changes.json`                          | les quatre exercices                                                                                                                                                                             |
| supprimés                                       | `src/lib/domain/progress/gestureSelector.ts`, `src/lib/domain/gesture/{exercises,opening,passages}.ts`, `src/lib/domain/sets/gridClassify.ts`, le juge `chord-grid`, la dérivation `grid-change` |

---

### Task 1: Les familles des changements

**Files:**

- Create: `src/lib/domain/families/music/gridChanges.ts`, `gridChanges.spec.ts`
- Modify: `src/lib/domain/families/core/types.ts`, `core/select.ts`, `core/select.spec.ts`, `src/lib/domain/families/guitar/chordShapes.ts`, `chordShapes.spec.ts`, `guitar/derivations.ts`, `src/lib/domain/families/index.ts`, `index.spec.ts`, `src/lib/domain/sets/correspondences.ts`

**Interfaces:**

```ts
// families/core/select.ts
export interface Selected<M extends Member> {
	admitted: M[];
	/** A `position` filter with `turns` found nothing beyond and turned. */
	turned: boolean;
}
/** `admitted`, and whether the direction turned. */
export function select<M extends Member>(family, index, selection, context?): Selected<M>;
/** Why a member of the index is not admitted: the first filter that leaves it out, in the core's order; null when it is admitted. */
export function refusedBy<M extends Member>(family, index, selection, member: M, context?): Filter | null;

// families/core/types.ts — Family.confusion gains what refused the member heard
confusion(index: I, admitted: readonly M[], payload: unknown, refused?: Filter | null): unknown;
```

- `chord-shapes` : l'index devient `{ chord, strings, degrees?, frets? }`. `strings` est une zone de cordes voisines, de trois cordes ou plus ; sans `degrees`, les membres sont les formes de chaque renversement sur chaque groupe de trois cordes voisines, de la plus grave position à la plus aiguë (l'ordre de `triadShapes` aujourd'hui, `src/lib/domain/sets/chordGrid.ts`). Avec `degrees` et `frets` : la forme placée, seule.
- Ses confusions, pour un index sans `degrees`, sont celles de `classifyGridChord` (`src/lib/domain/sets/gridClassify.ts`), dans son ordre : `none`, `other-chord`, `other-quality`, `other-set` (la forme entendue n'est sur aucun groupe de la zone), puis selon le filtre qui la refuse : `in` → `out-of-zone` ; `position` → `not-higher` ou `not-lower` selon son sens. Pour une forme placée : `other-shape`.
- `grid-changes` (musique, pas guitare) : index `{ grid }` (l'identifiant d'une grille du registre) ; membres : ses changements dans l'ordre (`gridChanges`), `{ id: "<grille>#<rang>", rank, at, length, symbol }` ; attributs `rank`, `at`, `length`. Une grille inconnue : aucun membre, `indexProblem` le dit.
- Dérivations d'index : `change-chord` (défaut de `chord-shapes` pour l'ensemble `change`) : la triade du symbole du changement (`triadOf`) sur la zone de cordes du passage ; `placed` (défaut de `chord-shapes` pour `placed-voicing`) : la forme placée. Une dérivation reçoit, en plus de l'élément, les valeurs de l'index du passage et les paramètres (`index(item, { of, params })`).
- Correspondance `voicing` : d'une forme de `chord-shapes` (`placed-voicing`) vers son voicing (`voicing-on-strings`).

- [ ] **Step 1: Écrire les tests qui échouent.** `select` : `turned` vrai seulement quand un filtre `position` à `turns` a tourné ; `refusedBy` rend le premier filtre qui écarte, dans l'ordre du cœur, pour chaque filtre. `chordShapes.spec.ts` : une zone `[4, 3, 2, 1]` donne les formes des groupes 4-3-2 et 3-2-1, dans l'ordre de `triadShapes` (comparé à lui sur les accords des deux grilles) ; chaque confusion de `classifyGridChord`, comparée à lui pour les quatre règles sur un échantillon ; la forme placée. `gridChanges.spec.ts` : les changements des deux grilles, leurs rangs et longueurs ; une grille inconnue. Les dérivations et la correspondance.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** `classifyGridChord` et `triadShapes` ne sont pas touchés dans cette tâche.
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; les trois exercices de mémoire inchangés (`catalogMembers.spec.ts` vert sans retouche).
- [ ] **Step 5: Commit** — `feat: give the changes their families`

### Task 2: Le passage écrit en données

**Files:**

- Create: `src/lib/domain/exercise/passage/types.ts`, `validate.ts`, `validate.spec.ts`, `indices.ts`, `indices.spec.ts`, `boundaries.spec.ts`
- Modify: `src/lib/domain/exercise/types.ts`, `fromJson.ts`, `src/lib/domain/exercise/selection/` (`toward` lit un paramètre ; les paramètres de passage sont des paramètres), `src/lib/application/definitions/checks.ts`, leurs specs, `src/lib/composition/definitionLimits.spec.ts`

**Interfaces:**

```ts
// exercise/passage/types.ts
export interface PassagesTemplate {
	/** By name, the values an index takes: the indices are their product. */
	of: Readonly<Record<string, readonly unknown[]>>;
	/** The members of a passage, in order: each is the item of a round. */
	members: SelectionTemplate & { andBack?: boolean };
	/** Passage params: each takes the next value of its list at every passage of one index. */
	each?: Readonly<Record<string, readonly unknown[]>>;
	opens?: { acquired: { skill: SkillId; item: string; need?: 'every-group' | 'one-group' } };
	again?: 'until-passed';
	restBars?: number;
	/** Share of right changes that makes a passage pass; 1 by default. */
	passes?: number;
}
/** One index of an exercise: its values, and a stable key (`grid=iohefy-a;strings=3,2,1`). */
export interface PassageIndex {
	key: string;
	of: Readonly<Record<string, unknown>>;
}

// exercise/passage/indices.ts
export function passageIndices(definition: ExerciseDefinition): PassageIndex[];
/** The members of a passage of this index (`andBack`: then back down without the last twice). */
export function passageMembers(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Readonly<Record<string, unknown>>
): Member[];
```

- `ExerciseDefinition.passages?: PassagesTemplate`. Un exercice écrit `passages` ou `items`, pas les deux.
- Limites, vérifiées avant le travail : `MAX_PASSAGE_INDICES = 500` (le produit de `of`), `MAX_PASSAGE_EACH = 64` valeurs par paramètre, `MAX_PASSAGE_MEMBERS = 256` membres par passage.
- Refus, un test par ligne (préfixe `passages`) :

| Écrit                                                                                                | Raison                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `passages` et `items`                                                                                | `an exercise writes passages or items, not both`                                                |
| `of` vide, ou une valeur qui n'est pas une liste non vide                                            | `passages.of.<nom> must be a list, not empty`                                                   |
| le produit dépasse la limite                                                                         | `passages.of gives 1200 indices, more than 500`                                                 |
| `members` refusé par le module des choix                                                             | `passages.members.<champ> …` (sa raison)                                                        |
| la famille de `members` ne donne pas des éléments de l'ensemble de la capacité                       | `passages.members names family "note-places", whose members are no items of change`             |
| l'index de la famille ne se lit pas d'un index du passage                                            | `passages.of gives no index of grid-changes: <raison de la famille>` (vérifié sur chaque index) |
| `each.<nom>` pas une liste non vide, ou trop longue                                                  | `passages.each.<nom> must be a list, not empty` / `… has 100 values, more than 64`              |
| un paramètre de passage du même nom qu'un paramètre de l'exercice                                    | `passages.each.direction is also written in params`                                             |
| `opens` mal formé ; capacité inconnue ou sans cartes ; correspondance inconnue                       | comme `params.learning.enter` (plan 3), préfixe `passages.opens`                                |
| `again` autre que `until-passed` ; `restBars` pas un entier positif ou nul ; `passes` hors de ]0, 1] | `passages.<clé> must be …`                                                                      |
| une clé inconnue                                                                                     | `passages has an unknown key "x"`                                                               |
| un passage du catalogue de plus de 256 membres                                                       | `passages.members gives 300 members for index <clé>, more than 256`                             |

- Un paramètre de passage se lit `{ "param": "<nom>" }` dans le tour et dans `passages.members` : le contrôle par niveau des paramètres le prend dans chacune de ses valeurs. `toward` accepte `"up"`, `"down"` ou `{ "param" }`.

- [ ] **Step 1: Écrire les tests qui échouent** — les refus ; `passageIndices` sur les quatre écritures de la Task 5 (24 × 2 = 48 index pour le lien, 4, 2 et 2) ; `passageMembers` : les changements d'une grille ; pour un accord sur un groupe, les 4 premières formes par position puis le retour sans rejouer la plus haute (égal à `linkShapes(chord, set)` pour les 48 index) ; les limites, dans le budget de `definitionLimits.spec.ts`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Rien ne joue encore un passage.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: read the passages an exercise writes`

### Task 3: La source de passages

**Files:**

- Create: `src/lib/domain/session/passageSource.ts`, `passageSource.spec.ts`, `src/lib/domain/exercise/passage/opens.ts`, `opens.spec.ts`
- Modify: `src/lib/domain/types.ts` (`PlannedItem.passage`), `src/lib/domain/exercise/round/compile.ts` (le précédent, les paramètres de passage), `src/lib/domain/session/boundaries.spec.ts` (ou celui du dossier)

**Interfaces:**

```ts
// domain/types.ts — PlannedItem gains:
passage?: {
	/** This passage in the series. */
	id: string;
	/** Its index's key and values. */
	index: string;
	of: Readonly<Record<string, unknown>>;
	/** Its rank in the passage, and the passage's length. */
	rank: number;
	length: number;
	/** The values of the passage params, as this round reads them. */
	each: Readonly<Record<string, unknown>>;
	/** The identity of the last member heard in the passage; null before any. */
	previous: string | null;
};

// domain/session/passageSource.ts
/**
 * Serves the passages of exercises that write `passages`: the exercises in turn, each on its open
 * index played least recently (the order written on a tie), a round per member of the passage.
 */
export function createPassageSource(input: {
	exercises: readonly ExerciseDefinition[];
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
	durationMs: number;
}): ItemSource;

// exercise/passage/opens.ts
export function indexOpen(definition: ExerciseDefinition, index: PassageIndex, acquired: ReadonlySet<CardKey>): boolean;
```

- La source : à chaque passage, l'exercice suivant de la liste qui a un index ouvert ; son index joué le moins récemment ; les paramètres `each` à leur valeur suivante pour cet index (la dernière se relit dans `Attempt.data.passage.each` des tentatives de cet index, puis dans la séance) ; un passage sans membre, ou dont un tour n'admet aucun membre, est sauté (au plus un tour de la liste des valeurs, puis l'index est laissé pour cette séance). Le premier tour d'un passage porte `countIn` ; avec `restBars`, quand l'index change après un passage de la séance. `scope` : la valeur `grid` de l'index quand il en a une (les niveaux de tempo par grille d'aujourd'hui) — écrit `"scope": "grid"` dans `passages` si la clé générique est préférable ; à trancher dans la tâche et à dire dans le rapport.
- `record` : la source garde l'identité du membre entendu (`family.recognise` sur la réponse de la tentative, quel que soit le verdict, comme `previous` aujourd'hui) ; au changement suivant du même passage elle le donne comme `previous`. Quand `select(...)` du contenu du tour dit `turned`, elle change le paramètre que `toward` lit, pour le reste du passage (D9).
- `again: "until-passed"` : un passage dont la part de réussites est sous `passes` revient sur le même index, entier, avec sa mesure comptée, avant de passer à l'exercice suivant.
- La séance s'arrête comme aujourd'hui : aucun passage ne commence après `durationMs` ni une fois fatigué.
- `compileRound` : les valeurs de `item.passage.each` s'ajoutent aux paramètres résolus ; `item.passage.previous` devient le `previous` du contenu (`MemberContent.previous`, rangé comme une identité et résolu par `Family.member` dans le juge) ; les dérivations d'index reçoivent `item.passage.of`.
- Une nouvelle tentative range `passage` (identité, index, rang, `each`) dans ses données ; c'est le présentateur de la Task 5 qui écrit `attemptData` : cette tâche pose le type et le lit.

- [ ] **Step 1: Écrire les tests qui échouent** — sur des exercices écrits dans le test (une famille de test enregistrée par le test, ou les grilles publiques) : l'alternance des exercices ; l'index le moins récemment joué, l'ordre écrit à égalité ; les paramètres qui tournent par index et se relisent dans les tentatives ; `again` ; `restBars` ; un passage injouable sauté, tous injouables (Review Focus 2) ; le précédent donné au tour suivant et remis à zéro au passage suivant ; le sens qui tourne pour le reste du passage ; la fin de séance ; des tentatives d'avant ce plan dans le magasin : ignorées, la séance démarre (Review Focus 3). `opens.spec.ts` : `every-group`, `one-group`, sur des cartes acquises ou non.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** `gestureSelector` reste branché jusqu'à la Task 5.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: serve the passages an exercise writes`

### Task 4: La comparaison, avant la bascule

**Files:**

- Create: `src/lib/testing/catalogChanges.spec.ts`

- [ ] **Step 1: Écrire la comparaison** (Review Focus 1), pendant que `gestureSelector`, `classifyGridChord` et `gridExpectation` existent, sur les quatre exercices réécrits en mémoire comme la Task 5 les écrira :
  - **les passages** : pour chaque élément de `gestureElements` de chaque exercice, l'index correspondant de `passageIndices` existe (48, 4, 2, 2), et ses membres sont les changements ou les formes que `gestureSelector` sert (mêmes clés d'élément, même ordre) ;
  - **le jugement** : pour chaque changement de chaque passage, chaque précédent possible (aucun, et chaque forme de l'accord d'avant sur la zone), chaque valeur de `direction` et de `zone`, et pour charge utile l'identité de chaque forme de l'accord demandé sur les six cordes, de son autre qualité, d'un autre accord, `null` et une chaîne illisible : `correct` et `confusion` égaux à ceux de `classifyGridChord` ; la direction qui tourne égale à `climbDirection` ;
  - **le capteur d'accords** : les attendus et candidats de `gridExpectation(item, opensAt)`, égaux à ceux que le présentateur de la Task 5 donnera (le test compare ici les membres admis à `admittedShapes(item)`, dans l'ordre) ;
  - **l'ouverture** : pour un jeu de cartes acquises tiré au hasard (graine fixe, 200 tirages), `indexOpen` égal à `isOpen` de `domain/gesture/opening.ts` pour chaque index.
- [ ] **Step 2: Lancer.** Le rapport dit combien de cas ont été comparés et liste chaque différence, avec le plus petit exemple. **Une différence arrête la tâche** : elle remonte, elle ne se corrige pas en silence.
- [ ] **Step 3: Commit** — `test: compare the changes judged as members with the rules they replace`

### Task 5: Les quatre exercices en données, et la fin de la règle

**Files:**

- Modify: `catalog/changes.json`, l'instantané du catalogue, `src/lib/application/sets/chordGrid.ts`, `chordGridMessages.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/domain/sets/` (`chordGrid.ts`, `change.ts`, `index.ts`), `src/lib/domain/judges/index.ts`, `src/lib/domain/derivations/index.ts`, `src/lib/domain/gesture/` (`summary.ts`, `index.ts`), `src/lib/testing/` (`gestureSeries.ts`, `randomExercise.ts`), `src/lib/ui/play/demo/demoGestureSeries.ts`, les specs touchées
- Delete: `src/lib/domain/progress/gestureSelector.ts`, `src/lib/domain/gesture/{exercises,opening,passages}.ts`, `src/lib/domain/sets/gridClassify.ts`, leurs specs

Ce que le catalogue écrit (les tours gardent leur gabarit ; `content` et `passages` changent ; `params.rule`, `stringSets`, `qualities`, `grids` partent) :

| Exercice            | `passages.of`               | `members`                                                                         | `each`                         | `opens`                       | contenu d'un changement                                                                                    |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `inversion-run`     | `chord` (24), `strings` (2) | `{ "family": "chord-shapes", "order": ["position"], "take": 4, "andBack": true }` | —                              | `chord-anchor`, `every-group` | `{ "family": "chord-shapes" }`                                                                             |
| `grid-in-direction` | `grid` (2), `strings` (2)   | `{ "family": "grid-changes" }`                                                    | `direction: ["up", "down"]`    | `chord-anchor`, `every-group` | `… "where": [{ "position": { "beyond": "previous", "toward": { "param": "direction" }, "turns": true } }]` |
| `grid-in-zone`      | `grid` (2)                  | `{ "family": "grid-changes" }`                                                    | `zone` : les treize zones (D7) | `chord-zone`, `every-group`   | `… "where": [{ "in": { "frets": { "param": "zone" } } }]`                                                  |
| `grid-reading`      | `grid` (2)                  | `{ "family": "grid-changes" }`                                                    | —                              | `chord-anchor`, `one-group`   | `{ "family": "chord-shapes" }`                                                                             |

`inversion-run` écrit aussi `"again": "until-passed"`, `"restBars": 1` ; les quatre, `"passes": 0.9`.

- Les séances de changements jouent `createPassageSource` (`createAppServices`). `AppServices.gesture().open` : un exercice des changements a un index ouvert.
- Le présentateur des deux vues (`application/sets/chordGrid.ts`) lit l'élément et `PlannedItem.passage` au lieu de `ChordGridItem` : sa consigne (`GridCue`) vient des paramètres de passage (un `direction` : la montée ; une `zone` : la zone ; un élément de `placed-voicing` : le lien ; sinon la lecture) ; les attendus du capteur sont les membres admis du contenu du tour, avec les sosies d'aujourd'hui ; après un raté, la forme attendue est l'admise la plus proche de l'entendue, sinon de celle qui sonne encore, sinon la plus grave (`expectedShape`). Les modèles `GridStageModel` et `LinkLaneModel` gardent leur forme : les deux vues et leurs specs ne changent pas.
- `Attempt.data` d'un changement : `{ item, passage, answer, confusion }` ; `item` est l'élément de l'ensemble (`{ grid, index }`, ou la forme placée).
- Supprimés : le juge `chord-grid`, la dérivation `grid-change`, `GestureRule`, `ChordGridItem`, `readGestureParams`, `gestureChangeSet` et le contrôle des paramètres des changements par vue (`definitionChecks`), `VIEW_PRESENTERS` s'il n'a plus lieu d'être (les deux présentateurs se trouvent par l'ensemble : `change`, `placed-voicing` ; à trancher dans la tâche et à dire). `domain/gesture/summary.ts` reste jusqu'au plan 4c, adapté pour lire `data.passage`.
- `catalogChanges.spec.ts` devient une table figée (comme `catalogMembers.spec.ts`) avant la suppression des anciennes fonctions.

- [ ] **Step 1: Écrire les tests qui échouent** — `series/gestureSession.spec.ts` (ou son équivalent) : une séance de changements de bout en bout sur le nouveau moteur — le lien (48 index, les 7 changements d'un tour, la mesure de silence, un tour raté qui revient entier après une mesure comptée), la montée (le sens alterne d'un passage à l'autre et tourne au bout du manche), la zone (la suite des zones), la lecture ; les niveaux de tempo par grille montent et descendent comme avant. Un test de frontière : `GestureRule`, `gestureSelector`, `classifyGridChord`, `readGestureParams` ne reviennent pas sous `src/lib` (hors migrations).
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Basculer, figer la comparaison, supprimer.** L'instantané du catalogue : son diff ligne à ligne, son `git diff --stat` dans le rapport.
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; les specs des deux vues inchangées.
- [ ] **Step 5: Commit** — `refactor: play the changes from the passages their exercises write`

### Task 6: L'aide par le niveau

**Files:**

- Modify: `catalog/changes.json`, l'instantané du catalogue, `src/lib/application/sets/chordGrid.ts`, ce qui décide l'anti-blocage (`src/lib/domain/session/policy.ts`) si un tour jugé à la réponse n'y descend pas déjà au niveau d'aide, leurs specs

- Chacun des quatre exercices écrit, sous son niveau 1, un niveau d'aide (`"aid": true`, `"params": { "tempo": 80, "shapes": true }`, mêmes seuils que le niveau 1) et `"flow": { "antiBlocking": true }`.
- À un niveau qui écrit `shapes: true`, le présentateur dessine l'aide d'aujourd'hui (D12) ; à tout autre niveau, rien. `PlannedItem.aid` n'est plus écrit par la source pour les changements ; une tentative jouée au niveau d'aide porte l'aide `'aid-level'`, comme pour le rythme.
- `LINK_AID_AFTER_MISSES` et l'aide « la première fois et après un passage raté » disparaissent.

- [ ] **Step 1: Écrire les tests qui échouent** — Review Focus 4, de bout en bout dans la série : trois ratés de suite au niveau 1 → le niveau d'aide au passage suivant, annoncé (`aid-level`), la forme dessinée dans le modèle ; les réussites qu'il demande le font remonter ; au premier passage d'un index, aucune aide.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: aid the changes through their aid level`

### Task 7: Les docs

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- [ ] **Step 1:** `docs/fichiers-de-definitions.md` : `passages` (chaque clé, avec les fragments du catalogue), la famille `grid-changes`, la zone de cordes de `chord-shapes`, `toward` lu d'un paramètre, les paramètres de passage, l'ouverture, les refus et les limites.
- [ ] **Step 2:** `CLAUDE.md` : les phrases devenues fausses (« Gesture track », « Skills, item sets and exercises », « Chord sensor », « Play views » pour ce qui touche la règle et l'aide).
- [ ] **Step 3:** la spec : « Réalisation (plan 4b) » — D1 à D12, ce que l'exécution a décidé en plus, ce qui est laissé au plan 4c (le modèle générique des deux vues, « Geste » → « Changements », le bilan, la fin de `domain/gesture/`) ; dans « Réalisation (plan 4a) », le sort de « Laissé au plan 4b ».
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `docs: say how an exercise writes its passages`

### Étape jouable

- [ ] Dans l'aperçu, micro simulé, sur une base où les triades de do, fa et sol sont acquises (cartes posées à la main) : une séance de changements au-delà du premier passage de chaque exercice ouvert, sans erreur de console ; la mesure de silence du lien, le sens de la montée, la zone affichée.
