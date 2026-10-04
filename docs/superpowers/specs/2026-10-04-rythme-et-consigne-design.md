# Design — rythme, consigne et pilotage de l’Apprentissage

Date : 2026-10-04. Statut : approuvé dans la conversation de recherche (analyse de l’export du 2026-10-04), rédigé à la planification.

Cette spec corrige ce que l’export du 2026-10-04 a montré : FSRS bloqué en apprentissage, une grille rythmique qui dérive, des consignes mal lues, des échecs en cascade, un ordre prévisible et une surcharge. Elle complète les specs `2026-10-02-apprentissage-design.md` et `2026-10-03-sondage-avant-apprentissage-design.md`, dont les principes restent valables (froid seul compté, sondage, file d’introduction).

## Constats (export du 2026-10-04)

1219 tentatives, 43 sessions, 40 cartes, 80 bpm. Les données ne sont pas copiées dans le dépôt.

1. **FSRS bloqué.** Les 16 cartes `locate` apprises sont en état ts-fsrs 1 (Learning), difficulté 9,7 à 9,9, stabilité 0,04 à 0,37 j. `adjustLeadBeats` descend à 1 temps (750 ms) après une réussite à 2 temps ; à froid à 1 temps : 14 tentatives, 0 réussite. L’alternance Good/Again qui en résulte n’enchaîne jamais deux Good, et les `learning_steps` par défaut (`['1m', '10m']`) n’ont pas de sens avec des révisions espacées d’au moins 1 h.
2. **Lecture de la consigne.** 26 fausses notes sur 121 sont la note qui donne son nom à la corde (« A, corde de E grave » → E joué). Les naturelles en case 5 et 7 forment des paires miroir (« A sur E » / « E sur A »).
3. **Rythme trop serré.** À 2 temps, une consigne revient tous les 3 temps ; les cibles dérivent sur tous les temps de la mesure ; les réponses en avance tombent pile un temps trop tôt.
4. **Cascade d’échecs.** Après un raté, la réussite baisse de 11 points ; après deux, elle tombe à 28 %. L’écoute s’arrête à +400 ms : « trouvée trop tard » et « inconnue » se confondent. L’écran ne montre jamais la bonne position.
5. **Ordre prévisible.** La carte suivante est la même dans 55 à 60 % des cas : `reviewableCards` trie par échéance puis par clé.
6. **Surcharge.** 43 % des fausses notes sont une note demandée dans les 6 consignes précédentes ; environ 10 positions distinctes par fenêtre de 20 consignes ; réussite à 2 temps entre 40 et 58 %.

## Principes conservés

- Seuls les essais à froid comptent pour la rétention, FSRS, l’acquis et la maîtrise. Le sondage garde son exception de température.
- La première note jouée est la réponse.
- Le métronome ne change pas de tempo pendant la marche. `onBeat` arrive jusqu’à 100 ms avant le temps : on compare les index avec `>=`.
- Tous les nombres sont des constantes nommées, à calibrer.

## 1. FSRS et échelle des temps d’avance

- `scheduling.ts` : `learning_steps: []`. Un premier Good fait passer une carte en Review (vérifié avec ts-fsrs 5.4.2 : New + Good → Review, S ≈ 2,3 j ; une carte bloquée en Learning passe en Review au Good suivant, sans migration). `relearning_steps: ['1h']` reste.
- `LEAD_STEPS = [8, 4, 2]`. Le palier 1 disparaît. `leadForThreshold` rend au moins 2. Avec le plancher de tempo à 80 bpm (section 7), 2 temps durent au plus 1 500 ms = `RECALL_THRESHOLD_MS` : le palier le plus court reste un test de rappel direct.
- Type : `LeadBeats = 8 | 4 | 2` pour ce qui se planifie (cartes, consignes). `RecordedLeadBeats = LeadBeats | 1` pour `Attempt.leadBeats`, car les tentatives déjà enregistrées à 1 temps restent dans l’historique (et y comptent comme avant pour la maîtrise).
- Les cartes `identify` portent le palier le plus court (2) au lieu de 1 ; le champ n’a pas d’usage en mode 2.
- Migration Dexie version 4 : toute carte à `leadBeats: 1` passe à 2. Les tentatives ne changent pas.
- Sauvegardes : le validateur accepte encore `leadBeats: 1` sur une carte (ancien export), et l’import le convertit en 2 avant écriture. L’export écrit ce qui est en base (donc jamais 1 sur une carte).

## 2. Grille calée sur la mesure, respiration, correction

### Grille (mode 1)

