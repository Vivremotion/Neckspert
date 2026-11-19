# Chantier 2, plan 5a : les routines en données, les séances par routine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une entrée de l'accueil est une routine écrite dans un fichier : son titre, ses exercices, son ouverture. Une séance joue une routine, ou un exercice seul. Les sortes de séance du code (`learn`, `free`, `triads`, `triads-zone`, `gesture`, `exercise`) disparaissent, et avec elles les derniers identifiants du catalogue écrits dans `src/`.

**Architecture:**

- **La routine** est un objet de fichier (`routines`), lu après les exercices, rangé dans un registre.
- **Comment une séance pioche** se déduit des exercices de la routine : tous de mémoire, la procédure d'apprentissage ; tous à passages, la source de passages. Le reste est refusé au chargement.
- **L'ouverture** est un prédicat écrit sur ce que le joueur sait. Une routine qui n'a rien à jouer n'est pas proposée.
- **Un seul service** dit, pour chaque routine : ouverte, révisions dues, prochaine révision, au repos.
- **« On change d'air »** fait sortir de la séance l'exercice bloqué ; la séance continue avec les autres.
- **Les écrans ne changent pas d'allure dans ce plan** : l'accueil garde ses blocs, nourris par le service. Le bilan unique, l'accueil sans « Exercices » et la Bibliothèque sont le plan 5b.

