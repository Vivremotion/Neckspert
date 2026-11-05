# Neckspert — le projet

Ce document dit ce que Neckspert veut être, les principes qui le guident et comment marchent son moteur et son langage d’exercices. Il remplace le brief d’origine et les notes de direction tenues pendant le prototype. Les règles de jeu détaillées sont dans `PRODUCT.md`, l’ordre des travaux dans `docs/feuille-de-route.md`, le suivi dans les [issues](https://github.com/Vivremotion/Neckspert/issues). Les décisions de chaque chantier sont dans leurs specs (`docs/superpowers/specs/`), les plans d’exécution dans `docs/superpowers/plans/`.

## Le produit

**Une plateforme d’apprentissage de la guitare** dont le moteur permet d’écrire n’importe quel exercice et de structurer l’apprentissage. On joue sur une vraie guitare, sur le temps ; l’application écoute, juge et mesure ce qui reste d’une séance à l’autre. Aujourd’hui : les notes du manche, les triades, la précision rythmique. Ensuite : lecture, oreille, improvisation.

**Le problème de départ.** Un guitariste avancé, qui pratique beaucoup, ne retient pas les notes du manche. Pendant un exercice, la recherche devient rapide après quelques répétitions ; dix minutes plus tard ou le lendemain, tout est à refaire. Il retrouve les notes par calcul à partir des repères du manche, jamais par accès direct. Les exercices classiques « ne mènent nulle part » : pas de critère de réussite, pas de progrès visible. Ce qui marche : des exercices simples et ciblés, avec un objectif défini, un progrès mesurable et des critères observables, et des jeux de rythme gratifiants et utiles à la fois.

**Pour qui.** Des guitaristes investis, du débutant motivé à l’expert, qui savent qu’il faut travailler pour progresser. L’application marche en autonomie, sans professeur. Les professeurs sont un second public : ils créent des exercices pour leurs élèves et suivent leurs progrès entre les cours. L’application prolonge un cours, elle ne le remplace pas.

**Positionnement.** Un cours interactif pour guitaristes investis, avec de vraies leçons et des exercices variés, pas un jeu sans portée pédagogique (Yousician, Rocksmith). Chaque exercice écoute la guitare et juge.

**La revendication.** Mesurer ce qui reste, pas ce qui réussit pendant l’exercice. Le premier essai d’un item après un délai (à froid) compte à part des suivants (à chaud), et seul le froid alimente la rétention. La maîtrise exige le rappel espacé et le transfert hors de l’aide.

**Gratuit et open source**, au moins le moteur et les exercices fondamentaux (notes du manche, formes d’accord, précision rythmique). Un modèle économique, s’il existe, ne passe jamais par les compétences fondamentales.

**À garder en tête, sans le viser maintenant** : d’autres instruments (basse, 7 cordes, piano, batterie, trompette), et même un moteur audio de jeu musical sans pédagogie. Seules les représentations « position » et « forme » dépendent de l’instrument. Le cœur du moteur (séries, apprentissage, temps musical, juges par hauteur ou par attaque) ne nomme pas la guitare, à une fuite près : le numéro de corde, facultatif, des notes d’une figure. Les objets propres à un instrument (note sur une corde, case, zone du manche, voicing, forme, miroir) vivent dans le module de cet instrument, et ses capteurs changent avec lui.

## Principes

1. **Pédagogie avant technologie.** On conçoit l’exercice pour apprendre, puis la détection pour lui. On ne plie jamais un exercice à une limite technique.
2. **Une mesure dit ce qu’elle prouve.** Chaque exercice porte sa revendication. Un verdict faux est pire qu’aucun ; un juge non mesuré n’est pas publié ; ce que l’application ne sait pas juger est dit, pas maquillé ; le nombre d’essais est toujours dit.
3. **Ne jamais rendre dépendant de l’interface.** Le joueur apprend à se débrouiller comme un musicien, sans l’application : l’écran donne la question, jamais la réponse, et chaque aide s’efface.
4. **Décider avant de jouer.** La consigne arrive avant la cible, la première réponse compte, et elle tombe sur le temps.
5. **Apprendre de l’usage réel.** Les questions techniques se tranchent avec les données de vraies séances (variantes en ombre, journal de diagnostic), rarement par un prototype jetable.
6. **Pas de gamification creuse.** Ni séries, ni XP, ni classements, ni récompenses inventées, ni temps total comme exploit, ni score global. L’engagement vient du progrès visible, de la musique, des prises réécoutées, des déblocages réels.
7. **Local-first.** Données sur l’appareil, sans compte ni serveur obligatoire. Partage par fichier ou lien d’abord ; une synchronisation plus tard, facultative et auto-hébergeable.
8. **Le professeur (ou l’élève) reste la référence.** L’application est une petite part de la pratique quotidienne.
9. **Un modèle général, des présentations particulières.** Le moteur expose un modèle général ; une présentation propre à un exercice reste possible quand elle vaut son coût.
10. **Un mot par concept**, le même dans le code, l’interface et le langage d’exercices (« niveau » / `level`, « respiration », « suite »…).

## Ce que l’application fait aujourd’hui

- **Notes du manche.** _Localiser_ (« F, corde de B », à jouer sur le temps) et _identifier_ (« corde de A, case 8 », répondre sur un clavier d’une octave à l’écran). Une séance d’Apprentissage compose retests, révisions à froid, notes nouvelles et consolidation ; le jeu libre reste ouvert.
- **Triades** sur les cordes G-B-E, en deux voies : la **mémoire** (ancrer une triade sur la corde de sa fondamentale, puis la jouer dans une zone du manche) et le **geste** (relier des formes voisines sur une grille, monter, rester dans une zone, puis en jam). Les grilles s’écrivent en vrais symboles d’accord.
- **Rythme** : trois exercices (« Mesures silencieuses », « Métronome sur 2 et 4 », « Contretemps »), une figure jouée en boucle et jugée par cycle, des niveaux, l’écoute de la figure et la réécoute de sa prise.
- **Séquences** : une suite de notes imposée, jouée en rythme, chaque note jugée sur sa hauteur et sur sa place (l’arpège d’un accord, une forme déplacée d’accord en accord sur une grille, un thème écrit). Le moteur les joue ; le catalogue public n’en a pas encore avec des hauteurs, et les exercices privés s’écrivent en local (`docs/exercices-locaux.md`, en développement seulement).
- **Autour** : calibration de la latence sans le geste du joueur, bilan de séance, carte du manche, réglages, sauvegarde et restauration par fichier, interface en français et en anglais.

Les règles de jeu, les seuils et la terminologie de chaque exercice sont dans `PRODUCT.md`.

## Apprendre

### Les méthodes retenues

Pratique de récupération et répétition espacée (FSRS, via `ts-fsrs`) ; entrelacement (en blocs à l’acquisition d’un geste, mêlé ensuite) ; retrait de l’aide ; hypothèse du guidage (un retour simultané fréquent nuit à la rétention) ; espaces de connaissances (on travaille la **frange**, ce dont les prérequis sont acquis) ; transfert.

### Le cycle d’un savoir

1. **Comprendre** : un texte court et une démonstration.
2. **Voir** : avec l’aide complète.
3. **Faire** : l’aide se retire.
4. **Rappeler** : à froid, espacé.
5. **Transférer** : sur une vraie grille, sans aide, dans une autre position, à l’oreille.

« Maîtrisé » exige 4 et 5, jamais 3 seul.

### Froid et chaud

Seuls les essais à froid nourrissent la rétention, FSRS et la maîtrise. Le jeu propose ce qu’il faut travailler, mais tout reste jouable en jeu libre : la règle froid / chaud garde les statistiques honnêtes. Une même mesure pose deux questions : la **mémoire** (comment elle se dégrade sans pratique) et le **geste** (comment elle progresse avec la pratique : tempo tenu, précision). Les mots du joueur restent distincts : « je sais / je ne sais plus », « ça coule / ça accroche ».

### Didactique et pédagogie

Deux questions distinctes, que le projet traite à des endroits différents.

- **La didactique** porte sur le savoir : quoi apprendre, découpé comment, dans quel ordre, et comment un savoir de musicien devient quelque chose qu’on peut travailler et mesurer (la _transposition didactique_ de Chevallard). Ici : les capacités et leurs prérequis, ce qu’un essai doit remplir pour compter, les exercices qui les travaillent.
- **La pédagogie** porte sur la relation entre l’apprenant et ce savoir et sur la conduite de l’apprentissage : la séance, l’ordre des consignes, les aides et leur retrait, les retours, la motivation, l’autonomie. Le triangle de Houssaye nomme trois relations : _enseigner_ (le professeur et le savoir), _former_ (le professeur et l’élève), _apprendre_ (l’élève et le savoir). Une application en autonomie travaille surtout _apprendre_ ; le professeur garde _former_.

Le moteur est surtout didactique : il dit ce qui compte comme savoir. La pédagogie vit dans les séances, les routines et le planificateur, et c’est elle que « apprendre à apprendre » remet en question (voir « Questions ouvertes »).

**Capacité et compétence.** Une **capacité** est un savoir-faire appris, exercé sur un contenu, hors situation : retrouver une note sur une corde, ancrer une triade, tenir le temps sans clic, lire une tablature. Une **compétence** mobilise plusieurs capacités ensemble dans une famille de situations (Roegiers, Meirieu) : jouer une grille, improviser en jam. Lire une tablature et lire une portée sont deux capacités : la tablature dit quelles cases presser, la portée demande de lire, de connaître les notes du manche et de choisir une position. Marquer la pulsation avec le corps est une vraie capacité, mais aucun capteur ne l’observe : aucun exercice ne la déclare.

**Un exercice dit ce qu’il travaille.** Il nomme la ou les capacités qu’il travaille ; un exercice qui ne le dit pas ne sert à rien. Une même capacité peut être travaillée par plusieurs exercices, dans des conditions différentes.

**La condition de référence** (décidée pour le chantier 2, le 2026-11-05, à préciser dans sa spec). La mémoire d’un item appartient à une capacité : une carte par (capacité, item), partagée par tous les exercices qui la travaillent, à la place de la clé mécanique + item (décision durable 2). La capacité porte sa condition de référence : ce que veut dire « sans aide », son seuil de rappel direct. C’est un plancher vérifié sur chaque essai : seuls les essais à froid qui la remplissent nourrissent la carte, et un essai plus dur compte aussi. La forme d’un exercice change la performance de rappel ; la condition de référence empêche qu’un exercice plus facile fausse la carte des autres. Un exercice qui ne la remplit jamais, un échafaudage, ne rend jamais un item acquis, et c’est voulu. Une consigne qui donne un autre indice (chercher autrement) relève d’une autre capacité. Qu’une capacité ait une mémoire (des cartes FSRS) est un choix de données sur la capacité ; que mémoire et geste soient deux choses différentes n’est pas prouvé.

### Compétences, parcours, planificateur (à venir)

- **Le graphe** : des capacités et des compétences, en nœuds, avec un seul type d’arête, le prérequis (« A se compose de B et C » s’écrit déjà « B et C sont prérequis de A »). Une réussite ne crédite jamais un autre nœud, même prérequis : une réussite en jam est une réussite en jam. Les transferts entre capacités ne se décrètent pas ; ils se découvriraient dans les données (le premier essai à froid dans B sur des items acquis dans A, contre des items qui ne le sont pas). Le graphe d’un professeur remplace celui du projet ou vit à côté, jamais fusionné ; l’état du joueur, par (capacité, item), ne dépend d’aucun graphe.
- **Parcours** : un chemin suggéré dans le graphe (le parcours fondamental du projet, celui d’un professeur, celui que l’élève compose). Un guide, pas une cage.
- **Séance** : un bouton. Le planificateur compose révisions dues, frange, objectif en cours et un moment de transfert ; il affiche le plan avant de commencer et annonce chaque changement d’exercice.
- **Le planificateur est explicable**, sans apprentissage automatique d’abord : chaque candidat (exercice × item) reçoit un score (urgence d’oubli, gain de frange, faiblesse récente, poids d’objectif, moins la fatigue et la répétition) et chaque bloc dit pourquoi il est là. Les poids s’ajustent ensuite sur les données.

## Présenter ce qu’il faut jouer

1. **L’écran donne la question, jamais la réponse** : noms, symboles d’accord, degrés, grilles. Les coordonnées de case ne sont qu’une aide qui s’efface, ou l’objet d’un exercice de lecture.
2. **La représentation dépend de la compétence** : changer d’accord, une grille en mesures ; lire, une portée ou une tablature ; le rythme, une notation rythmique ou l’audio ; le manche, le nom seul. Aucune vue n’est « la meilleure » sans données.
3. **La structure du temps est aussi une aide qui s’efface** : piste complète, puis position dans la mesure, puis clic seul, puis **yeux fermés** (consignes sonores). Seule la dernière forme prouve le transfert.

Les vues spécifiques et les mini-jeux sont permis ; une réussite y compte comme une réussite _avec aide_ tant qu’elle n’est pas confirmée sans.

## Comment marche le moteur

Svelte 5 et SvelteKit en site statique, TypeScript, CSS natif, données dans IndexedDB (Dexie). L’architecture est en ports et adaptateurs : un domaine pur (`src/lib/domain/`), une couche d’application qui définit les ports et orchestre les séances (`src/lib/application/`), des adaptateurs pour l’audio, le stockage et le journal (`src/lib/infrastructure/`), une racine de composition unique et des écrans minces. Le détail est dans `CLAUDE.md`.

- **Une horloge.** Un seul `AudioContext` donne le temps ; tout ce qui s’entend ou se juge est calé sur lui, jamais sur `setInterval`. Un transport porte la carte de tempo et place les sons ; un son dont l’heure est passée est abandonné, pas joué en retard.
- **Le temps musical.** Les positions et les durées sont des fractions exactes de ronde ; un mètre (`3/4`, `6/8`, `7/8`…) et une carte de tempo par exercice ; une seule conversion vers les secondes audio. Rien ne suppose 4/4.
- **Des capteurs derrière des ports.** Une seule entrée audio alimente tous les détecteurs : attaques sans hauteur, notes (une attaque et la hauteur lue après elle, octave comprise), accords par vérification des formes candidates (on vérifie ce qui est attendu plutôt que de transcrire). Le détecteur rapporte ce qui sonne et ne pardonne rien : la propreté fait partie de ce que le joueur travaille. Chaque capteur a sa latence, calibrée contre le micro de l’ordinateur sans le geste du joueur, et déclare ce qu’il sait juger.
- **Un tour, un plan.** Chaque tour est compilé en un plan : la consigne, les attentes (capteur, place dans la mesure, fenêtre, contenu à juger), la longueur et la politique de jugement. Une attente unique et une figure entière s’écrivent dans la même liste. Des modes enregistrés jugent les plans : la **première réponse** (la première note est la réponse, les suivantes sont ignorées) ou l’**alignement** d’une suite d’attaques sur une figure, note à note sur le moment et la hauteur (une fausse note en place est fausse, pas manquée ; une note sautée ne décale pas le reste), avec un verdict par réponse ou par cycle. Les mesures d’un cycle sont distinctes : fidélité, précision, régularité, tenue, placement.
- **Tout ce qui est perçu est gardé.** Chaque essai conserve les observations brutes de ses capteurs, avec leur sort (réponse, ignorée et pourquoi, illisible) et l’avis du juge au moment du jeu. Un journal de diagnostic, à part des données d’apprentissage, garde les prises qui servent à mesurer les capteurs.
- **Une procédure d’apprentissage**, la même pour tous les sujets : sondage d’un item nouveau sans aide, présentation aidée après un raté, niveaux de l’item sur l’échelle de son exercice, retests, révisions à froid, consolidation, ensemble de travail borné.
- **Un contrôleur de séance** joue tous les exercices. Une politique pure décide à chaque frontière ce qui vient (un tour, une écoute, une respiration, la fin) ; les tours s’enchaînent en suites, séparées par des respirations et des mesures comptées ; un anti-blocage propose une écoute, un jeu accompagné ou un niveau d’aide quand le joueur bute. Chaque série garde sa trace et sa prise, réécoutable.
- **Des vues génériques.** Un cadre commun (départ, pause, décompte, annonces) et des vues composées par les données : la piste (une tuile par temps, la cible sur son temps), les touches de réponse, la grille, la figure en notation et en tablature.
- **Local et migrable.** Chaque tentative est conservée avec son horodatage ; sauvegarde et restauration par fichier ; chaque montée de version de la base est une fonction pure, appliquée de la même façon à la base et à un fichier importé.
- **L’IA hors de la boucle.** Jamais dans le temps compté, le juge ou la note (voir « L’IA »).

## Le langage d’exercices

### L’idée

> Un exercice est une **traduction** entre deux représentations d’un même objet musical, sous une contrainte de temps.

Localiser : nom → position jouée. Identifier : position → nom tapé. Ancrer une triade : symbole et corde de la fondamentale → forme jouée. Relier : symbole → forme jouée, voisine de la précédente. Oreille : son → nom. Lecture : partition → son. Improvisation : grille → notes admises.

### La forme d’un exercice

```
exercice := sur MATIÈRE
            de REPR  vers REPR RÉPONSE [parmi ENSEMBLE] [où RELATION]
            au FIGURE [avec ACCOMPAGNEMENT]
            progresse NIVEAUX quand CONDITION
            mesure MESURES

MATIÈRE        := générateur (× générateur | où condition)*        -- notes(…), cordes(…), triades(…), grille(…), partition(…)
REPR           := nom | position | forme | degrés | symbole | son | portée | tab | armure | structure …
RÉPONSE        := jouée | tapée | chantée
RELATION       := voisine | plus haut | plus bas | dans zone(a..b) | pas encore jouée   -- lie une réponse aux précédentes
FIGURE         := mètre et événements en temps musical : cible, consigne, silence
ACCOMPAGNEMENT := clic(motif) | backing(…) | silence                -- le clic est un accompagnement minimal
MESURES        := justesse, rappel, précision, régularité, tenue, placement, tempo tenu, écoute
```

Exemple, l’exercice _localiser_ de l’application :

```
exercice "Localiser"
  sur   notes(cases 1..11) × cordes(toutes)
  de    nom + corde  vers position jouée
  au    4/4, cible sur le 1, consigne 8, 4 ou 2 temps avant  avec clic
  progresse avance 8 → 4 → 2  quand rappel direct
  mesure justesse, rappel
```

Cette syntaxe est une carte postale : elle dit ce que le format doit pouvoir écrire. Le format réel est un arbre de données.

### Ce qu’un exercice écrit déjà en données

Aujourd’hui le catalogue public est encore écrit en TypeScript, et un exercice privé est un fichier JSON local, validé au chargement (`docs/exercices-locaux.md`). Dans les deux cas, un exercice n’est que des données lues par des pièces du moteur : son tempo et son mètre, ses niveaux, l’échelle de ses items, ses fenêtres de réponse, sa respiration, son déroulé (scène, aperçu, consigne au premier passage, anti-blocage), le **gabarit de son tour** (où tombent la consigne et les attentes, leur capteur, leur contenu, leur fenêtre, la politique de jugement) et la **présentation** de sa consigne (les textes et les images de chaque emplacement de la vue). Ce qui manque prend la valeur par défaut.

**Les niveaux ont deux axes et une seule règle.** Un niveau d’exercice et un niveau d’item écrivent chacun des chemins pointés (`{ tempo: 90, 'windows.perfectMs': 60 }`) qui remplacent ces valeurs et rien d’autre. Le moteur ne couple pas les deux axes.

**Le moteur refuse seulement ce qu’il ne peut pas exécuter**, jamais ce qui manque de valeur pédagogique. La validation nomme l’exercice et le champ fautifs. Un test tire au hasard des exercices composés à partir des pièces enregistrées et joue tous ceux que la validation accepte.

### Les règles du langage

- **Les valeurs sont empruntées aux notations existantes** : notation scientifique (`Bb3`), symboles d’accord (`G7/B`), chiffres romains, degrés (`R b3 5`), coordonnées de tablature (`2:7`), durées, chiffrages de mesure ; figures et formes s’écrivent dans un sous-ensemble strict de LilyPond, et un script de développement convertit un export MusicXML vers ce sous-ensemble. Jamais de notation maison. Seule la structure est propre à l’application.
- **La vérité est l’arbre**, sous un schéma JSON versionné. Une syntaxe texte et un formulaire seront deux surfaces de cet arbre.
- **Le validateur confronte l’arbre aux capteurs** : un exercice qui demande ce qu’aucun capteur ne sait observer est refusé.
- **Une primitive n’entre que si au moins deux exercices réels l’exigent.**
- **Le langage se compile vers les briques du moteur**, il ne les remplace pas. Une mécanique codée à la main reste une échappatoire légitime.
- **Risque nommé** : l’effet de plateforme interne, où le langage devient une usine à configuration. Le point dur : les relations à état entre réponses.

### Le banc d’essai

Le langage est éprouvé sur un corpus privé, deux ans de cours de guitare (39 cours, 43 exercices), qui reste hors du dépôt : c’est l’œuvre d’un professeur. Le premier passage a montré que les clauses tiennent pour 40 exercices une fois les primitives manquantes ajoutées, et que 3 relèvent de l’écoute plutôt que d’un jugement automatique. Les primitives manquantes, par nombre d’exercices qui les exigent :

| Primitive               | Exercices | Ce qu’elle apporte                                                 |
| ----------------------- | --------: | ------------------------------------------------------------------ |
| **S** séquence          |        15 | plusieurs cibles dans un tour, jugées note à note et en entier     |
| **R** rythme            |         8 | subdivisions, mètres, figures rythmiques, attaques sans hauteur    |
| **E** ensembles admis   |         8 | une réponse juste parmi un ensemble (notes d’un accord, une gamme) |
| **A** audio joué        |         8 | backing, note ou motif à entendre                                  |
| **F** formes pleines    |         7 | accords ouverts et barrés, tétrades, registre grave                |
| **H** écoute            |         6 | prise enregistrée, jugée par l’élève ou le professeur              |
| **C** clic paramétrable |         5 | le clic comme accompagnement réglable                              |
| **Q** qualité du son    |         5 | cordes qui sonnent, une note à la fois, vibrato, constance         |
| **N** représentations   |         5 | armure, mode, degré, structure d’un morceau                        |

R, C et S sont faits (voir la feuille de route). Le corpus ne reflète qu’un professeur ; un second programme de cours sera le test suivant.

## Vocabulaire

| Concept       | Ce qu’il porte                                                                                                                          | Où il vit             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Mécanique** | l’espace d’items, le capteur, le juge, la scène : ce qui demande du code (« localiser une note », « ancrer une triade »)                | code                  |
| **Exercice**  | une mécanique et ses données : items, tempo, niveaux, tour, présentation ; un identifiant stable                                        | données partageables  |
| **Niveau**    | une surcharge des paramètres de l’exercice (niveau d’exercice) ou de l’item (son échelle), avec ses conditions de montée et de descente | exercice ; état local |
| **Item**      | ce qui s’apprend (« F, corde de B » ; « A, fondamentale sur B ») ; sa mémoire (carte FSRS) et son niveau                                | données de l’élève    |
| **Séance**    | ce qu’on lance d’un bouton ; une ou plusieurs séries                                                                                    | données de l’élève    |
| **Suite**     | des tours enchaînés sans écart, entre deux respirations ou mesures comptées                                                             | dans la séance        |
| **Tour**      | une consigne et ce qu’elle attend, compilé en un plan                                                                                   | dans la séance        |
| **Essai**     | un tour joué : réussite, verdict, mesures, aides, observations, plan résolu                                                             | données de l’élève    |

## Décisions durables

1. **La définition et la progression sont séparées.** Le jeu n’écrit jamais dans une définition. Un fichier d’exercice ne contient aucune progression ; une même définition peut être donnée à plusieurs élèves.
2. **La mémoire appartient à l’item, pas à l’exercice.** La clé d’une carte est mécanique + item : un item appris dans un exercice compte quand il réapparaît dans un autre.
3. **Le tempo est une donnée de l’exercice**, que ses niveaux peuvent surcharger comme tout autre paramètre. Il est enregistré avec chaque essai, puisqu’il entre dans le jugement (un temps d’avance ne dure pas le même nombre de millisecondes à 80 et à 140 bpm). Un changement de tempo passe par une respiration ou une mesure comptée.
4. **Mémoire et geste sont deux questions posées à toute compétence**, pas deux familles d’exercices. FSRS mesure l’oubli ; une courbe mesure la progression d’un geste. Le contrat d’une mécanique n’impose pas FSRS.
5. **Chaque capteur déclare ce qu’il sait juger.** Une mécanique ne s’appuie que sur ce que ses capteurs savent observer.
6. **Le juge doit avoir raison seul.** Contester un verdict (« Joué juste ») est un outil de développement pour trouver les erreurs du juge, pas une fonction de l’application publiée. Un juge se valide sur des oracles annotés.
7. **L’IA est un module indépendant derrière un port.** Elle produit des objets validés par un schéma, prévisualisés, versionnés et réversibles ; elle n’intervient jamais dans la boucle de jeu.
8. **Une migration garde les règles pédagogiques, pas l’ancien comportement.** Un modèle construit à côté d’un ancien l’absorbe, et l’ancien code est supprimé dès la validation.

## Créer un exercice (à venir)

- **Un modèle est un exercice à trous** (des paramètres). Trois portes, un seul arbre : dupliquer et remplir les trous ; décrire en langage naturel à un LLM ; écrire en texte. Ajouter une représentation ou un capteur reste du code.
- **L’interface n’édite que les trous**, avec un formulaire généré depuis le schéma et des contrôles musicaux. La structure passe par le texte ou le LLM.
- **Deux retours avant d’enregistrer** : la **relecture** (l’application redit l’exercice en mots et en tire sa revendication) et l’**aperçu jouable**.

## L’IA

- **Une capacité générale** : interroger les séances, diagnostiquer l’application, répondre à des questions de théorie et de technique, rédiger des fiches, créer des exercices, proposer un plan.
- **Une couche de capacités** dans l’application, requêtes et commandes, toutes validées et proposées avant d’être appliquées ; puis un adaptateur par branchement : un dossier exporté que l’utilisateur porte dans l’assistant de son choix, WebMCP, plus tard un client lourd.
- **Le LLM écrit la prose, le domaine calcule les faits** (orthographe des notes, degrés, formes), dans une base de connaissances ouverte et versionnée qu’il cite.
- **Coût** : clé fournie par l’utilisateur, LLM local, ou son propre assistant. Une IA hébergée serait un confort payant, compatible avec la règle des fondamentaux gratuits.

## Direction artistique et ton

- **« Près du silence »** : sérieux mais engageant, l’atmosphère d’une salle de répétition. Une palette chaude et sobre, un accent pour « maintenant », des verdicts lisibles sans la couleur, toujours doublés d’une forme. Spec : `docs/superpowers/specs/2026-10-22-direction-artistique-design.md`, système visuel : `DESIGN.md`. La direction pixel en quatre tons du prototype est abandonnée.
- **Mains prises, loin de l’écran** : le guitariste est à 60 cm à 1 m, les deux mains sur l’instrument. Consignes lisibles à distance, aucune interaction fine pendant une série, barre d’espace au clavier.
- **Pendant le jeu**, la consigne, le temps et le verdict, avec le moins d’éléments possible ; aucune légende ni explication.
- **Ton** : un bon professeur. Direct, chaleureux, une pointe d’humour sec, jamais infantilisant ; le vocabulaire des musiciens.

## Questions ouvertes

- **Apprendre à apprendre.** L’application risque de faire le travail de l’apprenant : exercices, diagnostic, plan et carte du domaine lui sont servis, et on n’apprend pas si tout est servi. Le planificateur ne construit jamais le graphe à la place du joueur : le joueur le construit, l’explore ou le déconstruit lui-même, d’une façon qui demande de penser ; plus il s’y investit, plus il gagne. Le but : qu’il sache construire son propre système, apprendre avec, et apprendre aux autres à construire le leur. Pistes, rien n’est décidé : son graphe comme des hypothèses que ses propres données mettent à l’épreuve ; le principe 3 étendu à la pensée, le joueur dit avant de voir (« devant ou derrière ? », « que travailler ensuite ? ») ; l’application mesure la justesse de son jugement sur lui-même (sa calibration). À reprendre avant le chantier des compétences.
- **L’espace des questions et un générateur.** Une alternative au système actuel (échelles, cartes par item), peut-être plus intéressante, à discuter : un modèle de l’apprenant par inférence (bayésienne ou IRT, traçage de connaissances) qui estime ce que le joueur sait sur tout l’espace des questions possibles, et un générateur qui choisit la question suivante selon la rétention, l’incertitude du modèle, le besoin d’un test de transfert et une difficulté souhaitable (autour de 70 à 85 % de réussite). L’échelle n’y est plus écrite : elle émerge des temps d’avance et des aides que le générateur choisit. Piste qui relie les deux : **pour travailler la musique, le mieux est d’en faire ; la technique s’apprend en chemin.** Le générateur ne tirerait pas ses questions d’un espace abstrait mais d’une vraie musique (deux mesures d’un thème, la grille en cours) : la technique se travaille là où elle sert, et le modèle de l’apprenant mesure ce qui en reste. Moins d’exercices écrits, plus de musique donnée, ce qui pourrait aussi limiter le risque d’un langage déclaratif qui tourne à l’usine à configuration. Cette piste rejoint « apprendre à apprendre » : le joueur construirait son système en **déconstruisant des musiques pour voir comment elles fonctionnent** (quelles capacités un thème ou une grille mobilise, ce qui lui manque pour le jouer), et son graphe naîtrait de la musique qu’il veut jouer plutôt que d’un programme reçu.
- **Licence**, à choisir avant la première contribution externe. Proposition : le format en MIT ou CC0, le moteur et l’application en AGPL, le catalogue en CC BY-SA.
- **Modèle économique** : hébergement d’un espace professeur, IA hébergée ? Jamais les fondamentaux.
- **Le nom** : « Neckspert » nomme le manche, pas une plateforme multi-compétences.
- **Le concept de mécanique** : l’auteur doute qu’il convienne au projet. À rouvrir quand les exercices sortiront du code ou quand un plan ajoutera une mécanique.
- **Les professeurs veulent-ils écrire des exercices ?** Hypothèse non testée.
- **Sécurité et vie privée** : une définition partagée est une entrée non fiable (validation stricte, aucun code exécutable) ; des prises envoyées à un professeur sont des données personnelles, parfois de mineurs.
- **Adoption** : importer depuis les formats des professeurs (Guitar Pro, MusicXML, tablatures) ; gouvernance d’un catalogue communautaire.
- **Version d’une définition** : que devient la progression quand une définition change ?
- **Reconnaître la corde au timbre** (inharmonicité), d’abord comme simple signalement dans les statistiques.
- **Jouer sur une backing track** : la détection suppose que seule la guitare produit une hauteur ; un accompagnement joué exige une entrée isolée ou la soustraction de la piste.
