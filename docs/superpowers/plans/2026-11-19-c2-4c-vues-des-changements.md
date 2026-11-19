# Chantier 2, plan 4c : les vues des changements lisent un seul modèle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les deux vues des changements (`grid-scroll`, `link-lane`) lisent un seul modèle générique, construit par le cœur à partir du passage et de la `presentation` que l'exercice écrit. Les modèles `GridStageModel` et `LinkLaneModel`, leurs consignes, leur aide et leurs ratés dessinés quittent le présentateur. « Geste » s'appelle « Changements » à l'écran.

**Architecture:**

- **Le modèle d'un passage** (`PassageStageModel`) : la consigne du tour montré (les emplacements de `presentation`, comme pour la piste), la ligne du passage (chaque tour avec sa place en temps et ses mots), le tour montré, l'aide et, après un raté, ce qui a été entendu et attendu.
- **Les champs** d'une consigne viennent de deux registres : ceux de l'élément (`ITEM_FIELDS`, déjà là) et ceux du contenu du tour, dits par la vue de sa famille (`strings`, `frets`, `toward` pour `chord-shapes`).
- **L'aide** est le dessin que `presentation.aided` nomme, montré quand le tour se joue à un niveau d'aide : celui de l'échelle de l'élément (déjà là) ou celui de l'exercice (nouveau). Le dessin `admitted` montre sur le manche les membres que le contenu admet.
- **Les ratés** passent par `CONTENT_VIEWS`, comme sur la piste.
- **Le présentateur** des changements garde sa scène, ses capteurs, l'attendu du capteur d'accords et les données de la tentative. Il ne construit plus d'écran.

**Tech Stack:** TypeScript, Svelte 5, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 7 « Les écrans » ; « Réalisation (plan 4b) », « Laissé au plan 4c » ; § 8 pour ce qui part au plan 5).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Ce que le joueur voit ne change que là où ce plan le décide** :
  - l'aide des grilles dessine sur le manche toutes les formes admises au prochain changement, au lieu d'une seule forme en diagramme (D5) ;
  - la lecture (`grid-reading`) reçoit son niveau d'aide et l'anti-blocage (D7) ;
  - « Geste » s'écrit « Changements » (D8).
    Tout le reste est identique : le titre, les mots de la consigne, les cases de la grille, les tuiles du lien, l'accord suivant annoncé, les verdicts, ce qu'un raté dessine et dit, l'aide du lien (les notes de la forme à jouer et de la suivante).
