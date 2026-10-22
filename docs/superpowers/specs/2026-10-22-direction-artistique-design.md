# Direction artistique « Près du silence » et design system

Date : 2026-10-22. Statut : décidé avec l'utilisateur (2026-10-21 et 22), deux tirages impeccable puis des corrections sur pièces. Remplace la cartouche Game Boy (abandonnée le 2026-10-13, `docs/vision.md`, « Direction artistique et ton »). Piste parallèle au cœur : elle ne touche ni `application/session/` ni `domain/` (voir « Frontières »).

Pièces de référence :

- l'esquisse approuvée, `.impeccable/mocks/decision/silence.html` (« Prochaine séance » et « En séance ») ;
- la planche des états de jeu, `.impeccable/mocks/decision/silence-etats.html` (état 3 retenu) ;
- le contrat de direction, `.impeccable/surfaces/src-routes-session-page-svelte.md` (thèse, monde, premier écran, seed du tirage) ;
- `PRODUCT.md`, rafraîchi depuis `docs/vision.md` le 2026-10-21.

## Ce qui est décidé

**Le monde.** Pochettes ECM : un écran qui se tait à mesure que l'aide s'efface, mais dit toujours ce qui vient et quand. Sobre, sérieux, pas froid. Refuse l'appli de guitare sombre à néons, cartes et anneaux de progression, et tout ce qui fait jouet ou « généré ».

**Un design system, une seule source.** Couleurs, typographie, espacements, mouvements et composants vivent dans des tokens et des primitives partagés ; aucun écran n'écrit de valeur brute ; `DESIGN.md` décrit le système construit, pas une intention. Les thèmes viendront plus tard en changeant les valeurs des tokens, jamais la sémantique des verdicts ni des degrés.

## Le monde

### Couleurs, par rôle

| Token           | Valeur                          | Rôle                                                                   |
| --------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `--np-ground`   | `#ECE8E2` brume                 | fond des écrans hors jeu                                               |
| `--np-text`     | `#23211F` encre                 | texte, rail de navigation                                              |
| `--np-muted`    | `#7A7F80` ardoise               | texte secondaire, filets                                               |
| `--np-earth`    | `#8C6E52` terre d'ombre         | le « pourquoi », les durées, les annotations                           |
| `--np-now`      | `#D9A13B` ambre                 | le maintenant (ligne de la piste) et l'action principale, rien d'autre |
| `--np-field`    | dégradé ardoise → terre d'ombre | le champ de jeu                                                        |
| `--np-on-field` | brume                           | texte et cases sur le champ                                            |
| `--np-rule`     | encre à 12 %                    | filets sur fond clair                                                  |

La séance se joue sur un champ sombre et brumeux ; les autres écrans sont clairs. Les valeurs exactes du champ (dégradé, opacités des cases) se fixent à la construction, mesurées sur le contraste (voir « Vérification »).

### Typographie

Une seule famille, **Atkinson Hyperlegible Next** (OFL, auto-hébergée dans `static/fonts/`), lisible à un mètre. Graisses légères et grands corps pour ce qui se lit de loin, gras pour les titres de blocs. Rôles en tokens (`--np-type-*`) : `meta` (16 px au moins, jamais moins : `scripts/functional-ui.mjs` refuse le texte sous 16 px), `body`, `title`, `prompt` (la corde, la correction), `hero` (la note de la consigne, autour de 300 px sur grand écran), chacun en `clamp()` sur la largeur du conteneur comme aujourd'hui. Les symboles d'accord restent dans cette famille tant que Petaluma (piste de `vision.md`) n'est pas éprouvée.

### Espace et formes

Marges immenses, filets fins, aucun cadre double ni ombre. Une échelle d'espacement en tokens (`--np-space-*`). Les états se lisent **par la forme avant la teinte** (contrat) : hauteur, plein ou creux, position, puis seulement la couleur.

### Mouvement

La piste suit l'indice de temps audio à chaque image, comme aujourd'hui. Un verdict s'imprime dans sa case avec un court effet (≤ 150 ms) ; `prefers-reduced-motion` le supprime. Durées et courbes en tokens (`--np-motion-*`).

## Le design system

### Tokens

`src/lib/ui/tokens.css` porte les tokens du nouveau monde sous des noms de rôle (tableau ci-dessus, plus `--np-type-*`, `--np-space-*`, `--np-motion-*`, et ceux de la piste : case, case de temps fort, opacité du passé). Pendant la migration, les anciens tokens Game Boy (`--np-bg`, `--np-mid`, `--np-shade`, `--np-font-pixel`, `--np-tile`, les `--r-*` du comp) restent pour les écrans pas encore migrés ; ils disparaissent à la fin (« Ce qui disparaît »). Les nouveaux noms ne réutilisent pas les anciens (d'où `--np-text` pour l'encre, `--np-ink` étant pris), pour qu'un écran ne change jamais d'apparence à moitié.

