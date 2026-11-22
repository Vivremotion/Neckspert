# Chantier 2, plan 5b : le bilan, l'accueil, la Bibliothèque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les écrans suivent les données : un seul bilan, par exercice et par portée ; un accueil qui liste les routines ouvertes et rien d'autre ; une Bibliothèque où tout exercice du registre se joue seul. Le chantier se ferme sur ce qui restait à durcir avant qu'un fichier importé joue vraiment : le budget de vérification d'un fichier, le travail borné de la source de passages, le banc ouvert qui tire des passages et des routines.

**Architecture:**

- **Le bilan** résume une séance par exercice et par portée, quel que soit l'exercice. Le résumé du geste et celui d'un exercice deviennent le même ; une séance de mémoire garde en tête son bloc de mémoire.
- **L'accueil** liste les routines ouvertes, avec leurs révisions. « Exercices », la tendance et l'écart au temps en sortent.
- **La Bibliothèque** liste tous les exercices du registre. Un service dit pour chacun son titre, ses routines, s'il se repose, s'il a quelque chose à jouer.
- **Le durcissement** : chaque contrôle au chargement compte son coût, pas seulement ses tours ; la source de passages borne son travail par tour servi.

**Tech Stack:** TypeScript, Svelte 5, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 8 « Dans le moteur », « L'accueil », « La Bibliothèque » ; § 11 ; « Réalisation (plan 5a) », « Laissé au plan 5b »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Rien de stocké ne change de forme** : base 13, sauvegarde 9.
- **Ce que le joueur voit change là où le § 8 le décide, et nulle part ailleurs** : le bilan d'une séance de changements et celui d'un exercice ont la même forme ; l'accueil perd « Exercices », la tendance et l'écart au temps ; le lien « Bibliothèque » mène à la Bibliothèque (D5b). Ce qu'une séance pioche, ce qu'un tour juge, ce qu'un écran de jeu montre ne bougent pas.
- **Aucun identifiant du catalogue dans `src/`** hors tests et migrations (le test de frontière du plan 5a reste vert).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.** Chaque contrôle est borné avant le travail qu'il borne.
- **Les écrans** suivent `src/lib/ui/CLAUDE.md` : le monde calme pour l'accueil, le bilan et la Bibliothèque ; aucun texte sous 16 px ; pas de mots d'explication superflus.
- **Instantanés** : aucun ne change, sauf décision écrite dans une tâche.
- **Rien de privé dans le dépôt.** `docs/projet.md` n'est pas modifié.
- **Textes de l'écran** en français et en anglais par `defineMessages`.
- **Vocabulaire** : « bilan » / `summary` ; « Bibliothèque » / `library` ; « budget de vérification » / `check budget`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                                           | Sorte                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------- |
| le bilan par exercice et par portée ; le service de la Bibliothèque ; le budget de vérification | primitive du cœur             |
| l'accueil, la Bibliothèque, l'écran du bilan                                                    | écrans                        |
| le bloc de mémoire en tête du bilan d'une séance de mémoire                                     | gardé tel quel                |
| un préfixe réservé aux identifiants du catalogue                                                | laissé à l'auteur (hors plan) |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Un bilan, une forme.** `SessionSummary.exercises` : une ligne par exercice et par portée joués dans la séance — tours joués et réussis, tours aidés, niveau atteint, tempo du début et de la fin, passages réussis quand l'exercice en écrit, « On change d'air » s'il est sorti. Les ratés qu'on peut contester et, tant que la séance est en mémoire, ses séries (à réécouter) restent, pour tout exercice. Une séance de mémoire garde en tête son bloc d'aujourd'hui (la note, les cartes apprises, la prochaine révision).
- **D2 — Un exercice que plus aucun fichier ne définit** garde sa ligne dans le bilan, avec son identifiant pour titre et ce que ses tentatives disent. Ses cartes, que plus rien ne sert, ne sont plus comptées par le bilan. Le bilan et l'accueil comptent les mêmes cartes : celles que listent les exercices de la séance.
- **D3 — L'accueil** : les routines ouvertes, dans l'ordre du registre ; pour chacune son titre, ses révisions dues ou les prochaines, « au repos ». Espace lance la première. Rien d'autre, sauf deux lignes d'état : un fichier importé refusé (déjà là), un fichier du catalogue refusé (nouveau, dans toute version : « Une partie du catalogue n'a pas pu être chargée »).
- **D4 — La tendance et l'écart au temps quittent l'accueil** et ne sont montrés nulle part pour l'instant ; `homeStats()` disparaît. La page « Progrès » garde la carte du manche.
- **D5b — Le jeu libre mêlé des notes n'a plus de lien.** Le lien « Bibliothèque » menait au jeu libre de la routine des notes (ses deux exercices mêlés). Il mène à la Bibliothèque, où chaque exercice de mémoire se joue seul, en jeu libre. L'adresse `/session?routine=<id>&free=1` continue de marcher.
- **D5 — La Bibliothèque** (`/library`) : tous les exercices du registre, dans l'ordre du registre ; pour chacun son titre (celui de l'exercice, sinon le nom de sa capacité), les routines qui le listent, « au repos », et un bouton pour le jouer seul. Un exercice qui n'a rien à jouer maintenant (un exercice à passages sans index ouvert) est listé sans bouton, avec « Rien à jouer pour l'instant ». Aucun tri, aucun filtre, aucune recommandation : le joueur choisit.
- **D6 — Un service pour la Bibliothèque** : `library()` remplace `resting(ids)` et l'usage de `exerciseSessionExercises()` par les écrans.
- **D7 — Le budget de vérification d'un fichier** compte le coût : chaque tour compilé au chargement pèse ses attentes et leurs filtres. Un fichier au-delà du budget est refusé avec une phrase qui le dit. Les limites par tours (`MAX_ROUND_CHECKS`, `MAX_PASSAGE_ROUND_CHECKS`) restent.
- **D8 — La source de passages borne son travail** : au plus un nombre fixé d'essais par passage servi ; au-delà, l'index est laissé de côté pour la séance.
- **D9 — Une consigne mal écrite est refusée en mots** : un emplacement écrit dans une seule langue, ou qui n'est pas un texte.
- **D10 — Le banc ouvert** tire aussi des exercices à passages et des routines, et joue tous ceux que les validateurs acceptent.

