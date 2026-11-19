# Chantier 2, plan 2b : importer des fichiers de définitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le joueur importe ses fichiers de définitions dans l'application, en production comme en développement, depuis les réglages. Ils sont rangés dans la base, relus à chaque démarrage, et leurs refus se lisent. `exercises.local/` disparaît.

**Architecture:**

- **Un service** (`AppServices.definitions`) tient les fichiers importés : il les lit dans la table `definitionFiles` (créée au plan 2a), recharge les registres, dit ce que chaque fichier a donné et ce qui a été refusé.
- **Le démarrage attend ce service** : le catalogue est chargé tout de suite, les fichiers importés dès que la base répond, et le premier écran ne se dessine qu'ensuite.
- **Recharger, c'est vider puis remplir** : le catalogue d'abord, puis les fichiers importés dans l'ordre de leurs noms. Un import, une suppression et l'import d'une sauvegarde rechargent.
- **Un fichier importé est une entrée non fiable** : identifiants contrôlés, formes contrôlées, taille bornée, rien d'exécuté.

**Tech Stack:** TypeScript, Svelte 5 (runes), SvelteKit (`ssr = false`), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie, `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md` (C1, C7, C8, C11 ; § 3 ; « Réalisation (plan 1) » et « Réalisation (plan 2a) », dont « Laissé au plan 2b »).

## Global Constraints

- **Branche :** `chantier-2-no-exercices-in-code`, worktree `.worktrees/c2-1-format-catalogue`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Poussée à la fin du plan, pas avant.
- **Ce que le joueur vit sans fichier importé ne change pas** : mêmes écrans, mêmes séances. Aucun instantané ne change ; `catalog/` ne change pas.
- **Rien de stocké ne change de forme** : la base reste en version 13, la sauvegarde en version 9.
- **Une progression n'est jamais perdue** : supprimer un fichier retire ses objets des registres, pas une ligne de la base.
- **Rien de privé dans le dépôt** : ni le contenu ni les identifiants de `exercises.local/`. La matière des tests est commune (triades arpégées, grilles publiques).
- **Un fichier importé n'est jamais exécuté** ; ses textes s'affichent comme du texte (aucun `{@html}`).
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.**
- **Vocabulaire** : « fichier de définitions » / `definition file` ; « fichier importé » / `imported file` ; « refus » / `refusal` ; « capacité » / `skill` ; « ensemble » / `ItemSet`.
- **Interface en français et en anglais** (`defineMessages`), jamais sous 16 px. Le cadre d'un refus est traduit ; sa raison reste celle du validateur, en anglais.
- **Commits :** Conventional Commits en minuscules, impératif ; terminés par la ligne `Co-Authored-By` du modèle qui écrit.

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Un identifiant est fait de lettres, de chiffres, de `-`, de `_` et de `.`,** et commence par une lettre ou un chiffre. Cela vaut pour une capacité, une grille et un exercice. `unknown` est réservé : la migration le donne aux tentatives que rien ne nomme. Les identifiants du catalogue et des fichiers privés convertis passent.
- **D2 — Un fichier est rangé sous son nom, tel que le navigateur le donne.** Deux fichiers du même nom n'existent pas : le second remplace le premier. Le nom est comparé tel quel (casse comprise).
- **D3 — Un fichier trop long n'est pas rangé** (plus de `MAX_DEFINITION_FILE_CHARS`). Tout autre fichier est rangé, même illisible : son refus s'affiche, et l'auteur le remplace par une version corrigée.
- **D4 — L'origine d'un objet importé est le nom de son fichier** ; celle d'un objet du catalogue reste `/catalog/<nom>.json`. Un fichier importé qui porte le nom d'un fichier du catalogue ne le remplace pas : ce sont deux origines.
- **D5 — Le premier écran attend les fichiers importés.** Si la base ne répond pas, l'application démarre avec le catalogue seul et dit, en un refus, que les fichiers importés n'ont pas pu être lus.
- **D6 — Supprimer un fichier demande une confirmation** qui dit que la progression est gardée. Remplacer un fichier n'en demande pas.
- **D7 — L'accueil montre une ligne, dans toute construction, quand un fichier importé a un refus** ; elle mène aux réglages. La liste des refus du catalogue reste réservée au développement.
- **D8 — La doc du format s'appelle `docs/fichiers-de-definitions.md`** (l'ancien `docs/exercices-locaux.md`, déplacé).
- **D9 — Le mode dégradé quand un fichier du catalogue est refusé en production passe au plan 5.** Il touche l'accueil et la composition des séances, que le plan 5 récrit. Ici, une séance ne lit plus que les exercices de sa piste qui existent.
- **D10 — Les cartes dont la clé ne se lit plus par l'ensemble de leur capacité passent au plan 3.** Rien ne sert encore une carte d'une capacité importée ; le plan 3 construit le sujet d'apprentissage qui les ignorera.
- **D11 — Le dossier lié relu à chaque rechargement n'est pas construit** (spec, hors périmètre). En développement comme en production, un fichier retouché se réimporte.

