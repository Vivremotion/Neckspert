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
- **Depuis le 2026-10-09** : l’ancrage et la zone sont deux exercices, chacun sa session et sa consigne ; la zone apparaît à l’accueil quand l’ancrage lui a fourni assez de triades (`ZONE_MIN_ACQUIRED_TRIADS`). Le passage de l’un à l’autre au sein d’une même session n’était pas clair, même pour qui connaît l’application. Les intégrer aux sessions d’Apprentissage reste à penser, et **le changement d’exercice doit y être manifeste**.

## Une vue de jeu par mécanique

- **Étape** : 5, ou les exercices composés, selon ce qui vient d’abord.
- **Origine** : 2026-10-08, bande de l’accord des triades d’ancrage sur la piste. Il n’y a qu’un écran de jeu (`PlayScreen`, scènes piste et pavé) ; chaque mécanique y ajoute des champs facultatifs (`detail`, `diagram`, la bande de l’ancrage), si bien qu’un changement pour une mécanique touche la vue de toutes.
- **Direction** : un cadre commun (pause, quitter, overlays, métronome) et une vue par mécanique, enregistrée par son id, assemblée à partir de briques communes (piste, consigne, verdict, pavé). Le présentateur donne des données d’écran opaques, lues par la seule vue de sa mécanique ; le cœur ne nomme toujours aucune mécanique. Une vue par mécanique et non par exercice : un exercice est une définition en données qui réutilise la vue de sa mécanique (décisions 1 et 8).
- **À reprendre** alors : `PromptView.detail`, `diagram`, `target`, `band`, `shape`, `VerdictView.heard`, `expected`, `gap`, `PlayView.followUp` et `contest` quittent le contrat commun.