### Primitives

Dans `src/lib/ui/primitives/`, chacune avec sa spec `*.svelte.spec.ts`, pure présentation (props, pas de services) :

| Primitive     | Ce qu'elle porte                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Lane`        | la piste : une case par temps, ligne du maintenant fixe, fenêtre passé / futur, temps forts ; prend des cases déjà calculées |
| `LaneCell`    | une case : vide, cible (son nom), bande (accord plaqué sur plusieurs temps, nom écrit une fois), jouée (marque de verdict)   |
| `VerdictMark` | la forme d'un verdict, avec son nom accessible                                                                               |
| `Prompt`      | la consigne énorme et sa ligne (la corde), ou la correction à sa place                                                       |
| `InfoLine`    | la ligne discrète du haut : exercice n / N, nom, compteur, tempo                                                             |
| `NavRail`     | le rail de navigation en dos de pochette                                                                                     |
| `Button`      | l'action principale (ambre) et les actions secondaires                                                                       |
| `BlockList`   | une liste de blocs : titre, pourquoi, durée, bloc en cours marqué                                                            |

`ChordShape` et `Term` restent et passent au nouveau monde. `VerdictSprite`, `PixelBox`, `PixelButton`, `PixelText` et `PixelWord` disparaissent à la fin de la migration. Les vues d'exercice (`ui/play/views/`) composent ces blocs et gardent leur logique pure (`laneTiles`, `gridScroll`, `linkLane`, `rhythmFigure`) : une vue change sans toucher les autres.

### Documentation et garde-fous

- **`DESIGN.md`** et son fichier lisible par les outils **`.impeccable/design.json`** sont écrits par le documentaliste d'impeccable **à partir du système construit**, à la fin du premier plan, puis mis à jour à la fin de chaque plan suivant.
- Le **détecteur d'impeccable** tourne en hook après chaque modification d'interface (installé globalement le 2026-10-21) et une fois en fin de plan (`impeccable detect --json`).
- `src/lib/ui/CLAUDE.md` est réécrit pour pointer vers le nouveau système ; la phrase de `CLAUDE.md` sur le Game Boy disparaît.

## Les écrans

### En séance

Règles de l'utilisateur, à tenir pour toutes les vues de jeu :

1. **Le moins d'éléments possible pour dire le nécessaire.** La piste montre quoi et quand sans l'écrire.
2. **La piste** : une case par temps, fond uni, le nom de ce qu'il faut jouer dans la case cible. Un tiers de la largeur pour le passé, deux tiers pour le futur ; le futur couvre au moins deux mesures et contient toujours la cible dès qu'elle est annoncée. La fenêtre exacte (en nombre de temps, selon le mètre) se fixe dans le plan, avec un test sur `laneTiles`.
3. **Ligne du maintenant** ambre, fixe, au tiers. Le temps 1 de chaque mesure est un ton plus clair. Aucun numéro de temps ni de mesure.
4. **Aucun texte explicatif pendant le jeu** : ni « maintenant », ni « respiration » (pas de consigne = respiration), ni « dans 2 temps », ni « mesure 4 », ni légende.
5. **La consigne** au centre, énorme : la note, la corde dessous.
6. **La ligne d'infos** en haut, discrète : « 1 / 4 · Révisions à froid · 3 / 7 · ♩ = 100 » (exercice, nom, compteur de consigne ou de cycle, tempo), et « quitter ». Dans l'écran actuel, les éléments qui n'ont pas encore de donnée (le « 1 / 4 » de la séance composée vient avec le planificateur) sont omis, pas inventés.
7. **Le verdict reste sur la piste.** La case jouée, juste à gauche de la ligne, porte la marque de son verdict ; une seule ligne dessous : « en retard · +42 ms », « F# joué » (depuis `VerdictView.offsetMs` et `answerLabel`). Le temps de réaction quitte l'écran de jeu (il reste dans les tentatives et le bilan).
8. **Réussi : le centre se tait. Raté : la correction prend la place de la consigne** (`VerdictView.correction` en grand, la consigne rappelée au-dessus). Pour les triades, les formes entendue et attendue (`ChordShape`) prennent cette place.