## Review Focus

1. **Remplacer un fichier par un autre du même nom** : les objets que la nouvelle version ne porte plus quittent les registres sans recharger la page (Task 3).
2. **Un fichier rangé qui ne se lit plus** (après une mise à jour du format) : l'application démarre, l'accueil le dit, les réglages donnent la raison (Tasks 3, 4, 5).
3. **Importer une sauvegarde qui porte des fichiers** : leurs objets sont dans les registres aussitôt (Task 3).
4. **Supprimer un fichier dont la progression existe** : aucun écran ne casse ; réimporter retrouve la progression (Tasks 3, 6).
5. **Un fichier choisi par erreur** (une image, un fichier de 20 Mo, un nom avec des espaces et des accents) : refusé ou rangé selon D3, l'écran reste utilisable (Task 4).

## File Structure

| Fichier                                                           | Rôle                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/domain/definitions/ids.ts`                               | la règle d'un identifiant                                            |
| `src/lib/domain/definitions/register.ts`                          | modifié : dit ce qu'il a enregistré                                  |
| `src/lib/composition/definitions.ts`                              | modifié : charger le catalogue, recharger avec les fichiers importés |
| `src/lib/application/definitions/service.ts`                      | le service des fichiers importés                                     |
| `src/lib/application/app.ts`                                      | `AppServices.definitions`                                            |
| `src/routes/+layout.svelte`                                       | attend le service avant de dessiner                                  |
| `src/lib/ui/screens/settings/ImportedFiles.svelte`, `messages.ts` | la section « Fichiers importés »                                     |
| `src/lib/ui/definitions/refusalMessages.ts`                       | le cadre traduit d'un refus, pour l'accueil et les réglages          |
| `docs/fichiers-de-definitions.md`                                 | la doc du format (déplacée)                                          |

---

### Task 1: Ce qu'un fichier a le droit d'écrire

**Files:**

- Create: `src/lib/domain/definitions/ids.ts`, `ids.spec.ts`
- Modify: `src/lib/domain/skill/fromJson.ts`, `src/lib/domain/grid/fromJson.ts`, `src/lib/domain/exercise/fromJson.ts`, `src/lib/application/definitions/checks.ts`, `src/lib/domain/gesture/exercises.ts`, leurs specs

**Interfaces:**

```ts
// domain/definitions/ids.ts
/** Null when `id` may name a skill, a grid or an exercise; else why not. */
export function idProblem(id: unknown, options?: { reserved?: readonly string[] }): string | null;
export const RESERVED_IDS = ['unknown'] as const;
```

- Les trois lecteurs appellent `idProblem` ; capacités et exercices passent `RESERVED_IDS`.
- `exerciseFromJson` vérifie la forme de chaque clé de premier niveau avant de rendre l'exercice.
- `definitionChecks` refuse les paramètres des changements que le sélecteur ne sait pas lire, au lieu de laisser une erreur pour le jeu.

- [ ] **Step 1: Écrire les tests qui échouent**, un par ligne :

| Écrit                                                                | Raison                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `id: ''`, `id: 3`                                                    | `id must be a string, not empty`                                                          |
| `id: 'a:b'`, `'a#b'`, `'a b'`, `'-a'`, `'é'`                         | `id must be made of letters, digits, "-", "_" or ".", and start with a letter or a digit` |
| capacité ou exercice `id: 'unknown'`                                 | `id "unknown" is reserved`                                                                |
| grille `id: 'unknown'`                                               | acceptée                                                                                  |
| exercice `presentation: 3`, `flow: 'x'`, `round: []`, `params: null` | `<clé> must be an object`                                                                 |
| exercice `pick: 'weird'`                                             | `pick must be "loop" or "next"`                                                           |
| exercice `howTo: 3`, `title: { fr: 'x' }`                            | `<clé> must be { fr, en }`                                                                |
| exercice `view: 3`                                                   | `view must be a string`                                                                   |
| exercice `tempo: '80'`                                               | `tempo must be a number`                                                                  |
| exercice `levels: {}`, `items: 'a'`, `figures: {}`, `shapes: {}`     | `<clé> must be a list`                                                                    |
| exercice des changements `params.qualities: ['xyz']`                 | `params.qualities names "xyz", which is no chord quality`                                 |
| exercice des changements `params.stringSets: [[9, 8, 7]]`            | `params.stringSets[0] is no set of strings`                                               |
| exercice des changements `params.rule: 'fly'`                        | `params.rule must be link, climb, zone or jam`                                            |

Et deux gardes : chaque identifiant de `catalog/` passe `idProblem` ; `catalogFiles.spec.ts` reste à zéro refus.

- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** Les messages existants qu'un test épingle gardent leur texte quand le tableau ne les change pas.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: refuse ids and shapes a definition file may not write`

