# Chantier 2, plan 4a : les familles, les filtres, le juge « membre d'une famille » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ce qu'un tour accepte s'écrit comme un choix de membres dans une famille : la famille, des filtres, un ordre, une prise. Un seul juge de contenu, « membre d'une famille », remplace `note` et `chord-voicing`. Les trois exercices de mémoire joués sur la guitare (`locate-note-string`, `chord-anchor`, `chord-zone`) l'écrivent ainsi, et le tirage provisoire de `chord-zone` disparaît.

**Architecture:**

- **Une famille** est du code enregistré : pour un index, elle rend des membres. La guitare enregistre `note-places` (une note : ses cases) et `chord-shapes` (un accord sur des cordes : ses formes).
- **Un membre** se nomme par son identité (ses cordes, ses cases), jamais par un rang. Ses attributs (`strings`, `frets`, `position`, `pitch`) servent aux filtres et à l'ordre.
- **Trois opérations**, dans le cœur, sur n'importe quelle famille : restreindre (des filtres qui s'additionnent), ordonner (une liste d'attributs), prendre (tout, ou les premiers).
- **Une seule fonction pure** rend les membres admis ; elle sert au juge, au tirage d'un membre et aux candidats du capteur d'accords.
- Le plan 4b ajoutera la famille `grid-changes`, le passage et les changements en données sur ces mêmes pièces.

**Tech Stack:** TypeScript, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 6 ; § 7 pour l'écriture JSON d'un choix ; « Réalisation (plan 3) », « Laissé au plan 4 »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Ce que le joueur vit ne change pas** : mêmes consignes, mêmes réponses acceptées, mêmes verdicts, mêmes confusions, mêmes dessins après un raté, mêmes candidats pour le capteur d'accords. Les séries rejouées avec une graine (`series/*.spec.ts`) et les fixtures du capteur d'accords ne changent pas.
- **Rien de stocké ne change de forme** : base 13, sauvegarde 9 ; `Attempt.data` (élément, réponse, confusion) garde sa forme pour chaque capacité.
- **Le cœur ne nomme ni famille, ni ensemble, ni instrument** : les opérations et le juge lisent les registres ; `domain/families/core/` n'importe pas `domain/music`.
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.**
- **Instantanés** : celui du catalogue change dans la Task 4, pour les seuls champs `content` et `params.learning` des trois exercices ; celui des plans du rythme (`rhythmExercises.parity`) ne change pas d'un octet.
- **Rien de privé dans le dépôt.**
- **Vocabulaire** : « famille » / `family` ; « membre » / `member` ; « index » / `index` ; « attribut » / `attribute` ; « filtre » / `filter` ; « choix » / `selection` (une famille, ses filtres, son ordre, sa prise) ; « admis » / `admitted`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                                         | Sorte                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| restreindre, ordonner, prendre ; le juge « membre d'une famille » ; le tirage d'un membre     | primitive du cœur                                                         |
| une famille, ses attributs, comment elle reconnaît ce qu'un capteur a entendu, ses confusions | primitive enregistrée, de l'instrument                                    |
| ce qu'un élément d'un ensemble donne comme index d'une famille                                | primitive enregistrée, par ensemble                                       |
| le choix écrit dans `content`, et `params.learning.asks`                                      | donnée de l'exercice                                                      |
| la case que la consigne de `chord-zone` nomme, tirée parmi celles de la forme demandée        | exception, portée par l'ensemble `voicing-on-strings` (comme aujourd'hui) |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Un choix s'écrit comme au § 7 de la spec** : `{ "family": …, "of": …, "where": […], "order": […], "take": … }`. Seule `family` est obligatoire.
- **D2 — `of` nomme ce qui donne l'index** à partir de l'élément (un nom enregistré). Absent : l'index que l'ensemble de l'élément donne à cette famille. Deux noms entrent : l'élément lui-même, et `root` (la fondamentale d'un voicing, sur la corde qui la porte).
- **D3 — L'index de `note-places` est une note, avec ou sans corde** ; celui de `chord-shapes` est un accord sur des cordes, avec ou sans le degré de chaque corde. Un élément de `note-on-string` donne la note et sa corde ; un élément de `voicing-on-strings` donne l'accord, ses cordes et ses degrés : ses membres sont alors ses formes à chaque octave.
- **D4 — Les filtres s'écrivent ainsi** (un objet à une clé) :

| Filtre de la spec      | Écriture                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------- |
| dans une zone          | `{ "in": { "strings": […], "frets": [de, à] } }` (une des deux bornes suffit)       |
| à une case             | `{ "at": <case> }` : le membre couvre cette case                                    |
| au-delà du précédent   | `{ "position": { "beyond": "previous", "toward": "up" \| "down", "turns": true } }` |
| autre que le précédent | `{ "other": "previous" }`                                                           |

Une valeur est écrite, ou lue : `{ "param": "a.b" }` dans les paramètres résolus, `{ "item": "fret" }` sur l'élément. Un filtre dont la valeur lue est absente ne restreint rien (un élément de `chord-zone` sans case demandée accepte le voicing partout, comme aujourd'hui).