- **Avant de supprimer les anciens modèles, une comparaison** : pour chaque exercice du catalogue, sur des passages entiers, le nouveau modèle dit les mêmes mots et dessine les mêmes ratés que l'ancien (Task 2). Une différence ne s'accepte pas dans une tâche : elle remonte.
- **Rien de stocké ne change** : base 13, sauvegarde 9. La sorte de séance `'gesture'`, `AppServices.gesture()`, `SessionSummary.gesture` et `domain/gesture/summary.ts` restent : le § 8 les remplace au plan 5 (les routines, un seul bilan).
- **Le cœur ne nomme ni famille, ni ensemble, ni exercice, ni instrument** (tests de frontière existants, étendus à `passageStage.ts`).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.** Une consigne qui lit un champ que rien ne donne est refusée au chargement, le champ nommé.
- **Instantanés** : celui du catalogue change pour les quatre exercices des changements (leur `presentation`, leurs niveaux d'aide) ; celui des plans du rythme ne change pas. Les tables figées (`catalogChanges.spec.ts`, `catalogMembers.spec.ts`) restent vertes sans retouche.
- **Rien de privé dans le dépôt.** `docs/projet.md` n'est pas modifié.
- **Textes de l'écran** en français et en anglais par `defineMessages` ou dans les données ; jamais sous 16 px.
- **Vocabulaire** : « passage » / `passage` ; « ligne du passage » / `rounds` ; « champ » / `field` ; « dessin » / `picture` ; « membres admis » / `admitted`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                                                  | Sorte                              |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| le modèle d'un passage, la ligne du passage, le sens d'un membre au suivant, l'aide au niveau d'aide   | primitive du cœur                  |
| les champs et le dessin des membres de `chord-shapes`, les champs d'un changement de grille            | primitive enregistrée (la guitare) |
| la `presentation` des quatre exercices, le niveau d'aide de la lecture                                 | donnée de l'exercice               |
| les vues `grid-scroll` et `link-lane`                                                                  | composants de l'écran, qui restent |
| `VIEW_PRESENTERS` (le présentateur du lien trouvé par sa vue), la sorte `'gesture'`, le bilan du geste | exception, jusqu'au plan 5         |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Un modèle pour les deux vues.** `PassageStageModel` : la consigne du tour montré ; la ligne du passage (pour chaque tour : sa place en temps, ses mots, le sens depuis le tour d'avant) ; le rang du tour montré ; l'aide ; le verdict et ses ratés. Les deux vues le lisent ; chacune garde sa façon de dessiner (la grille en cases, le lien en tuiles et flèches).
- **D2 — Les mots viennent de la `presentation`.** Les emplacements existants suffisent : `primary` (le grand mot du tour), `secondary`, `detail`, et `target` (les mots de chaque tour sur la ligne). Aucun emplacement nouveau.
- **D3 — Les champs du contenu portent le nom de ce qu'ils sont, pas du paramètre qui les nourrit.** La vue de la famille `chord-shapes` donne `{strings}` (« sol‑si‑mi »), `{frets}` (« 1 à 5 », vide sans zone de cases) et `{toward}` (« ↑ en montant », « ↓ en descendant », vide sans sens). La spec donnait `{direction}` et `{zone}` en exemple : ce sont des noms de paramètres, que l'auteur d'un fichier choisit librement ; les mots, eux, appartiennent à l'instrument.
- **D4 — Le sens d'un tour au suivant** (`up`, `down`, `same`, ou rien) se lit sur l'attribut `position` de la famille du passage. La vue du lien en fait ses flèches. Une famille sans position n'a pas de sens.
- **D5 — L'aide est le dessin `admitted`** : sur le manche, les membres que le contenu admet. Pour le tour montré, et pour le tour suivant (marqués « ensuite »), calculés avec pour précédent la forme entendue une fois le tour jugé, sinon le précédent du tour montré. Le lien dessine ainsi ce qu'il dessinait. Les grilles dessinaient une seule forme, choisie par le code (la plus proche, ou la plus grave) ; elles dessinent maintenant toutes les formes admises, comme le § 7 l'écrit.
- **D6 — Un niveau d'aide de l'exercice montre `presentation.aided`**, comme le fait déjà le niveau aidé de l'échelle d'un élément. Le paramètre `shapes: true` du plan 4b disparaît : un seul mécanisme.
- **D7 — La lecture (`grid-reading`) écrit son niveau d'aide et `flow.antiBlocking`**, comme les trois autres : son aide dessine maintenant les formes admises.
- **D8 — « Geste » devient « Changements » à l'écran seulement** (l'accueil, l'en-tête du jeu). Les noms du code et la sorte de séance partent au plan 5 avec les routines.
- **D9 — Un passage porte toujours ses éléments** (`PlannedItem.passage.items`), et la ligne du passage se calcule une fois par passage.

## Review Focus

1. **Un mot ou un dessin qui change sans que le plan l'ait décidé** : le titre, le sens, la zone, les symboles, les tuiles, le raté. La comparaison de la Task 2 et les specs des vues (sorties rendues inchangées) le tiennent.
2. **Un fichier importé dont la consigne lit un champ que rien ne donne**, ou nomme le dessin `admitted` sans contenu de membres : refusé au chargement, l'emplacement et le champ nommés (Task 1).
3. **Un passage d'une famille sans vue** (ni champs ni dessin) sur une vue de passage : la ligne se dessine avec des mots vides, sans erreur (Task 2).
4. **Un long passage** (256 tours) : la ligne se calcule une fois par passage, pas à chaque tour (Task 2).
5. **Les pages de démonstration** (`/dev/gesture`, `/dev/gesture?view=grid`, `/session/demo`) et le bilan d'une séance d'avant : toujours rendus (Task 3).

## File Structure