### Task 2: Recharger les registres

**Files:**

- Modify: `src/lib/domain/definitions/register.ts`, `register.spec.ts`, `src/lib/composition/definitions.ts`, `definitions.spec.ts`, `src/lib/composition/createApp.ts`, `src/lib/testing/setup.ts`

**Interfaces:**

```ts
// domain/definitions/register.ts
export interface Registered {
	file: string;
	kind: 'skill' | 'grid' | 'exercise';
	id: string;
}
export interface RegisterResult {
	refusals: Refusal[];
	registered: Registered[];
}
/** Files in the order of their names; in a file, skills, grids, then exercises. Never throws. */
export function registerFiles(
	files: Readonly<Record<string, string>>,
	checks: DefinitionChecks
): RegisterResult;

// composition/definitions.ts
/** What a load gave, the catalog's files apart from the imported ones. */
export interface LoadedDefinitions {
	catalog: RegisterResult;
	imported: RegisterResult;
}
/** Empties the registries, then fills them: the catalog, then the imported files. */
export function loadDefinitions(input: {
	catalog: Readonly<Record<string, string>>;
	imported?: Readonly<Record<string, string>>;
}): LoadedDefinitions;
/** The last load; null before any. */
export function loadedDefinitions(): LoadedDefinitions | null;
```

- `loadDefinitions` n'a plus de garde « une seule fois » : chaque appel vide les trois registres et les remplit. Les lignes de console gardent leur forme, la source des fichiers importés étant `imported`.
- `createApp` ne lit plus `exercises.local/` : il charge le catalogue seul, et seulement si rien n'a encore été chargé (`loadedDefinitions() === null`) : des tests enregistrent leurs propres objets avant de l'appeler. La page d'accueil lit `loadedDefinitions()` à la place de `refusedDefinitions()`, qui disparaît.

- [ ] **Step 1: Écrire les tests qui échouent** — `register.spec.ts` : `registered` liste chaque objet enregistré, dans l'ordre, et aucun objet refusé. `definitions.spec.ts` : un second appel avec moins de fichiers retire les objets des fichiers absents (Review Focus 1) ; un fichier importé nommé `notes.json` et le fichier du catalogue `/catalog/notes.json` cohabitent (D4) ; une collision d'identifiant avec le catalogue nomme `/catalog/notes.json` ; `loadedDefinitions()` rend le dernier chargement.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter**, et adapter les appelants de `registerFiles` (ils lisent `.refusals`).
- [ ] **Step 4: Vérifier** — `npm test && npm run check`. `grep -rn "exercises.local" src` ne rend plus que des commentaires à récrire dans cette tâche.
- [ ] **Step 5: Commit** — `refactor: reload the registries from the catalog and the imported files`

