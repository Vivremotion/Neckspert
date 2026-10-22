# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit en site statique, Svelte 5 (runes uniquement), CSS natif avec variables, sans bibliothèque de composants. Données locales dans IndexedDB (Dexie). Tests Vitest pour la logique métier. Décision de l'utilisateur, consignée dans `docs/brief.md`.

## Users

**Des guitaristes investis**, du débutant motivé à l'expert, qui savent qu'il faut travailler pour progresser ; pas des gens qui veulent « jouer des morceaux » sans compétence réelle. Ils suivent un cursus, avec ou sans professeur : l'application marche **en autonomie, sans professeur**.

**Le premier utilisateur est l'auteur.** Guitariste avancé, jusqu'à 5 h de pratique par jour, qui aime l'improvisation, la technique et le son, et suit des cours. Son problème de départ : les notes du manche ne s'impriment pas ; il les retrouve par calcul à partir des repères, jamais par accès direct, et tout est à refaire le lendemain.

**Les professeurs** sont un second public : ils créent des exercices pour leurs élèves et suivent leurs progrès entre les cours. L'application prolonge un cours, elle ne le remplace pas.

Ce qui marche pour ce public : des exercices simples et ciblés, avec un objectif défini, un progrès mesurable et des critères observables. Ce qui ne marche pas : les exercices qui « ne mènent nulle part », sans critère de réussite ni progrès visible.

## Product Purpose

**Une plateforme d'apprentissage de la guitare** dont le moteur permet d'écrire n'importe quel exercice et de structurer l'apprentissage : notes du manche, formes d'accord, précision rythmique aujourd'hui ; lecture, oreille, improvisation ensuite. On joue sur une vraie guitare, sur le temps, et l'application mesure ce qui reste d'une séance à l'autre. Vision et feuille de route : `docs/vision.md`.

La revendication : **mesurer ce qui reste, pas ce qui réussit pendant l'exercice.** Le froid compte à part du chaud ; la maîtrise exige le rappel espacé et le transfert hors de l'aide. Exemple pour le manche : une position est **maîtrisée** quand elle est retrouvée juste et vite, à froid, dans des séances distinctes espacées de plusieurs jours (valeurs initiales, à calibrer : 90 % de premières réponses justes, en moins de 1,5 s, sur trois séances, la dernière réussite au moins 72 h après la précédente).

Gratuite et open source : au moins le moteur et les exercices fondamentaux. Un modèle économique, s'il existe, ne passe jamais par les compétences fondamentales.

## Positioning

**« JTC rendu interactif »** : un cours pour guitaristes investis, du débutant motivé à l'expert, avec de vraies leçons et des exercices variés, pas une porte d'entrée pour débutants ni un jeu sans portée pédagogique (Yousician, Rocksmith). JTC n'est pas interactif ; ici, chaque exercice écoute la guitare et juge.

Le mécanisme que les autres n'ont pas : le premier essai d'un item après un délai (à froid) est compté à part des suivants (à chaud), et seul le froid alimente la rétention ; la répétition espacée (FSRS) ramène ce qui faiblit ; chaque mesure dit ce qu'elle prouve (justesse, rappel, précision, régularité, tenue, placement). Les autres entraîneurs mesurent si tu trouves pendant l'exercice ; celui-ci mesure si tu trouves encore le lendemain, sans réfléchir et sans l'écran.

Ce projet remplacera Neckspert, l'outil d'origine.

## Operating Context

- **Mains prises, loin de l'écran.** Le guitariste tient sa guitare, à 60 cm à 1 m de l'écran. Il ne peut pas manipuler l'interface pendant une série.
- **Tous les écrans**, du téléphone à l'ordinateur de bureau.
- **Entrée audio.** Guitare branchée sur une interface audio, recommandée. Le micro de l'appareil est toléré, avec une détection moins fiable.
- **Contrôles.** Un grand bouton tactile ou cliquable entre les séries, la barre d'espace et quelques touches sur un clavier (E écouter, R réécouter). Pas de prise en charge de pédale. Exception : en mode 2, la réponse se donne à l'écran avec de grands boutons.
- **Plusieurs séances courtes par jour**, au milieu d'une pratique beaucoup plus longue. L'application reste minoritaire dans la pratique quotidienne.
- **Contexte pédagogique** : un professeur donne des renversements, des grilles, des figures rythmiques et des tonalités d'improvisation qui changent d'un cours à l'autre. Le corpus de référence est deux ans de cours de l'auteur (39 cours, 43 exercices), hors dépôt.

## Capabilities and Constraints