**Tech Stack:** TypeScript, Svelte 5, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (§ 8 ; § 2 pour le fichier ; § 11 « La frontière » ; tout ce que les « Réalisation » laissent « au plan 5 »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan.
- **Rien de stocké ne change de forme** : base 13, sauvegarde 9. Une séance enregistre déjà `routine`, `exercise` et `free` ; les séances d'avant se relisent telles quelles.
- **Ce que le joueur vit ne change que là où la spec ou ce plan le décide** :
  - « On change d'air » ne termine plus toute une séance de plusieurs exercices (§ 8) ;
  - le lien « Bibliothèque » de la navigation reste le jeu libre des notes jusqu'au plan 5b ;
  - les adresses `/session?kind=…` deviennent `/session?routine=…` (avec `&free=1` pour le jeu libre) et `/session?exercise=…` (D6).
    Tout le reste est identique : ce que chaque séance pioche, dans quel ordre, les révisions dues de l'accueil, quand « Triades vers une case » et « Changements » se montrent, le jeu libre des notes.
- **Les règles pédagogiques gardées sont jouées de bout en bout** (§ 11), pas la parité avec l'ancien code : les specs de séance existantes (`notes`, `triadsSession.spec.ts`, `gestureSession.spec.ts`) restent vertes, lancées par leur routine.
- **Le cœur ne nomme ni routine, ni exercice, ni capacité, ni grille du catalogue.** À la fin du plan, un test de frontière le tient pour tout `src/` hors tests et migrations (Task 6).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.** Chaque contrôle est borné avant le travail qu'il borne.
- **Instantanés** : celui du catalogue gagne les quatre routines (Task 1) ; aucun autre ne change.
- **Rien de privé dans le dépôt.** `docs/projet.md` n'est pas modifié.
- **Textes de l'écran** en français et en anglais ; jamais sous 16 px.
- **Vocabulaire** : « routine » / `routine` ; « ouverture » / `opens` ; « au repos » / `resting` ; « jeu libre » / `free`.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Classement des pièces

| Pièce                                                                                                       | Sorte                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| la routine, son registre, sa lecture, ses refus ; le prédicat d'ouverture ; la séance déduite des exercices | primitive du cœur               |
| un exercice bloqué qui sort de la séance                                                                    | primitive du cœur               |
| les quatre routines du catalogue, leurs titres, l'ouverture de `chords-zone`                                | donnée                          |
| le jeu libre d'un exercice de mémoire seul                                                                  | primitive du cœur               |
| l'accueil qui garde ses blocs ; le bilan par piste ; le lien « Bibliothèque » vers le jeu libre des notes   | exception, remplacée au plan 5b |
| une routine sans mémoire dont un exercice n'écrit pas de passages                                           | non construit : refusé (D3)     |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — La routine s'écrit comme au § 8** : `{ "id", "title": { "fr", "en" }, "exercises": [...], "opens" }`. Le catalogue en écrit quatre, chacune dans le fichier de ses exercices : `notes` (« Apprentissage »), `chords` (« Triades »), `chords-zone` (« Triades vers une case »), `changes` (« Changements »).
- **D2 — L'ordre des exercices d'une routine de mémoire est l'ordre où ils introduisent** : le premier listé qui a un élément prêt introduit. `notes` liste `identify-note` puis `locate-note-string`, comme le code le fait aujourd'hui (plan 3, D6).
- **D3 — Trois routines sont refusées au chargement** : celle qui mêle des exercices de mémoire et sans mémoire (§ 8) ; celle dont deux exercices travaillent la même capacité ; celle, sans mémoire, dont un exercice n'écrit pas de `passages`. Cette dernière n'est pas construite : « chaque exercice à son tour, un passage chacun » demande des passages. Les exercices de rythme se jouent seuls.
- **D4 — L'ouverture** : `{ "acquired": { "skill", "atLeast" } }`, `{ "level": { "exercise", "scope", "atLeast" } }`, `{ "all": [...] }`, `{ "any": [...] }`. « Ceux qu'une correspondance désigne » (§ 8) n'est pas construit : l'ouverture par index des passages le fait déjà. `chords-zone` s'ouvre à six triades acquises en ancrage ; « une fois ouverte, elle le reste » n'a plus besoin d'être écrit : une carte acquise le reste.
- **D5 — Une routine se montre quand son ouverture est vraie et qu'un de ses exercices a quelque chose à jouer.** La routine des changements se montre ainsi dès qu'un index est ouvert, sans écrire d'ouverture.
- **D6 — Une séance se lance par sa routine ou par son exercice** : `/session?routine=<id>`, `/session?exercise=<id>`. Une adresse qui ne mène nulle part le dit et renvoie à l'accueil. Les anciennes adresses `?kind=` ne sont plus lues.
- **D7 — Le jeu libre.** Une routine de mémoire se joue aussi en jeu libre (`/session?routine=notes&free=1`) : des éléments tirés parmi ceux de tous ses exercices, chacun au niveau qu'il tient. C'est le jeu libre des notes d'aujourd'hui, et le lien « Bibliothèque » y mène jusqu'au plan 5b. Un exercice de mémoire joué seul se joue de la même façon, sur ses seuls éléments. Un exercice à passages joué seul passe par la source de passages ; un exercice à figures, comme aujourd'hui. Le jeu libre garde sa règle : une tentative sur une carte apprise et laissée assez longtemps compte à froid.
- **D8 — « On change d'air »** : dans une séance de plusieurs exercices, l'exercice bloqué (sur sa portée) sort de la séance et se repose ; la séance continue. Elle finit quand il ne reste rien. Dans une séance d'un seul exercice, rien ne change. Le repos ne change pas ce que la séance suivante pioche (la lettre du § 8).
- **D9 — Une séance de routine ouvre les capteurs des exercices de toutes les routines**, comme les trois pistes aujourd'hui : ce que les autres capteurs entendent reste gardé sur les tentatives. Une séance d'un exercice seul n'ouvre que les siens.
- **D10 — L'en-tête et la consigne de départ viennent des données.** L'en-tête du jeu porte le titre de la routine, ou celui de l'exercice joué seul. La consigne de l'écran de départ, quand le premier exercice n'en écrit pas, est celle que la routine écrit (`howTo`, en français et en anglais) : les quatre routines du catalogue écrivent les textes que l'écran tenait par sorte de séance. Un exercice joué seul sans consigne garde la phrase générale d'aujourd'hui.
- **D11 — Plus aucun identifiant du catalogue dans `src/`** hors tests et migrations. Le manche (la carte, les statistiques) lit les capacités dont l'ensemble est `note-on-string` ou `placed-note` ; le jeu libre et la carte prennent leurs places dans les éléments des exercices ; les pages de démonstration choisissent dans le registre.

## Review Focus

1. **Une séance qui ne pioche plus comme avant** : l'ordre d'introduction des notes, la zone qui n'entre que sur l'ancrage, les passages à tour de rôle. Les specs de séance existantes, lancées par leur routine, le tiennent (Task 3).
2. **Un fichier importé qui écrit une routine** : un exercice inconnu, une liste vide ou énorme, un mélange, une ouverture profonde ou qui nomme une capacité inconnue — refusé au chargement, le champ nommé, sans figer le démarrage (Task 1, Task 2).
3. **Une routine du catalogue dont un exercice manque** (son fichier refusé ou retiré) : la routine est refusée, l'accueil ne la montre pas, rien ne lève (Task 1, Task 2).
4. **Le joueur qui reprend** : ses séances enregistrées (`routine`, `free`, `exercise`) se relisent ; le bilan d'une ancienne séance s'ouvre ; ses niveaux et ses repos sont là (Task 4).
5. **« On change d'air » au milieu d'une séance de plusieurs exercices** : la séance continue avec les autres, le bloqué ne revient pas, la séance finit quand il ne reste rien ; l'annonce et le bilan nomment chaque exercice au repos (Task 5).

## File Structure

| Fichier                                                       | Rôle                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/routine/`                                     | créé : `types.ts`, `fromJson.ts`, `registry.ts`, `validate.ts`, `opens.ts`                                                                         |
| `src/lib/domain/definitions/file.ts`, `register.ts`           | modifiés : la liste `routines`, lue après les exercices                                                                                            |
| `catalog/notes.json`, `chords.json`, `changes.json`           | les quatre routines                                                                                                                                |
| `src/lib/application/app.ts`, `services/createAppServices.ts` | modifiés : `routines()`, `startRoutine`, `startExercise` pour tout exercice                                                                        |
| `src/lib/application/session/`                                | modifié : l'origine d'une séance à la place de sa sorte ; l'exercice bloqué qui sort                                                               |
| `src/lib/domain/session/passageSource.ts`, la procédure       | modifiés : laisser un exercice de côté                                                                                                             |
| `src/routes/session/`, `src/routes/+page.svelte`, l'accueil   | modifiés : les adresses, les blocs nourris par le service                                                                                          |
| supprimés                                                     | `src/lib/domain/exercise/catalogIds.ts`, `src/lib/application/session/sessionKindFromQuery.ts`, `src/lib/domain/triads/zoneOpen.ts`, `SessionKind` |

---

### Task 1: La routine, objet de fichier

**Files:**

- Create: `src/lib/domain/routine/types.ts`, `fromJson.ts`, `registry.ts`, `validate.ts`, leurs specs
- Modify: `src/lib/domain/definitions/file.ts`, `register.ts`, leurs specs ; `src/lib/composition/definitions.ts` ; `catalog/notes.json`, `chords.json`, `changes.json` ; l'instantané du catalogue ; `src/lib/composition/catalogFiles.spec.ts`

**Interfaces:**

```ts
// routine/types.ts
export interface RoutineDefinition {
	id: string;
	title: { fr: string; en: string };
	/** In the order they introduce (memory) or take turns (passages). */
	exercises: ExerciseId[];
	/** Told on the start screen when the first exercise played tells none. */
	howTo?: { fr: string; en: string };
	opens?: Opening;
}
export type Opening =
	| { acquired: { skill: SkillId; atLeast: number } }
	| { level: { exercise: ExerciseId; scope?: string; atLeast: number } }
	| { all: Opening[] }
	| { any: Opening[] };
export const MAX_ROUTINE_EXERCISES = 32;
export const MAX_OPENING_TERMS = 16; // every node of the predicate counted
export const MAX_OPENING_DEPTH = 4;

// routine/fromJson.ts
export function routineFromJson(json: unknown): RoutineDefinition; // throws naming the field
// routine/validate.ts — the references, read in the registries
export function routineProblem(routine: RoutineDefinition): string | null;
// routine/registry.ts
export function registerRoutine(routine: RoutineDefinition, file: string): string | null; // the holder of the id, or null
export function findRoutine(id: string): RoutineDefinition | undefined;
export function routines(): RoutineDefinition[]; // in the order registered
export function clearRoutines(): void;
```

- `registerFiles` gagne une quatrième passe par source : les routines, après les exercices. `Registered.kind` et `DefinitionKind` gagnent `'routine'`. L'identifiant suit `idProblem` ; les routines ont leur espace de noms.
- `routineProblem` refuse, le champ nommé : un exercice qu'aucun fichier ne définit ; une liste vide ou de plus de `MAX_ROUTINE_EXERCISES` ; un exercice listé deux fois ; un mélange de capacités de mémoire et sans mémoire ; deux exercices sur une même capacité ; une routine sans mémoire dont un exercice n'écrit pas de `passages` ; une ouverture qui nomme une capacité ou un exercice inconnu, un `atLeast` qui n'est pas un entier positif, plus de `MAX_OPENING_TERMS` termes ou de `MAX_OPENING_DEPTH` niveaux.
- Le catalogue : `notes` = `["identify-note", "locate-note-string"]`, « Apprentissage » / « Learning » ; `chords` = `["chord-anchor"]`, « Triades » / « Triads » ; `chords-zone` = `["chord-zone"]`, « Triades vers une case » / « Triads around a fret », `"opens": { "acquired": { "skill": "chord-anchor", "atLeast": 6 } }` ; `changes` = les quatre exercices des changements dans l'ordre d'aujourd'hui, « Changements » / « Changes ». Les titres sont ceux que l'accueil écrit aujourd'hui (les lire dans `src/lib/ui/screens/home/messages.ts`). Chaque routine écrit en `howTo` le texte que `src/lib/ui/play/messages.ts` tient aujourd'hui pour sa sorte de séance (`howTo.learn`, `triads`, `triads-zone`, `gesture`), mot pour mot, dans les deux langues.

- [ ] **Step 1: Écrire les tests qui échouent** — la lecture d'une routine et chacun de ses refus (Review Focus 2) ; la quatrième passe (une routine nomme un exercice d'un fichier qui vient après ; un identifiant pris deux fois nomme son détenteur) ; Review Focus 3 : le fichier d'un exercice refusé, sa routine refusée, les autres chargées ; le catalogue sans refus avec ses quatre routines ; une routine de 32 exercices et une ouverture aux limites chargées vite (le budget de `definitionLimits.spec.ts`).
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check` ; l'instantané du catalogue lu ligne à ligne.
- [ ] **Step 5: Commit** — `feat: read the routines a definition file writes`

### Task 2: L'ouverture, et un seul service pour l'accueil

**Files:**

- Create: `src/lib/domain/routine/opens.ts`, `opens.spec.ts`
- Modify: `src/lib/application/app.ts`, `src/lib/application/services/createAppServices.ts`, leurs specs ; `src/routes/+page.svelte`, `src/lib/ui/screens/home/HomeScreen.svelte`, `messages.ts`, leurs specs
- Delete: `src/lib/domain/triads/zoneOpen.ts` et sa spec

**Interfaces:**

```ts
// routine/opens.ts
export interface Known {
	/** Cards acquired, by skill. */
	acquired(skill: SkillId): number;
	/** The level an (exercise, scope) holds, 1 for level 1; null when it holds none. */
	level(exercise: ExerciseId, scope: string | undefined): number | null;
}
export function opened(opening: Opening | undefined, known: Known): boolean;

// app.ts — replaces triads(), gesture() and resting()
export interface RoutineEntry {
	id: string;
	title: { fr: string; en: string };
	/** Its opening holds and one of its exercises has something to play. */
	open: boolean;
	/** Reviews due now, for a routine of memory exercises; null otherwise. */
	due: number | null;
	nextReviewAt: number | null;
	/** One of its exercises rests after « On change d'air ». */
	resting: boolean;
}
export interface AppServices {
	routines(): Promise<RoutineEntry[]>; // in the order registered
	/** Of `exerciseIds`, those resting — kept for the exercises played alone until plan 5b. */
	resting(exerciseIds: readonly ExerciseId[]): Promise<ExerciseId[]>;
}
```

- « Quelque chose à jouer » (D5) : pour une routine de mémoire, un de ses exercices a une carte servie ou un élément qui peut entrer ; pour une routine de passages, `passagesOpen` d'un de ses exercices.
- Les révisions dues et la prochaine révision d'une routine de mémoire se comptent sur les cartes servies des capacités de ses exercices (ce que `homeStats` et `triads()` comptent aujourd'hui, chacun pour sa piste).
- L'accueil garde ses blocs et son allure : chaque bloc de routine vient de `routines()` (titre, révisions dues ou prochaine révision, « au repos »), une routine fermée n'est pas montrée ; la touche Espace lance la première routine ouverte. « Exercices », la tendance et l'écart au temps restent (plan 5b). `homeStats` ne garde que ce que ces deux-là lisent.

