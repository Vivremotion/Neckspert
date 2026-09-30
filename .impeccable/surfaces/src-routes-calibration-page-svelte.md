---
version: 1
slug: 'src-routes-calibration-page-svelte'
primary_target: 'src/routes/calibration/+page.svelte'
related_targets:
  [
    'src/lib/ui/screens/calibration/CalibrationScreen.svelte',
    'src/routes/dev/calibration/+page.svelte'
  ]
---

## Scope

Écran de calibration audio (entrée, niveau, run, offset). Mode Operate. Surface entière dans le monde Bonfire / Game Boy déjà établi par H (pas de nouveau monde).

## Surface

- **Public et tâche :** le guitariste choisit l'entrée, vérifie le niveau, lance la mesure de latence en jouant une corde étouffée sur chaque clic, lit l'issue et réessaie si besoin.
- **Contenu :** sélecteur d'entrée, recommandation casque si micro intégré, mètre de niveau, boutons Écouter / Calibrer / Annuler / Réessayer, instruction, progrès hits/needed, issue (ok / no-sound / inconsistent / cancelled).
- **Moment mémorable :** la barre de niveau full-bleed qui répond au geste Écouter, puis la calibration qui s'imprime en issue pixel.

## Direction contract

THESIS: Calibration is a Game Boy instrument panel in the four Bonfire tones: pick the input, watch the meter fill, run the muted-string ritual. Refuses floating cards, soft dashboards, and any fifth hue outside the checkerboard tramage.

OWN-WORLD: Inherit H — ground #E99568, mid #BE6754, shade #813B2A, ink #451218; 8px tile; pixel capitals; hierarchy by double frames and inversion only.

STORY: The guitarist confirms the input, hears that the meter moves, plays muted strings on the clicks, and reads a measured latency or a recoverable failure.

FIRST VIEWPORT: Full-bleed Bonfire frame. Top: pixel title CALIBRATION, full-width input select, headphones hint when built-in. Center: full-bleed level meter (tramage/inversion), huge Listen / Calibrate. Bottom: muted-string instruction, then progress or outcome at scale 2. No decorative cards.

FORM: Autonomous fallback closest to shipped Bonfire play screen (plan I3). Seed 8ef567da dealt indices 5/4/2 but no interactive lock; hypothesis documented. build-phase skipped (I1 owns state.json).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
