# Design — sonder avant d’enseigner

Date : 2026-10-03. Statut : en relecture.

Le positionnement disparaît. Chaque note nouvelle est d’abord **sondée** : demandée une fois sans aide, dans l’Apprentissage, quand elle sort de la file d’introduction. Retrouvée en rappel direct, elle passe directement en révision, comme une réussite au positionnement aujourd’hui. Sinon, l’aide apparaît dès la consigne suivante et l’apprentissage normal commence.

## Pourquoi

- Le public visé connaît une partie du manche et sait où sont ses trous. Un balayage de 66 positions avant de jouer coûte une session entière et ne sert qu’une fois.
- Le sondage étale ce balayage sur les sessions, au rythme de la file : une note déjà sue ne coûte qu’une consigne.
- Le joueur type (`PRODUCT.md`, « Utilisateur principal ») retrouve les notes par calcul : la plupart des sondages échouent, et la note s’apprend comme aujourd’hui.

## Principes conservés

- Les règles de l’acquis et de la maîtrise ne changent pas. Le sondage dispense de l’enseignement, jamais de la vérification : une note réussie au sondage revient en révision à froid comme toute note acquise, et la maîtrise demande toujours trois sessions distinctes.
- Ordre de la file d’introduction, limites `LEARNING_SLOTS` et `MAX_UNCONSOLIDATED`, échelle des temps d’avance : inchangés.
- Les nombres restent des constantes nommées, à calibrer.

## Terminologie

- **Sondage** (`phase: 'probe'`) : la toute première consigne d’une position, sans aide, au moment où elle entre dans l’Apprentissage. Il n’y en a qu’un par position et par sens.
- **Sondage réussi** : rappel direct (`isDirectRecall`). En mode 1, le temps d’avance du sondage est `leadForThreshold(tempo)`, donc toute réponse juste dans la fenêtre est un rappel direct. En mode 2, nom juste en au plus `IDENTIFY_RECALL_THRESHOLD_MS` (3 s).
- **Sondage manqué** : mauvaise note, pas de réponse, ou (mode 2) nom juste mais trop lent.
- **Déjà sue** : note dont le sondage a réussi.

## 1. Température d’un sondage : exception documentée

**Règle.** Un sondage réussi est enregistré **à froid**. Un sondage manqué est enregistré **à chaud**.

**Pourquoi c’est une exception.** « À froid » veut dire « premier essai après un délai », et un sondage est toujours un premier essai : selon cette définition, il serait toujours à froid. Mais dans le code, « à froid » veut aussi dire « compte pour la rétention ». Un sondage manqué ne mesure pas un oubli : la note n’a jamais été apprise. L’enregistrer à froid le ferait compter contre la maîtrise (seuil de 90 %), contre la précision à froid de la carte du manche et dans le temps médian du mode 2.

**Choix retenu.** La température du sondage dépend de son résultat, pour que tous les filtres à froid existants (FSRS, acquis, maîtrise, carte du manche, écart au temps de l’accueil, tendance) excluent les sondages manqués sans code supplémentaire. L’alternative (température fidèle, plus un prédicat `countsForRetention` à chaque endroit qui lit le froid) a été écartée : un sixième calcul de statistique risquerait d’oublier le prédicat.

**Où c’est écrit.** Cette règle figure :

- dans `PRODUCT.md`, Terminologie, à l’entrée « À froid / à chaud » ;
- dans `CLAUDE.md`, « Rules that span files », règle « Cold vs hot » ;
- en commentaire au seul endroit qui la calcule (contrôleur de session, choix de température) ;
- dans un test nommé d’après la règle.

**Effet de bord corrigé.** Aujourd’hui, un échec au positionnement est enregistré à froid sans créer de carte. Quand la note est apprise plus tard, cet échec reste dans son historique et compte contre la maîtrise. La migration (section 7) le repasse à chaud.

## 2. Déroulé dans l’Apprentissage

### Sélecteur

L’option 4 (« Note nouvelle ») sert un sondage au lieu d’une présentation :

| Champ de `PlannedItem` | Mode 1                                | Mode 2    |
| ---------------------- | ------------------------------------- | --------- |
| `phase`                | `'probe'`                             | `'probe'` |
| `temperature`          | `'cold'` (provisoire, voir section 1) | idem      |
| `aid`                  | `'none'`                              | `'none'`  |
| `leadBeats`            | `leadForThreshold(tempo)`             | `null`    |

Rien d’autre ne change dans l’ordre des options : retest > révision > reprise > note nouvelle (sondage) > consolidation.

### Limites