| Fichier                                                                                           | Rôle                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/lib/application/presentation/passageStage.ts`                                                | créé : `PassageStageModel`, `passageStage`                                                                         |
| `src/lib/application/presentation/contentViews.ts`                                                | modifié : les champs et le dessin des membres d'une famille ; les mots des ratés des changements                   |
| `src/lib/application/presentation/itemFields.ts`                                                  | modifié : les champs d'un changement (`symbol`, `title`), `quality` d'une forme placée                             |
| `src/lib/application/presentation/presentPrompt.ts`, `pictures.ts`, `validate.ts`, `playViews.ts` | modifiés : les champs du contenu, le dessin `admitted`, l'aide au niveau d'aide de l'exercice, les vues de passage |
| `src/lib/application/session/series/stage.ts`                                                     | modifié : l'aiguillage vers `passageStage`                                                                         |
| `src/lib/ui/play/views/{GridScrollView.svelte,gridScroll.ts,LinkLaneView.svelte,linkLane.ts}`     | modifiés : lisent `PassageStageModel`                                                                              |
| `src/lib/application/sets/chordGrid.ts`, `chordGridMessages.ts`                                   | modifiés : plus de modèle, de consigne, d'aide ni de raté                                                          |
| `catalog/changes.json`                                                                            | les quatre `presentation`, les niveaux d'aide                                                                      |

---

### Task 1: Les champs et les dessins qu'un passage peut lire

**Files:**

- Modify: `src/lib/application/presentation/contentViews.ts`, `itemFields.ts`, `pictures.ts`, `presentPrompt.ts`, `validate.ts`, leurs specs

**Interfaces:**

```ts
// contentViews.ts — la vue des membres d'une famille gagne deux lectures
interface MemberView {
	// … answerLabel, miss (déjà là)
	/** Les champs que ce contenu offre aux mots d'une consigne. */
	names: readonly string[];
	fields(value: MemberContent, locale: Locale): Record<string, string>;
	/** Le dessin de membres de la famille ; null quand il n'y a rien à dessiner. */
	picture(members: readonly Member[], next: readonly Member[]): Picture | null;
}
/** Les noms des champs qu'offre le contenu de membres d'une famille ; vide sans vue. */
export function memberFieldNames(family: string): readonly string[];
/** Les champs d'un contenu de membres ; vide pour ce qui n'en est pas un. */
export function memberFields(value: unknown, locale: Locale): Record<string, string>;
/** Le dessin des membres admis maintenant et ensuite ; null sans vue. */
export function membersPicture(
	family: string,
	now: readonly Member[],
	next: readonly Member[]
): Picture | null;

// pictures.ts — un dessin qui lit le contenu du tour, pas l'élément
export const CONTENT_PICTURES: readonly string[] = ['admitted'];
```

- `chord-shapes` : `strings` (les noms des cordes de l'index, de la grave à l'aiguë, comme `setLabel` aujourd'hui), `frets` (« 1 à 5 » pour un filtre `in.frets` compilé, sinon vide), `toward` (« ↑ en montant » / « ↓ en descendant » pour un filtre `position` compilé, sinon vide ; les mots viennent de `chordGridMessages.ts`). `picture` : un dessin `neck`, les notes de chaque forme nommées, celles de `next` marquées `next: true` (comme `neckWithNext`).
- `note-places` : aucun champ, aucun dessin (`names: []`, `picture` rend `null`).
- `chordShapesView.miss` dit aussi les ratés des changements : la forme attendue est `expectedShape(admis, entendue, value.previous)` et les mots sont ceux de `CHORD_GRID_MESSAGES.gap` pour une confusion de `ChordGridConfusion`. Les mots et les dessins des ratés des triades ne changent pas (`catalogMembers.spec.ts` reste vert).
- `ITEM_FIELDS['change']` : `symbol` (le symbole du changement), `title` (le titre de sa grille). `ITEM_FIELDS['placed-voicing']` gagne `quality` (« majeur », « mineur »).
- `presentPrompt` reçoit en plus les champs du contenu du tour (`memberFields` de sa première attente à contenu de membres) ; un champ de l'élément l'emporte sur un champ du contenu de même nom.
- `presentationProblem` : un emplacement peut lire un champ de l'élément ou du contenu de membres du tour (`memberFieldNames` de la famille que le gabarit nomme) ; `aided: { "picture": "admitted" }` demande un tour dont une attente a un contenu de membres.

- [ ] **Step 1: Écrire les tests qui échouent** — les trois champs de `chord-shapes` sur des contenus compilés du catalogue (avec et sans zone, avec et sans sens, le sens une fois tourné) ; le dessin de deux formes maintenant et d'une ensuite ; un raté de changement dit par la vue (forme attendue, mots) pour chaque sorte de `ChordGridConfusion` ; les champs de `change` et `quality` ; Review Focus 2 : une consigne qui lit `{nope}`, et `admitted` sans contenu de membres, refusées avec l'emplacement nommé.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: let a prompt read the fields and the picture of its round's members`

### Task 2: Le modèle d'un passage

**Files:**

- Create: `src/lib/application/presentation/passageStage.ts`, `passageStage.spec.ts`, `src/lib/testing/catalogPassageStage.spec.ts` (la comparaison)
- Modify: `src/lib/application/presentation/playViews.ts`, `validate.ts`, `src/lib/application/session/series/stage.ts`, `src/lib/domain/session/passageSource.spec.ts`, leurs specs, les tests de frontière

