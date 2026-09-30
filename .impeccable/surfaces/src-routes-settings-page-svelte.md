---
version: 1
slug: 'src-routes-settings-page-svelte'
primary_target: 'src/routes/settings/+page.svelte'
related_targets:
  ['src/lib/ui/screens/settings/SettingsScreen.svelte', 'src/routes/dev/settings/+page.svelte']
---

## Scope

Écran de réglages (langue, tempo, entrée, lien calibration, export/import). Mode Operate. Surface entière dans le monde Bonfire / Game Boy de H.

## Surface

- **Public et tâche :** le guitariste change langue et tempo, choisit l'entrée, ouvre la calibration, exporte ou importe une sauvegarde avec confirmation.
- **Contenu :** FR/EN, stepper tempo 60..140, select entrée, offset + lien /calibration, export/import, confirmation inversée, erreur lisible.
- **Moment mémorable :** le tempo scale-4 comme signal dominant, confirmation d'import en cadre inversé.

## Direction contract

THESIS: Settings is a stacked Game Boy control column in Bonfire tones — language, tempo, input, calibration, backup. Refuses card grids, soft form chrome, and any hue outside the four tones.

OWN-WORLD: Inherit H — #E99568 / #BE6754 / #813B2A / #451218, 8px tile, pixel capitals, double frames and inversion.

STORY: The guitarist adjusts language and tempo, picks an input, jumps to calibration, and backs up or restores local data with an explicit replace confirmation.

FIRST VIEWPORT: One column of double frames (language, tempo, input, calibration, backup). Tempo is the dominant signal (scale 4, huge stepper). Import confirmation inverted. Calibration link underlined ≥48px tall. No decorative cards.

FORM: Autonomous fallback closest to Bonfire play screen (plan I3). Seed non-interactive; build-phase skipped (I1 owns state.json).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
