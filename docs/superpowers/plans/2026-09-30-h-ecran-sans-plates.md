# H — Écran de jeu sans images de scène Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redessiner l’écran de jeu en code, pour qu’il ressemble à la maquette approuvée sans superposer une copie de cette maquette.

**Architecture:** Les plates actuelles (`assets/plates/*.png`) sont des agrandissements de la maquette, lettres et tuiles comprises. `PlayScreen` les affiche puis redessine la note, la corde, la flèche et la piste par-dessus : tout est doublé. On retire ces images du rendu. Le damier est du CSS. La note, la corde, le verdict, le cœur, la ligne d’arrivée et les tuiles sont des éléments qui lisent `controller.view`. Les fichiers PNG peuvent rester sur le disque ; ils ne sont plus des fonds.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), CSS natif, Vitest (`*.svelte.spec.ts` en jsdom).

## Global Constraints

- Travailler dans le worktree `.worktrees/integration-wave-1`, branche `integration/wave-1`. Ne pas merger sur `main`.
- Ne pas lancer d’agent en arrière-plan sans le dire. Le serveur de démo, s’il tourne, est `http://127.0.0.1:5173/` depuis ce worktree.
- Svelte 5, runes uniquement. Pas de stores Svelte 4, pas de `export let`.
- Quatre tons : `#E99568`, `#BE6754`, `#813B2A`, `#451218`. Un cinquième ton est un damier de deux tons adjacents.
- La grande lettre n’est jamais un F figé. Elle affiche `view.prompt.primary` (`F`, `F#`, `Gb`, …). La tuile cible affiche la même chaîne. La corde affiche `view.prompt.secondary`.
- La flèche (ou le rond, la flèche gauche, la croix) vient de `view.lastVerdict.verdict` via `VerdictSprite`. Pas d’image « late » en dur.
- La maquette `.impeccable/mocks/comp-4-full-bleed-lane.png` est la référence visuelle de la scène F / en retard. Ses chiffres `10`, `14`, `15` au-dessus des tuiles à venir ne sont pas repris (contrat de direction).
- Comparaison navigateur : `http://127.0.0.1:5173/session/demo?shot=1` (scène figée). La démo sans `shot=1` est animée.

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/ui/play/PlayScreen.svelte` | Écran : damier CSS, consigne, verdict, piste vivante. Plus aucune `<img>` de plate. |
| `src/lib/ui/play/PixelWord.svelte` | Lettres en pixels pour `primary` (une ou plusieurs, dièse ou bémol). |
| `src/lib/ui/primitives/VerdictSprite.svelte` | Rond, flèche gauche, flèche droite, croix. |
| `src/lib/ui/play/lane.ts` | Déjà là. Fournit les tuiles (`justPlayed`, `current`, `target`, `history`). |
| `src/lib/ui/play/PlayScreen.svelte.spec.ts` | La consigne et la corde sont lisibles ; le bouton Commencer existe à l’arrêt. |

Ne pas modifier `package.json`, `vite.config.ts`, ni les modules des plans A–G.

---

### Task 1: Retirer les fonds de scène

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte`

**Interfaces:**
- Consumes: `controller.view`.
- Produces: un écran dont le HTML ne contient plus `/plates/`.

- [ ] **Step 1: Supprimer les cinq `<img src="/plates/…">`**

Le damier du haut devient un `div` avec le dégradé damier déjà décrit dans `tokens.css` (`.np-dither`) ou le même motif recopié sur `.field`. Pas d’image.

- [ ] **Step 2: Vérifier qu’aucune plate n’est référencée**

Run: `rg "/plates/" src/lib/ui/play src/routes/session`
Expected: aucune ligne.

- [ ] **Step 3: Ouvrir la démo figée**

`http://127.0.0.1:5173/session/demo?shot=1`

Expected: un seul F, un seul « corde de B ». Le F de l’image de fond et le second « de B » ont disparu. Le reste peut encore être moche.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte
git commit -m "fix: stop painting the mockup behind the play screen"
```

---

### Task 2: Consigne et verdict dessinés

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte`
- Modify: `src/lib/ui/play/PixelWord.svelte`
- Modify: `src/lib/ui/primitives/VerdictSprite.svelte`
- Test: `src/lib/ui/play/PlayScreen.svelte.spec.ts`

**Interfaces:**
- Consumes: `view.prompt.primary`, `view.prompt.secondary`, `view.lastVerdict`.
- Produces: une grande lettre pixel, la corde, une boîte double, un `VerdictSprite` du verdict courant, le bandeau, `+95 ms`, `1,21 s` sur la scène figée.

- [ ] **Step 1: Garder le test existant**

`PlayScreen.svelte.spec.ts` exige au moins un « F » lisible (la consigne et la tuile cible en montrent deux : `getAllByText`) et `/corde de B/i`. Le bouton « Commencer » existe quand le contrôleur est `idle`.

