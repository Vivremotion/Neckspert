# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit en site statique, Svelte 5 (runes uniquement), CSS natif avec variables, sans bibliothèque de composants. Données locales dans IndexedDB (Dexie). Tests Vitest pour la logique métier. Décision de l'utilisateur, consignée dans `docs/brief.md`.

## Users

**Utilisateur principal : l'auteur.** Guitariste de niveau avancé, jusqu'à 5 h de pratique par jour, qui aime l'improvisation, la technique et le son, et que les reprises ennuient. Il suit des cours avec un professeur. Son problème : les notes du manche ne s'impriment pas. La recherche devient rapide après quelques répétitions, mais tout est à refaire 10 minutes plus tard ou le lendemain. Il retrouve les notes par calcul à partir des repères (points des cases 3, 5, 7, 9 ; « C est une case au-dessus de B ») ou par tâtonnement, jamais par accès direct. Deux semaines de l'exercice classique n'ont rien changé.

**Ensuite : d'autres guitaristes avancés.** L'application sera publiée après usage personnel, comme Neckspert. Ils partagent le même besoin : mémoriser durablement le manche plutôt que réussir un exercice sur le moment.

Ce qui marche pour ce public : des exercices simples et ciblés, avec un objectif défini, un progrès mesurable et des critères observables. Rhythm Doctor a très bien fonctionné pour le rythme, parce qu'il était à la fois gratifiant et utile. Ce qui ne marche pas : les exercices qui « ne mènent nulle part », sans critère de réussite ni progrès visible.

## Product Purpose

Faire passer la connaissance du manche du calcul au rappel direct, et le prouver. L'application choisit quoi réviser, fait jouer la réponse sur une vraie guitare, sur le temps, et mesure ce qui reste d'une session à l'autre.

Le succès : une position est **maîtrisée** quand elle est retrouvée juste et vite, à froid, dans des sessions distinctes espacées de plusieurs jours. Valeurs initiales, à calibrer : 90 % de premières réponses justes, en moins de 1,5 s, sur trois sessions, la dernière réussite au moins 72 h après la précédente.

À terme, la mémoire du manche sert la musique : renversements, déplacements sur une grille, notes cibles puis improvisation sur backing track.

## Positioning

Les autres entraîneurs de manche mesurent si tu trouves la note pendant l'exercice ; celui-ci mesure si tu la trouves encore le lendemain, sans réfléchir.

Le mécanisme : le premier essai d'une position après un délai (à froid) est compté à part des suivants (à chaud), et seul le froid alimente les statistiques de rétention. La répétition espacée (FSRS) ramène les positions faibles. Le seuil de temps sépare le rappel direct du calcul. La forme de jeu de rythme (répondre sur le temps) et le parcours vers la musique (modes à débloquer) servent cette revendication centrale.

## Operating Context

- **Mains prises, loin de l'écran.** Le guitariste tient sa guitare, à 60 cm à 1 m de l'écran. Il ne peut pas manipuler l'interface pendant une série.
- **Tous les écrans**, du téléphone à l'ordinateur de bureau.
- **Entrée audio.** Guitare branchée sur une interface audio, recommandée. Le micro de l'appareil est toléré, avec une détection moins fiable.
- **Contrôles.** Un grand bouton tactile ou cliquable entre les séries, et la barre d'espace sur un clavier. Pas de prise en charge de pédale.
- **Plusieurs sessions courtes par jour**, au milieu d'une pratique beaucoup plus longue. L'application reste minoritaire dans la pratique quotidienne.
- **Contexte pédagogique**, qui alimente les modes avancés : le professeur donne des renversements, des grilles et des tonalités d'improvisation qui changent d'un cours à l'autre. Les modes 3 à 5 ne sont pas liés à ces exemples.

## Capabilities and Constraints

### Modes

1. **Localisation** (nom vers position) : « F, corde de B », à jouer sur le temps.
2. **Identification inverse** (position vers nom) : consigne textuelle (« corde de A, case 8 ») plutôt qu'un manche dessiné. La note jouée confirme la position, la réponse nommée est vérifiée.
3. **Renversements** : produire un renversement donné, pour n'importe quel accord et groupe de cordes. Après la réponse, afficher les notes attendues et le degré porté par chaque corde (fondamentale, tierce, quinte).
4. **Ascension** : sur une grille programmable, chaque accord plus haut que le précédent, attaque sur le temps, sans rupture de pulsation ; puis la descente.
5. **Boss musical** : backing track dans une tonalité donnée, notes cibles sur les changements d'accord, puis improvisation libre.

**Premier prototype :** modes 1 et 2, répétition espacée, tableau de bord de rétention.

### Règles de jeu

