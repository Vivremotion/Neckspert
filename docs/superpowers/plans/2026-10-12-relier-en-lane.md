# Relier en Lane — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer la vue `link-path` de relier par une Lane d'une tuile par mesure, enchaîner les tours d'un même accord sans pause ni doublement jusqu'à un tour réussi, et n'afficher l'aide qu'après des ratés.

**Architecture:** le sélecteur du geste (`progress/gestureSelector.ts`) décide de rester sur l'élément de relier, du tour enchaîné (`ChordGridItem.continued`) et de l'aide par changement. Le présentateur `chordGridPresenter.stage` rend un `LinkLaneModel` (tuiles du passage et aide). La vue `LinkLaneView` place les tuiles par le pur `views/linkLane.ts` et remplace `LinkPathView` dans le registre.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest (node + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-10-voie-geste-design.md`, section « Deuxième refonte de relier : la Lane (2026-10-12) » ; maquette `.impeccable/mocks/link-lane.html`.

## Global Constraints

- Quatre teintes de `DESIGN.md`, jetons `--np-*` de `src/lib/ui/tokens.css`, aucun texte sous 16 px, VT323. Exception : les notes de l'aide sont dans des cercles.
- Copie de l'interface en français et en anglais (`defineMessages`), code et commentaires en anglais.
- Les constantes sont nommées : `LINK_AID_AFTER_MISSES = 2`.
- Contrainte, zone et jam ne changent pas : leur passage, leur aide (au passage) et `grid-scroll` restent tels quels.
- Porte de fusion : `npm test && npm run check`, puis `npm run lint`.

## Review Focus

- Un tour enchaîné dont le dernier changement du tour précédent n'est pas encore enregistré à l'ouverture : `passageSucceeded` sur les essais enregistrés (un essai manquant ne compte pas en échec). Test : Task 1, « decides on the attempts recorded so far ».
- La forme qui sonne encore à l'ouverture d'un tour enchaîné : `previous` n'est pas remis à null (l'attente n'en fait jamais une candidate). Test : Task 1.
- Le changement de groupe sur le même accord : nouvel élément, donc mesure comptée et tuile « D ». Test : Task 1.
- La Lane pendant la mesure comptée, sans `targetBeatIndex` : les tuiles se placent sur le décompte. Test : Task 3.
- Une pause puis une reprise au milieu d'un tour enchaîné : le passage reprend au changement suivant comme avant ; rien de neuf à tester, à vérifier à la main sur `/dev/gesture`.

---

### Task 1: Tours enchaînés et aide par changement (domaine)

**Files:**

- Modify: `src/lib/domain/mechanics/chordGrid.ts` (`ChordGridItem`)
- Modify: `src/lib/domain/gesture/passages.ts` (`linkShapes`)
- Modify: `src/lib/domain/progress/gestureSelector.ts`
- Test: `src/lib/domain/gesture/passages.spec.ts`, `src/lib/domain/progress/gestureSelector.spec.ts`

**Interfaces:**

- Produces: `ChordGridItem.continued?: true` — un tour de relier qui suit un tour du même élément : sa forme la plus grave n'est pas rejouée. `linkShapes(chord, set, continued = false): VoicingOccurrence[]` — sans la première forme quand `continued`. `LINK_AID_AFTER_MISSES = 2` exporté de `passages.ts`.

- [ ] **Step 1: tests qui échouent**
  - `passages.spec.ts` « a continued tour starts at the second shape » : `linkShapes(D, [3,2,1], true).map(fretsOf)` vaut `['7-7-5','11-10-10','14-15-14','11-10-10','7-7-5','2-3-2']` (même écriture que les tests existants).
  - `gestureSelector.spec.ts` (avec seul `GESTURE_LINK` ouvert sur deux éléments) :
    - « stays on the link chord until a tour succeeds » : premier tour avec un raté → l'élément suivant est le même, `item.continued === true`, 6 changements, pas de `countIn` au premier, premier `shape` = 2e forme ; après un tour sans raté → autre élément, `countIn: true`, pas de `continued`.
    - « keeps the shape still ringing into a continued tour » : `previous` du premier changement du tour enchaîné = forme décidée au dernier changement.
    - « decides on the attempts recorded so far » : 6 essais justes sur 7 enregistrés → tour réussi, on change d'élément.
    - « aids a link from the change after the second miss, until a tour succeeds » : changements 0 et 1 ratés → changement 2 `aid: 'show-position'`, 0 à 2 → les deux premiers `'none'` ; le tour enchaîné qui suit garde l'aide dès son premier changement ; après un tour réussi, l'élément suivant commence sans aide.
    - « counts a bar when only the set changes » : D sur [3,2,1] réussi puis D sur [4,3,2] → `countIn: true`, pas `continued`.
  - Les tests existants de contrainte, zone et jam (aide au passage) restent verts sans changement.
- [ ] **Step 2:** `npx vitest run src/lib/domain/gesture src/lib/domain/progress/gestureSelector.spec.ts` — échec attendu.
- [ ] **Step 3: implémenter.** `startPassage` : si le passage précédent est de relier et n'a pas réussi (`passageSucceeded` sur les essais de `state.lastPassage`), reprendre son élément sans avancer `turn`, `continued: true`, garder `this.previous`. L'état d'élément gagne `aidOn: boolean` (allumé à `LINK_AID_AFTER_MISSES` ratés dans un tour, éteint quand un tour réussit) ; en relier, `aid` se calcule à chaque `next()` : `aidOn || ratés du passage en cours >= LINK_AID_AFTER_MISSES`. Un raté = un essai du passage qui n'est pas `isSuccess`. `countIn` seulement au premier changement d'un passage non enchaîné.
- [ ] **Step 4:** relancer — PASS.
- [ ] **Step 5:** commit `feat: chain the link's tours on one chord until one succeeds, aided after two misses`.

### Task 2: Modèle de la Lane de relier (présentateur)

**Files:**

- Modify: `src/lib/application/mechanics/chordGrid.ts`
- Test: `src/lib/application/mechanics/chordGrid.spec.ts`

**Interfaces:**

- Consumes: `ChordGridItem.continued`, `linkShapes(chord, set, continued)`.
- Produces (remplace `LinkPathModel` et `LinkPathShape`, supprimés) :

```ts
export type LinkTile = 'root' | 'up' | 'down';
export interface LinkAidNote {
	string: StringNumber;
	fret: number;
	name: string;
} // name: « G# »
export interface LinkLaneModel {
	kind: 'link-lane';
	root: string; // « E », le symbole
	quality: string; // « majeur » / « major »
	set: string; // « sol · si · mi »
	strings: { string: StringNumber; name: string }[]; // low first
	tiles: LinkTile[]; // une par changement du passage
	changes: readonly GridChange[];
	index: number;
	beatsPerBar: 4;
	/** Les notes des formes à jouer maintenant et ensuite, quand le changement est aidé. */
	aid: { now: LinkAidNote[]; next: LinkAidNote[] | null } | null;
}
```

- [ ] **Step 1: tests qui échouent** dans `chordGrid.spec.ts` :
  - « gives the link's lane: the root, then the way » : D sur [3,2,1], index 0, non enchaîné → `tiles` = `['root','up','up','up','down','down','down']`, `root: 'D'`, `quality: 'majeur'`, `set: 'sol · si · mi'`.
  - « starts a continued tour on an arrow » : `continued: true` → `['up','up','up','down','down','down']`.
  - « shows the notes of the shapes now and next, aided » : E sur [3,2,1], index 2, `aid: 'show-position'` → `aid.now` = `[{string:3,fret:9,name:'E'},{string:2,fret:9,name:'G#'},{string:1,fret:7,name:'B'}]`, `aid.next` = les notes de 13-12-12 ; non aidé → `aid: null` ; au dernier changement → `aid.next: null`.
  - La forme demandée (`item.shape`) et l'attente d'un tour enchaîné viennent de `linkShapes(..., true)` : « asks the second shape first in a continued tour ».
- [ ] **Step 2:** `npx vitest run src/lib/application/mechanics/chordGrid.spec.ts` — échec.
- [ ] **Step 3: implémenter** `linkLaneModel(item, locale, aided)` à la place de `linkPathModel` ; `linkShape(item, index)` et `nextChange` passent `item.continued` à `linkShapes`. Le sens d'une tuile compare `shapePosition` à la forme d'avant (la première d'un tour enchaîné monte depuis la plus grave). Noms des notes : `formatSpelledNote(note.note)`. Qualité : un libellé fr/en par id (`maj` → majeur/major, `min` → mineur/minor) dans `chordGridMessages.ts`. Le séparateur du groupe devient « · ».
- [ ] **Step 4:** relancer — PASS.
- [ ] **Step 5:** commit `feat: give the link a lane model, its root then the way of each shape`.

### Task 3: La vue `link-lane`

**Files:**

- Create: `src/lib/ui/play/views/linkLane.ts`, `linkLane.spec.ts`, `LinkLaneView.svelte`, `LinkLaneView.svelte.spec.ts`
- Delete: `src/lib/ui/play/views/linkPath.ts`, `linkPath.spec.ts`, `LinkPathView.svelte`, `LinkPathView.svelte.spec.ts`
- Modify: `views/index.ts` (`'link-lane': LinkLaneView`, plus de `'link-path'`), `views/messages.ts` (retirer les messages de link-path devenus inutiles ; ajouter `onStrings: 'sur cordes' / 'on strings'`), `src/lib/domain/gesture/exercises.ts` (vue `'link-lane'`, consigne), `src/lib/ui/play/demo/DemoGestureSession.svelte.ts` si elle nomme la vue ou le modèle.

**Interfaces:**

- Consumes: `LinkLaneModel`.
- Produces:

```ts
export type LinkTileState = 'past' | 'now' | 'next' | 'later';
export interface LinkLaneTile {
	symbol: LinkTile | null; // null : une mesure d'un passage précédent, tirée de l'historique
	/** Mesures depuis la barre : 0 = le bord gauche de la tuile sur la barre, à son changement. */
	offset: number;
	state: LinkTileState;
	verdict: Verdict | null;
}
export function linkLaneLayout(
	model: LinkLaneModel,
	time: { anchorBeat: number | null; nowBeat: number; history: readonly LaneEntry[] }
): { tiles: LinkLaneTile[]; beat: number | null }; // beat : temps de la mesure en cours, 1 à 4
```

`anchorBeat` est le temps du changement `model.index` (`view.targetBeatIndex`, ou pendant la mesure comptée le temps entier où tombe le décompte, figé par la vue à chaque changement de `view.countdown`). `now` = `model.index`, `next` = `index + 1`, `later` au-delà, `past` avant ; les mesures passées hors du passage viennent de `history` (une entrée par changement, `symbol: null`). On montre `LANE_BARS_BEFORE = 2` mesures passées et `LANE_BARS_AFTER = 4` à venir.

- [ ] **Step 1: tests qui échouent**
  - `linkLane.spec.ts` : « places each change by its bar, the one asked on the bar » (index 2, `anchorBeat` 8, `nowBeat` 9 → tuile 2 `offset` −0.25, `now` ; tuile 3 `next` à 0.75) ; « counts the beat of the bar » (`nowBeat` 9 → `beat` 2) ; « carries the verdicts of the changes played » ; « places the tiles on the count before the passage » (`anchorBeat` posé, aucune entrée d'historique) ; « draws earlier bars from the history, without a symbol ».
  - `LinkLaneView.svelte.spec.ts` (avec `StageController`) : « is the view of the link » (`PLAY_VIEWS['link-lane']`) ; « shows the root big, its quality and the strings » (`E`, `majeur`, `sur cordes`, `sol · si · mi`) ; « draws the root on the first tile and arrows after » (tuiles `data-testid="link-tile"` : `E`, `↗`, `↗`, `↗`, `↘`, `↘`, `↘`) ; « puts the beat number over the next tile » ; « draws no neck unaided, the notes in circles aided » (aucun `data-testid="aid-neck"` sans aide ; avec aide, 6 cercles, `B`, `G#`, `E` dans les pleins `--np-ink`, la suivante `--np-mid`) ; « shows the root bigger during the counted bar » (classe `counting` sur la fondamentale quand `view.countdown !== null`).
- [ ] **Step 2:** `npx vitest run src/lib/ui/play/views` — échec.
- [ ] **Step 3: implémenter.** `LinkLaneView` suit la maquette : fondamentale en haut à gauche (plus grande pendant la mesure comptée), qualité, « sur cordes », groupe ; la Lane comme celle des notes (tuile `now` `--np-ink`, `next` `--np-mid`, `later` contour `--np-shade`, `past` damier, verdict au-dessus des passées avec `VerdictSprite` comme `LinkPathView`), le numéro du temps au-dessus de la tuile `next` dans le style `.beat-no` de `PlayScreen` ; flèches `↗` / `↘` ; le manche du groupe sous la Lane seulement quand `model.aid`, cases de la plus basse à la plus haute des deux formes ±1. Défilement par `controller.timeline.nowBeat()` dans une boucle `requestAnimationFrame`, comme `LinkPathView`. Consigne de `GESTURE_LINK` :
  - fr : « Joue l’accord demandé sur les cordes indiquées, en partant de sa position la plus grave. Monte ses renversements un par un vers l’aigu, puis redescends par le même chemin : un accord par mesure, attaqué sur le premier temps. Les flèches donnent le sens : ↗ monte, ↘ descends. »
  - en : « Play the chord asked on the strings shown, starting from its lowest position. Climb its inversions one by one, then come back down the same way: one chord per bar, struck on the first beat. The arrows give the way: ↗ up, ↘ down. »
- [ ] **Step 4:** relancer — PASS ; `npm run check`.
- [ ] **Step 5:** commit `feat: play the link on a lane of bars, the neck only as an aid`.

### Task 4: Décompte, documentation, vérification

**Files:**

- Modify: `src/lib/ui/play/PlayFrame.svelte`, `src/lib/ui/play/messages.ts` (`startsIn: (n) => \`Départ dans ${n} temps\`` / `` `Starting in ${n} beats` ``, une ligne)
- Modify: test de `PlayFrame` qui lit « Départ dans »
- Modify: `docs/superpowers/specs/2026-10-10-voie-geste-design.md` (« Réalisation » de la deuxième refonte : la Lane d'exemple de la consigne devient la phrase sur les flèches ; ce qui a été décidé en route), `CLAUDE.md` (la vue de relier s'appelle `link-lane`, `views/linkLane.ts`, tours enchaînés, `LINK_AID_AFTER_MISSES`)

- [ ] **Step 1:** test « writes the count as a sentence » : avec `countdown = 3`, le cadre affiche « Départ dans 3 temps ». Échec, puis implémentation, puis PASS.
- [ ] **Step 2:** `npm test && npm run check && npm run lint`.
- [ ] **Step 3:** capture headless de `/dev/gesture` à 1280×800 et 390×844 : pas de texte sous 16 px, pas de défilement horizontal, la Lane défile.
- [ ] **Step 4:** commit `docs: record the link on a lane`.