### Ce qui existe aujourd'hui

**Notes du manche**

1. **Localisation** (nom vers position) : « F, corde de B », à jouer sur le temps.
2. **Identification inverse** (position vers nom) : consigne textuelle (« corde de A, case 8 ») plutôt qu'un manche dessiné. La guitare ne sert pas : la réponse se donne en touchant ou cliquant le nom parmi douze grands boutons, les mêmes sur tous les appareils. Les notes altérées portent les deux formes (F# / Gb). Le premier bouton touché est la réponse. Le temps est mesuré de l'affichage de la consigne au toucher. Ce mode suppose d'être à portée de l'écran.

**Triades** (cordes G-B-E), en deux voies : la **mémoire** (ancrer une triade : symbole et corde de la fondamentale vers forme jouée, puis une zone du manche) et le **geste** (relier des formes voisines sur une grille, monter, jouer dans une zone, puis en jam). Les grilles s'écrivent en vrais symboles d'accord. Après un raté, l'écran dessine ce qui a été entendu et ce qui était attendu.

**Rythme** : trois exercices du professeur (mesures silencieuses, métronome sur 2 et 4, contretemps), une figure jouée en boucle et jugée par cycle, des niveaux, l'écoute et la réécoute de sa prise (voir « Rythme » plus bas).

**À venir** (`docs/vision.md`, « Ordre des chantiers ») : séquences et figures sur les exercices du manche, ensembles admis et formes pleines, audio joué et prises partagées, compétences et planificateur, langage d'exercices et Atelier. Les vues prévues : Prochaine séance, Séance, Bilan, Progrès, Bibliothèque, Fiche d'exercice, Atelier, Réglages.

### Règles de jeu

- **La première note jouée est la réponse.** Une exception : à l'ancrage d'une triade, un premier accord faux remis juste plus tard dans la fenêtre est salué à l'écran (« corrigé »), mais compte comme un raté.
- **Visualiser avant de jouer.** La consigne arrive avant la cible, mains immobiles, puis la note doit tomber sur le temps. La note cible tombe toujours sur le temps 1 d'une mesure ; la consigne apparaît 8 temps avant (temps 1, deux mesures avant), 4 temps avant (temps 1 de la mesure précédente) ou 2 temps avant (temps 3). Jamais de consigne ni de cible sur les temps 2 ou 4. En mode 1, la corde s'affiche un temps avant la note ; la note est la seule lettre en grand.
- **Respiration.** Après une cible, la consigne suivante attend le temps 1 de la mesure suivante. Pendant ce temps, après une fausse note ou une absence de réponse, l'écran montre la bonne réponse : la position en mode 1 (« corde de E grave, case 5 »), le nom en mode 2.
- **Hors temps.** Après la fenêtre de réponse, l'écoute continue environ 2 s (jamais au-delà de l'apparition de la consigne suivante). Une bonne note jouée là est « hors temps » : trouvée, mais pas en rappel direct. Une note jouée avant la consigne, ou dans les 300 ms qui suivent son apparition, appartient à la consigne précédente.
- **Seuil mémoire contre calcul** : environ 1 à 1,5 s. En dessous, rappel direct ; au-delà, calcul. Seuil à calibrer séparément pour le mode 2, où la réponse passe par l'écran.
- **Notes ambiguës** : une même hauteur existe sur plusieurs cordes, et le détecteur ne sait pas laquelle a été jouée. Le mode 1 vérifie la hauteur et l'octave (seules les octaves jouables sur la corde demandée sont acceptées) et fait confiance au guitariste pour la corde.
- **Enregistrer les confusions**, pas seulement les échecs (F# joué à la place de F : erreur d'une case, donc de calcul).
- **Progression par une file ordonnée** : les naturelles d'abord, en alternant les cordes, celles placées sur un point du manche en premier ; puis les altérées. Une note nouvelle entre dès qu'une place se libère (fenêtre glissante).
- **Cordes à vide supposées connues** : la consigne nomme la corde par sa note à vide ; la case 0 n'est jamais demandée.
- **Retrait progressif de l'aide** : position affichée, puis nom seul, puis accord seul.
- **Le jeu propose, tout reste accessible.** La séance est un bouton : le jeu compose ce qu'il faut travailler et le dit. Chaque exercice reste jouable en jeu libre ; la règle froid / chaud garde les statistiques honnêtes.
- **Temps de jeu illimité, révisions à froid limitées.** L'Apprentissage et le jeu libre restent toujours ouverts ; ce qui est rejoué à chaud ne compte pas dans la rétention. Un essai à froid compte quel que soit le mode : en jeu libre, une position déjà apprise et non jouée depuis au moins 1 h compte comme une révision. La fatigue est signalée (baisse de précision, temps de réaction qui s'allonge).

