# Direction artistique, plan 2 : coquille et écrans hors séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passer la coquille (rail de navigation) et les écrans hors séance (Pratiquer, bilan, réglages, calibration, carte du manche) au monde « Près du silence », avec les primitives `NavRail` et `BlockList`, jusqu'à un `DESIGN.md` qui les décrit.

**Architecture:** Deux primitives de présentation pure dans `src/lib/ui/primitives/` ; la règle « où le rail se montre, quelle destination est active » est une fonction pure de `src/lib/ui/shell/navigation.ts`. `src/routes/+layout.svelte` compose le rail et pose le monde clair (police, fond, couleur) sur la seule coquille hors séance, pour que `/session` et `PlayFrame` (plan 3) gardent l'ancien monde. Chaque écran de `src/lib/ui/screens/*` quitte `Pixel*` pour `Button`, `BlockList` et les tokens nouveaux ; sa logique et ses messages restent où ils sont. Rien ne change dans `application/` ni `domain/`.

**Tech Stack:** Svelte 5 (runes), CSS natif, Vitest (`*.svelte.spec.ts` en jsdom, `*.spec.ts` en node), impeccable (détecteur, `impeccable-finish-reviewer`, `impeccable-documenter`), `scripts/functional-ui.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-22-direction-artistique-design.md` (« La coquille et la navigation », « Pratiquer (l'accueil) », « Les autres écrans », « Ordre » point 2, « Réalisation » du plan 1). Esquisse : `.impeccable/mocks/decision/silence.html` (colonne de gauche : rail et « Prochaine séance »). Contrat : `.impeccable/surfaces/src-routes-session-page-svelte.md`. Système construit : `DESIGN.md`, `src/lib/ui/CLAUDE.md`.

## Global Constraints

- Ne pas modifier `src/lib/application/`, `src/lib/domain/`, ni leurs contrats. L'accueil n'affiche que ce que `HomeStats`, `TriadsHome`, `gesture()`, `resting()` et `RHYTHM_EXERCISES` donnent ; il peut lire les constantes de durée du domaine (`LEARN_SESSION_MS`, `GESTURE_SESSION_MS`, `SESSION_MS` de `domain/session/policy.ts`). Aucun plan, « pourquoi » ni durée inventés.
- Tokens du nouveau monde seulement (second bloc `:root` de `src/lib/ui/tokens.css`) : `--np-ground`, `--np-text`, `--np-muted`, `--np-earth`, `--np-now`, `--np-rule`, `--np-font-text`, `--np-size-meta|body|title|prompt|correction`, `--np-step-1..8`, `--np-motion-*`. Jamais `--np-bg`, `--np-mid`, `--np-shade`, `--np-ink`, `--np-tile`, `--np-font-pixel`, `--np-type-*`, `--np-space-*` dans un fichier migré. Aucune valeur brute de couleur, de taille de texte ni d'espacement (sauf 1 px, 2 px, 4 px pour les filets, comme au plan 1).
- Un écran ne mêle jamais les deux mondes. Deux composants de l'ancien monde vivent dans des écrans migrés jusqu'au plan 3 : `ChordShape` (réglages ; ses variables `--shape-ink|ground|accent` existent déjà) et, sur le bilan, `Term` et `PlayedCycle` (voir tâche 5). Aucun autre composant `Pixel*` ne reste dans un écran migré.
- L'ambre (`--np-now`) marque le maintenant : la destination active du rail, le bloc en cours de Pratiquer, et l'action principale d'un écran (au plus une). Les réglages n'ont pas d'action principale, donc pas d'ambre hors du rail.
- Aucun texte sous 16 px ; le texte de l'interface reste dans les `messages.ts` (fr et en).
- Sobriété : pas de texte explicatif superflu, pas de cadre double, pas d'ombre, pas de carte ; filets fins (`--np-rule`, 1 px), marges larges.
- Pas de rail pendant une séance ni sur les pages de jeu de développement et de diagnostic.
- Garder les comportements et les noms accessibles que les specs existantes vérifient (rôles, `aria-pressed`, `disabled`, liens) ; une spec ne change que là où la composition change (accueil), et le dit.
- Barrière de fusion : `npm test && npm run check`.

## Review Focus

1. **Le rail sur une page de jeu** : `/session?kind=free` (la Bibliothèque), `/session/demo`, `/dev/gesture`, `/dev/rhythm`, `/dev/identify`, `/diagnostic/oracle` n'ont pas de rail, et ne prennent pas la police nouvelle de la coquille. Test dans la tâche 1.
2. **Un téléphone à 390 px** : le rail devient une barre en haut, les quatre intitulés tiennent sans défilement horizontal de la page ; la carte du manche défile dans son cadre, pas la page. Vérifié par capture CDP à 390 × 844 dans la tâche 9 ; la règle `showsRail` / `activeDestination` est testée dans la tâche 1.
3. **Un premier lancement** (aucune carte apprise, `medianColdOffsetMs` nul, triades sans dû, geste fermé) : l'accueil montre l'Apprentissage en cours et « Commencer », sans ligne de révisions ni chiffre inventé (tiret). Test dans la tâche 4.
4. **Un exercice de rythme au repos** : sa ligne garde son lien et dit « On y revient plus tard ». Test dans la tâche 4.
5. **Barre d'espace sur l'accueil** : lance toujours l'Apprentissage, mais pas quand le focus est sur un bouton ou un lien du rail ou d'un bloc (sinon Espace activerait deux choses). Test dans la tâche 4 (`src/routes/+page.svelte` ; ajouter `A` à la liste des balises ignorées).

---

### Task 1: La règle du rail, `NavRail` et la coquille

**Files:**

- Create: `src/lib/ui/shell/navigation.ts`, `src/lib/ui/shell/navigation.spec.ts`
- Create: `src/lib/ui/primitives/NavRail.svelte`, `src/lib/ui/primitives/NavRail.svelte.spec.ts`
- Modify: `src/routes/+layout.svelte`

**Interfaces:**

- Produces: `type Destination = 'practice' | 'library' | 'progress' | 'settings'` ; `showsRail(path: string): boolean` ; `activeDestination(path: string): Destination | null`. `NavRail` props : `{ label: string; brand: string; items: readonly { key: string; href: string; label: string }[]; current: string | null }`.

- [ ] **Step 1: Write the failing tests.**
  - `navigation.spec.ts` (node) : `showsRail` est faux pour `/session`, `/session/demo`, `/dev/identify`, `/dev/gesture`, `/dev/rhythm`, `/diagnostic`, `/diagnostic/oracle` ; vrai pour `/`, `/map`, `/settings`, `/calibration`, `/summary`, `/dev/home`, `/dev/summary`, `/dev/map`, `/dev/settings`, `/dev/calibration`. `activeDestination` : `/` et `/summary` → `'practice'` (le bilan suit une pratique) ; `/map` → `'progress'` ; `/settings` et `/calibration` → `'settings'` ; les miroirs `/dev/home|summary|map|settings|calibration` suivent leur page ; tout autre chemin → `null`. `'library'` n'est jamais actif (la Bibliothèque est une séance, sans rail).
  - `NavRail.svelte.spec.ts` (jsdom) : rend un `nav` nommé par `label`, un lien par item dans l'ordre ; l'item `current` porte `aria-current="page"`, les autres non ; aucun numéro dans le texte des liens ; `brand` (« neckspert ») est présent et `aria-hidden="true"` (décor du dos, le titre de la page nomme déjà l'app).
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/shell src/lib/ui/primitives/NavRail.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.**
  - `navigation.ts` : deux fonctions pures, tables de préfixes en constantes nommées.
  - `NavRail.svelte`, d'après la colonne gauche de l'esquisse : fond `--np-text`, texte `--np-ground` ; liens à `--np-size-meta`, minuscules (`text-transform: lowercase`), `letter-spacing: 0.06em`, opacité 0,62 au repos (au moins 4,5:1 sur l'encre : mesure avec `src/lib/ui/contrast.ts`, monte l'opacité si besoin), 1 au survol, au focus et pour l'actif ; l'actif marqué d'un filet ambre de 4 px au bord gauche du rail, à la hauteur du lien ; focus visible 2 px `currentColor`. `brand` en bas, tourné de −90°, `font-weight: 300`, `--np-size-title`, `letter-spacing: 0.4em`. Largeur 168 px (constante CSS locale nommée, `--rail-width`), pleine hauteur, `position: sticky; top: 0; height: 100dvh`. Sous `@container app (width < 720px)` : barre en haut, pleine largeur, la marque à plat sur une première ligne à `--np-size-meta`, les liens sur la suivante, l'actif souligné d'un filet ambre de 4 px sous le lien.
  - `+layout.svelte` : intitulés `fr { label: 'Navigation', brand: 'neckspert', practice: 'Pratiquer', library: 'Bibliothèque', progress: 'Progrès', settings: 'Réglages' }`, `en { …, practice: 'Practice', library: 'Library', progress: 'Progress', settings: 'Settings' }` ; Bibliothèque → `/session?kind=free`. Quand `showsRail(path)` : une grille `.shell` (`grid-template-columns: var(--rail-width) 1fr`, une colonne sous 720 px de conteneur) qui pose le monde clair : `background: var(--np-ground); color: var(--np-text); font-family: var(--np-font-text); font-weight: 400; -webkit-font-smoothing: auto; image-rendering: auto`, et `::selection` encre sur brume ; le contenu dans un `<main>`. Sinon, les enfants seuls, comme aujourd'hui. Déplace ici les `:global(html), :global(body)` (`width/height: auto; overflow: auto; min-height: 100dvh`) que chaque écran répète.
- [ ] **Step 4: Run** les deux specs, puis `npm test && npm run check` ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: add the dark navigation rail and its light shell`.

### Task 2: `Button` pour les écrans hors séance

**Files:**

- Modify: `src/lib/ui/primitives/Button.svelte`, `src/lib/ui/primitives/Button.svelte.spec.ts`

**Interfaces:**

- Produces: props ajoutées `label?: string` (→ `aria-label`), `pressed?: boolean` (→ `aria-pressed`, absent quand non fourni), et la variante `'choice'` : `variant?: 'primary' | 'quiet' | 'choice'`.

- [ ] **Step 1: Write the failing tests** : `label` donne le nom accessible ; `pressed={true}` donne `aria-pressed="true"`, sans `pressed` l'attribut est absent ; `variant="choice"` rend `data-variant="choice"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/primitives/Button.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.** `choice` : une option d'un groupe (langue, style de diagramme, journal) ; filet `1px solid var(--np-text)`, fond transparent, `--np-size-body`, `padding: var(--np-step-1) var(--np-step-3)` ; pressée (`aria-pressed="true"`) ou désactivée parce que choisie : fond `--np-text`, texte `--np-ground`, opacité 1 (la forme pleine dit le choix, pas l'ambre). Les variantes existantes ne changent pas.
- [ ] **Step 4: Run** la spec ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: let buttons name themselves, be pressed and act as choices`.

### Task 3: `BlockList` et `Page`

**Files:**

- Create: `src/lib/ui/primitives/BlockList.svelte`, `src/lib/ui/primitives/BlockList.svelte.spec.ts`
- Create: `src/lib/ui/primitives/Page.svelte`, `src/lib/ui/primitives/Page.svelte.spec.ts`

**Interfaces:**

- Produces: `Page` props `{ title: string; children: Snippet; aside?: Snippet }` : la page hors séance, une `section` nommée par son `h1` (`aria-labelledby`, id généré par `$props.id()`), colonne de lecture `max-width: 44rem`, marges `--np-step-7` en haut et sur les côtés (`--np-step-3` sous 720 px de conteneur), `h1` en `--np-size-prompt` graisse 300 sur un filet encre de 1 px, `aside` (facultatif) aligné à droite sur la ligne de base du titre. Tous les écrans des tâches 4 à 8 s'y posent.
- Produces: `export interface Block { key: string; title: string; subtitle?: string; why?: string; duration?: { text: string; spoken: string }; href?: string; onselect?: () => void }` (exporté depuis `<script module>`). Props : `{ label: string; blocks: readonly Block[]; current?: string }`.

- [ ] **Step 1: Write the failing tests** : `Page` rend une `section` dont le nom accessible est `title`, un seul `h1`, et ses enfants. `BlockList` : une liste (`role="list"`) nommée par `label`, un élément par bloc dans l'ordre ; le titre est un lien quand `href`, un bouton quand `onselect` (un clic l'appelle), du texte sinon ; `subtitle` suit le titre après « · » ; `why` et la durée sont rendus quand fournis, absents sinon ; la durée montre `text` (« 5′ ») et son nom lisible `spoken` (« 5 min », texte masqué visuellement) ; le bloc `current` porte `aria-current="true"`, aucun autre.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/primitives/BlockList.svelte.spec.ts src/lib/ui/primitives/Page.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement**, d'après l'esquisse sans les numéros (aucun ordre de plan n'existe) : chaque bloc une grille `1fr auto` alignée sur la ligne de base, `padding: var(--np-step-3) 0 var(--np-step-2)`, filet `1px solid var(--np-rule)` dessous ; titre `--np-size-title` gras (700), sous-titre même taille en 400 ; `why` sur sa ligne en `--np-earth`, `--np-size-meta`, `margin-top: var(--np-step-1)` ; durée à droite, `--np-size-title`, 300, chiffres tabulaires. Le lien ou le bouton du titre couvre toute la ligne (pseudo-élément étiré), sans soulignement au repos, souligné au survol et au focus, focus visible 2 px `currentColor`. Bloc en cours : filet ambre intérieur de 4 px à gauche (`box-shadow: inset 4px 0 0 var(--np-now)`), le contenu décalé de `--np-step-2`.
- [ ] **Step 4: Run** la spec ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: add the page and the block list of the screens off play`.

### Task 4: Pratiquer (l'accueil)

**Files:**

- Modify: `src/lib/ui/screens/home/HomeScreen.svelte`, `src/lib/ui/screens/home/messages.ts`, `src/lib/ui/screens/home/HomeScreen.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`, et sa spec si elle existe (sinon `src/routes/page.svelte.spec.ts` pour la barre d'espace)
- Create: `src/lib/ui/screens/home/duration.ts`, `src/lib/ui/screens/home/duration.spec.ts`

**Interfaces:**

- Consumes: `Page`, `BlockList` et `Block` (tâche 3), `Button` (tâche 2). Les props de `HomeScreen` ne changent pas.
- Produces: `formatMinutes(ms: number, words: { short: (n: number) => string; spoken: (n: number) => string }): { text: string; spoken: string }` (arrondi à la minute, au moins 1).

- [ ] **Step 1: Write the failing tests.**
  - `duration.spec.ts` : `formatMinutes(300_000, fr)` → `{ text: '5′', spoken: '5 min' }` ; `formatMinutes(20_000, fr).text` → `'1′'`.
  - `HomeScreen.svelte.spec.ts`, réécrit pour la nouvelle composition (le dire dans le message de commit) : un titre de niveau 1 « Pratiquer » ; une liste de blocs nommée « Séances » ; le premier bloc « Apprentissage », en cours (`aria-current`), sa durée « 5′ » ; « 6 révisions dues » / « 1 révision due » / « Prochaines révisions · Dans 2 h » comme `why` de ce bloc ; un clic sur son titre et un clic sur « Commencer » appellent `onstart` ; « Commencer » est le seul bouton `data-variant="primary"` ; blocs « Triades » (avec « 2 révisions de triades dues » quand dû, sans `why` sinon), « Triades vers une case » seulement quand `zoneDue !== null`, « Geste » seulement quand ouvert et `ongesture` fourni ; un bloc par exercice de rythme, titre « Rythme », sous-titre le titre de l'exercice, lien `/session?kind=exercise&exercise=<id>`, « On y revient plus tard » quand il est dans `resting` ; la ligne « Écart au temps · 40 ms · plus près », un tiret sans médiane ; au premier lancement (Review Focus 3), aucun texte « révision ».
  - Barre d'espace (Review Focus 5) : sur la page `/`, Espace avec le focus sur `document.body` lance `goto('/session?kind=learn')` ; avec le focus sur un lien, rien.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/screens/home src/routes` ; attendu : FAIL.
- [ ] **Step 3: Implement.**
  - `messages.ts` : ajoute `title: 'Pratiquer' / 'Practice'`, `blocks: 'Séances' / 'Sessions'`, `start: 'Commencer' / 'Start'`, `minutes: (n) => \`${n}′\``, `minutesSpoken: (n) => \`${n} min\``; retire `how` (le mode d'emploi est sur la page de départ de la séance) et `rhythmExercises` s'il n'est plus lu.
  - `HomeScreen.svelte`, composition de l'esquisse dans `Page` (titre « Pratiquer », sans durée totale : les blocs sont des choix, pas une suite) ; `BlockList` ; pied en `space-between` : à gauche la ligne de l'écart (libellé `--np-muted` en `--np-size-meta`, valeur `--np-size-title` 300 tabulaire, tendance `--np-earth`), à droite `Button` primaire « Commencer » → `onstart`. Les blocs : Apprentissage (`LEARN_SESSION_MS`, `onselect: onstart`, en cours), Triades et Triades vers une case (`LEARN_SESSION_MS`, `ontriads`), Geste (`GESTURE_SESSION_MS`), Rythme par exercice (`SESSION_MS`, `href`). Supprime le bouton « Rythme » dépliable, `PixelBox`, `PixelButton`, `PixelText`, le damier, l'animation de cartouche, les `:global(html/body)`.
  - `+page.svelte` : `A` rejoint les balises qui ignorent Espace.
- [ ] **Step 4: Run** `npx vitest run src/lib/ui/screens/home src/routes`, puis `npm test && npm run check` ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: lay the practice screen out as a list of sessions`.

### Task 5: Le bilan

**Files:**

- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte`, `src/lib/ui/primitives/Term.svelte`
- Test: `src/lib/ui/screens/summary/SummaryScreen.svelte.spec.ts`, `src/lib/ui/primitives/Term.svelte.spec.ts` (inchangées, elles doivent passer)

**Interfaces:**

- Consumes: `Page` (tâche 3), `Button` (tâche 2).
- Produces: `Term` lit `--term-ground`, `--term-text`, `--term-rule` avec repli sur les anciens tokens (même mécanisme que `--shape-*` de `ChordShape`), pour que la vue rythmique du plan 3 ne change pas.

- [ ] **Step 1: Run** `npx vitest run src/lib/ui/screens/summary src/lib/ui/primitives/Term.svelte.spec.ts` ; attendu : PASS (base avant restyle).
- [ ] **Step 2: Implement.**
  - Composition : dans `Page` (« Bilan ») ; la note (`summary.grade`) en `--np-size-correction` 300 ; les lignes en liste à filets `--np-rule` : libellé à gauche en `--np-size-body`, valeur à droite en `--np-size-title` 300 tabulaire ; les blocs d'exercice (rythme, série, geste, ratés) en lignes à plusieurs segments, titre gras, détails en `--np-earth` `--np-size-meta`. Fatigue détectée : la ligne en gras avec un filet encre de 4 px à gauche (la forme, pas une teinte). « Accueil » en `Button` primaire, « Carte » en `quiet` ; les boutons de réécoute, « Joué juste » et « C’était en place » en `quiet`. Plus de `PixelBox`, `PixelButton`, `PixelText`, damier, animation, `:global(html/body)`.
  - `Term` : `background: var(--term-ground, var(--np-bg)); color: var(--term-text, var(--np-ink)); border: 1px solid var(--term-rule, var(--np-shade))`, focus `var(--term-text, var(--np-ink))` ; le bilan pose `--term-ground: var(--np-ground); --term-text: var(--np-text); --term-rule: var(--np-rule)` et l'espacement de la définition en `--np-step-*` passe par le même repli (`--term-gap`, `--term-pad`).
  - `PlayedCycle` (développement seulement, refait au plan 3) : son conteneur `.played-cycle` redéfinit localement les noms anciens sur les valeurs nouvelles (`--np-ink: var(--np-text); --np-shade: var(--np-muted); --np-bg: var(--np-ground); --np-type-body: var(--np-size-body); --np-type-meta: var(--np-size-meta)`), avec un commentaire « pont jusqu'au plan 3 ». C'est la seule lecture de noms anciens permise dans un écran migré ; elle se note dans « Réalisation ».
- [ ] **Step 3: Run** `npx vitest run src/lib/ui/screens/summary src/lib/ui/primitives`, puis `npm run check` ; attendu : PASS.
- [ ] **Step 4: Commit** `feat: move the summary to the quiet direction`.

### Task 6: Les réglages

**Files:**

- Modify: `src/lib/ui/screens/settings/SettingsScreen.svelte`
- Test: `src/lib/ui/screens/settings/SettingsScreen.svelte.spec.ts`, `src/routes/settings/page.svelte.spec.ts` (inchangées)

**Interfaces:**

- Consumes: `Page` (tâche 3), `Button` avec `label`, `pressed`, `choice` (tâche 2).

- [ ] **Step 1: Run** les deux specs ; attendu : PASS (base).
- [ ] **Step 2: Implement.** Dans `Page` (« Réglages » ; la `section` de `Page` remplace celle de l'écran et son `aria-labelledby`). Chaque groupe une section : intitulé en `--np-size-body` gras, filet `--np-rule` dessous, contenu en dessous à `--np-step-2`. Langue et style de diagramme : `Button variant="choice"` (garder `disabled` sur l'option choisie, que les specs lisent) ; `ChordShape` en `size="small"` à côté de son option, avec `--shape-ink: var(--np-text); --shape-ground: var(--np-ground); --shape-accent: var(--np-rule)`. Entrée audio : `select` natif, filet encre 1 px, fond `--np-ground`, `--np-size-body`, hauteur au moins 48 px, focus 2 px. Gain : « − » / « + » en `choice` avec leurs `label`, la valeur « ×3 » en `--np-size-title` 300 tabulaire. Calibration : la latence en `--np-size-body`, le lien vers `/calibration` souligné (garder `href`). Export / import et journal : `quiet` (bascule du journal en `choice` avec `pressed`). Erreurs (`role="alert"`) en gras avec filet encre de 4 px à gauche. Aucun ambre.
- [ ] **Step 3: Run** les deux specs, puis `npm run check` ; attendu : PASS.
- [ ] **Step 4: Commit** `feat: move the settings to the quiet direction`.

### Task 7: La calibration

**Files:**

- Modify: `src/lib/ui/screens/calibration/CalibrationScreen.svelte`
- Test: `src/lib/ui/screens/calibration/CalibrationScreen.svelte.spec.ts`, `src/routes/calibration/page.svelte.spec.ts` (inchangées)

- [ ] **Step 1: Run** les deux specs ; attendu : PASS (base).
- [ ] **Step 2: Implement.** Dans `Page` (« Calibration », même remplacement). L'entrée en `select` comme aux réglages ; le conseil du casque en `--np-size-body`. Le niveau : un filet de piste `--np-rule` de 8 px de haut, le remplissage `--np-text` (`transform: scaleX`, inchangé). Une action principale ambre à la fois, selon la phase : pas encore à l'écoute → « Écouter » primaire et « Démarrer » `quiet` désactivé ; à l'écoute → « Démarrer » primaire ; en cours → « Annuler » `quiet` ; fini → « Recommencer » primaire, « Calibrer sur le clic » `quiet`. La consigne en `--np-size-prompt` 400 (lue de loin, guitare en main), la progression en `--np-size-title` 300 tabulaire, le résultat et ses mesures sous un filet encre de 1 px, sans boîte inversée. Plus de `Pixel*`.
- [ ] **Step 3: Run** les deux specs, puis `npm run check` ; attendu : PASS.
- [ ] **Step 4: Commit** `feat: move the calibration to the quiet direction`.

### Task 8: La carte du manche

**Files:**

- Modify: `src/lib/ui/screens/map/NeckMapScreen.svelte`
- Test: `src/lib/ui/screens/map/NeckMapScreen.svelte.spec.ts` (inchangée)

- [ ] **Step 1: Run** la spec ; attendu : PASS (base).
- [ ] **Step 2: Implement.** Dans `Page` (« Carte du manche » ; la carte peut élargir la colonne à `max-width: none` par une prop `wide?: boolean` de `Page`, à ajouter avec son test si la capture le demande). La grille garde ses rôles ARIA et ses noms ; elle défile horizontalement dans son propre cadre (`overflow-x: auto`), jamais la page. Les états par la forme : non vu, case vide sous filet `--np-rule` ; en cours, filet encre 1 px ; acquis, filet encre 2 px ; maîtrisé, case pleine `--np-text`, texte `--np-ground`. La hauteur (`pitch`) en `--np-size-body` 500, les deux temps en `--np-size-meta` tabulaires. « Accueil » en `quiet` (le rail mène déjà partout ; pas d'action principale, pas d'ambre). Plus de `Pixel*`, damier ni `:global(html/body)`.
- [ ] **Step 3: Run** la spec, puis `npm run check` ; attendu : PASS.
- [ ] **Step 4: Commit** `feat: move the neck map to the quiet direction`.

### Task 9: Vérification, finition et DESIGN.md

**Files:**

- Modify: `scripts/functional-ui.mjs` (seulement si un sélecteur Game Boy y casse), `src/lib/ui/CLAUDE.md`, `CLAUDE.md` (la ligne `src/lib/ui/` si elle nomme les écrans encore Game Boy), `docs/superpowers/specs/2026-10-22-direction-artistique-design.md` (« Réalisation », plan 2), `DESIGN.md`, `.impeccable/design.json`

- [ ] **Step 1:** `grep -rnE -- '--np-(bg|mid|shade|ink|tile|font-pixel|type-|space-)|Pixel(Box|Button|Text)' src/routes/+layout.svelte src/routes/+page.svelte src/lib/ui/screens src/lib/ui/primitives/{NavRail,BlockList,Page,Button}.svelte` ; attendu : seulement le pont commenté de `.played-cycle` (tâche 5).
- [ ] **Step 2:** `npm test && npm run check` ; attendu : PASS. Puis `node scripts/functional-ui.mjs` contre les serveurs de dev qu'il attend ; attendu : aucun échec, aucun texte sous 16 px.
- [ ] **Step 3:** Captures dans `.impeccable/review/da-2/` : `/dev/home`, `/dev/summary`, `/dev/settings`, `/dev/calibration`, `/dev/map`, et `/` vide, en bureau 1440 × 900 et en téléphone par émulation CDP (`Emulation.setDeviceMetricsOverride` 390 × 844, `mobile: true`, facteur 3), headless Chrome ne descendant pas sous ~500 px. Regarder chaque capture ; corriger ce qu'elles montrent (débordement, rail à 390 px, ambre en double) avant de relancer une seule série.
- [ ] **Step 4:** `/Users/cyril/.claude/skills/impeccable/scripts/impeccable detect --json` sur les fichiers modifiés ; corriger ou justifier chaque constat.
- [ ] **Step 5:** Relecture de finition (`impeccable-finish-reviewer`) contre le contrat, l'esquisse et les captures ; appliquer les corrections matérielles, une seule nouvelle série de captures.
- [ ] **Step 6:** `impeccable-documenter` met à jour `DESIGN.md` et `.impeccable/design.json` depuis le code : rail, `Page`, `BlockList`, `Button` `choice`, écrans migrés, la règle de l'ambre élargie à la destination active et au bloc en cours, la liste de « Migration » réduite à `PlayFrame`, ses vues, l'oracle de diagnostic, `PlayedCycle`, `Term` et `ChordShape`. Mettre à jour `src/lib/ui/CLAUDE.md` et « Réalisation » de la spec (le titre « Pratiquer » sans durée totale ni numéros, les blocs comme choix, le pont de `PlayedCycle`, les variables `--term-*`, tout écart décidé à la finition).
- [ ] **Step 7:** `npm test && npm run check` ; attendu : PASS. Commit `docs: describe the shell and the migrated screens in the design system`.