### Task 3: Le service des fichiers importés, et le démarrage

**Files:**

- Create: `src/lib/application/definitions/service.ts`, `service.spec.ts`
- Modify: `src/lib/application/app.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/composition/createApp.ts`, `createApp.svelte.spec.ts`, `src/routes/+layout.svelte`, `src/lib/testing/fakes.ts`, les faux services des écrans (`src/lib/ui/screens/**/fakeServices.ts`)

**Interfaces:**

```ts
// application/definitions/service.ts
export interface ImportedFile {
	name: string;
	importedAt: number;
	/** What was registered of it, by kind, in the order read. */
	skills: string[];
	grids: string[];
	exercises: string[];
	refusals: Refusal[];
}
export interface DefinitionsService {
	/** Resolves once the imported files are read and registered. Never rejects. */
	ready(): Promise<void>;
	/** The imported files, by name. */
	files(): Promise<ImportedFile[]>;
	/** Stores each file under its name (replacing one of that name), reloads; the files as stored. A file too long is not stored: it comes back in `refused`. */
	import(
		files: readonly { name: string; text: string }[]
	): Promise<{ stored: ImportedFile[]; refused: Refusal[] }>;
	/** Removes the file and reloads. Stored progress is untouched. */
	remove(name: string): Promise<void>;
	/** Reads the table again and reloads (after a backup was imported). */
	reload(): Promise<void>;
	/** The refusals of the imported files at the last load; of the catalog too when `catalog` is true. */
	refusals(options?: { catalog?: boolean }): readonly Refusal[];
}
export function createDefinitionsService(deps: {
	files: DefinitionFileRepositoryPort;
	load(imported: Readonly<Record<string, string>>): LoadedDefinitions;
	now(): number;
}): DefinitionsService;
```

- `AppServices.definitions: DefinitionsService`. `AppServices.backup.importAll` recharge après avoir remplacé les données (Review Focus 3).
- `+layout.svelte` : `{#await services.definitions.ready()}` rien `{:then}` l'application. Le rail de navigation attend aussi.
- D5 : si `files.all()` rejette, `ready()` se résout quand même ; `refusals()` porte alors `{ file: 'imported files', kind: 'file', id: null, reason: 'the imported files could not be read: <message>' }`.

- [ ] **Step 1: Écrire les tests qui échouent** — `service.spec.ts`, sur le faux dépôt et un `load` qui passe par le vrai `loadDefinitions` :
  - `ready()` charge les fichiers rangés ; appelé deux fois, il ne lit la table qu'une fois ;
  - `import` range, recharge, et rend pour chaque fichier ses objets et ses refus ; un fichier trop long n'est pas rangé et revient dans `refused` avec `the file is longer than 1000000 characters` ;
  - réimporter un fichier du même nom avec un exercice en moins : cet exercice n'est plus dans le registre (Review Focus 1) ;
  - `remove` retire les objets du fichier ; un second fichier garde les siens ;
  - `reload` après une écriture directe dans le dépôt (ce que fait l'import d'une sauvegarde) ;
  - un fichier rangé illisible : `ready()` se résout, `files()` le liste avec son refus (Review Focus 2) ;
  - le dépôt qui rejette : D5.
    `createApp.svelte.spec.ts` : après `importAll` d'une sauvegarde 9 qui porte un fichier, son exercice est dans le registre.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: keep imported definition files and load them at startup`

### Task 4: La section « Fichiers importés » des réglages

**Files:**

- Create: `src/lib/ui/screens/settings/ImportedFiles.svelte`, `ImportedFiles.svelte.spec.ts`, `src/lib/ui/definitions/refusalMessages.ts`, `refusalMessages.spec.ts`
- Modify: `src/lib/ui/screens/settings/SettingsScreen.svelte`, `messages.ts`, `src/routes/settings/+page.svelte`, `src/lib/ui/screens/home/messages.ts`, `HomeScreen.svelte` (le cadre d'un refus vient de `refusalMessages.ts`)

**Interfaces:**

- `ImportedFiles.svelte` — props : `files: readonly ImportedFile[]`, `refused: readonly Refusal[]` (les fichiers non rangés du dernier import), `onimport(files: File[]): void`, `onremove(name: string): void`. Présentation seule : la page appelle le service.
- La section vient après « Sauvegarde », avec l'ancre `#imported-files`.
- `refusalMessages.ts` exporte `refusalText(refusal, locale)` : le cadre de l'accueil d'aujourd'hui (fichier, sorte d'objet, identifiant), puis la raison.

