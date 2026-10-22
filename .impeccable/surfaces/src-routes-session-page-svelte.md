---
version: 1
slug: "src-routes-session-page-svelte"
primary_target: "src/routes/session/+page.svelte"
related_targets: ["src/routes/+page.svelte","src/lib/ui/play/PlayFrame.svelte"]
---

## Scope

Le monde visuel de la plateforme, éprouvé sur deux écrans : « Prochaine séance » (vue Pratiquer, futur accueil) et « En séance » (`PlayFrame`, lane des notes). Mode Operate. Remplace la cartouche Game Boy, abandonnée.

## Surface

- **Public et tâche :** le guitariste, à 60 cm – 1 m, mains sur la guitare. Avant : il voit la séance, pourquoi chaque bloc, combien de temps, et la lance d'un bouton. Pendant : il lit la consigne de loin, voit arriver ce qu'il faut jouer et quand, joue sur le temps.
- **En séance, règles de l'utilisateur (2026-10-21) :** le moins d'éléments possible pour dire le nécessaire ; la lane le montre sans l'écrire. Une case par temps, fond uni, le nom de ce qu'il faut jouer dans sa case. Passé 1/3, futur 2/3, au moins deux mesures à venir visibles. Ligne fixe, sans le mot « maintenant ». Pas de consigne = respiration, sans le mot. Ni « dans 2 temps », ni « mesure 4 », ni légende, ni numéros pendant l'exercice. La consigne énorme reste au-dessus.
- **En séance, ce qui s'ajoute (2026-10-22) :** une ligne d'infos discrète en haut (« 1 / 4 · Révisions à froid · 3 / 7 · ♩ = 100 ») et « quitter ». Le verdict reste sur la piste : la case jouée garde son nom et porte la forme du verdict (▶ en retard, ◀ en avance, ✕ raté sur case sombre), une seule ligne dessous (« en retard · +42 ms », « F# joué »). Réussi : le centre se tait. Raté : la correction prend la place de la consigne (« F · corde de B » en rappel, « case 6 » en grand). Planche : `.impeccable/mocks/decision/silence-etats.html`, état 3 retenu.
- **Décisions de l'utilisateur à la finition (2026-10-22) :** la case passée garde la marque seule tant que la piste ne reçoit pas le nom joué (il viendra avec la migration H) ; après un raté, le rappel montre la note seule (« F ») et la correction en grand reste la phrase que donne le cœur (« corde de B, case 6 ») ; le bouton « pause » discret reste à côté de « quitter » (pause au toucher, Espace au clavier).
- **Navigation :** rail sombre en dos de pochette, intitulés sans numéros, l'actif marqué d'un filet ambre.
- **Esquisse approuvée :** `.impeccable/mocks/decision/silence.html` (construction code d'abord : c'est la composition à suivre).
- **Moment mémorable :** la consigne seule dans le champ brumeux, et les cases qui arrivent sur la ligne ambre.

## Direction contract

THESIS: Près du silence : un écran qui se tait à mesure que l'aide s'efface, mais dit toujours ce qui vient et quand. Refuse l'appli de guitare sombre à néons, cartes et anneaux de progression, et le tableau de bord gamifié.

OWN-WORLD: Pochettes ECM. Brume #ECE8E2, encre #23211F, ardoise #7A7F80, terre d'ombre #8C6E52, ambre #D9A13B réservé au maintenant et à l'action principale. Champ de jeu brumeux (ardoise vers terre d'ombre). Une grotesque précise, Atkinson Hyperlegible Next, corps légers et grands, marges immenses, filets fins. États par la forme avant la teinte ; une seule échelle d'une séance à l'autre ; la grille des mesures comme armature.

STORY: Le joueur lit la séance comme un dos de pochette, la lance, puis lit la consigne à distance et voit les cases arriver deux mesures à l'avance jusqu'à la ligne.

FIRST VIEWPORT: Rail sombre de 168 px (pratiquer actif, bibliothèque, progrès, réglages, atelier grisé, « neckspert » le long du dos). Prochaine séance : titre léger 40 px et durée totale, quatre blocs numérotés (titre gras, pourquoi en terre d'ombre, durée à droite), le bloc en cours marqué d'un filet ambre, « fait aujourd'hui » et « Commencer » ambre en pied. En séance : champ brumeux, « F » de 300 px centré, « corde de B » 48 px, en bas une piste de 12 cases unies (4 passées, 8 à venir), ligne ambre au tiers, la cible porte son nom ; la ligne d'infos discrète en haut à gauche, « quitter » en haut à droite ; rien d'autre.

FORM: Direction n° 7 de ma liste ordonnée (pochettes ECM), assignée au premier tirage, gardée par l'utilisateur à la relance audacieuse. seed:47f9b36fdc1a27e0

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Les autres vues sur la même piste (accords, grille, lien, figure rythmique), plus tard.
- Clair et sombre : la séance claire, le jeu sombre ; thèmes plus tard.
- Téléphone en portrait ; mode 2 (douze boutons) ; bilan, progrès, bibliothèque.
