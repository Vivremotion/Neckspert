---
version: 1
slug: 'src-routes-settings-page-svelte'
primary_target: 'src/routes/settings/+page.svelte'
related_targets:
  ['src/lib/ui/screens/settings/SettingsScreen.svelte', 'src/routes/dev/settings/+page.svelte']
---

## Scope

Écran de réglages (langue, entrée, lien calibration, export/import). Mode Operate. Surface entière dans le monde Bonfire / Game Boy de H.

## Surface

- **Public et tâche :** le guitariste change la langue, choisit l'entrée, ouvre la calibration, exporte ou importe une sauvegarde avec confirmation.
- **Contenu :** FR/EN, select entrée, offset + lien /calibration, export/import, confirmation inversée, erreur lisible.
- **Moment mémorable :** confirmation d'import en cadre inversé.
- **Tempo :** absent de cet écran. Il est propre à chaque exercice et s'adapte seul à la fin des sessions d'Apprentissage (`docs/superpowers/specs/2026-10-05-mecaniques-exercices-design.md`).

## Direction contract

THESIS: Settings is a stacked Game Boy control column in Bonfire tones — language, input, calibration, backup. Refuses card grids, soft form chrome, and any hue outside the four tones.

OWN-WORLD: Inherit H — #E99568 / #BE6754 / #813B2A / #451218, 8px tile, pixel capitals, double frames and inversion.

STORY: The guitarist adjusts the language, picks an input, jumps to calibration, and backs up or restores local data with an explicit replace confirmation.

FIRST VIEWPORT: One column of double frames (language, input, calibration, backup). Tempo is the dominant signal (scale 4, huge stepper). Import confirmation inverted. Calibration link underlined ≥48px tall. No decorative cards.

FORM: Autonomous fallback closest to Bonfire play screen (plan I3). Seed non-interactive; build-phase skipped (I1 owns state.json).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