Textes :

| Clé          | fr                                                                         | en                                               |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| titre        | Fichiers importés                                                          | Imported files                                   |
| bouton       | Importer des fichiers                                                      | Import files                                     |
| vide         | Aucun fichier importé.                                                     | No imported file.                                |
| aide         | Un fichier du même nom remplace le précédent.                              | A file of the same name replaces the one before. |
| contenu      | `2 capacités, 1 grille, 3 exercices` (les sortes à zéro ne sont pas dites) | `2 skills, 1 grid, 3 exercises`                  |
| rien de lu   | Rien n'a été lu dans ce fichier.                                           | Nothing was read from this file.                 |
| supprimer    | Supprimer                                                                  | Remove                                           |
| confirmation | Supprimer ce fichier ? Ta progression est gardée.                          | Remove this file? Your progress is kept.         |
| non rangé    | `<fichier>` n'a pas été importé : `<raison>`                               | `<file>` was not imported: `<reason>`            |

- [ ] **Step 1: Écrire les tests qui échouent** — le composant : la liste vide ; un fichier avec ses comptes et sa date ; ses refus, chacun avec son cadre ; « Supprimer » demande la confirmation puis appelle `onremove` ; « Annuler » ne l'appelle pas ; le choix de deux fichiers appelle `onimport` avec les deux ; un fichier non rangé s'affiche ; un nom avec des espaces et des accents s'affiche tel quel, comme du texte. `refusalMessages.spec.ts` : les quatre sortes, avec et sans identifiant, dans les deux langues.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.** La page lit chaque `File` avec `file.text()` ; un fichier qu'elle ne peut pas lire comme du texte revient en « non rangé ». Le champ de fichier accepte `.json` et plusieurs fichiers, et se vide après chaque choix pour qu'on puisse rechoisir le même fichier.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: import, replace and remove definition files from the settings`

### Task 5: L'accueil dit qu'un fichier importé a un problème

**Files:**

- Modify: `src/routes/+page.svelte`, `src/lib/ui/screens/home/HomeScreen.svelte`, `HomeScreen.svelte.spec.ts`, `messages.ts`

**Interfaces:**

- `HomeScreen` gagne `importedProblems: number` : au-dessus de zéro, une ligne et un lien vers `/settings#imported-files`. fr : `Un fichier importé a un problème.` / `<n> fichiers importés ont un problème.` ; en : `An imported file has a problem.` / `<n> imported files have a problem.` Lien : `Voir dans les réglages` / `See in the settings`.
- La page compte les fichiers importés qui ont au moins un refus (`services.definitions.refusals()`), dans toute construction. La liste `refused` reste réservée au développement et ne porte plus que les refus du catalogue.

- [ ] **Step 1: Écrire les tests qui échouent** — zéro : aucune ligne ; un ; plusieurs ; le lien.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `feat: tell on the home screen that an imported file has a problem`

### Task 6: Une progression sans définition ne casse rien

**Files:**

- Create: `src/lib/application/services/orphanProgress.spec.ts`, `src/routes/routes.svelte.spec.ts`
- Modify: `src/lib/domain/exercise/registry.ts` (`findExercise`), ce que les tests font apparaître dans `src/lib/application/services/createAppServices.ts`, `src/lib/domain/progress/stats.ts`, `src/lib/application/session/`

**Interfaces:**

```ts
// domain/exercise/registry.ts
export function findExercise(id: ExerciseId): ExerciseDefinition | undefined;
```

