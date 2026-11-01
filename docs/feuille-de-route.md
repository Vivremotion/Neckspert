# Feuille de route

État au 2026-11-01. Ce document dit dans quel ordre le projet avance et pourquoi ; ce que le projet veut être est dans `docs/projet.md`. Le travail au jour le jour est suivi dans les [issues](https://github.com/Vivremotion/Neckspert/issues) et sur le [tableau du projet](https://github.com/users/Vivremotion/projects/1). Chaque chantier a sa spec dans `docs/superpowers/specs/` et ses plans dans `docs/superpowers/plans/`.

## Où on en est

La v2 a remplacé Neckspert v1 sur `main` le 2026-10-29 (la v1 reste au tag `v0.1.0`). Le moteur du temps musical et la séquence sont finis : un seul contrôleur joue toutes les séances (notes, triades, geste, rythme, séquences), chaque tour est compilé depuis les données de son exercice, et les niveaux surchargent n’importe quel paramètre. Le prochain chantier du cœur est **le chantier 2**.

## Une seule piste touche le cœur à la fois

Le cœur (`application/session/`, `domain/time/`) est traversé par chaque chantier. Deux branches qui le modifient en même temps produisent des conflits coûteux et des décisions contradictoires : les chantiers se font **dans l’ordre**, une branche à la fois. Deux pistes peuvent courir à côté parce qu’elles ne touchent pas le cœur : **le visuel** et **les capteurs** (derrière leurs ports, mesurés sur les prises du journal de diagnostic avant d’être branchés).

## Fait

**Le prototype** (2026-10-01 au 2026-10-04) : localiser et identifier, répétition espacée, tableau de rétention, Apprentissage avec sondage, rythme et consigne. Plans dans `docs/superpowers/plans/README.md`.

**Vers une plateforme**, dans l’ordre de l’ancienne feuille de route (étapes 1 à 3) :

1. Mécaniques, exercices et tempo propre à chaque exercice (2026-10-05).
2. Journal des essais : toutes les observations brutes gardées avec chaque essai (2026-10-06).
3. Triades et geste : **A** accords et voicings par degré ; **B1** capteur d’accords par vérification de candidats ; **C0** journal de diagnostic ; **C1** voie de la mémoire des triades ; **D** voie du geste (relier, monter, zone, jam) sur des grilles en données (2026-10-06 au 2026-10-11).

**Chantier 1, le temps musical** (2026-10-14 au 2026-10-29, spec `2026-10-14-temps-musical-et-sequences-design.md`) : capteur d’attaques sans hauteur (A) ; première séance de rythme (plan 1) ; la séance en segments, l’anti-blocage, le bilan par suite et la réécoute (plan 2) ; la journée de validation du capteur d’attaques sur un oracle annoté (G) ; puis la migration de tout l’existant sur le nouveau moteur : moteur de tour (H1), procédure d’apprentissage (H2), contrôleur et geste (H3), notes (H4), langage ouvert (L), triades et langage du tour (H5), niveaux d’exercice et contrôleur unique (H6). Les écarts à la spec sont dans ses sections « Réalisation ».

**La séquence (S)** (2026-10-30 au 2026-11-01, spec `2026-10-30-sequence-design.md`) : une suite de notes imposée, jouée en rythme, jugée note à note sur la hauteur et le moment. La figure s’écrit dans la liste d’attentes du tour ; elle a absorbé le cycle du rythme (le rythme est une séquence sans hauteur). Avec : les arpèges d’une forme, les formes déplacées d’accord en accord, les thèmes écrits, les marques en jeu, les exercices locaux en JSON (`docs/exercices-locaux.md`), la conversion MusicXML, et un détecteur de notes qui écoute le capteur d’attaques. Les notes rapides restent à mesurer en jouant. Le catalogue public n’a pas encore de séquence avec des hauteurs.

**Direction artistique** « Près du silence » (spec `2026-10-22-direction-artistique-design.md`) : plan 1, fondations et séance ; plan 2, coquille et écrans.

## Ensuite

### 2. Aucun exercice dans le code

Le catalogue, les grilles et la composition des séances deviennent des fichiers de données chargés au démarrage et validés à ce moment ; le code ne garde que les pièces du moteur, les tests ont leurs propres exercices. Avec : les parcours en données (fin des types de séance fermés), un instrument en paramètre au lieu de la guitare six cordes en dur, et les trous de validation à combler avant qu’un auteur écrive un fichier (listés dans la spec du temps musical, « Points mineurs reportés »). Le chargement des exercices locaux en est un premier morceau. Version 13 de la base. La question du concept de mécanique se rouvre ici.

### 3. Ensembles admis et formes pleines (E, F)

Des juges par ensemble (notes de l’accord en cours, d’une gamme, approches) ; le juge d’accords élargi au grave ; accords ouverts et barrés, tétrades, familles de voicings, degrés étendus, et n’importe quel accord : une grammaire qui engendre les symboles au lieu d’une table, un générateur de formes pour 4 à 6 notes.

### 4. Audio joué et prises (A, H)

Un port « jouer un contenu » calé sur l’horloge (backing, note à entendre, démonstration avant un exercice nouveau) ; des prises enregistrées, réécoutées, partageables ; la mesure `écoute`.

### 5. Compétences et planificateur

Compétences et graphe de prérequis, mesures par (compétence, item), planificateur scoré et explicable, parcours fondamental en données ; les vues Pratiquer, Bibliothèque, Progrès et Fiche d’exercice. La question « apprendre à apprendre » (`docs/projet.md`) se reprend avant.

### 6. Le langage publié, l’Atelier et l’IA

Le format v1 (après la traduction complète du corpus de test et d’un second programme de cours) ; l’Atelier (trous, relecture, aperçu jouable) ; la couche de capacités et ses premiers adaptateurs (dossier partagé, WebMCP) ; la base de connaissances.

## À côté du cœur

- **Le visuel, plan 3** : le cadre de séance et les vues de jeu passent au monde « Près du silence » (la figure et le geste sont encore dans l’ancien monde pixel), la respiration d’une séquence est redessinée, puis l’ancien monde disparaît. Les retours de la séance de l’auteur du 2026-10-28 y sont rattachés.
- **Les capteurs** : la reconnaissance des accords, à mesurer d’abord sur un export audio connu et le journal de diagnostic de vraies séances ; la vérification de hauteur et les attaques legato pour les notes rapides, si le jeu le demande ; la plage grave du juge d’accords (pour le chantier 3).
- **La mise en ligne** : la v2 sur GitHub Pages et le domaine.

## Plus tard

Qualité du son (Q), voix, micro hexaphonique, synchronisation et espace professeur, vue graphe des connaissances, navigation à la guitare, thèmes, autres instruments, client lourd ; journal append-only comme vérité de stockage ; PWA hors ligne ; Safari et iOS ; accessibilité.