### Apprentissage

Une session d'environ 5 minutes, toujours ouverte, à relancer autant qu'on veut. À chaque consigne, le jeu choisit, dans cet ordre :

1. **Retest d'une note en cours d'apprentissage** dont l'écart est écoulé.
2. **Révision à froid** : une position apprise, due selon la répétition espacée, et non jouée depuis au moins 1 h. Au plus environ 20 par session. Seules ces réponses, et les essais à froid du jeu libre, comptent pour la rétention.
3. **Reprise** d'une note restée en cours d'apprentissage à la session précédente.
4. **Note nouvelle**, la suivante de la file, sondée d'abord sans aide (voir Progression), s'il y a moins de 3 notes en cours d'apprentissage et moins de 10 notes apprises mais pas encore acquises.
5. **Consolidation** : une note déjà apprise, parmi les plus fragiles (confusions récentes, faible stabilité). À chaud, ne compte pas.

Dans chaque catégorie, le choix se fait au hasard : jamais deux fois la même note de suite, jamais les deux notes d'une paire miroir à la suite (« A, corde de E grave » et « E, corde de A »), et pas deux fois la même corde quand c'est possible. Une note n'entre pas dans la file tant que sa note miroir n'est pas acquise.

Le jeu se pilote au taux de réussite (une réussite : juste et dans le temps ; hors temps, fausse note et absence de réponse sont des ratés) :

- **Note nouvelle** seulement si chaque note en cours d'apprentissage réussit à au moins 80 % sur ses derniers essais de la session, et si la session réussit à au moins 70 % sur ses 10 dernières consignes du mode 1 (sondages exclus).
- **Rattrapage** : après un raté (hors sondage), la consigne suivante est une note solide (acquise, sans raté récent), à chaud, au même temps d'avance.
- **Ensemble de travail** : au plus 6 notes différentes à chaud dans une session ; les révisions à froid n'en font pas partie.
- **Séquences** (essai) : les consignes vont par séquences de 4, au même temps d'avance et dans la même scène ; un changement de temps d'avance entre deux séquences est annoncé par une mesure décomptée.
- **Corde dessinée** (essai) : une aide qui se retire dès qu'elle ne sert plus. Les six cordes sont dessinées, la corde demandée marquée avec sa lettre, à la présentation aidée d'une note nouvelle et à la consigne qui suit un raté de cette note dans la session ; elles disparaissent après une réussite de la note. Jamais aux révisions à froid ni aux sondages.

Le tempo est propre à chaque exercice (chaque exercice sur le temps, mode 1, a le sien ; le mode 2 se joue à son propre rythme, sans tempo, voir `docs/plateforme.md`) et n'est plus réglable dans les Réglages. Il reste fixe pendant une session. À la fin d'une session d'Apprentissage, il s'adapte pour la suivante : plus de 90 % de réussite au mode 1 → +5 bpm ; moins de 70 % → −5 bpm ; entre 80 et 160 bpm. À 80 bpm, 2 temps durent 1,5 s : le temps d'avance le plus court reste un test de rappel direct.

Apprendre une note (mode 1), après un sondage manqué : présentation à 8 temps avec la position affichée, dès la consigne suivante. Chaque réussite divise le temps d'avance par deux (8, 4, 2 à 80 bpm), chaque échec le double, au plus 8 ; l'aide n'apparaît qu'à 8 temps. La note est **apprise** après 2 réussites au temps d'avance du rappel direct. En mode 2, présentation avec le nom de la note, puis 2 réponses rapides sans aide.

Quand on passe de la guitare à l'écran ou l'inverse, une mesure est décomptée à l'écran (4, 3, 2, 1) avant la consigne : clics et piste vers la guitare, silence et boutons vers l'écran. De même entre deux séquences de temps d'avance différents. Le décompte occupe les quatre temps qui précèdent la consigne calée sur la grille.

À la fatigue, plus de note nouvelle ni de consolidation ; seuls les retests en cours continuent. Le bilan suit : précision et temps médian à froid, notes apprises, notes déjà sues (sondages réussis), notes qui reprendront la prochaine fois, heure des prochaines révisions (une information, pas une invitation à attendre). Le bouton de l'accueil est toujours actif, dès la première visite ; il indique les révisions dues ou l'heure des suivantes. Les chiffres sont des valeurs de départ, à calibrer.

### Progression