- La note cible tombe **toujours sur le temps 1** d’une mesure (4/4, le métronome accentue déjà le 1).
- La consigne apparaît `leadBeats` temps avant : 8 (temps 1, deux mesures avant), 4 (temps 1 de la mesure précédente) ou 2 (temps 3 de la mesure précédente). Ni consigne ni cible sur les temps 2 ou 4.
- Calcul : `alignedPromptBeat(earliest, lead)` = plus petit index `P ≥ earliest` tel que `(P + lead) mod 4 = 0`. Le contrôleur démarre la consigne au premier temps reçu dont l’index est `≥ P` et dont l’alignement tombe sur lui ; si un temps a été perdu, il recalcule `P` à partir de l’index reçu (jamais de comparaison `===` sur un index attendu).

### Respiration

- Après une cible au temps `T`, la consigne suivante n’apparaît pas avant `T + 4 × RESPIRATION_BARS` (temps 1 de la mesure suivante). `RESPIRATION_BARS = 1`.
- Cycle obtenu : 8 temps à 2 temps d’avance (cible toutes les deux mesures), 8 temps à 4, 12 temps à 8.
- Pendant la respiration, le verdict reste affiché.

### Correction affichée

- Après une fausse note ou une absence de réponse (et après « hors temps », qui est un raté), le cadre du verdict montre la bonne réponse : en mode 1, la position (« corde de E grave, case 5 ») ; en mode 2, le nom de la note (« F# / Gb »).
- `VerdictView` gagne `correction: string | null`.
- Mode 2 : pas de cible rythmique, pas de respiration ; seule la correction s’ajoute.

## 3. Écouter après la fenêtre (mode 1)

- La fenêtre principale va de la consigne + `MIN_RESPONSE_MS` à la cible + `LATE_LIMIT_MS`.
- **Zone hors temps** : de la cible + `LATE_LIMIT_MS` à la cible + `LATE_LIMIT_MS` + `LATE_CAPTURE_MS` (2 000 ms), bornée par le début de la respiration (`T + 4 × RESPIRATION_BARS`), donc toujours avant la consigne suivante. À 80 bpm : la zone finit à T + 2,4 s, la respiration à T + 3 s. À 160 bpm : la borne coupe la zone à T + 1,5 s.
- Quand la fenêtre principale se ferme sans note, le verdict « Mauvaise note » s’affiche avec la correction, et l’écoute continue. Une bonne note dans la zone hors temps remplace ce verdict par **« hors temps »** (`'offbeat'`, FR « Hors temps », EN « Off beat »), `correct: true`. Une première note fausse dans la zone reste `wrong`, avec la note jouée et sa confusion. La tentative est enregistrée quand la question est tranchée : à la première note, ou à la fin de la zone.
- `'offbeat'` n’est jamais du rappel direct (les deux `isDirectRecall`, `scoring/recall.ts` et `progress/lead.ts`, l’excluent). Il vaut Hard pour FSRS, ne rend ni acquise ni maîtrisée, et fait remonter le temps d’avance comme un échec.
- Hiérarchie : Parfait > En avance / En retard > Hors temps > Mauvaise note = pas de réponse. La note de session (jeu libre) compte un hors temps comme un demi-raté.
- **Notes de la consigne précédente** : toute note dont l’attaque corrigée tombe avant l’apparition de la consigne ou dans les `MIN_RESPONSE_MS` (300 ms) qui suivent est ignorée ; elle ne verrouille pas la question.
- Sprite : un anneau (le rond du Parfait, évidé). Son : une note brève et grave, distincte des autres, < 150 ms.
- Les écarts au temps (accueil, bilan) n’incluent pas les hors temps ; la précision à froid (bilan, carte du manche) les compte comme ratés.

## 4. Ordre aléatoire sous contraintes, paires miroir

- Dans chaque catégorie du sélecteur, le choix se fait au hasard (`random` injecté), sous contraintes :
  - jamais deux fois la même carte de suite ;
  - jamais les deux notes d’une paire miroir à la suite ;
  - pas deux fois la même corde de suite quand une autre carte est possible.
- La priorité entre catégories ne change pas : retests, révisions à froid, reprises, nouvelles, consolidation. Les révisions à froid sont tirées au hasard parmi les cartes dues.
- Consolidation : tirage au hasard parmi les `CONSOLIDATION_POOL = 3` cartes les plus fragiles (ordre actuel), sous les mêmes contraintes.
- **Paire miroir** : `locate` « X sur corde S » et « Y sur corde T », avec X = note à vide de T et Y = note à vide de S. E vaut pour les cordes 1 et 6. Exemples : A sur E grave / E sur A ; G sur D / D sur G ; B sur G / G sur B.
- **File d’introduction** : une note dont la note miroir a une carte non acquise (en apprentissage, ou apprise non acquise) n’est pas introduite ; elle attend sans bloquer les suivantes.
- Exceptions documentées : la présentation aidée qui suit un sondage manqué reste la consigne suivante (même carte, règle du 2026-10-03) ; le retest servi en avance quand rien d’autre n’est possible peut répéter la carte précédente plutôt que d’arrêter la session.

## 5. Séquences (essai désactivable)

- `SEQUENCES_ENABLED = true`, `SEQUENCE_LENGTH = 4`, `SEQUENCE_MAX_DELAY = 2`. Logique isolée dans `progress/sequence.ts`.
- Une séquence est une suite d’au plus 4 consignes de même scène (guitare ou écran) et, en mode 1, de même temps d’avance.
- Le premier choix d’une séquence suit la priorité normale ; il fixe la scène et le temps d’avance. Ensuite, seules les cartes compatibles sont candidates, toujours dans l’ordre des catégories. S’il n’y en a pas, la séquence s’arrête plus tôt (jamais de répétition pour la compléter).
- Une note en apprentissage dont le temps d’avance diffère attend une séquence compatible. Si elle a dépassé son écart de retest de plus de `SEQUENCE_MAX_DELAY` consignes, la séquence en cours s’arrête. La présentation aidée qui suit un sondage manqué arrête toujours la séquence.
- Un changement de temps d’avance entre deux séquences de mode 1 est annoncé par la mesure décomptée existante : `PlannedItem.countIn = true`, le contrôleur compte une mesure comme pour un changement de scène.
- Consolidation : une carte acquise peut être servie au temps d’avance de la séquence s’il est plus long ou égal au sien.
- Constante à `false` : aucun filtre de compatibilité, aucune mesure décomptée pour le temps d’avance, comportement du lot 4 seul.

## 6. Pilotage par le taux de réussite

- **Réussite** d’une consigne : réponse juste et pas « hors temps ». **Raté** : fausse note, pas de réponse, hors temps (une réponse juste mais lente en mode 2 n’est pas un raté).
- Taux glissant : sur les `SUCCESS_WINDOW = 10` dernières consignes du mode 1 de la session, hors sondages. Sans consigne encore, pas de blocage.
- **Note nouvelle** autorisée seulement si, en plus des limites existantes :
  - chaque note en cours d’apprentissage a au moins `NEW_NOTE_MIN_CARD_SUCCESS = 0.8` de réussite sur ses `NEW_NOTE_CARD_WINDOW = 5` derniers essais de la session (une note pas encore jouée dans la session bloque) ;
  - le taux glissant est ≥ `NEW_NOTE_MIN_SESSION_SUCCESS = 0.7`.
- **Rattrapage** : après `RECOVERY_AFTER_MISSES = 1` raté (hors sondage, et pas sur une consigne de rattrapage), la consigne suivante est une carte solide (acquise, aucun raté dans ses dernières tentatives, pas due pour une révision à froid), dans la même scène, au temps d’avance de la séquence en cours (sinon le sien). Phase `'consolidation'`, à chaud. Sans carte solide, rien de spécial.
- **Ensemble de travail** : au plus `MAX_WORKING_SET = 6` cartes distinctes servies à chaud dans la session (apprentissage, consolidation, rattrapage). Les révisions à froid n’en font pas partie. Ensemble plein : plus de note nouvelle ni de reprise, et la consolidation ne prend que des cartes déjà dans l’ensemble.

## 7. Tempo adapté entre les sessions

- Le tempo reste fixe pendant la session.
- À la fin d’une session d’Apprentissage (fin normale ou « Quitter »), si la session compte au moins `TEMPO_MIN_PROMPTS = 10` consignes du mode 1 hors sondages : réussite > `TEMPO_RAISE_AT = 0.9` → +`TEMPO_STEP_BPM` (5) ; < `TEMPO_LOWER_AT = 0.7` → −5. Bornes `[TEMPO_MIN_BPM = 80, TEMPO_MAX_BPM = 160]`.
- Le nouveau tempo est écrit dans `settings.tempoBpm`. L’écran Réglages l’affiche et garde la main ; ses bornes deviennent 80 à 160.
- Un tempo hors bornes (ancien réglage à 60) n’est jamais poussé dans le mauvais sens par la borne.

## 8. Consigne en deux temps, corde dessinée, mesure

- **Consigne en deux temps** (mode 1) : la corde s’affiche `STRING_PREVIEW_BEATS = 1` temps avant la note (`PlayView.preview`). Le temps d’avance se compte depuis la note. Le libellé de la corde passe en taille corps (32 px) : la note est la seule lettre en grand.
- **Corde dessinée** : six traits horizontaux, la corde visée en trait épais d’encre, sa lettre en petit (≥ 16 px) dans le schéma. Composant isolé `StringDiagram.svelte` derrière `STRING_DIAGRAM_AID = true`. À `false`, il ne rend rien et l’écran est celui d’aujourd’hui.
  - Affichée seulement pour les consignes à chaud d’une carte pas encore acquise (apprentissage, consolidation) : `PlannedItem.stringAid`. Jamais en révision à froid, au sondage ni en jeu libre.
  - Ce n’est pas un manche pour répondre (principe 4 respecté).
- **Mesure** : nouvelle confusion `{ kind: 'string-name' }` : note jouée de la hauteur à vide de la corde demandée, différente de la cible. Elle passe avant l’écart d’un ou deux demi-tons. Le validateur de sauvegarde vérifie désormais le champ `confusion`.

## 9. Documentation

`PRODUCT.md`, `CLAUDE.md` (« Rules that span files ») et `docs/superpowers/plans/README.md` décrivent le nouveau comportement.

## Choix par défaut à valider

1. `RESPIRATION_BARS = 1`, `LATE_CAPTURE_MS = 2000`, `MIN_RESPONSE_MS = 300`, `STRING_PREVIEW_BEATS = 1`, `SEQUENCE_LENGTH = 4`, `SEQUENCE_MAX_DELAY = 2`, `SUCCESS_WINDOW = 10`, `MAX_WORKING_SET = 6`, `TEMPO_STEP_BPM = 5`, `TEMPO_MIN_PROMPTS = 10`.
2. Identifiant du verdict : `'offbeat'`, libellés « Hors temps » / « Off beat », sprite en anneau.
3. Rattrapage : phase `'consolidation'`, pas de nouvelle phase.
4. Le tempo adapté est écrit dans `settings.tempoBpm` ; les bornes de l’écran Réglages passent de 60–140 à 80–160.
5. Cartes `identify` à `leadBeats: 2` (le palier 1 n’existe plus).
6. Fenêtre de réussite par note : `NEW_NOTE_CARD_WINDOW = 5` essais, sondage exclu ; une note en apprentissage pas encore jouée dans la session bloque l’entrée d’une note nouvelle.
7. Ensemble de travail compté en cartes (clé), pas en cases physiques.
8. L’aperçu de la corde peut tomber sur le temps 2 (consigne à 2 temps) ou le temps 4 : seule la note compte comme consigne. Il peut apparaître pendant la mesure de la cible précédente (respiration non retardée par l’aperçu).
9. Le libellé de la corde passe de 56 px à 32 px en mode 1 (« la note est la seule lettre en grand »). Le mode 2 ne change pas.
10. Une mesure décomptée (changement de scène ou de temps d’avance) affiche 4, 3, 2, 1 sur les quatre temps qui précèdent la consigne calée, et efface le verdict à ce moment-là ; si l’alignement repousse la consigne, le verdict reste visible plus longtemps.
11. Hors temps dans la note de session : un demi-raté. Précision à froid : un raté. Écarts au temps : exclus.
12. Une première note fausse dans la zone hors temps est enregistrée comme réponse (avec sa confusion), alors qu’avant elle comptait comme absence de réponse.
13. Le rattrapage ne suit pas un raté sur une consigne de rattrapage (pas de chaîne).
14. Baseline : `npm run lint` signalait déjà 40 fichiers hors `src` (plans anciens, `.impeccable/`, `scripts/`) avant cette branche. Ils ne sont pas reformatés ici ; les fichiers touchés passent Prettier.

## Hors périmètre (pistes à discuter)

- Faux positifs de la détection de fatigue : 28 sessions sur 32 signalées sans baisse réelle ; la fonction compare les 6 premières réponses aux 6 dernières, de mélanges différents.
- Sondage réussi noté Good plutôt qu’Easy (`5:E` sondé « su » ne réussit que 35 % de ses consolidations).
- Recaler l’échéance d’une carte en Review sur ses échecs à chaud.
- Pondérer la consolidation vers le mode 1 (le mode 2 est réussi à 98 % en consolidation).
- Espacer davantage les retests dans la session.
- Calibrer le seuil du mode 2.
- Faire varier le tempo pendant la session (futur exercice de transfert sur les positions maîtrisées).