**Interfaces:**

```ts
// passageStage.ts
export interface PassageRound {
	/** Temps depuis le début du passage. */
	at: number;
	length: number;
	/** L'emplacement `target` de la consigne, dit pour l'élément de ce tour ; vide sans lui. */
	label: string;
	/** Du tour d'avant à celui-ci, sur l'attribut `position` de la famille ; null au premier et sans position. */
	way: 'up' | 'down' | 'same' | null;
}
export interface PassageStageModel {
	prompt: PresentedPrompt;
	rounds: readonly PassageRound[];
	/** Le tour montré : son rang dans le passage. */
	index: number;
	beatsPerBar: number;
	anchorBeat: number | null;
	history: readonly LaneEntry[];
	/** Le dessin d'aide, au niveau d'aide ; null sinon. */
	aid: Picture | null;
	verdict: StageVerdict | null;
	chordDiagram: ChordDiagramStyle;
}
export function passageStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem; // avec `passage`
	plan: RoundPlan;
	settled: { value: ResponseValue; success: boolean } | null;
	place: StagePlace;
	beatsPerBar: number;
	chordDiagram: ChordDiagramStyle;
	locale: Locale;
	random: () => number;
}): PassageStageModel;

// playViews.ts — la liste existe depuis le plan 4b avec `link-lane` seule
export const PASSAGE_VIEWS: readonly string[] = ['grid-scroll', 'link-lane'];
```

- La ligne (`rounds`) : la longueur de chaque tour est celle que son gabarit de tour donne pour son élément ; elle se calcule une fois par passage (un cache par identité de passage suffit).
- L'aide (D5, D6) : quand `item.exerciseLevel < 0` ou que l'élément est servi aidé, et que la consigne écrit `aided`. Pour `admitted` : les membres admis du tour montré, et ceux du tour suivant compilé avec pour précédent le membre entendu (`Family.named` de la réponse) une fois le tour jugé, sinon `passage.previous`.
- `stage.ts` : un exercice qui écrit `passages` et une `presentation`, sur une vue de `PASSAGE_VIEWS`, prend `passageStage` ; `stageOf` du présentateur reste l'issue des autres jusqu'à la Task 3.
- `screenProblem` : une `presentation` est acceptée sur une vue de passage, et y demande `passages` ; `link-lane` demande `passages` dans tous les cas (déjà là) ; `grid-scroll` sans `presentation` reste la vue par défaut d'un exercice que son présentateur dessine.
- La source sert déjà chaque tour avec les éléments de son passage (`passage.items`) ; un test le tient pour toute famille.