- Pendant qu’il attend sa réponse, le sondage occupe une place de `LEARNING_SLOTS` (la carte est en mémoire avec `learnedAt: null`, comme une présentation aujourd’hui).
- Réussi, il libère sa place aussitôt. Un joueur qui connaît bien le manche enchaîne les sondages : le balayage de l’ancien positionnement se fait par morceaux, session après session.
- Une note réussie au sondage est acquise : elle n’entre pas dans `MAX_UNCONSOLIDATED` (apprises mais pas encore acquises).
- Fatigue : plus de note nouvelle, donc plus de sondage.

### Résultat

- **Réussi** : la carte est créée par `probeCard` (l’actuel `placementCard`, étendu aux deux sens) : planification `graduateToReview(now)`, `learnedAt = acquiredAt = now`, `leadBeats` du sondage (1 en mode 2). La note ne revient pas dans la session, sauf en consolidation, comme toute note apprise.
- **Manqué** : la carte est créée par `introduceCard` (en apprentissage). La **consigne suivante** est la même note avec l’aide : 8 temps et position affichée en mode 1, nom affiché en mode 2. Puis l’échelle habituelle (section « Ajustements » de la spec Apprentissage du 2026-10-02).
- **Reprise** (option 3) : une note restée en apprentissage d’une session précédente repart de la présentation avec l’aide, sans nouveau sondage.

### Mode 2

Même règle, avec le seuil du mode 2. Une position du mode 2 devient candidate dès que sa version mode 1 est acquise (inchangé) : une réussite au sondage du mode 1 la rend candidate tout de suite.

Limite connue : en mode 2, toucher un bouton au hasard réussit une fois sur douze. Le seul effet est de sauter l’enseignement ; la première révision à froid rattrape l’erreur.

## 3. Écran de jeu

- **Aucune annonce.** Un sondage ressemble exactement à une révision : même consigne, même piste, mêmes verdicts. Pas de libellé du type « Nouvelle note ». Le guitariste est à 60 cm – 1 m, mains sur la guitare : un texte de plus ne serait pas lu.
- L’aide n’apparaît qu’après un sondage manqué, à la consigne suivante. Pas de texte d’explication non plus à ce moment.
- Aucun changement de `PlayScreen`, de `PlayView` ni du contrat `.impeccable/surfaces/src-routes-session-page-svelte.md`.

## 4. Accueil

- Le bouton affiche toujours « Apprentissage » (EN : « Learn »), dès la première visite.
- `HomeStats.nextAction` disparaît ; `homeSessionKind` et `homeAction.ts` aussi (la session lancée est toujours `'learn'`).
- La ligne des révisions (dues, ou heure des prochaines) s’affiche dès qu’il existe une carte apprise ; avant, rien (comme aujourd’hui sans carte apprise).
- Texte `how` réécrit en FR et EN sans le positionnement. FR : « Le bouton lance l’Apprentissage : environ 5 minutes, à relancer quand tu veux. La note défile dans la piste : joue-la, sur la corde indiquée, quand sa case atteint le trait. Les cordes à vide sont supposées connues. Le clic sort des enceintes de l’ordinateur. » EN, même contenu.
- **Premier chiffre** (« Écart au temps ») : il porte sur les essais du mode 1 à froid et justes. Les sondages réussis en font partie. Un joueur qui connaît déjà des notes voit donc un chiffre dès sa première session ; sinon le tiret reste jusqu’à la première révision à froid, au moins `MIN_COLD_DELAY_MS` plus tard.

## 5. Bilan

- **Précision et temps médian à froid** : sur les révisions à froid seulement (y compris jeu libre à froid). Les sondages en sont exclus, réussis comme manqués : compter les réussites sans les échecs gonflerait la précision.
- Nouvelle ligne **« N notes déjà sues »** (EN : « N notes already known ») : sondages réussis de la session. Affichée seulement si N > 0.
- `SessionSummary` gagne `knownCount`.
- Première session type : « Aucune révision à froid cette fois », N notes déjà sues, N notes apprises, N notes reprendront la prochaine fois.
- Bilan du jeu libre : inchangé (pas de sondage en jeu libre).

## 6. Carte du manche

Pas de changement de forme. Les sondages manqués étant à chaud, ils sortent de `coldAccuracy` et du temps médian du mode 2. Un sondage réussi compte comme un essai à froid réussi.

## 7. Données et migration

### Types

- `ItemPhase` : `'placement'` devient `'probe'`.
- `SessionKind` : `'placement'` disparaît (`'learn' | 'free'`).
- `Settings.placementDoneAt` disparaît.
- `RecordOutcome` devient `{ card: CardState } | null` : la carte qu’un essai vient de créer ou de changer (note apprise, sondage réussi ou manqué). Le sélecteur la calcule dans `record()`, de façon synchrone, avant toute attente, comme aujourd’hui pour une note apprise ; le contrôleur l’écrit.

### Base (Dexie version 3)

Contrairement à la version 2, la version 3 **migre** au lieu de vider :