- [ ] **Step 1: Écrire les tests qui échouent** — `orphanProgress.spec.ts`, sur les faux dépôts, avec une base qui porte, en plus d'une progression normale : une carte et des tentatives d'une capacité qu'aucun fichier ne définit ; des tentatives, un niveau et une séance d'un exercice qu'aucun fichier ne définit ; une séance d'une routine inconnue. Chaque service que l'accueil, la carte du manche, le bilan et les réglages appellent se résout : `homeStats`, `triads`, `gesture`, `resting`, `neckMap`, `sessionSummary` de chacune de ces séances, `backup.exportAll` puis `importAll` de l'export. `startSession('learn')` démarre. Un test retire un exercice de la piste des notes du registre : `startSession('triads')` démarre quand même (D9).
      `routes.svelte.spec.ts` : chaque module `src/routes/**/+page.svelte` et `+layout.svelte` s'importe avec les registres vides (`import.meta.glob`, sans `eager`).
- [ ] **Step 2: Lancer, noter ceux qui échouent.**
- [ ] **Step 3: Corriger chaque lecteur qui lève** : il ignore la ligne orpheline, il ne la supprime pas.
- [ ] **Step 4: Vérifier** — `npm test && npm run check`.
- [ ] **Step 5: Commit** — `fix: keep screens working when stored progress has no definition`

### Task 7: Les docs, et la fin de `exercises.local/`

**Files:**

- Move: `docs/exercices-locaux.md` → `docs/fichiers-de-definitions.md`
- Modify: `CLAUDE.md`, `.gitignore` (le commentaire), `docs/feuille-de-route.md` (le chemin de la doc, rien d'autre), `scripts/musicxml-to-lilypond.mjs` (un commentaire), `src/lib/ui/screens/home/HomeScreen.svelte.spec.ts` (les noms de fichiers d'exemple), `src/lib/composition/definitions.spec.ts` (le chemin de l'exemple), `src/lib/infrastructure/storage/migrations/v13.ts` (un commentaire), `docs/superpowers/specs/2026-11-18-aucun-exercice-dans-le-code-design.md`
- Ne pas toucher : `docs/projet.md` (l'auteur y a des notes non commitées ; ses phrases devenues fausses lui sont signalées dans la passation).

- [ ] **Step 1: Déplacer et récrire la doc** : on importe un fichier depuis les réglages, en production aussi ; un fichier du même nom remplace ; supprimer garde la progression ; la règle des identifiants (D1) ; ce qui est refusé ; la limite de taille. Plus aucune phrase sur un dossier lu au build.
- [ ] **Step 2: Mettre à jour `CLAUDE.md`** : seulement les phrases devenues fausses (le dossier `exercises.local/`, `loadDefinitions`, le démarrage, le service, la section des réglages, la doc renommée).
- [ ] **Step 3: Corriger les deux phrases laissées par le plan 2a** : le commentaire de `upgradedApart` (les clés restent distinctes et aucune ligne n'est perdue, dans tout ordre ; entre deux lignes renommées vers une même clé libre, la première prend la clé), et, dans la spec, « Réalisation (plan 2a) », la phrase « un export se réimporte toujours » (un export des lignes que l'application ou la migration ont écrites se réimporte ; une carte d'une capacité de mémoire dont la clé ne se lit pas par son ensemble reste refusée).
- [ ] **Step 4: Écrire « Réalisation (plan 2b) »** dans la spec : les onze décisions de ce plan, une ligne chacune ; ce qui est laissé au plan 3 (D10) et au plan 5 (D9).
- [ ] **Step 5: Vérifier** — `npm test && npm run check && npx prettier --check CLAUDE.md docs/fichiers-de-definitions.md` ; `grep -rn "exercises.local\|exercices-locaux" src scripts CLAUDE.md docs/*.md .gitignore` ne rend que la ligne `/exercises.local/` de `.gitignore` (gardée : le dossier privé existe encore sur la machine de l'auteur) et `docs/projet.md`.
- [ ] **Step 6: Commit** — `docs: say how a definition file is imported`

### Étape jouable

- [ ] `npm run build` réussit ; la construction ne porte aucun fichier de `exercises.local/`.
- [ ] Dans l'aperçu, depuis les réglages : importer les deux fichiers privés convertis ; l'accueil les liste ; en jouer un au-delà du premier tour, micro simulé ; remplacer un fichier ; en supprimer un puis le réimporter ; exporter une sauvegarde et la réimporter.
- [ ] Recharger la page : les fichiers sont toujours là.