- [ ] **Step 1: Écrire les tests qui échouent** — `opened` sur chaque forme, imbriquée ; le service sur des bases écrites dans le test : rien d'acquis (ni la zone ni les changements), six triades acquises (la zone), un index ouvert (les changements), des révisions dues, un exercice au repos ; Review Focus 3 (une routine refusée absente du service) ; l'accueil rendu pour ces cas, mêmes textes qu'aujourd'hui.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `feat: tell the home what each routine offers from one service`

### Task 3: Une séance joue une routine, ou un exercice seul

**Files:**

- Modify: `src/lib/application/app.ts`, `services/createAppServices.ts`, `src/lib/application/session/SessionController.svelte.ts`, `src/lib/domain/progress/plans.ts`, `src/lib/testing/` (les bancs de séance), leurs specs

**Interfaces:**

```ts
// app.ts — startSession(kind) leaves at Task 4; these two are added here and it calls them
startRoutine(routineId: string, options?: { free?: boolean }): Promise<PlaySessionController>;
/** Any exercise of the registry, alone (D7). */
startExercise(exerciseId: ExerciseId): Promise<PlaySessionController>;

// domain/types.ts
export type SessionOrigin = { routine: string; free?: true } | { exercise: ExerciseId; free?: true };
```

- `startRoutine` : de mémoire, `createLearningProcedure` sur `exerciseSubject({ exercises })` dans l'ordre de la routine, avec les cartes et les tentatives des capacités que ses exercices travaillent ou lisent pour entrer (`params.learning.enter`) ; à passages, `createPassageSource` sur ses exercices. Les capteurs ouverts : D9. Une routine fermée ou sans rien à jouer se lance quand même (l'accueil ne la montre pas ; une séance sans rien à demander finit sur le bilan, comme la zone aujourd'hui).
- Le jeu libre (D7) : `buildFreePlan` généralisé tire parmi les éléments que listent les exercices donnés (`definition.items`, lus par leur ensemble), chacun au niveau qu'il tient ; une routine de mémoire jouée libre s'enregistre `{ routine, free: true }` (comme aujourd'hui), un exercice de mémoire seul `{ exercise, free: true }`. Le jeu libre d'une routine sans mémoire est refusé. Un exercice à passages seul : `createPassageSource` sur lui seul. Un exercice à figures : comme aujourd'hui.
- Le contrôleur reçoit l'origine de la séance (`SessionOrigin`) à la place de sa sorte, et l'enregistre telle quelle. `startSession(kind)` reste le temps de cette tâche, réduit à un appel de `startRoutine` par la routine que la sorte nommait (la table part à la Task 4).
- Une ancienne séance `{ routine: 'notes', free: true }` se relit : son bilan s'ouvre comme aujourd'hui.

- [ ] **Step 1: Écrire les tests qui échouent** — Review Focus 1 : les specs de séance existantes lancées par `startRoutine` (les notes, les triades, la zone, les changements), leurs affirmations inchangées ; une routine écrite dans le test avec deux exercices de mémoire dans l'autre ordre introduit dans cet ordre ; le jeu libre d'une routine de mémoire (les éléments des deux exercices des notes, tirés comme aujourd'hui, la séance enregistrée `{ routine, free }`) ; `startExercise` sur un exercice de mémoire (jeu libre : ses seuls éléments, les niveaux, la séance enregistrée), sur un exercice à passages, sur un exercice à figures ; une routine inconnue rejetée avec son nom.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `feat: start a session from its routine or its exercise`

### Task 4: Les sortes de séance quittent le code

**Files:**

- Modify: `src/lib/domain/types.ts`, `src/lib/domain/progress/stats.ts`, `src/lib/application/app.ts`, `services/createAppServices.ts`, `src/lib/application/session/contract.ts`, `SessionController.svelte.ts`, `src/routes/session/+page.svelte` et ses voisins, `src/routes/+page.svelte`, `src/routes/+layout.svelte`, `src/lib/ui/play/PlayFrame.svelte`, `src/lib/ui/play/messages.ts`, `src/lib/ui/screens/summary/`, `src/lib/ui/screens/home/`, `scripts/functional-ui.mjs`, leurs specs
- Delete: `src/lib/application/session/sessionKindFromQuery.ts` et sa spec

- `SessionKind`, `ROUTINE_OF_KIND`, `sessionOriginOf(kind)`, `sessionKindOf`, `AppServices.startSession` et `SessionSummary.kind` disparaissent. Le bilan lit l'origine enregistrée et les capacités des exercices de la séance : ses prochaines révisions sont celles des capacités de la routine jouée ; ce qu'il montrait « pour une séance de triades » se décide sur l'ensemble des capacités (`voicing-on-strings`), plus sur une sorte.
- `/session` lit `routine` (avec `free=1`) ou `exercise` ; sans l'un des deux, ou pour un identifiant inconnu : un message et un lien vers l'accueil (fr, en). L'accueil lance ses routines par leur identifiant. Le lien « Bibliothèque » de la navigation mène au jeu libre de la première routine de mémoire du registre (`/session?routine=<id>&free=1`, l'identifiant lu dans le registre) : le jeu libre des notes d'aujourd'hui, sans identifiant écrit dans le code.
- L'en-tête et la consigne de départ (D10) : le contrôleur donne à l'écran le titre et la consigne de ce qu'il joue ; `kindName` et `howTo` par sorte quittent `src/lib/ui/play/messages.ts`, sauf la phrase générale d'un exercice joué seul et le mot « Jeu libre ». Le monde d'une vue ne lit toujours pas l'origine.
- `scripts/functional-ui.mjs` : ses adresses suivent (ne pas le lancer ; lire ce qu'il attend).

- [ ] **Step 1: Écrire les tests qui échouent** — les adresses (`routine`, `routine` + `free`, `exercise`, rien, un identifiant inconnu) ; l'en-tête et la consigne de départ de chaque routine du catalogue, mot pour mot ceux d'aujourd'hui ; Review Focus 4 (des séances d'avant de chaque origine, leurs bilans rendus comme aujourd'hui) ; plus aucune référence à `SessionKind` dans `src/` (un test de frontière court).
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `refactor: tell a session by what it plays, not by a kind`

### Task 5: L'exercice bloqué sort de la séance

**Files:**

- Modify: `src/lib/domain/progress/selector.ts` (`ItemSource`), `src/lib/domain/session/passageSource.ts`, `src/lib/application/session/series/exerciseLevels.ts`, `SessionController.svelte.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/domain/types.ts`, l'écran du bilan, leurs specs

**Interfaces:**

```ts
// ItemSource — optional
/** Stops serving (exercise, scope) for the session; false when it then has nothing left to serve. */
leave?(exerciseId: ExerciseId, scope?: string): boolean;
// GestureSummary.changeOfAir becomes a list
changeOfAir?: { exerciseId: ExerciseId; scope?: string }[];
```

- À la frontière qui suit le tour bloquant : si la source sait laisser de côté (`leave`) et qu'il lui reste à servir, la série continue ; l'annonce « On change d'air » nomme l'exercice (et sa portée) jusqu'à la mesure comptée suivante. Sinon la série finit, comme aujourd'hui.
- La source de passages laisse de côté les index de cette portée ; un exercice sans portée, tous ses index.
- Le repos (`resumeAfter`) s'écrit comme aujourd'hui, sur l'exercice et sa portée.
- Le bilan nomme chaque exercice sorti.

- [ ] **Step 1: Écrire les tests qui échouent** — Review Focus 5, dans la série réelle : le lien bloque, la montée, la zone et la lecture continuent, le lien ne revient pas ; un deuxième exercice bloque ensuite ; le dernier bloque et la séance finit ; une portée bloquée, l'autre grille du même exercice continue ; une séance d'un seul exercice (le rythme) finit comme avant, ses specs intactes ; l'annonce et le bilan.
- [ ] **Step 2: Lancer, vérifier l'échec ; implémenter.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check`.
- [ ] **Step 4: Commit** — `feat: let a blocked exercise leave the session and the others go on`

### Task 6: Plus un identifiant du catalogue dans le code

**Files:**

- Delete: `src/lib/domain/exercise/catalogIds.ts`
- Modify: tout ce qui l'importe (`createAppServices.ts`, `src/lib/domain/progress/neck.ts`, `stats.ts`, `plans.ts`, `src/lib/domain/music/curriculum.ts`, `src/lib/domain/gesture/summary.ts`, les pages `/dev/*`, `src/lib/ui/play/demo/`, les bancs de `src/lib/testing/`), leurs specs
- Create: `src/lib/testing/catalogIdsBoundary.spec.ts`

- Le manche : une carte, une tentative ou une capacité « du manche » est celle dont l'ensemble est `note-on-string` ou `placed-note` (`isNeck` lit le registre des capacités). La carte du manche et le jeu libre prennent leurs places dans les éléments que les exercices de ces capacités listent, plus dans `practiceCards()` ni `LEARNABLE_FRETS`.
- Les cartes servies (`servedCards`) : toute capacité de mémoire, par l'union des exercices du registre qui la travaillent.
- Les tentatives de changements se reconnaissent à leur passage (`data.passage`), plus à une liste de capacités.
- Les pages de démonstration et `/dev/*` choisissent dans le registre (la première grille, le premier exercice à figures…).
- Le test de frontière : il lit les identifiants des capacités, grilles, exercices et routines dans les fichiers de `catalog/`, et refuse chacun, écrit entre guillemets, dans tout fichier de `src/` hors `*.spec.ts`, `src/lib/testing/`, `migrations/`, `legacy/`, les jeux de données de tests ; il se vérifie lui-même avec un fautif posé par le test. Les identifiants qui sont aussi des mots du format (s'il y en a) sont listés avec leur raison.

- [ ] **Step 1: Écrire le test de frontière, le voir échouer avec la liste des fautifs.**
- [ ] **Step 2: Retirer chaque fautif, tests de chaque morceau d'abord.**
- [ ] **Step 3: Vérifier** — `npm test && npm run check` ; les specs de la carte du manche, des statistiques et du jeu libre inchangées dans ce qu'elles affirment.
- [ ] **Step 4: Commit** — `refactor: name no catalog id in the code`

### Task 7: Les docs

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, la spec

- [ ] **Step 1:** `docs/fichiers-de-definitions.md` : la routine (chaque clé, les quatre du catalogue en exemple), l'ouverture, ce qu'une séance pioche selon ses exercices, ce qui est refusé et les limites, un exercice joué seul.
- [ ] **Step 2:** `CLAUDE.md` : « Sessions », « Exercise sessions », « Storage » (les constantes de routine), « Skills, item sets and exercises », ce qui nomme une sorte de séance.
- [ ] **Step 3:** la spec : « Réalisation (plan 5a) » — D1 à D11, ce que l'exécution a décidé en plus, ce qui reste au plan 5b ; le sort de chaque ligne « au plan 5 » des « Réalisation » précédentes (fait ici, ou au plan 5b).
- [ ] **Step 4: Vérifier** — `npm test && npm run check && npx prettier --check` sur les fichiers touchés.
- [ ] **Step 5: Commit** — `docs: say how a file writes a routine`

### Étape jouable

- [ ] Dans l'aperçu, micro simulé : l'accueil liste les routines ouvertes ; une séance de chaque routine au-delà de la respiration (les notes, les triades, la zone et les changements avec des cartes posées à la main) ; un exercice de rythme et le jeu libre des notes joués seuls ; dans les changements, un exercice bloqué sort et la séance continue ; aucune erreur de console.