## Review Focus

1. **Un bilan d'avant** : une séance enregistrée avant ce plan (des notes, des triades, des changements, un exercice de rythme, un exercice supprimé depuis) s'ouvre et dit ce qu'elle disait (Task 1).
2. **Un fichier au budget** : le pire fichier accepté se charge dans le budget de temps du démarrage ; le fichier juste au-delà est refusé, sa phrase le dit ; le catalogue passe très en dessous (Task 4).
3. **Un passage qui échoue à son dernier tour, pour chaque valeur de chaque paramètre** : la source rend la main dans son budget, l'index est laissé de côté, la séance continue (Task 4).
4. **Le catalogue amputé** : un fichier du catalogue refusé — l'accueil le dit, liste ce qui reste, la Bibliothèque aussi, rien ne lève (Task 2, Task 3).
5. **Un exercice importé joué depuis la Bibliothèque** au-delà de la respiration : de mémoire, à passages, à figures (Task 3, Task 5).

## File Structure

| Fichier                                                                                    | Rôle                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/domain/session/summary.ts` (ou le module que la tâche nomme)                      | créé : le bilan par exercice et par portée                                |
| `src/lib/domain/gesture/`                                                                  | supprimé                                                                  |
| `src/lib/ui/screens/summary/`                                                              | modifié : une forme pour tout exercice                                    |
| `src/lib/ui/screens/home/`, `src/routes/+page.svelte`                                      | modifiés : les routines seules, la ligne du catalogue amputé              |
| `src/lib/ui/screens/library/`, `src/routes/library/`                                       | créés                                                                     |
| `src/lib/application/app.ts`, `services/createAppServices.ts`                              | modifiés : `library()`, le bilan ; `homeStats()` et `resting()` supprimés |
| `src/lib/domain/exercise/validate.ts`, `src/lib/domain/definitions/`                       | modifiés : le budget de vérification                                      |
| `src/lib/domain/session/passageSource.ts`                                                  | modifié : le travail borné                                                |
| `src/lib/application/session/series/openness.spec.ts`, `src/lib/testing/randomExercise.ts` | modifiés : passages et routines                                           |
| `scripts/functional-ui.mjs`                                                                | modifié : chaque routine, un exercice importé                             |

---

### Task 1: Un seul bilan, par exercice et par portée

**Files:**

- Create: le module du bilan par exercice dans `src/lib/domain/session/` (ou à côté de `series/exerciseSummary.ts` si le calcul demande l'application), sa spec
- Modify: `src/lib/domain/types.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/application/session/series/exerciseSummary.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte`, `messages.ts`, leurs specs
- Delete: `src/lib/domain/gesture/`

**Interfaces:**

```ts
// domain/types.ts — replaces GestureSummary and ExerciseSummary
export interface PlayedExercise {
	exerciseId: ExerciseId;
	scope?: string;
	/** Rounds played, and those that passed. */
	rounds: number;
	passed: number;
	/** Rounds played with an aid that is not the level's own. */
	aided: number;
	/** The level held at the end, as the screen numbers it; null when the exercise writes no level. */
	level: { shown: number; of: number; aid: boolean } | null;
	/** The tempo of the first and of the last round; null in free time. */
	tempo: { first: number; last: number } | null;
	/** Passages played and passed, for an exercise that writes them; null otherwise. */
	passages: { played: number; passed: number } | null;
	/** It left the session by « On change d'air ». */
	changedAir: boolean;
}
export interface SessionSummary {
	// … the memory block's fields as today, for a session of memory exercises
	exercises: PlayedExercise[]; // in the order first played
	misses: SummaryMiss[]; // the contestable misses, as the gesture's today
	series?: SeriesSummary; // while the session is in memory
	replayable?: number[];
}
```

- Les nombres d'aujourd'hui se retrouvent : pour une séance de changements, `rounds`/`passed` sont ses changements et ceux à temps, `passages` ses passages réussis sur joués, `tempo` le premier et le dernier ; pour un exercice de rythme, `rounds`/`passed`/`aided` sont ses cycles, ses réussites, ses cycles aidés, `level` son niveau atteint.
- L'écran : une liste d'exercices, la même pour toute séance ; les ratés contestables et les séries dessous, comme aujourd'hui pour qui les avait ; le bloc de mémoire en tête pour une séance de mémoire. Un exercice sans définition : D2.

- [ ] **Step 1: Écrire les tests qui échouent** — Review Focus 1 : pour chaque sorte de séance d'avant (des enregistrements écrits dans le test, avec leurs tentatives), le bilan dit les mêmes nombres qu'aujourd'hui (les lire dans les specs existantes du bilan du geste et d'un exercice, dont les cas sont déplacés) ; une séance de plusieurs exercices et portées ; un exercice supprimé ; l'écran rendu pour ces cas.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter ; supprimer `domain/gesture/`.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `refactor: sum up any session by exercise and scope`

### Task 2: L'accueil liste les routines

**Files:**

- Modify: `src/routes/+page.svelte`, `src/lib/ui/screens/home/HomeScreen.svelte`, `messages.ts`, `src/routes/dev/home/+page.svelte`, `src/lib/application/app.ts`, `services/createAppServices.ts`, `src/lib/domain/progress/stats.ts`, `src/lib/domain/types.ts`, leurs specs

- L'accueil : D3. « Exercices », la tendance et l'écart au temps sortent ; `homeStats()`, `HomeStats` et ce qu'eux seuls lisaient sont supprimés (D4).
- Une routine dont le calcul lève (un fichier importé abîmé) est fermée et notée dans la console ; les autres blocs restent. Aujourd'hui un seul échec remplace tout l'accueil par une alerte.
- Le catalogue amputé (Review Focus 4) : quand le chargement a refusé un fichier ou un objet du catalogue, l'accueil le dit dans toute version (une ligne, fr et en), à côté de la ligne des fichiers importés ; en développement la liste des refus reste.

- [ ] **Step 1: Écrire les tests qui échouent** — l'accueil rendu : des routines ouvertes et fermées, des révisions dues, une routine au repos, aucune routine (un message : rien à jouer, et le lien vers la Bibliothèque) ; plus de bloc « Exercices », de tendance ni d'écart ; le catalogue amputé ; Espace.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `feat: list the open routines on the home, and nothing else`

### Task 3: La Bibliothèque

**Files:**

- Create: `src/routes/library/+page.svelte`, `src/lib/ui/screens/library/LibraryScreen.svelte`, `messages.ts`, leurs specs
- Modify: `src/lib/application/app.ts`, `services/createAppServices.ts`, `src/routes/+layout.svelte`, `src/lib/ui/shell/navigation.ts`, leurs specs

**Interfaces:**

```ts
// app.ts — replaces resting(ids)
export interface LibraryEntry {
	exerciseId: ExerciseId;
	/** The exercise's title, else the name of its skill. */
	title: { fr: string; en: string };
	/** The titles of the routines that list it. */
	routines: { fr: string; en: string }[];
	resting: boolean;
	/** It has something to play now, alone. */
	playable: boolean;
}
library(): Promise<LibraryEntry[]>; // every exercise of the registry, in the order registered
```

- `playable` : un exercice de mémoire qui liste des éléments ; un exercice à passages dont un index est ouvert ; un exercice à figures que la source sait servir. Ce que `startExercise` refuserait n'est pas jouable.
- La page : D5. Le lien « Bibliothèque » de la navigation y mène ; la navigation la compte parmi ses pages.

- [ ] **Step 1: Écrire les tests qui échouent** — le service sur le catalogue (les onze exercices, leurs routines, les trois de rythme sans routine), sur un exercice importé, sur un exercice au repos, sur un exercice à passages sans index ouvert ; Review Focus 4 ; l'écran rendu ; le lien ; Review Focus 5 côté service (un exercice importé de chaque sorte lancé par `startExercise`).
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `feat: play any exercise alone from the library`

### Task 4: Le durcissement avant qu'un fichier importé joue

**Files:**

- Modify: `src/lib/domain/exercise/validate.ts`, `src/lib/domain/exercise/passage/validate.ts`, `src/lib/domain/definitions/register.ts`, `src/lib/domain/session/passageSource.ts`, `src/lib/application/presentation/validate.ts`, `src/lib/composition/definitionLimits.spec.ts`, leurs specs

**Interfaces:**

```ts
// The cost of checking one file, counted while its exercises are checked.
export const MAX_FILE_CHECK_COST = /* fixed by the task from measures: the worst accepted file loads within the start budget */;
// passageSource.ts
export const MAX_PASSAGE_TRIES = /* fixed by the task */;
```

- Le budget (D7) : une unité par attente compilée, plus une par filtre de son choix ; compté pour chaque tour que le chargement compile (éléments × niveaux, tours des passages) ; le compte est vérifié avant chaque compilation ; un fichier au-delà est refusé en entier (« this file asks more checking than a start can afford: … »). Le pire fichier que les limites acceptent aujourd'hui (28 secondes mesurées au plan 4b) doit être refusé, ou chargé dans le budget.
- La source (D8) : Review Focus 3.
- La consigne (D9) : un emplacement d'une seule langue, un nombre, un objet sans texte — refusés par `presentationProblem` avec l'emplacement nommé, plus par une erreur attrapée.

- [ ] **Step 1: Écrire les tests qui échouent** — Review Focus 2 (le fichier du plan 4b, mesuré ; le catalogue et son coût, affirmé très en dessous) ; Review Focus 3 ; D9.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter ; fixer les deux constantes d'après les mesures, écrites dans le rapport.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `fix: bound what checking a file and serving a passage may cost`

### Task 5: Le banc ouvert et le script de jeu

**Files:**

- Modify: `src/lib/testing/randomExercise.ts`, `src/lib/application/session/series/openness.spec.ts`, `scripts/functional-ui.mjs`

- Le banc (D10) : il tire des exercices à passages (une famille, un index, des paramètres de passage parmi les pièces enregistrées) et des routines sur les exercices tirés ; il joue tous ceux que les validateurs acceptent, avec des réponses justes et sans réponse, par `startRoutine` et `startExercise`. Un cas écrit à la main pour chaque sorte tient le banc quand le hasard n'en donne pas.
- Le script : chaque routine du catalogue et un exercice importé de chaque sorte, joués au-delà de la respiration ; ses attentes de texte suivent l'accueil et la Bibliothèque.

- [ ] **Step 1: Étendre le banc, le voir jouer (compter ce qu'il joue de chaque sorte, l'afficher dans le message d'échec).**
- [ ] **Step 2: Le script (ne pas le lancer : dire ce qu'il visite).**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `test: draw passages exercises and routines on the open bench`

### Task 6: Les docs, et l'état du chantier

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- [ ] **Step 1:** `docs/fichiers-de-definitions.md` : le budget de vérification et sa phrase de refus ; la consigne refusée en mots ; comment un fichier importé se joue (la Bibliothèque, une routine importée sur l'accueil).
- [ ] **Step 2:** `CLAUDE.md` : « Sessions », « Exercise sessions », « Play views », le bilan, l'accueil, la Bibliothèque ; les commandes et l'architecture si un module a bougé.
- [ ] **Step 3:** la spec : « Réalisation (plan 5b) » — D1 à D10, ce que l'exécution a décidé en plus ; puis « État du chantier 2 » : ce que la spec demandait et qui est fait, section par section (§ 2 à § 11), ce qui reste ouvert et à qui (l'auteur : le préfixe réservé du catalogue, les questions posées au fil des plans ; un chantier suivant : le reste).
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `docs: close chantier 2 on what was built and what is left`

### Étape jouable

- [ ] Dans l'aperçu, micro simulé : l'accueil (les routines, sans « Exercices ») ; la Bibliothèque (les onze exercices) ; depuis elle, un exercice de rythme, le jeu libre d'un exercice de mémoire, un exercice à passages ; un fichier importé par les réglages (un exercice de chaque sorte, une routine) joué au-delà de la respiration ; les bilans ; aucune erreur de console.