- **D5 — « Le précédent » est donné par qui appelle** : pour le tirage, le dernier membre demandé de cette carte ; pour un passage (plan 4b), le dernier membre entendu. Sans précédent, ces deux filtres ne restreignent rien.
- **D6 — Le tirage de `chord-zone` s'écrit `params.learning.asks`**, un choix : `{ "family": "chord-shapes", "where": [{ "other": "previous" }] }`. Un membre est tiré au hasard parmi les admis ; l'ensemble en fait l'élément demandé (sa position, et la case que la consigne nomme). `params.learning.draw` et le registre des tirages disparaissent.
- **D7 — Un membre se reconnaît à ce que le capteur rend** : pour une note, sa hauteur seule (le capteur n'entend pas la corde) ; pour une forme, l'identité que le capteur d'accords décide. C'est la famille qui le dit.
- **D8 — Les confusions restent celles d'aujourd'hui**, dites par la famille : pour une note, l'octave, le nom de la corde, l'écart en cases ; pour une forme, autre octave, autre renversement, autre accord, rien.
- **D9 — Les juges `note` et `chord-voicing`, et les dérivations `note-of-item`, `voicing-root`, `voicing-anywhere`, `voicing-at-position` sont supprimés.** `name`, `pitch` et `chord-grid` restent (ce dernier jusqu'au plan 4b).
- **D10 — Un plan de tour déjà stocké garde son ancien contenu** (`note`, `chord-voicing`) : il n'est pas réécrit et rien ne le rejuge.

## Review Focus

1. **Une réponse acceptée hier et refusée aujourd'hui, ou l'inverse** : pour chaque élément des trois listes du catalogue, les membres admis sont exactement ce que les anciens juges acceptaient (Task 4, un test exhaustif sur les 66 + 144 + 144 éléments).
2. **Une corde à vide, un voicing sans forme jouable dans les bornes du manche, une zone vide** : aucun membre admis ne fait pas planter le tour ; il est refusé au chargement quand c'est écrit, sinon jugé faux (Tasks 1, 2).
3. **Un filtre qui lit une valeur absente** (un élément sans case, un paramètre non écrit) : il ne restreint rien, ou l'exercice est refusé au chargement selon D4 (Task 2).
4. **Le hasard rejoué** : le tirage d'un membre appelle `random()` autant de fois et dans le même ordre que l'ancien tirage (Task 3).
5. **Un fichier importé qui nomme une famille, un filtre ou un attribut inconnus, ou une famille que l'ensemble de sa capacité n'indexe pas** : refusé au chargement, avec le nom (Task 2).

## File Structure

| Fichier                                      | Rôle                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/domain/families/core/`              | types, opérations, filtres, la fonction des membres admis ; ne nomme aucune famille     |
| `src/lib/domain/families/guitar/`            | `note-places`, `chord-shapes`, leurs attributs, reconnaissance et confusions            |
| `src/lib/domain/families/index.ts`           | les registres : familles, index par ensemble                                            |
| `src/lib/domain/judges/member.ts`            | le juge « membre d'une famille »                                                        |
| `src/lib/domain/exercise/round/`             | modifié : un `content` écrit comme un choix                                             |
| `src/lib/domain/learning/exerciseSubject.ts` | modifié : `asks` à la place de `draw`                                                   |
| supprimés                                    | `src/lib/domain/sets/draws.ts`, les juges `note` et `chord-voicing`, quatre dérivations |

---

### Task 1: Les familles et les trois opérations

**Files:**

- Create: `src/lib/domain/families/core/types.ts`, `core/select.ts`, `core/select.spec.ts`, `core/boundaries.spec.ts`, `src/lib/domain/families/guitar/notePlaces.ts`, `guitar/chordShapes.ts`, leurs specs, `src/lib/domain/families/index.ts`, `index.spec.ts`

**Interfaces:**

```ts
// families/core/types.ts
/** One member of a family: named by its identity, never by a rank. */
export interface Member {
	/** Stable identity (its strings and frets), unique in its family. */
	id: string;
}
export interface Family<I = unknown, M extends Member = Member> {
	id: string;
	/** Null when `index` is one this family reads; else why not. */
	indexProblem(index: unknown): string | null;
	/** Every member for this index, in a stable order. */
	members(index: I): M[];
	/** By name: what a filter or an order compares. A list for `strings` and `frets`. */
	attributes: Readonly<Record<string, (member: M) => number | readonly number[]>>;
	/** The admitted member a sensor's payload is, or null. */
	recognise(admitted: readonly M[], payload: unknown): M | null;
	/** How a payload that is no admitted member relates to them; null when nothing can be said. */
	confusion(index: I, admitted: readonly M[], payload: unknown): unknown;
}
export type Filter =
	| { in: { strings?: readonly number[]; frets?: readonly [number, number] } }
	| { at: number }
	| { position: { beyond: 'previous'; toward: 'up' | 'down'; turns?: boolean } }
	| { other: 'previous' };
/** A selection with every value resolved. */
export interface Selection {
	family: string;
	where?: readonly Filter[];
	order?: readonly string[];
	take?: number;
}
export interface SelectionContext {
	/** The member before: the last asked of the card, or the last heard in the passage. */
	previous?: Member | null;
}

// families/core/select.ts
/** The members a selection admits for an index: restricted, ordered, taken. Pure. */
export function admitted<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	context?: SelectionContext
): M[];
/** Null when the family can run this selection; else why not (an unknown attribute, a filter it has no attribute for). */
export function selectionProblem(family: Family, selection: Selection): string | null;

// families/index.ts
export const FAMILIES: Readonly<Record<string, Family>>;
export function familyNamed(id: string): Family | null;
/** What gives an index from an item: by name, the family it indexes and the sets it reads. */
export interface IndexDerivation {
	family: string;
	reads: readonly string[];
	index(item: unknown): unknown;
}
export const INDEX_DERIVATIONS: Readonly<Record<string, IndexDerivation>>; // 'note', 'voicing', 'root'
/** The derivation `name` (or, absent, the one set `set` gives family `family`); null when none. */
export function indexDerivation(family: string, set: string, name?: string): IndexDerivation | null;
```

- `note-places` : index `{ pitch, string? }` ; membres `{ id: "<string>:<fret>", string, fret, midi }`, cases 0 à la dernière case jouable, sur la corde donnée ou sur les six. `recognise` : la hauteur seule (`payload.midi`). `confusion` : celle de `classifyNoteConfusion` quand l'index porte une corde, sinon `null`.
- `chord-shapes` : index `{ chord, strings, degrees? }` (`chord` : fondamentale et qualité ; `strings` : des cordes voisines, de la plus grave à la plus aiguë) ; membres : les formes de l'accord sur ces cordes à chaque octave, de tous ses renversements, ou du seul voicing que `degrees` désigne ; `id` : celui de `occurrenceId` (`<voicingKey>@<frets>`). `recognise` : `payload.decided` égal à l'`id` d'un admis. `confusion` : celle de `classifyChord` (`src/lib/domain/sets/triadChord.ts`), dont le calcul vient ici.
- Attributs des deux : `strings`, `frets`, `position` (la case frettée la plus basse ; 0 pour une forme à vide), `pitch` (la note la plus grave, en MIDI).
- Filtres : `in` (toutes les notes du membre sont sur ces cordes et dans ces cases ; une corde à vide compte dans une zone qui commence à la case 1, comme `ZONE_FRETS` aujourd'hui) ; `at` (le membre couvre cette case : elle est entre sa case la plus basse et sa plus haute, une corde à vide comptant pour 0) ; `position.beyond` (plus haute, ou plus basse, que celle du précédent ; avec `turns`, quand plus rien n'est au-delà, le sens tourne) ; `other` (pas le précédent). Sans `previous`, les deux derniers ne restreignent rien.
- `order` : par les attributs nommés, dans l'ordre, croissant ; un attribut liste se compare par son plus petit élément. `take` : les n premiers.

- [ ] **Step 1: Écrire les tests qui échouent.**
  - `select.spec.ts`, sur une famille de test écrite dans le test (des membres à deux attributs) : chaque filtre seul ; deux filtres qui s'additionnent ; `beyond` vers le haut, vers le bas, au bout sans `turns` (rien) et avec (le sens tourne) ; `other` ; `order` sur deux attributs ; `take` ; aucun `previous` ; `selectionProblem` : attribut inconnu (`order names attribute "x", which family "t" does not have`), filtre `in` ou `at` sur une famille sans `strings`/`frets` (`filter "in" needs the attributes strings and frets, which family "t" does not have`).
  - `notePlaces.spec.ts` : pour les 66 éléments de `locate-note-string`, les MIDI des membres égalent `acceptableMidis(item)` ; sans corde, les membres couvrent les six cordes ; `recognise` par la hauteur ; les confusions de `classifyNoteConfusion` sur trois cas.
  - `chordShapes.spec.ts` : pour les 144 voicings de `chord-anchor`, les `id` des membres avec `degrees` égalent ceux de `voicingOccurrences(voicing)` ; sans `degrees`, ceux des trois renversements ; `recognise` ; les quatre confusions de `classifyChord` ; un accord sans forme jouable : aucun membre, pas d'erreur.
  - `core/boundaries.spec.ts` : aucun fichier de `families/core/` n'importe `domain/music`, `domain/sets`, `domain/triads` ni ne nomme `note-places` ou `chord-shapes`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Rien d'autre ne lit encore ces modules.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: select the members of a family by filters, an order and a take`

### Task 2: Un contenu écrit comme un choix, et son juge

**Files:**

- Create: `src/lib/domain/judges/member.ts`, `member.spec.ts`
- Modify: `src/lib/domain/judges/index.ts`, `src/lib/domain/exercise/round/` (`types.ts`, `compile.ts`, `validate.ts`, leurs specs), `src/lib/domain/derivations/index.ts` (les valeurs lues sur un élément), `src/lib/application/definitions/checks.spec.ts`

**Interfaces:**

```ts
// judges/member.ts
export const MEMBER_CONTENT = 'member';
/** The value of a member content: what the judge needs, resolved at compile time. */
export interface MemberContent {
	family: string;
	index: unknown;
	selection: Selection; // every value resolved
	/** The member before, when the selection reads one. */
	previous?: Member | null;
}

// exercise/round/types.ts — a content is a derivation, as today, or a selection:
export type ContentTemplate =
	| { from: string; pattern?: readonly number[] }
	| {
			family: string;
			of?: string;
			where?: readonly FilterTemplate[];
			order?: readonly string[];
			take?: Num;
	  };
```

- Dans un `FilterTemplate`, une valeur est écrite, `{ "param": "a.b" }` ou `{ "item": "<nom>" }`. Les valeurs lues sur un élément viennent d'un registre par nom, à côté de `ITEM_NUMBERS` : `string` (`note-on-string`), `fret` (`voicing-on-strings` ; absente quand l'élément n'en porte pas).
- `compileRound` résout le choix : l'index par `indexDerivation`, les valeurs des filtres ; un filtre dont la valeur lue est absente est retiré (D4). Le contenu de l'attente est `{ kind: 'member', value: MemberContent }`.
- Le juge : `admitted(...)`, puis `recognise` ; juste si un admis est reconnu ; `answer` : ce que le juge d'hier rendait pour ce capteur (`{ midi }` pour une note, `{ decided }` pour une forme) ; `confusion` : celle de la famille.
- Refus (`roundProblem`), un test par ligne :

| Écrit                                                | Raison                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `family: "nope"`                                     | `content names family "nope", which is not registered`                             |
| `of: "nope"`                                         | `content.of "nope" gives no index of chord-shapes from voicing-on-strings`         |
| pas d'`of`, et l'ensemble n'indexe pas la famille    | `set placed-note gives no index of chord-shapes`                                   |
| une clé de filtre inconnue                           | `content.where[0] is no filter (in, at, position, other)`                          |
| `order: ["nope"]`                                    | la raison de `selectionProblem`                                                    |
| `{ "at": { "item": "nope" } }`                       | `content.where[0] reads item value "nope", which voicing-on-strings does not have` |
| `{ "at": { "param": "a.b" } }` non écrit à un niveau | `content.where[0] reads param "a.b", which no level of the exercise writes`        |
| `take: 0`                                            | `content.take must be a positive whole number`                                     |
| un choix dans une entrée de figure                   | `a figure entry takes its content from a derivation`                               |

- [ ] **Step 1: Écrire les tests qui échouent** — le juge sur les deux familles (juste, faux avec confusion, charge utile sans hauteur ni décision) ; la compilation d'un tour d'essai écrit dans le test, avec `of`, sans, avec un filtre dont la valeur manque ; les refus du tableau.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Les juges `note` et `chord-voicing` et leurs dérivations restent jusqu'à la Task 4 ; le catalogue n'est pas touché.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: judge an answer as a member of a family`

### Task 3: Demander un membre

**Files:**

- Modify: `src/lib/domain/learning/params.ts`, `exerciseSubject.ts`, leurs specs, `src/lib/domain/sets/types.ts`, `voicingOnStrings.ts`, `src/lib/application/definitions/checks.ts`, `checks.spec.ts`, `catalog/chords.json`, l'instantané du catalogue (pour `params.learning` de `chord-zone` seulement)
- Delete: `src/lib/domain/sets/draws.ts`, `draws.spec.ts`

**Interfaces:**

```ts
// sets/types.ts — ItemSet gains:
/** The item a prompt asks when a member was drawn for a card's item (its place, what the prompt names). */
asked?(item: I, member: Member, random: () => number): I;

// learning/params.ts — ExerciseLearning: `draw` leaves, `asks` enters
asks?: { family: string; of?: string; where?: readonly FilterTemplate[] };
```

- `exerciseSubject.promptItem` : avec `asks`, les membres admis pour l'index de l'élément, `previous` étant le dernier membre demandé de cette carte (lu sur sa dernière tentative qui porte un élément, puis dans la séance) ; un tirage uniforme ; `set.asked(item, member, random)`. `voicing-on-strings.asked` rend `{ voicingKey, position, fret }` comme `another-place` aujourd'hui (la case tirée parmi `cueFrets` de la forme).
- Comment un élément demandé redonne son membre (pour `previous`) : `ItemSet.memberOf?(item): string | null`, l'`id` du membre ; `voicing-on-strings` le calcule de `voicingKey` et `position`.
- `chord-zone` écrit `"asks": { "family": "chord-shapes", "where": [{ "other": "previous" }] }` à la place de `"draw": "another-place"`.
- Refus : `params.learning.asks` mal formé, famille inconnue, ensemble sans index, ensemble sans `asked` (`params.learning.asks needs a set that can ask a member, which note-on-string cannot`) ; `params.learning.draw` écrit : `params.learning.draw is gone: write params.learning.asks`.

- [ ] **Step 1: Écrire les tests qui échouent** — les cas de `draws.spec.ts` réécrits sur le sujet (jamais la dernière forme quand une autre existe ; la seule quand il n'y en a qu'une ; une case que la forme couvre ; sans précédent) ; Review Focus 4 : avec la même graine, la suite des éléments demandés égale celle de `another-place` (comparer aux deux le temps de la tâche, puis supprimer l'ancien) ; les refus.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter, supprimer `draws.ts`.** `series/triadsSession.spec.ts` ne change pas.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: ask a member drawn among those a selection admits`

### Task 4: Les trois exercices sur les familles, et la fin des anciens juges

**Files:**

- Modify: `catalog/notes.json`, `catalog/chords.json`, l'instantané du catalogue, `src/lib/application/sets/voicingOnStrings.ts`, `noteOnString.ts`, ce qui dit une réponse et un raté par sorte de contenu (`CONTENT_VIEWS`), `src/lib/domain/judges/index.ts`, `src/lib/domain/derivations/index.ts`, `src/lib/testing/randomExercise.ts`, les specs touchées
- Create: `src/lib/testing/catalogMembers.spec.ts`
- Delete: `src/lib/domain/sets/triadChord.ts` si plus rien ne le lit (son calcul est dans la famille)

Ce que le catalogue écrit :

| Exercice             | Attente         | `content`                                                               |
| -------------------- | --------------- | ----------------------------------------------------------------------- |
| `locate-note-string` | la note         | `{ "family": "note-places" }`                                           |
| `chord-anchor`       | la fondamentale | `{ "family": "note-places", "of": "root" }`                             |
| `chord-anchor`       | l'accord        | `{ "family": "chord-shapes" }`                                          |
| `chord-zone`         | l'accord        | `{ "family": "chord-shapes", "where": [{ "at": { "item": "fret" } }] }` |

- Le présentateur de `voicing-on-strings` donne au capteur d'accords les membres admis comme attendus, et autour d'eux les mêmes sosies qu'aujourd'hui (`voicingCandidates`) ; jamais une forme de l'accord qui sonne encore.
- `Attempt.data` de chaque capacité garde sa forme (`anchorData`, `chordData`, les données de `locate`).
- Ce qui dit une réponse et un raté (`CONTENT_VIEWS`) passe de `note` et `chord-voicing` à `member`, par famille ; les mêmes mots, les mêmes dessins.

- [ ] **Step 1: Écrire les tests qui échouent.** `catalogMembers.spec.ts` (Review Focus 1), tant que les anciens juges existent : pour chaque élément des listes de `locate-note-string` (66), `chord-anchor` (144) et, pour `chord-zone`, chaque voicing à chacune de ses positions et de ses cases (toutes), sur un éventail de charges utiles (chaque MIDI de 28 à 88 pour une note ; pour un accord, l'`id` de chaque forme de chaque renversement et de l'autre qualité, et `null`) : le nouveau juge rend le même `correct`, la même `answer` et la même `confusion` que l'ancien. Les candidats du capteur d'accords pour chaque élément : les mêmes `id`, les mêmes sortes, dans le même ordre.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Basculer le catalogue, puis supprimer** les deux juges, les quatre dérivations et la comparaison avec eux dans `catalogMembers.spec.ts` (le test garde ses attendus sous forme de tableau figé pour quelques éléments). L'instantané du catalogue : son diff ligne à ligne, et son `git diff --stat` dans le rapport.
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; les séries à graine et les fixtures du capteur d'accords inchangées.
- [ ] **Step 5: Commit** — `refactor: judge the notes and the chords as members of their families`

### Task 5: Les docs

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- [ ] **Step 1:** `docs/fichiers-de-definitions.md` : un contenu écrit comme un choix (famille, `of`, `where`, `order`, `take`), les deux familles et leurs attributs, les quatre filtres, `params.learning.asks`, les refus.
- [ ] **Step 2:** `CLAUDE.md` : les phrases devenues fausses (les juges par sorte de contenu, `draw`, `another-place`, « To add an item set »), et les familles là où elles se rangent.
- [ ] **Step 3:** la spec : « Réalisation (plan 4a) » — D1 à D10, ce que l'exécution a décidé en plus, ce qui est laissé au plan 4b ; dans « Réalisation (plan 3) », le sort de ce qui était « Laissé au plan 4 ».
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `docs: say how an exercise writes what it accepts as members of a family`

### Étape jouable

- [ ] Dans l'aperçu, micro simulé : une séance de notes et une séance de triades au-delà du début, sans erreur de console ; un raté d'accord dessine ce qui a été entendu et attendu comme avant.
