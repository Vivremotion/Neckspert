# À faire

Ce qui est repéré mais pas encore conçu. Chaque entrée dit d’où elle vient et à quelle étape de la feuille de route (`docs/plateforme.md`) elle se rattache. Une entrée sort de ce fichier quand une spec la prend en charge.

## Présenter un exercice que le guitariste n’a jamais vu

- **Étape** : 5, planificateur multi-exercices.
- **Origine** : 2026-10-08, premier essai de la session « Triades ». Tout a été compté faux : rien ne disait qu’en ancrage on joue la fondamentale seule sur le temps 1, puis l’accord dans le reste de la mesure. Le guitariste plaquait l’accord sur le 1.
- **Constat** : « Triades » enchaîne deux exercices (ancrage, zone) qui pourraient se jouer seuls et dont les gestes diffèrent. Une seule consigne de départ par session ne suffit pas. Le problème grandit quand une session d’Apprentissage mêlera des exercices : l’un d’eux peut apparaître au milieu d’une session sans que le guitariste l’ait jamais vu.
- **À penser** :
  - la consigne appartient à l’exercice (ou à sa mécanique), pas à la session ;
  - quand la montrer : à la première apparition de l’exercice, à son retour après une longue absence, à la demande ;
  - comment l’insérer sans casser la pulsation : arrêt et mesure comptée, comme un changement de tempo ou de scène, ou une pause explicite ;
  - si elle vit dans la définition (donc en données, partageable, écrite par un professeur ou un LLM) ou dans la mécanique (code) ;
  - son lien avec le sondage : un sondage raté parce que le geste n’était pas compris ne mesure pas la mémoire.
- **Depuis le 2026-10-11** : couvert en partie par la voie du geste : un exercice peut porter sa consigne en données (`ExerciseDefinition.howTo`) ; le contrôleur s’arrête avant son premier passage dans la série pour la dire, puis compte une mesure (la première consigne est sur l’écran de départ). Reste à faire : les notes et les triades n’ont pas de consigne par exercice, et le retour après une longue absence ou à la demande n’existe pas.
- **Depuis le 2026-10-09** : l’ancrage et la zone sont deux exercices, chacun sa session et sa consigne ; la zone apparaît à l’accueil quand l’ancrage lui a fourni assez de triades (`ZONE_MIN_ACQUIRED_TRIADS`). Le passage de l’un à l’autre au sein d’une même session n’était pas clair, même pour qui connaît l’application. Les intégrer aux sessions d’Apprentissage reste à penser, et **le changement d’exercice doit y être manifeste**.

## Une vue de jeu par mécanique

- **Étape** : 5, ou les exercices composés, selon ce qui vient d’abord.
- **Origine** : 2026-10-08, bande de l’accord des triades d’ancrage sur la piste. Il n’y a qu’un écran de jeu (`PlayScreen`, scènes piste et pavé) ; chaque mécanique y ajoute des champs facultatifs (`detail`, `diagram`, la bande de l’ancrage), si bien qu’un changement pour une mécanique touche la vue de toutes.
- **Direction** : un cadre commun (pause, quitter, overlays, métronome) et une vue par mécanique, enregistrée par son id, assemblée à partir de briques communes (piste, consigne, verdict, pavé). Le présentateur donne des données d’écran opaques, lues par la seule vue de sa mécanique ; le cœur ne nomme toujours aucune mécanique. Une vue par mécanique et non par exercice : un exercice est une définition en données qui réutilise la vue de sa mécanique (décisions 1 et 8).
- **À reprendre** alors : `PromptView.detail`, `diagram`, `target`, `band`, `shape`, `VerdictView.heard`, `expected`, `gap`, `PlayView.followUp` et `contest` quittent le contrat commun.
- **Fait en partie** (2026-10-10, voie du geste) : le cadre commun existe (`PlayFrame`), avec le registre des vues (`PLAY_VIEWS`) et le modèle d’écran opaque (`MechanicPresenter.stage`, `PlayView.stage`) ; la vue est nommée par l’exercice (`ExerciseDefinition.view`). Reste : `PlayFrame` pour les notes et les triades, qui gardent `PlayScreen`.

## Généraliser les accords à tous les instruments, groupes et qualités

- **Étape** : 3, sous-projet « Généralisation », indépendant de la voie du geste (D), avant ou après elle.
- **Origine** : 2026-10-10, conception de D. Le but final : faire les mêmes exercices sur mi‑la‑ré et la‑ré‑sol, sur des guitares de plus de 6 cordes, tous groupes confondus (comme en vraie jam), et avec des tétrades, des enrichissements et des altérations.
- **Déjà général** : les groupes de cordes (`StringSet`, n’importe quelle taille, voisines ou non, portés par les données des exercices), le voicing par degré porté par chaque corde (doublures, quatre sons), occurrences, positions et candidats, les consignes « fondamentale sur X » et « position N », la table des qualités (une ligne par qualité).
- **À faire** :
  1. **Instrument et accordage** : `StringNumber` (1 à 6) et `STANDARD_TUNING` sont figés. Une notion d’instrument (nombre de cordes, accordage), donnée au domaine au lieu de la constante, pour 7 et 8 cordes et les accordages alternatifs.
  2. **Plage du juge d’accords** : `NOTE_LO`–`NOTE_HI` (MIDI 52–84) note 0, sans erreur visible, toute triade sur mi‑la‑ré (dès E2 = 40) ou sur une corde de si grave (B1 = 35). Élargir, puis vérifier le juge dans le grave sur de vraies données (journal de diagnostic).
  3. **Familles de voicings** : un seul générateur aujourd’hui (`closeTriadVoicings`). Ajouter drop 2, drop 3, shells…, chacune comme générateur nommé dans les données de l’exercice.
  4. **Degrés étendus** : la table des degrés s’arrête à l’octave. Ajouter 9, 11, 13 et les altérations (b9, #9, #11, b13), puis les qualités de tétrades et d’accords enrichis ou altérés ; l’orthographe et les candidats « une case à côté » suivent.
- **Limite physique, pas du code** : tous groupes confondus, deux formes de groupes différents peuvent sonner à l’identique. Le jam (qui ne juge que l’accord) le supporte ; une contrainte de position (monter, zone large) non, sauf capteur hexaphonique.