- **Sondage** : la première fois qu'une note sort de la file, elle est demandée sans aide (mode 1 au temps d'avance du rappel direct, mode 2 avec son seuil). Retrouvée en rappel direct, elle passe directement en révision, acquise ; sinon l'aide arrive à la consigne suivante et l'apprentissage commence. Rien n'annonce un sondage à l'écran. Le sondage dispense de l'enseignement, jamais de la vérification. Il n'y a plus de session de positionnement (spec `docs/superpowers/specs/2026-10-03-sondage-avant-apprentissage-design.md`).
- **File d'introduction** : naturelles puis altérées, cordes alternées, cases 1 à 11. Une note entre quand une place de la fenêtre se libère, pas quand un ensemble est acquis.
- **Mode 2** : une position entre dans la file en mode 2 dès qu'elle est acquise en mode 1. Chaque sens (nom vers position, position vers nom) est suivi séparément par la répétition espacée.
- **Triades et geste** : la zone des triades s'ouvre une fois les ancrages acquis ; la voie du geste s'ouvre sur les triades acquises. Les déblocages par compétence viendront avec le graphe de compétences et le planificateur (`docs/vision.md`, chantier 5).

### Rythme

Le rythme est une compétence à part entière, pas un décor des exercices du manche : jouer une figure en place, la tenir quand le clic se tait, la lire d’un trait. Seules les attaques comptent, pas les hauteurs ; toute attaque vaut (médiator, cordes étouffées, percussion). Trois exercices du professeur ouvrent la compétence, depuis « Rythme » à l’accueil : **mesures silencieuses**, **métronome sur 2 et 4**, **contretemps** (spec `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`).

- **On joue en continu** : la figure se joue en boucle, chaque **cycle** est jugé ; une **respiration** (au moins 4 s, clic audible, on ne joue pas) vient après chaque **suite** de cycles et montre seulement alors le retour de la suite. Rien n’est affiché sur les attaques pendant le jeu.
- **Une mesure dit ce qu’elle prouve** : fidélité à la figure (aucune note oubliée, aucune en trop, aucun temps perdu ou ajouté), régularité, tenue sans clic (décalage, dérive : seule la dérive dit « tu accélères »), placement et précision. Placement et précision ne jugent que si la latence a été mesurée sans le joueur ; sinon ils sont affichés sans compter.
- **Niveaux** : chaque exercice a son échelle (moins de clic, plus vite, ou plus lent quand c’est plus dur) ; on monte après 3 cycles réussis d’affilée sans aide, on redescend après 2 échecs ; les changements s’annoncent à la respiration, où le tempo peut changer (« ♩ = 100 bpm » → « ♩ = 120 bpm »). Des niveaux d’aide existent sous le niveau 1.
- **Écouter la figure** (E) avant de la jouer, **réécouter sa suite** (R) avec le clic remis sur les mesures muettes. En lecture, écouter avant de jouer est une aide : le cycle qui suit ne compte pas pour monter.
- Tout se joue à chaud : le rythme se mesure par sa progression, pas encore par la rétention.

### Terminologie

