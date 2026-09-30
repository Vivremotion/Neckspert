---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: ["src/lib/ui/screens/home/HomeScreen.svelte"]
---

## Scope

Accueil hors jeu. Mode Operate. Un bouton, un chiffre. Mains loin (60 cm–1 m).

## Surface

- **Public et tâche :** le guitariste décide s'il joue maintenant. Un seul geste : démarrer la session due, ou lire l'attente.
- **Contenu :** libellé d'action (positionnement / session du jour / délai relatif), médiane à froid, tendance. Rien d'autre.
- **Moment mémorable :** le bouton huge comme insert de cartouche Game Boy ; le chiffre seul sous lui comme le seul score qui compte.

## Direction contract

THESIS: L'accueil est une cartouche Bonfire à un seul geste : un PixelButton huge et un seul chiffre (médiane à froid). Refuse la grille de stats, le second bouton jeu libre, et la carte du manche sur `/`.

OWN-WORLD: Quatre tons Bonfire (#E99568 / #BE6754 / #813B2A / #451218), damier de tramage, grille 8 px, PixelButton / PixelText / PixelBox double, capitales pixel. Identique à l'écran de jeu H.

STORY: Le guitariste lit l'action à distance, appuie (ou barre d'espace) pour démarrer, ou voit le délai d'attente sur le bouton désactivé, et lit sa médiane à froid.

FIRST VIEWPORT: Plein cadre centré. Haut–milieu : PixelButton size=huge (libellé session / positionnement / délai). Sous le bouton, espacement 8×tile : un PixelText scale=4 pour la médiane (ou tiret), et optionnellement un PixelText scale=1 pour la tendance. Cadre double PixelBox autour du bloc action+chiffre. Pas de nav, pas de stats secondaires.

FORM: Structure 6 du tirage (centre stage — bouton huge + chiffre seul). Seed ea6ea1eb. Choix autonome code-led (serve-question non interactif ; pas d'OPENAI_API_KEY pour comps). Hypothèse : même langage cartouche Game Boy / Bonfire que l'écran de jeu.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