- tentatives `phase: 'placement'` → `phase: 'probe'` ; celles avec `correct: false` passent à `temperature: 'hot'` (un positionnement se jouait au temps d’avance du seuil : juste équivaut à rappel direct) ;
- sessions `kind: 'placement'` → `kind: 'learn'` ;
- ligne de réglages : `placementDoneAt` supprimé ;
- cartes : inchangées. Les cartes issues du positionnement sont déjà apprises et acquises.

Les positions manquées au positionnement n’ont pas de carte : elles seront sondées quand la file les atteindra.

Une seule fonction pure, `migrateLegacyPlacement`, fait ces conversions sur une tentative et une session, utilisée par la migration et par l’import.

### Sauvegardes

- À l’import, le fichier est d’abord normalisé par `migrateLegacyPlacement`, puis validé : un ancien export s’importe. Le validateur lui-même ne connaît que `'probe'`, `'learn'` et `'free'`. `placementDoneAt` présent dans les réglages importés est ignoré.
- `BackupFile.version` reste 1 (le format est compatible après normalisation).

## 8. Ce qui disparaît

- `buildPlacementPlan` (`progress/plans.ts`) et ses tests.
- `placementCard` → renommé `probeCard`, signature `(target: Target, attempt, now, sessionId, tempoBpm)`.
- `placementTargets()` → renommé `locateTargets()` (le jeu libre l’utilise encore via `practiceTargets`).
- Branches `'placement'` de `createAppServices.startSession`, `SessionController` (création de carte, `placementDoneAt` en fin de session), `finishDestination`, `/session` (`quitToSummary`), `homeAction`, messages de l’accueil.
- Commentaire « Placement shortcut » de `graduateToReview` : devient « Probe success ».
- `createListSelector` reste (jeu libre).

## 9. Tests

TDD, specs colocalisées. Barrière : `npm test && npm run check`.

- **Sélecteur** (`learnSelector.spec.ts`) :
  - une note nouvelle est servie en `probe`, sans aide, à `leadForThreshold(tempo)` en mode 1, sans temps d’avance en mode 2 ;
  - sondage réussi : `record()` renvoie une carte en révision, apprise et acquise ; la place est libérée, la note nouvelle suivante peut entrer dans la même session ;
  - sondage manqué (fausse note, pas de réponse) : la consigne suivante est la même note, aidée, à 8 temps ;
  - mode 2 : nom juste en plus de 3 s = manqué, aide (nom) à la consigne suivante ;
  - une note reprise d’une session précédente n’est jamais sondée ;
  - une note déjà sue ne compte pas dans `MAX_UNCONSOLIDATED` ;
  - fatigue : aucun sondage.
- **Contrôleur** (`SessionController.spec.ts`) : test nommé « records a missed probe hot and a passed probe cold » ; carte écrite selon le résultat ; plus d’écriture de `placementDoneAt`.
- **Cartes** : `probeCard` en mode 1 et en mode 2.
- **Statistiques** :
  - un sondage manqué ne compte ni contre la maîtrise, ni dans `coldAccuracy`, ni dans le temps médian du mode 2 ;
  - le bilan exclut les sondages de la précision à froid et compte `knownCount` ;
  - `computeHomeStats` sans `placementDoneAt`.
- **Stockage** : passage de la version 2 à la version 3 sur une base avec positionnement (phases, températures, sessions, réglages, cartes intactes) ; import d’un ancien export (phases et sessions converties, `placementDoneAt` ignoré) ; le validateur seul refuse `'placement'`.
- **Écrans** : accueil sans « Positionnement », bouton « Apprentissage » à la première visite ; bilan avec « notes déjà sues ».

## 10. Documentation

Dans la même branche :

- `PRODUCT.md` :
  - Progression : la puce « Positionnement » est remplacée par le sondage ;
  - Apprentissage, option 4 : « Note nouvelle, sondée d’abord sans aide… » ;
  - « Apprendre une note » : la présentation aidée suit un sondage manqué ;
  - « Le bouton de l’accueil reste toujours actif » (sans « après le positionnement ») ;
  - Terminologie : entrée « Sondage », et l’exception de température (section 1) sous « À froid / à chaud » ; « Acquis » : « (ou au sondage) ».
- `CLAUDE.md` : sessions `'learn' | 'free'`, phase `'probe'`, exception de température dans « Cold vs hot ».
- `docs/superpowers/plans/README.md` : la décision « Positionnement » est remplacée par « Sondage », avec renvoi vers cette spec ; « Acquis » : « (ou au sondage) ».

## Hors périmètre

- Sonder plusieurs notes d’avance pour remplir la fenêtre plus vite.
- Rejouer un sondage pour une note déjà en apprentissage.
- Calibration des seuils.
