## Scope

Écran de jeu pendant une série (session du jour, mode 1 Localisation en premier). Mode Operate. Premier écran de l'univers visuel de la famille Neckspert.

## Surface

- **Public et tâche :** le guitariste, à 60 cm – 1 m, mains sur la guitare, lit la consigne, joue la note sur le temps et lit son verdict. La guitare est le contrôleur ; barre d'espace ou grand bouton pour la pause, entre les séries seulement.
- **Contenu :** consigne (note, corde), temps (deux mesures d'annonce), verdict (Parfait, En avance, En retard, Mauvaise note ; écart en ms ; temps de réaction), historique de la série sur la piste. Rien d'autre.
- **Comp approuvée :** `.impeccable/mocks/comp-4-full-bleed-lane.png`. Corrections obligatoires : seuls les huit temps à venir portent des numéros (1 2 3 4 1 2 3 4), aucun chiffre au-dessus des cibles jouées, pas de « 10 », « 14 », « 15 » ; la tuile inversée de la dernière note jouée se place juste à gauche de la ligne d'arrivée ; le temps en cours est la première tuile à droite de la ligne.
- **Moment mémorable :** la piste qui défile de droite à gauche, la note qui tombe sur la ligne fixe, et le verdict qui s'imprime en sprite dans la tuile au moment où elle passe la ligne.

## Direction contract

THESIS: L'écran de jeu est une cartouche Game Boy aux couleurs de la guitare : consigne énorme, temps en piste de tuiles qui arrive sur une ligne fixe. Refuse l'écran habituel de la catégorie : manche dessiné, carte centrale arrondie, barre de progression.

OWN-WORLD: Quatre tons stricts mesurés sur la Strandberg Bonfire Red (fond #E99568, moyen #BE6754, ombre #813B2A, encre #451218), damier de tramage pour tout cinquième ton, grille de tuiles 8×8, police pixel en capitales, hiérarchie par cadres doubles et inversion. Les verdicts sont des sprites (rond, flèche gauche, flèche droite, croix) avec inversion, mouvement et son, jamais une couleur propre.

STORY: Le guitariste lit la note et la corde à distance, voit les deux mesures arriver, joue sur la ligne, lit son verdict, et voit la série défiler derrière la ligne.

FIRST VIEWPORT: Plein cadre 16:9, sans bandes. Haut (65 %) : « F » géant ombré et « corde de B » à gauche (60 %) ; boîte verdict à double cadre à droite (40 %) : sprite, bandeau inversé, écart en ms, temps de réaction. Bas (35 %) : piste de tuiles, ligne d'arrivée fixe au quart gauche surmontée d'un cœur, cibles jouées à gauche avec leur sprite, huit temps à droite, cible « F » au bout, « MESURE 2/2 TEMPS 3/4 » au-dessus à droite. Aucune action à l'écran : la guitare joue.

FORM: Challenger de catalogue digital-design-canon-gameboy-four-shade-field, fusionné, palette traduite vers la Bonfire mesurée à la demande de l'utilisateur ; hors de ma liste ordonnée (tirage : position 4, chronométrage officiel, écarté par l'utilisateur). Seed 5dc1b320.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Adaptation portrait (téléphone) : la piste passe sous la consigne, le verdict se superpose ou se réduit ; à éprouver à la construction.
- Écran de réponse du mode 2 (douze grands boutons), accueil, bilan et carte du manche : surfaces à venir, dans le même univers.
- Sons et mouvements de chaque verdict.