Run: `npx vitest run src/lib/ui/play/PlayScreen.svelte.spec.ts`
Expected: PASS. S’il échoue, réparer l’écran, pas le test, sauf si le test cherche un F unique alors que la tuile cible affiche aussi la note.

- [ ] **Step 2: Grande lettre**

`PixelWord` remplit la zone de consigne (environ 24 % × 50 % du cadre 1280×720). Ombre en `#BE6754` / `#813B2A`, décalée vers le bas droit, sans flou. `F#` et `Gb` tiennent dans la même zone, plus petits. Le texte reste dans le DOM pour le test (`getAllByText`).

- [ ] **Step 3: Corde**

Un seul libellé, `view.prompt.secondary`, sous la lettre, encre `#451218`, sur le damier. Pas de second exemplaire.

- [ ] **Step 4: Verdict**

Boîte à double cadre. `VerdictSprite` du verdict courant, grand, dans le haut de la boîte (la scène figée est `late` : flèche vers la droite, pleine, pas un triangle maigre). Bandeau inversé `playMessages().verdict[verdict]` (affiche « EN RETARD » en capitales). Écart et temps de réaction seulement s’ils ne sont pas `null`.

- [ ] **Step 5: Navigateur**

Recharger `?shot=1`. Comparer à `.impeccable/mocks/comp-4-full-bleed-lane.png`.

Expected: un F géant ombré, « corde de B » une fois, flèche à droite dans la boîte, bandeau, `+95 ms`, `1,21 s`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte src/lib/ui/play/PixelWord.svelte src/lib/ui/primitives/VerdictSprite.svelte src/lib/ui/play/PlayScreen.svelte.spec.ts
git commit -m "fix: draw the prompt and verdict instead of baking them into plates"
```

---

### Task 3: Piste vivante

**Files:**
- Modify: `src/lib/ui/play/PlayScreen.svelte`

**Interfaces:**
- Consumes: `laneTiles(...)` avec `beatsBefore: 4`, `beatsAfter: 8` ; `barLabel` ; `playMessages().measure`.
- Produces: cœur, ligne d’arrivée, tuile `justPlayed` inversée avec son sprite, tuiles à venir, tuile cible avec `prompt.primary`.

- [ ] **Step 1: Remplacer les images de piste par les tuiles**

Ne plus afficher `lane-bed`, `lane-history`, `lane-upcoming`. Pour chaque tuile de `laneTiles` :

- ligne d’arrivée vers 25–30 % de la largeur (là où la maquette la pose) ;
- `justPlayed` : case inversée (fond encre, sprite clair) immédiatement à gauche de la ligne ;
- la ligne : trois traits verticaux encre ;
- cœur encre juste au-dessus de la ligne ;
- `current` : première case à droite de la ligne ;
- historique passé : `VerdictSprite`, sans numéro au-dessus ;
- à venir : numéro de temps seulement si `tile.label !== null`, pas de `10` / `14` / `15` ;
- cible : case avec `view.prompt.primary`.

- [ ] **Step 2: Libellé**

`MESURE a/b TEMPS c/d` en haut à droite de la piste, via `barLabel` et `playMessages().measure`. Sur `?shot=1` : « MESURE 2/2 TEMPS 3/4 ».

- [ ] **Step 3: Navigateur**

Recharger `?shot=1` à côté de la maquette.

Expected: quatre sprites à gauche de la ligne (rond, rond, flèche gauche, croix), case inversée avec flèche droite contre la ligne, cœur, trois traits, cases à venir numérotées 1 2 3 4 1 2, F cible en bout. Pas de bandeau beige qui coupe la piste. Pas de chiffres fantômes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte
git commit -m "fix: draw the lane from live tiles"
```

---

### Task 4: Vérifier que le jeu reste lisible

**Files:**
- Test: `src/lib/ui/play/PlayScreen.svelte.spec.ts`

- [ ] **Step 1: Test d’une autre note**

Construire un contrôleur (le `DemoPlaySession` après `start`, ou un objet minimal qui satisfait `PlaySessionController`) dont `view.prompt.primary` est `G` et `secondary` est `corde de G`. Rendu. `getByText('G')` et `/corde de G/i` passent. Aucun F n’est exigé.

- [ ] **Step 2: Suite**

Run: `npx vitest run src/lib/ui/play && npm run check`
Expected: PASS, `svelte-check` 0 erreur.

- [ ] **Step 3: Les trois états**

Dans le navigateur, sans `shot=1` : la démo avance. Espace met en pause et montre « Reprendre ». Un contrôleur `idle` montre « Commencer ».

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/play/PlayScreen.svelte.spec.ts
git commit -m "test: play screen shows whichever note the prompt carries"
```

Rester sur `integration/wave-1`. Ne pas merger sur `main`.