- **À froid / à chaud** : premier essai d'une position après un délai / essais suivants. Exception : un sondage manqué est enregistré à chaud, parce qu'il ne mesure pas un oubli (la note n'a jamais été apprise) ; un sondage réussi est à froid.
- **Sondage** : la toute première consigne d'une position, sans aide, quand elle entre dans l'Apprentissage. **Déjà sue** : note dont le sondage a réussi.
- **Verdicts** : Parfait, En avance, En retard, Hors temps, Mauvaise note (Perfect, Early, Late, Off beat, Wrong note), du meilleur au moins bon ; une absence de réponse vaut une mauvaise note.
- **Temps d'avance** : nombre de temps entre l'apparition de la note et la cible : 8, 4 ou 2 (jamais 1). La cible tombe sur le temps 1.
- **Respiration** : la mesure qui suit la cible, sans nouvelle consigne ; la correction s'y affiche après un raté.
- **Hors temps** : bonne note jouée après la fenêtre, pendant l'écoute prolongée. Juste, jamais rappel direct : ne rend pas une note acquise, fait remonter le temps d'avance.
- **Tempo adaptatif** : propre à chaque exercice ; le tempo de l'exercice à la session d'Apprentissage suivante, ajusté sur la réussite de celle-ci. Il n'est pas réglable dans les Réglages.
- **Apprise** : réussie 2 fois sans aide, en rappel direct, dans la session où elle a été introduite. État à chaud, de court terme ; fait avancer la file, ne compte pas pour la rétention.
- **Acquis** : position réussie juste et sous le seuil de rappel direct, à froid, au moins une fois dans une session postérieure à son apprentissage, ou au sondage.
- **Maîtrisé** : voir Product Purpose. Alimente « Où j'en suis » et les déblocages.
- **Noms des notes** : toujours en lettres (C, D, E…), dans les deux langues. Les notes altérées apparaissent sous les deux formes (F# ou Gb), tirées au hasard, et les deux sont acceptées en réponse.
- **Langue de l'interface** : bilingue, français et anglais.

### Contraintes techniques

- Toute la temporisation est calée sur `AudioContext.currentTime`.
- Détection des notes avec octave par un détecteur de hauteur ; des accords par vérification de candidats (NNLS : on vérifie la forme attendue plutôt que de transcrire) ; des attaques sans hauteur pour le rythme. Une seule entrée audio alimente tous les capteurs ; la latence se calibre contre le micro de l'ordinateur, sans le geste du joueur.
- Chaque tentative est conservée avec son horodatage.
- Données en local uniquement, sans compte. Export et import de fichier pour sauvegarder ou changer d'appareil.

### Décisions ouvertes

- **Reconnaissance de la corde au timbre** (inharmonicité) : expérience possible plus tard, avec calibration par guitare et interface audio. D'abord en simple signalement dans les statistiques, sans effet sur le verdict.
- **Nom définitif.** « Neckspert Play » est le nom de travail ; « Neckspert » nomme le manche, pas une plateforme multi-compétences.

## Brand Commitments

- **Personnalité : sérieux mais engageant.** Chaleureux, qui donne envie de revenir ; ni froideur clinique ni bonne humeur forcée. L'atmosphère d'une salle de répétition.
- **Ton : un bon prof.** Direct, chaleureux, une pointe d'humour sec, jamais infantilisant ; le vocabulaire des musiciens. Un seul mot par concept, le même dans le code, l'interface et le langage d'exercices (« niveau », « respiration », « suite »…).
- **Pas de gamification creuse** : ni séries, ni XP, ni classements, ni récompenses inventées, ni temps total comme exploit, ni score global. L'engagement vient du progrès visible, de la musique, des prises réécoutées, des déblocages réels. Anti-modèle : Duolingo.
- **Le Game Boy est abandonné** (2026-10-13) : la direction pixel en quatre tons a été jugée laide en pratique et pas sérieuse. Elle ne sert plus de référence.
- **Thèmes plus tard** : la peau pourra changer ; la sémantique des verdicts et des degrés, jamais.

## Evidence on Hand

- `docs/vision.md` : vision, principes, vues prévues et ordre des chantiers. `docs/brief.md` : brief d'origine.
- Les écrans existants (accueil, séance, bilan, carte du manche, réglages, calibration) et leurs vues de jeu : consigne de note, grille d'accords, lane du lien, figure rythmique en notation (`src/lib/ui/`).
- Le corpus de cours de l'auteur (coffre Obsidian, hors dépôt) : c'est l'œuvre du professeur, à ne pas reproduire.
- Aucune donnée d'usage externe, aucun utilisateur externe, aucun témoignage : ne rien inventer de tel.

## Product Principles

1. **Une mesure dit ce qu'elle prouve.** Le froid fait foi pour la rétention ; un verdict faux est pire qu'aucun ; ce que l'application ne sait pas juger est dit, pas maquillé ; le nombre d'essais est toujours dit.
2. **Ne jamais rendre dépendant de l'interface.** L'écran donne la question, jamais la réponse (noms, symboles, grilles, pas de coordonnées de case) ; chaque aide s'efface, la structure du temps aussi, jusqu'aux yeux fermés. Seul le jeu sans aide prouve le transfert.
3. **Décider avant de jouer.** La consigne arrive avant la cible, la première réponse compte, et elle tombe sur le temps.
4. **Pédagogie avant technologie.** On conçoit l'exercice pour apprendre, puis la détection pour lui ; on ne plie jamais un exercice à une limite technique.
5. **Le seul gain, c'est le progrès mesuré.** Pas de gamification creuse ; l'application reste une petite part de la pratique et prolonge le cours, elle ne le remplace pas. Local-first : données sur l'appareil, sans compte.

## Accessibility & Inclusion

- Consignes lisibles à 60 cm – 1 m, sur tous les formats d'écran.
- Aucune interaction fine pendant une série ; cibles larges entre les séries et pour les réponses du mode 2, barre d'espace au clavier.
- Chaque verdict reste compréhensible sans la couleur : couleurs lisibles par les daltoniens, toujours doublées d'une forme.
