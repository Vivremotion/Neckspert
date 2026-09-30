---
version: 1
slug: "src-routes-map-page-svelte"
primary_target: "src/routes/map/+page.svelte"
related_targets: ["src/lib/ui/screens/map/NeckMapScreen.svelte"]
---

## Scope

Carte du manche 6×12. Mode Operate. Statut locate et identify par case.

## Surface

- **Public et tâche :** le guitariste voit l'état de chaque position (corde 6 en haut, case 0 à gauche) et revient à l'accueil.
- **Contenu :** grille 72 cellules, pitch + deux statuts, bouton Accueil. Scroll horizontal accepté.
- **Moment mémorable :** le damier de cases ink/mid/shade comme une cartouche de carte, densifié sans dashboard.

## Direction contract

THESIS: La carte est une grille Game Boy 6×12 de cellules à bordure ink, corde 6 en haut, fret 0 à gauche, statut par sens. Refuse la légende en cartes et le manche photoréaliste.

OWN-WORLD: Quatre tons Bonfire (unseen mid, learning tramage, acquired shade, mastered ink), grille 8 px, PixelText, PixelButton. Pas de cinquième teinte hors damier.

STORY: Le guitariste balaye le manche, lit les cases maîtrisées / acquises / en cours, et rentre à l'accueil.

FIRST VIEWPORT: Titre PixelText scale=3. Grille role=grid pleine largeur (max ~56rem), 6 rangées × 12 frets, scroll-x si besoin. Sous la grille, PixelButton large Accueil.

FORM: Structure 3 du tirage (carte cartouche plein cadre). Seed 6ff8ad84. Choix autonome code-led. Hypothèse Bonfire / play-screen cells.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
