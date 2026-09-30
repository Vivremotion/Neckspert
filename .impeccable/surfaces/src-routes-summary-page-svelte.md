---
version: 1
slug: "src-routes-summary-page-svelte"
primary_target: "src/routes/summary/+page.svelte"
related_targets: ["src/lib/ui/screens/summary/SummaryScreen.svelte"]
---

## Scope

Bilan post-session. Mode Operate. Faits de rétention à froid, lisibles à distance.

## Surface

- **Public et tâche :** après une série, le guitariste lit ce qui compte (précision, médiane, apprises, fatigue, prochaine heure) puis choisit Accueil ou Carte.
- **Contenu :** cinq faits + deux boutons de navigation. Pas de graphique, pas de dashboard.
- **Moment mémorable :** la boîte à double cadre comme le verdict box du jeu, remplie de faits tabulaires.

## Direction contract

THESIS: Le bilan est une fiche Game Boy à cinq faits dans un PixelBox double, pas un tableau de bord. Refuse les cartes métriques empilées et les sparklines.

OWN-WORLD: Quatre tons Bonfire, damier, grille 8 px, PixelBox double, PixelText, PixelButton large, capitales pixel — même univers que H.

STORY: Le guitariste lit précision à froid, médiane, positions apprises, fatigue, prochaine session, puis part vers l'accueil ou la carte.

FIRST VIEWPORT: Titre PixelText scale=3 centré. Sous lui un PixelBox double listant les cinq faits en lignes tabulaires ink-on-ground. Sous la boîte, deux PixelButton large (Accueil, Carte du manche) côte à côte.

FORM: Structure 3 du tirage (fiche double cadre). Seed f595af98. Choix autonome code-led (serve-question non interactif). Hypothèse Bonfire / verdict-box.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