- **La première note jouée est la réponse.** Aucune correction après une fausse note.
- **Visualiser avant de jouer.** La consigne arrive avant la cible (par exemple deux mesures), mains immobiles, puis la note doit tomber sur le temps.
- **Seuil mémoire contre calcul** : environ 1 à 1,5 s. En dessous, rappel direct ; au-delà, calcul.
- **Enregistrer les confusions**, pas seulement les échecs (F# joué à la place de F : erreur d'une case, donc de calcul).
- **Progression par petits ensembles** : une corde et trois notes, puis une corde et douze notes, puis une note sur plusieurs cordes, puis tout le manche.
- **Retrait progressif de l'aide** : position affichée, puis nom seul, puis accord seul.
- **Le jeu décide quoi travailler.** Les modes se débloquent progressivement.
- **Temps de jeu illimité, révisions à froid limitées.** Une fois les révisions du jour faites, les autres modes restent ouverts ; ce qui est rejoué à chaud ne compte pas dans la rétention. La fatigue est signalée (baisse de précision, temps de réaction qui s'allonge).

### Terminologie

- **À froid / à chaud** : premier essai d'une position après un délai / essais suivants.
- **Verdicts** : Parfait, En avance, En retard, Mauvaise note (Perfect, Early, Late, Wrong note).
- **Maîtrisé** : voir Product Purpose.
- **Noms des notes** : toujours en lettres (C, D, E…), dans les deux langues. Les notes altérées apparaissent sous les deux formes (F# ou Gb), tirées au hasard, et les deux sont acceptées en réponse.
- **Langue de l'interface** : bilingue, français et anglais.

### Contraintes techniques

- Toute la temporisation est calée sur `AudioContext.currentTime`.
- Détection des accords par HPCP (`essentia.js`), reprise de Neckspert ; détection des notes avec octave par un détecteur de hauteur (par exemple `pitchy`), dans le même traitement audio.
- Chaque tentative est conservée avec son horodatage.
- Données en local uniquement, sans compte. Export et import de fichier pour sauvegarder ou changer d'appareil.

### Décisions ouvertes

- **Niveaux et déblocage** : structure des niveaux et règles de déblocage des modes.
- **Session du jour** : déroulé exact.
- **Notes ambiguës** : une même hauteur existe sur plusieurs cordes, et le détecteur de hauteur ne sait pas sur quelle corde elle a été jouée.
- **Réponse nommée du mode 2** : comment le guitariste donne le nom de la note, mains prises et sans petit bouton.
- **Nom définitif.** « Neckspert Play » est le nom de travail.

## Brand Commitments

- **Famille Neckspert.** Produit frère de Neckspert (`~/Development/Neckspert`), avec lequel il partage le nom et l'identité de famille. Nom de travail : Neckspert Play.
- **Pas de gamification générique** : ni points d'expérience, ni séries quotidiennes culpabilisantes. La récompense, c'est le progrès mesuré.
- **Rhythm Doctor** est la référence d'expérience : gratifiant et utile à la fois.

## Evidence on Hand

- `docs/brief.md` : brief d'origine, décisions et questions ouvertes.
- Code réutilisable de Neckspert : `src/lib/domain/music/` (hauteurs, positions, formes, voicings, transposition), `src/lib/domain/hpcp/` et `src/lib/services/HPCPDetector/` (détection d'accords), `src/lib/services/Metronome.ts` et `src/lib/services/CalibrationService.ts` (à adapter à l'horloge audio), les ports de `src/lib/application/ports/`. Ne pas reprendre `TrainerManager.ts` ni les composants d'interface.
- Aucune donnée d'usage, aucun utilisateur externe, aucun témoignage : ne rien inventer de tel.

## Product Principles

1. **La rétention à froid fait foi.** Ce qui est rejoué à chaud ne compte pas dans les statistiques de rétention.
2. **Décider avant de jouer.** La consigne arrive avant la cible, la première note jouée est la réponse, et elle tombe sur le temps.
3. **Le jeu choisit, le guitariste joue.** Pas de menu d'exercices ; progression par petits ensembles, aide retirée peu à peu.
4. **Lire la guitare, pas l'écran.** Consignes textuelles lisibles à distance ; aucun manche dessiné pour répondre.
5. **Le seul gain, c'est le progrès mesuré.** Pas de points d'expérience ni de séries culpabilisantes ; l'application reste une petite part de la pratique.

## Accessibility & Inclusion

- Consignes lisibles à 60 cm – 1 m, sur tous les formats d'écran.
- Aucune interaction fine pendant une série ; cibles larges entre les séries, barre d'espace au clavier.
- Chaque verdict reste compréhensible sans la couleur.