Marques de verdict (forme d'abord, teinte ensuite ; case claire = réussi, case sombre = raté) :

| Verdict                       | Marque                      | Statut                         |
| ----------------------------- | --------------------------- | ------------------------------ |
| En retard                     | ▶ sous le nom, case claire  | décidé                         |
| En avance                     | ◀ sous le nom, case claire  | décidé                         |
| Mauvaise note, pas de réponse | ✕, case sombre              | décidé                         |
| Parfait                       | ● centré, case claire       | proposé, à valider sur planche |
| Hors temps                    | ▶ creux, case claire bordée | proposé, à valider sur planche |
| Corrigé (triades)             | ✕ puis ●, case sombre       | proposé, à valider sur planche |

Le cadre commun (`PlayFrame` : départ et mode d'emploi, pause sur Espace, compte à rebours, erreur audio, fatigue, briefing) passe au même monde avec ses vues, au plan 3, pour qu'un écran ne mêle jamais les deux mondes ; la même chose vaut pour le cadre de `PlayScreen` au plan 1 : le compte à rebours occupe la place de la consigne ; le départ est une page claire avec un seul bouton ambre. « Joué juste » reste réservé au développement, discret. Le passé de la piste ne montre que la marque du verdict : le nom de la note jouée n'est pas dans `LaneEntry` et ne s'y ajoute pas pendant cette piste.

### La coquille et la navigation

Un **rail sombre** à gauche (encre), en dos de pochette : intitulés sans numéros, l'actif marqué d'un filet ambre, « neckspert » le long du dos. Intitulés de `vision.md` posés sur les destinations qui existent : **Pratiquer** (`/`), **Bibliothèque** (le jeu libre, en attendant la vraie bibliothèque), **Progrès** (`/map`, la carte du manche en attendant « Où j'en suis »), **Réglages**. Pendant une séance, pas de rail : le jeu occupe tout l'écran. Sur un téléphone, le rail devient une barre en haut ; le jeu met la piste sous la consigne.

### Pratiquer (l'accueil)

La composition de « Prochaine séance » (titre léger et durée, blocs avec leur pourquoi et leur durée, « fait aujourd'hui » sans compteur, un bouton ambre), remplie avec **ce que l'accueil sait déjà** : l'apprentissage du jour (révisions dues ou heure des suivantes), les triades, le geste, le rythme. Aucun plan composé, aucune durée ni « pourquoi » inventés : le planificateur (chantier 5) les apportera.

### La réponse du mode 2 : un clavier

Décidé le 2026-10-22 : les douze boutons de noms laissent la place à **un clavier de piano d'une octave**, de C à B, touches blanches et noires à leur vraie place, le nom écrit sur chaque touche (les deux graphies sur les noires, « C# / Db »). Quitte à chercher où appuyer, autant apprendre la disposition du clavier, une compétence utile en musique occidentale ; qui la connaît déjà gagne du temps. Le premier appui reste la réponse ; la valeur envoyée est la hauteur (`AnswerChoice.value`), le cœur ne change pas. Conséquence : le temps de réponse du mode 2 change de sens (chercher une touche plutôt qu'un bouton), son seuil se recalibre sur l'usage, comme prévu dans `PRODUCT.md`.

### Les autres écrans

Bilan, réglages, calibration, carte du manche, puis les vues d'exercice (grille, lien, figure rythmique) passent au même système, chacun dans son plan (« Ordre »). La notation rythmique (VexFlow) s'engrave en brume sur le champ.

## Ordre

Trois plans, chacun fini par la relecture de finition d'impeccable, le détecteur, `DESIGN.md` à jour et `npm test && npm run check` :

1. **Fondations et séance.** Tokens, police, primitives `Lane`, `LaneCell`, `VerdictMark`, `Prompt`, `InfoLine`, `Button` ; la séance des notes et des triades (la piste et le cadre de `PlayScreen`, et le clavier du mode 2, qui s'affiche dans le même écran). Fin : relecture de finition sur l'écran de jeu, premier `DESIGN.md` et `.impeccable/design.json` par le documentaliste. `PlayScreen` disparaîtra au chantier 2 ; ce plan sort donc sa piste dans les primitives, qui lui survivent, et ne restyle que le reste.
2. **Coquille et écrans.** `NavRail`, `BlockList` ; la coquille (`+layout.svelte`), Pratiquer, bilan, réglages, calibration, carte.
3. **Vues d'exercice et ménage.** `PlayFrame` avec ses vues : grille, lien, figure rythmique et cycle joué sur la grammaire de la piste ; puis tout ce qui disparaît.

Chaque plan se fait sur sa branche ; aucun ne touche le cœur, ils peuvent donc courir pendant la migration H du temps musical.

## Frontières

- **Pas de changement du cœur.** Ni `application/session/`, ni `domain/`, ni les contrats (`PlayView`, `VerdictView`, `LaneEntry`). L'interface n'affiche que ce que la vue lui donne. Un manque se note dans « Questions ouvertes », il ne s'ajoute pas ici.
- **Le texte de l'interface** reste dans les `messages.ts` (fr et en) ; les nouveaux textes y entrent.
- **Le parcours d'impeccable** : construction en code d'abord (surface Operate) ; la composition à suivre est l'esquisse approuvée ; la relecture de finition audite contre le contrat de direction.

## Ce qui disparaît

À la fin du plan 3 (aucun reste après la migration) : la police VT323 et Oxanium (`static/fonts/`), les plaques Game Boy (`static/plates/`), `PixelBox`, `PixelButton`, `PixelText`, `PixelWord`, `VerdictSprite`, la classe `.np-dither`, les tokens Game Boy et les `--r-*` du comp, l'ancien contrat Game Boy et ses comps dans `.impeccable/` (gardés dans l'historique git). L'ancien `DESIGN.md` est remplacé dès la fin du plan 1.

## Vérification

- `npm test && npm run check` à chaque plan ; les specs de composants vérifient les états (case cible, case jouée par verdict, correction à la place de la consigne, marque accessible par son nom).
- `scripts/functional-ui.mjs` sur les écrans migrés : comportement et aucun texte sous 16 px.
- Contraste : texte et cases sur le champ au moins AA ; chaque verdict compréhensible sans la couleur.
- Captures bureau et téléphone, puis la relecture de finition d'impeccable (agent `impeccable-finish-reviewer`) contre le contrat et l'esquisse.

## Questions ouvertes

- Les marques de parfait, hors temps et corrigé (proposées ci-dessus), à valider sur une planche au plan 1.
- Le nom de la note jouée dans les cases passées : demande un champ dans `LaneEntry`, à décider avec la migration H.
- La place du futur `1 / 4` de la séance composée : vient avec le planificateur.
- Petaluma pour les symboles d'accord : à éprouver au plan 3 (grille).
- Le téléphone en portrait : la piste sous la consigne suffit-elle ? À éprouver au plan 1.

## Réalisation

Plan 1 (2026-10-22) :

- les tokens de taille et d'espacement du nouveau monde s'appellent `--np-size-*` et `--np-step-*` (les noms `--np-type-*` / `--np-space-*` sont pris par l'ancien monde) ; s'y ajoutent `--np-size-correction`, `--np-size-cell` ;
- le dégradé du champ a son milieu à `#656968` (et non `#6c706f`) pour tenir 4,5:1 ; aucun texte sur son haut le plus clair ;
- piste : une case par temps, toutes de même largeur (1/(3 × temps par mesure)), la ligne fixe au tiers, les cases en trop rognées à droite ; la marque de verdict garde une taille fixe (32 px) pour rester lisible sur téléphone ;
- marques : les six validées sur planche le 2026-10-22 (parfait point centré, avance ◀, retard ▶, hors temps ▷ sur case bordée, corrigé ✕● sur case sombre, mauvaise note ✕ sur case sombre) ;
- après un raté : le rappel montre la note seule et la correction en grand est la phrase du cœur (« corde de B, case 6 »), décision de l'utilisateur ; en mode 2, où la correction est le nom de la note (« F# / Gb »), le rappel reprend toute la consigne (« case 8 · corde de A ») ; la case passée montre la marque seule jusqu'à la migration H ;
- la légende sous la case jouée reste sur une ligne, hors du rognage de la piste : centrée sous sa case, elle se décale vers la droite plutôt que de passer le bord gauche de la piste quand la case recule dans la mesure de respiration ; le nom d'accord d'une bande (ancre de triade) part du bord gauche de la bande et court sur ses cases, jamais sur la case de la fondamentale, et ne s'affiche qu'une fois entier dans les cases visibles ;
- le bouton « pause » discret reste à côté de « quitter » (décision de l'utilisateur) ;
- le mode 2 répond sur un clavier de piano d'une octave (`AnswerKeyboard`), qui remplace `AnswerPad` ; il passe dès ce plan ;
- la barre de navigation disparaît sur `/session` (et `/dev/identify`) ; l'erreur de chargement de `/session` porte son lien « Retour à l'accueil » ;
- les écrans du geste et du rythme (`PlayFrame`, encore dans l'ancien monde) perdent aussi la barre de navigation sur `/session` ; `PlayFrame` garde son propre lien « quitter » ;
- reporté au plan 3 : le dossier de build Game Boy d'impeccable (`.impeccable/build/state.json`, les comps approuvés) et les tailles internes de `ChordShape`.