- [ ] **Step 1: Écrire les tests qui échouent** — `passageStage.spec.ts`, sur des exercices écrits dans le test : la ligne (places et longueurs), les mots de chaque tour, le sens, le tour montré ; l'aide au niveau d'aide et rien au niveau 1 ; l'aide du tour suivant avant et après le jugement ; un raté ; Review Focus 3 (une famille de test sans vue) et 4 (256 tours : la ligne calculée une fois, compté par un espion).
- [ ] **Step 2: Écrire la comparaison** (`catalogPassageStage.spec.ts`), tant que `gridStageModel` et `linkLaneModel` existent : pour chaque exercice du catalogue, réécrit en mémoire avec la `presentation` de la Task 3, sur un passage entier de chaque index et chaque valeur de paramètre de passage, tour par tour, avant et après un raté de chaque sorte : le titre, les mots de la consigne (le sens, la zone, les cordes, la qualité), les symboles et leurs places, les tuiles du lien (`root`, `up`, `down` contre `label` et `way`), le rang, et le raté (forme entendue, forme attendue, mots) sont ceux de l'ancien modèle ; l'aide du lien (notes maintenant et ensuite) aussi ; l'aide des grilles contient la forme que l'ancien modèle dessinait.
- [ ] **Step 3: Lancer, vérifier l'échec ; implémenter ; relancer.** Une différence remonte dans le rapport, elle ne se corrige pas en changeant l'attendu.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: build the screen model of a passage from its presentation`

### Task 3: Les deux vues lisent le modèle, le présentateur ne dessine plus

**Files:**

- Modify: `src/lib/ui/play/views/GridScrollView.svelte`, `gridScroll.ts`, `LinkLaneView.svelte`, `linkLane.ts`, `DrawnMiss.svelte`, leurs specs ; `src/lib/application/sets/chordGrid.ts`, `chordGridMessages.ts`, `types.ts`, leurs specs ; `catalog/changes.json`, l'instantané du catalogue ; `src/lib/ui/play/demo/demoGestureSeries.ts`, les pages `/dev/gesture` et `/session/demo` ; `src/lib/testing/catalogPassageStage.spec.ts` (figé)

- Les `presentation` du catalogue :

| Exercice            | `primary`  | `secondary` | `detail`                                                 | `target`   | `aided`                     |
| ------------------- | ---------- | ----------- | -------------------------------------------------------- | ---------- | --------------------------- |
| `inversion-run`     | `{chord}`  | `{quality}` | fr « sur cordes {strings} », en « on strings {strings} » | `{chord}`  | `{ "picture": "admitted" }` |
| `grid-in-direction` | `{symbol}` | `{title}`   | « {strings} · {toward} »                                 | `{symbol}` | `{ "picture": "admitted" }` |
| `grid-in-zone`      | `{symbol}` | `{title}`   | fr « cases {frets} », en « frets {frets} »               | `{symbol}` | `{ "picture": "admitted" }` |
| `grid-reading`      | `{symbol}` | `{title}`   | —                                                        | `{symbol}` | `{ "picture": "admitted" }` |

- Les niveaux d'aide des trois exercices perdent `"shapes": true` (D6).
- Les vues : mêmes sorties rendues qu'aujourd'hui, lues dans `PassageStageModel` (le titre dans `prompt.secondary`, la consigne dans `prompt.detail`, les cases et tuiles dans `rounds`, la flèche d'une tuile dans `way`, la première tuile du lien dans son `label`) ; l'aide et les dessins d'un raté passent par `PICTURE_VIEWS`. La case « lien » de `GridCue` et le champ `following` disparaissent.
- Le présentateur : `stageOf`, `feedback`, `gridStageModel`, `linkLaneModel`, `aidFor`, `cueOf`, `GridCue`, `DrawnMiss`, `LinkAidNote` supprimés ; restent `scene`, `sensors`, `contestable`, `expectation`, `attemptData`, `VIEW_PRESENTERS`.
- La comparaison de la Task 2 devient une table figée, qui ne dépend plus des fonctions supprimées (comme `catalogChanges.spec.ts`).

- [ ] **Step 1: Écrire les tests qui échouent** — les specs des deux vues sur le nouveau modèle, leurs affirmations sur le rendu inchangées (seules les fabriques de modèle changent) ; le catalogue sans refus ; Review Focus 5.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter ; figer la table ; supprimer.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; l'instantané du catalogue lu ligne à ligne (les quatre exercices seulement).
- [ ] **Step 5: Commit** — `refactor: draw the changes from the screen model of their passage`

### Task 4: L'aide de la lecture, « Changements », les docs

**Files:**

- Modify: `catalog/changes.json`, l'instantané ; `src/lib/ui/screens/home/messages.ts`, `src/lib/ui/play/messages.ts`, leurs specs ; `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- `grid-reading` écrit, sous son niveau 1, `{ "aid": true, "params": { "tempo": 80 } }` et `"flow": { "antiBlocking": true }` (D7).
- « Geste » → « Changements » (fr), « Gesture » → « Changes » (en), sur l'accueil et dans l'en-tête du jeu (D8).
- `docs/fichiers-de-definitions.md` : la consigne d'un passage (les emplacements, les champs de l'élément et du contenu, `target` sur la ligne), le dessin `admitted`, le niveau d'aide qui montre `aided` (et plus `shapes`), les vues de passage et leurs refus.
- `CLAUDE.md` : les phrases devenues fausses (« Play views », « Gesture track », « Skills, item sets and exercises »).
- La spec : « Réalisation (plan 4c) » — D1 à D9, ce que l'exécution a décidé en plus, ce qui reste au plan 5 ; dans « Réalisation (plan 4b) », le sort de « Laissé au plan 4c ».

- [ ] **Step 1: Écrire les tests qui échouent** — la lecture : trois ratés de suite au niveau 1 amènent son niveau d'aide, les formes admises dessinées (le test du plan 4b « three misses change nothing » est remplacé) ; les deux textes.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Les docs.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `feat: aid the reading of a grid and call the track « Changements »` puis `docs: say how a passage writes its prompt`

### Étape jouable

- [ ] Dans l'aperçu, micro simulé, triades acquises posées à la main : une séance de changements ; le lien au niveau 1 puis au niveau d'aide (les notes sur le manche), la montée, la zone et la lecture (catalogue local sans `again`, le temps du test, remis ensuite) ; les consignes et les cases comme avant ; aucune erreur de console.
