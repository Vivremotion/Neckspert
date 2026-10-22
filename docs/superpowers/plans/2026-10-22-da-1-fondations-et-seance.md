# Direction artistique, plan 1 : fondations et séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les tokens et les primitives du monde « Près du silence », et passer l'écran de séance des notes et des triades (`PlayScreen`) à ce monde, jusqu'au premier `DESIGN.md` écrit depuis le code.

**Architecture:** Les nouveaux tokens s'ajoutent à `src/lib/ui/tokens.css` sous des noms qui ne recouvrent pas ceux du Game Boy, qui restent pour les écrans pas encore migrés. Six primitives de présentation pure dans `src/lib/ui/primitives/` (`Button`, `InfoLine`, `VerdictMark`, `LaneCell`, `Lane`, `Prompt`). `PlayScreen` les compose ; la logique de fenêtre de la piste reste pure dans `src/lib/ui/play/lane.ts`. Rien ne change dans `application/` ni `domain/`.

**Tech Stack:** Svelte 5 (runes), CSS natif, Vitest (`*.svelte.spec.ts` en jsdom), impeccable 4.7 (détecteur, relecture de finition, documentaliste).

**Spec:** `docs/superpowers/specs/2026-10-22-direction-artistique-design.md`. Esquisses à suivre : `.impeccable/mocks/decision/silence.html` (le jeu) et `.impeccable/mocks/decision/silence-etats.html` (états ; l'état 3 est retenu). Contrat : `.impeccable/surfaces/src-routes-session-page-svelte.md`.

## Global Constraints

- Ne pas modifier `src/lib/application/`, `src/lib/domain/`, ni leurs contrats (`PlayView`, `VerdictView`, `LaneEntry`). L'interface n'affiche que ce que la vue lui donne.
- Nouveaux tokens : `--np-ground` `#ECE8E2`, `--np-text` `#23211F`, `--np-muted` `#7A7F80`, `--np-earth` `#8C6E52`, `--np-now` `#D9A13B`, `--np-on-field` `#ECE8E2`, `--np-rule` (encre à 12 %), `--np-field` (dégradé ardoise → terre d'ombre), plus `--np-type-*`, `--np-space-*`, `--np-motion-*` et les tokens de la piste. Ne jamais réutiliser `--np-bg`, `--np-mid`, `--np-shade`, `--np-ink`, `--np-tile`, `--np-font-pixel`.
- `--np-now` (ambre) sert à deux choses seulement : la ligne du maintenant et l'action principale.
- Police : Atkinson Hyperlegible Next, auto-hébergée dans `static/fonts/` (avec sa licence OFL). Aucun texte sous 16 px.
- En jeu : aucun texte explicatif (« maintenant », « respiration », « dans N temps », numéros de temps ou de mesure, légende). Le temps de réaction n'est plus affiché.
- `prefers-reduced-motion` supprime l'impression du verdict.
- Les textes nouveaux vont dans `src/lib/ui/play/messages.ts`, en fr et en en.
- Un écran ne mêle jamais les deux mondes : `PlayScreen`, sa grille de réponse du mode 2 (`AnswerPanel`, `AnswerPad`), `StringDiagram` et la barre de navigation sur `/session` passent ensemble.
- Barrière de fusion : `npm test && npm run check`.

## Review Focus

1. **Une cible annoncée huit temps à l'avance** (temps d'avance 8) doit être dans la piste dès le temps de la consigne, pas un temps plus tard. Test dans la tâche 3.
2. **Un temps d'avance de 2** : la cible est à deux cases de la ligne, la piste montre quand même deux mesures à venir. Test dans la tâche 3.
3. **Une bande de triade qui dépasse deux mesures** reste entière dans la piste. Test dans la tâche 3.
4. **Un raté sans réponse** (`answerLabel` nul) : la ligne sous la case dit « rien entendu », jamais « null joué ». Test dans la tâche 7.
5. **Hors temps et corrigé** ne se lisent pas comme des réussites : case bordée pour hors temps, case sombre pour corrigé. Test dans la tâche 4.

---

### Task 1: Tokens, police et contrastes

**Files:**
- Modify: `src/lib/ui/tokens.css`
- Create: `static/fonts/atkinson-hyperlegible-next-{300,400,500,700}.woff2`, `static/fonts/OFL-atkinson-hyperlegible-next.txt`
- Create: `src/lib/ui/contrast.ts`, `src/lib/ui/tokens.spec.ts`

**Interfaces:**
- Produces: les tokens CSS listés dans Global Constraints ; `--np-font-text` (la famille) ; `--np-type-meta|body|title|prompt|hero` ; `--np-space-1..8` (base 8 px) ; `--np-motion-imprint` (≤ 150 ms) et `--np-motion-ease` ; piste : `--np-cell`, `--np-cell-downbeat`, `--np-cell-past-opacity`, `--np-cell-gap`. `contrastRatio(foreground: string, background: string): number` (hex `#RRGGBB`, ratio WCAG).

- [ ] **Step 1: Write the failing tests** in `src/lib/ui/tokens.spec.ts` (projet node) :
  - `defines every role token of the new world` : lit `tokens.css` avec `fs`, attend une déclaration pour chaque nom de Global Constraints et de Produces.
  - `declares the self-hosted text face` : un `@font-face` pour `'Atkinson Hyperlegible Next'` dont chaque `url()` pointe vers un fichier qui existe dans `static/`.
  - `keeps the meta size at 16px or more` : le minimum du `clamp()` de `--np-type-meta` vaut au moins 16 px.
  - `contrastRatio` : `contrastRatio('#000000', '#FFFFFF')` vaut 21 à 0,01 près ; `contrastRatio('#23211F', '#ECE8E2') >= 7` ; `contrastRatio('#ECE8E2', '#6C706F') >= 4.5` (texte sur le milieu du champ) ; `contrastRatio('#23211F', '#D9A13B') >= 4.5` (texte du bouton ambre).
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/tokens.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.** `contrast.ts` : luminance relative WCAG 2.x. Ajoute les tokens et le `@font-face` (quatre graisses, `font-display: swap`) à `tokens.css` sans toucher aux tokens Game Boy. Les fichiers woff2 et la licence viennent du paquet npm `@fontsource/atkinson-hyperlegible-next` (sous-ensemble latin), copiés à la main dans `static/fonts/` ; le paquet n'est pas ajouté aux dépendances. Le dégradé `--np-field` reprend celui de l'esquisse (`#8d908e` → `#6c706f` → `#4a4440`). Si un ratio échoue, ajuste la valeur du champ, pas le test.
- [ ] **Step 4: Run** `npx vitest run src/lib/ui/tokens.spec.ts` ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: add the tokens and the text face of the quiet direction`.

### Task 2: Button et InfoLine

**Files:**
- Create: `src/lib/ui/primitives/Button.svelte`, `Button.svelte.spec.ts`, `InfoLine.svelte`, `InfoLine.svelte.spec.ts`

**Interfaces:**
- Produces: `Button` props `{ variant?: 'primary' | 'quiet'; onclick?: (event: MouseEvent) => void; disabled?: boolean; children: Snippet }` → un `<button type="button">` avec `data-variant`. `InfoLine` props `{ parts: string[]; end?: Snippet }` → les parties non vides jointes par « · », la première en graisse moyenne ; `end` à droite (quitter, pause).

- [ ] **Step 1: Write the failing tests**
  - `Button` : `renders a button with its label and variant` (rôle `button`, nom, `data-variant="primary"` par défaut) ; `calls onclick` ; `stays readable when disabled` (attribut `disabled`, même texte).
  - `InfoLine` : `joins the parts with a middle dot` (`['Apprentissage', '♩ = 100']` → texte `Apprentissage · ♩ = 100`) ; `skips empty parts` (`['', '♩ = 100']` → `♩ = 100`) ; `renders its end slot`.
- [ ] **Step 2: Run** `npx vitest run --project client src/lib/ui/primitives/Button.svelte.spec.ts src/lib/ui/primitives/InfoLine.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.** `primary` : fond `--np-now`, texte `--np-text`, grand corps ; `quiet` : texte seul, souligné au survol et au focus, hérite de la couleur du parent. Focus visible sur les deux. `InfoLine` en `--np-type-meta`, opacité réduite, chiffres tabulaires.
- [ ] **Step 4: Run** les mêmes specs ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: add the button and the info line of the quiet direction`.

### Task 3: La fenêtre de la piste

**Files:**
- Modify: `src/lib/ui/play/lane.ts`, `src/lib/ui/play/lane.spec.ts`

**Interfaces:**
- Produces: `laneWindow(input: { nowBeat: number; beatsPerBar: number; targetBeatIndex: number | null; followUp: { fromBeat: number; untilBeat: number } | null }): { beatsBefore: number; beatsAfter: number }`. `LaneTile` perd `label` et gagne `downbeat: boolean` (`beatIndex % beatsPerBar === 0`).

- [ ] **Step 1: Write the failing tests** dans `lane.spec.ts` :
  - `shows one bar behind and two ahead without a target` : `beatsPerBar: 4`, pas de cible → `{ beatsBefore: 4, beatsAfter: 8 }`.
  - `holds the target as soon as it is announced` : `nowBeat: 16`, cible `24` (temps d'avance 8) → `beatsAfter` ≥ 9, et `laneTiles` avec cette fenêtre contient une case `kind: 'target'`.
  - `keeps two bars ahead with a short lead` : `nowBeat: 22`, cible `24` → `beatsAfter: 8`.
  - `holds a whole band` : cible `24`, `followUp: { fromBeat: 25, untilBeat: 36 }`, `nowBeat: 20` → la dernière case vaut au moins le temps `35`.
  - `marks downbeats` : les cases des temps `0, 4, 8` ont `downbeat: true`, les autres `false`.
  - Retire les assertions sur `label`.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/play/lane.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement** `laneWindow` : `beatsBefore = beatsPerBar` ; `beatsAfter = max(2 × beatsPerBar, dernier temps à montrer − floor(nowBeat))`, où le dernier temps est `followUp.untilBeat` s'il y a une bande, sinon `targetBeatIndex + 1`. Remplace dans `laneTiles` le calcul de `label` par `downbeat`.
- [ ] **Step 4: Run** `npx vitest run src/lib/ui/play/lane.spec.ts` ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: open the lane one bar behind and two ahead, downbeats marked`.

### Task 4: VerdictMark, et la planche des marques

**Files:**
- Create: `src/lib/ui/primitives/VerdictMark.svelte`, `VerdictMark.svelte.spec.ts`, `src/lib/ui/primitives/verdictTone.ts`, `verdictTone.spec.ts`
- Modify: `.impeccable/mocks/decision/silence-etats.html` (une rangée des six marques)

**Interfaces:**
- Consumes: `ResponseVerdict` de `$lib/domain/types` ; `playMessages().verdict`.
- Produces: `verdictTone(verdict: ResponseVerdict): 'hit' | 'partial' | 'miss'` (`perfect`, `early`, `late` → `hit` ; `offbeat` → `partial` ; `corrected`, `wrong` → `miss`). `VerdictMark` props `{ verdict: ResponseVerdict; size?: number }` → un `<svg role="img">` nommé par `playMessages().verdict[verdict]`, avec `data-verdict`.

- [ ] **Step 1: Montre la planche à l'utilisateur.** Ajoute à `silence-etats.html` une rangée des six cases jouées avec leur marque : parfait ● centré (claire), en avance ◀ (claire), en retard ▶ (claire), hors temps ▶ creux (claire bordée), corrigé ✕ puis ● (sombre), mauvaise note ✕ (sombre). Ouvre-la dans le navigateur, demande à l'utilisateur de valider les trois marques proposées (parfait, hors temps, corrigé) et applique sa réponse avant d'écrire le code.
- [ ] **Step 2: Write the failing tests**
  - `verdictTone` : le tableau ci-dessus, une assertion par verdict.
  - `VerdictMark` : `names every verdict` (pour chaque verdict de `RESPONSE_VERDICTS`, `getByRole('img', { name })` avec le nom fr) ; `draws a different shape per verdict` (les six rendus ont six contenus SVG distincts).
- [ ] **Step 3: Run** `npx vitest run src/lib/ui/primitives/verdictTone.spec.ts && npx vitest run --project client src/lib/ui/primitives/VerdictMark.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 4: Implement.** Formes en SVG simple (`currentColor`), validées au Step 1 ; la case qui les porte décide la teinte.
- [ ] **Step 5: Run** les mêmes commandes ; attendu : PASS.
- [ ] **Step 6: Commit** `feat: mark each verdict by its shape`.

### Task 5: LaneCell et Lane

**Files:**
- Create: `src/lib/ui/primitives/LaneCell.svelte`, `Lane.svelte`, `Lane.svelte.spec.ts`

**Interfaces:**
- Consumes: `LaneTile` (tâche 3), `VerdictMark` et `verdictTone` (tâche 4).
- Produces: `Lane` props `{ tiles: LaneTile[]; targetLabel: string | null; bandLabel: string | null; caption: string | null; imprint: boolean }`. Les cases d'`offset <= 0` à gauche de la ligne, les autres à droite ; la ligne au tiers, `aria-hidden`. `targetLabel` dans la case `target`, `bandLabel` une fois au début de la bande, `caption` sous la case `justPlayed`, `imprint` anime cette case. `LaneCell` est interne à `Lane`.

- [ ] **Step 1: Write the failing tests** (`Lane.svelte.spec.ts`, cases construites à la main) :
  - `writes the target's name in its cell` ; `writes a band's name once` ;
  - `marks a played cell with its verdict and tone` (case `history` `late` → `VerdictMark` nommé « En retard », `data-tone="hit"`) ;
  - `writes the caption under the cell just played` ;
  - `shows no number, no word of time` : le texte de la piste ne contient que les noms et la légende passés en props ;
  - `marks downbeat cells` (`data-downbeat`).
- [ ] **Step 2: Run** `npx vitest run --project client src/lib/ui/primitives/Lane.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.** Grille de cases égales (`--np-cell-gap`), fond uni `--np-cell` (`--np-cell-downbeat` au temps fort), passé à `--np-cell-past-opacity` ; case cible et case réussie en `--np-on-field` avec texte `--np-text` ; `partial` bordée ; `miss` en `--np-text` avec texte `--np-on-field`. Ligne `--np-now`. Impression : `--np-motion-imprint`, retirée sous `prefers-reduced-motion`. Composition et proportions : `silence.html`.
- [ ] **Step 4: Run** la même spec ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: draw the lane of the quiet direction`.

### Task 6: Prompt

**Files:**
- Create: `src/lib/ui/primitives/Prompt.svelte`, `Prompt.svelte.spec.ts`

**Interfaces:**
- Produces: `Prompt` props `{ main: string; line?: string | null; recall?: string | null; size?: 'hero' | 'prompt'; children?: Snippet }`. `recall` au-dessus en petit (la consigne rappelée pendant une correction), `main` énorme (`hero`) ou grand (`prompt`, pour une correction ou un compte à rebours), `line` dessous (la corde), `children` dessous (forme d'accord, corde dessinée).

- [ ] **Step 1: Write the failing tests** : `shows the note big and its string below` ; `recalls the prompt above a correction` (`recall: 'F · corde de B'`, `main: 'corde de B, case 6'`, `size: 'prompt'` → ordre du texte : rappel puis correction, `data-size="prompt"`) ; `renders its children below`.
- [ ] **Step 2: Run** `npx vitest run --project client src/lib/ui/primitives/Prompt.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement** : centré, `--np-type-hero` graisse 300 pour `hero`, `--np-type-prompt` pour `prompt` et `line`.
- [ ] **Step 4: Run** la même spec ; attendu : PASS.
- [ ] **Step 5: Commit** `feat: add the prompt of the quiet direction`.

### Task 7: L'écran de séance

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte`, `PlayScreen.svelte.spec.ts`, `src/lib/ui/play/messages.ts`, `src/lib/ui/play/StringDiagram.svelte`, `src/lib/ui/primitives/ChordShape.svelte`, `src/lib/ui/play/answer/AnswerPanel.svelte`, `src/lib/ui/play/answer/AnswerPad.svelte`, `src/routes/+layout.svelte`

**Interfaces:**
- Consumes: `Button`, `InfoLine` (tâche 2), `laneWindow` et `laneTiles` (tâche 3), `Lane` (tâche 5), `Prompt` (tâche 6).
- Produces: messages `kindName: Record<SessionKind, string>` (fr : Apprentissage, Jeu libre, Triades, Triades · zone, Geste, Exercice ; en : Learn, Free play, Triads, Triads · zone, Gesture, Exercise), `playedAs: (label: string) => string` (« F# joué » / « F# played »), `nothingHeard` (« rien entendu » / « nothing heard »), `tempo: (bpm: number) => string` (« ♩ = 100 »). `ChordShape` lit ses couleurs dans `--shape-ink`, `--shape-ground`, `--shape-accent`, qui valent par défaut ses couleurs Game Boy actuelles ; `PlayScreen` les pose au nouveau monde.

- [ ] **Step 1: Update the tests** de `PlayScreen.svelte.spec.ts`. Les tests de comportement restent (départ, mode d'emploi, entrée audio absente, recommencer, pause, « Joué juste » au clic et sur Entrée, quitter vers le bilan, compte à rebours, corde avant la note, aide, bande de triade, grille de réponse). Ceux qui lisaient la structure Game Boy (`PixelWord` et ses `rect.ink`, `.body.due .note`, `.verdict`) lisent la nouvelle (texte de la consigne, `Lane`). Nouveaux tests :
  - `shows the info line: session, tempo, quit` (`Apprentissage · ♩ = 100`, lien « Quitter ») ;
  - `writes the verdict under the played cell` (`late`, `offsetMs: 42` → « en retard · +42 ms ») ;
  - `writes what was played after a wrong note` (`answerLabel: 'F#'` → « F# joué ») ;
  - `says nothing was heard after a silent miss` (`answerLabel: null`, `wrong` → « rien entendu ») ;
  - `puts the correction in place of the prompt` (`correction: 'corde de B, case 6'` → la consigne rappelée au-dessus, la correction dans `Prompt`, plus de grande lettre de la consigne) ;
  - `draws heard and expected shapes in place of the prompt after a triad miss` (les tests `.drawn` existants, déplacés) ;
  - `keeps the centre quiet after a hit` (`late`, sans correction → la zone de consigne est vide) ;
  - `shows no reaction time`.
- [ ] **Step 2: Run** `npx vitest run --project client src/lib/ui/play/PlayScreen.svelte.spec.ts` ; attendu : FAIL.
- [ ] **Step 3: Implement.**
  - `PlayScreen` : champ `--np-field` plein cadre ; en haut `InfoLine` avec `kindName[kind]` et `tempo(view.tempoBpm)`, et à droite « pause » (`Button quiet`, pendant le jeu) et « quitter » ; au centre `Prompt` ; en bas `Lane` (fenêtre de `laneWindow`). Sur un verdict raté (`correction` ou formes), `Prompt` montre la correction avec la consigne en rappel, ou les deux `ChordShape` ; sur une réussite, le centre est vide. `caption` : `verdict[v].toLowerCase() + ' · ' + offset` pour `early`, `late` et `offbeat` avec écart, `playedAs(answerLabel)` ou `nothingHeard` pour `wrong`, le nom du verdict sinon. Compte à rebours dans `Prompt` (`size: 'prompt'`). Départ, fin et pause : page claire `--np-ground`, mode d'emploi en `--np-type-body`, un `Button` primaire. « Joué juste » : `Button quiet` sous la correction. Plus de `PixelWord`, `PixelButton` ni `VerdictSprite` ici.
  - `StringDiagram`, `AnswerPanel`, `AnswerPad` : mêmes structures, couleurs et police du nouveau monde (cordes en `--np-on-field`, la corde demandée plus épaisse ; boutons de réponse en cases unies).
  - `+layout.svelte` : pas de barre de navigation sur `/session`.
- [ ] **Step 4: Run** `npm test && npm run check` ; attendu : tout passe.
- [ ] **Step 5: Commit** `feat: play the notes and triads in the quiet direction`.

### Task 8: Vérification, relecture de finition et DESIGN.md

**Files:**
- Create: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`, `DESIGN.md` (remplace), `.impeccable/design.json`
- Modify: `src/lib/ui/CLAUDE.md`, `CLAUDE.md` (la ligne du Game Boy dans « Architecture »), `docs/superpowers/specs/2026-10-22-direction-artistique-design.md` (« Réalisation »)

- [ ] **Step 1: Run** le serveur (`preview_start` « dev ») puis `node scripts/functional-ui.mjs` ; attendu : exit 0 (aucun texte sous 16 px, aucun échec de comportement).
- [ ] **Step 2: Capture** `/session/demo` en 1440 × 900 et en 390 × 844 pendant une consigne, après une réussite et après un raté ; enregistre `desktop.png` et `mobile.png` dans `.impeccable/review/`. Vérifie que la piste est sous la consigne sur téléphone et qu'aucun texte ne déborde.
- [ ] **Step 3: Run** `~/.claude/skills/impeccable/scripts/impeccable detect --json src/lib/ui/primitives src/lib/ui/play src/lib/ui/tokens.css` ; corrige ce qui est mécanique.
- [ ] **Step 4: Spawn** l'agent `impeccable-finish-reviewer` avec : la demande, le contrat (`.impeccable/surfaces/src-routes-session-page-svelte.md`), les esquisses (référence de critique), les captures, les sorties du détecteur, `~/.claude/skills/impeccable/reference/craft-floor.md`. Applique sa disposition (au plus deux tours de corrections), puis `npm test && npm run check`.
- [ ] **Step 5: Spawn** l'agent `impeccable-documenter` avec la racine du projet, le contrat, `PRODUCT.md` et `~/.claude/skills/impeccable/reference/document.md` ; attendu : `DESIGN.md` et `.impeccable/design.json` décrivent les tokens et les primitives construits, avec une section « Migration » qui dit quels écrans sont encore au Game Boy.
- [ ] **Step 6: Update** `src/lib/ui/CLAUDE.md` (le système, ses primitives, la règle « un écran ne mêle jamais les deux mondes »), la ligne de `CLAUDE.md`, et « Réalisation » de la spec (ce que le code a décidé contre elle, dont les marques validées à la tâche 4).
- [ ] **Step 7: Commit** `docs: describe the quiet design system from the built play screen`.
