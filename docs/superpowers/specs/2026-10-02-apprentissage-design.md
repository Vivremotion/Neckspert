# Design — mode Apprentissage

Date : 2026-10-02. Statut : approuvé, corrigé à la planification (section « Corrections »).

La session du jour devient l’**Apprentissage** : une session d’environ 5 minutes, toujours ouverte, qui apprend les notes nouvelles par rappels espacés dans la session, révise à froid ce qui est dû, et consolide le reste. Les ensembles du curriculum ne sont plus des portes : une fenêtre glissante sur une file ordonnée fait entrer les notes nouvelles.

## Problèmes constatés

1. **Le bouton se réactive aussitôt, avec les mêmes notes.** Une carte due est proposée en révision. Si elle a été jouée il y a moins d’une heure (souvent en jeu libre), l’essai est à chaud, FSRS ne la replanifie pas, elle reste due, et l’accueil rouvre la session.
2. **Sessions d’une seule note.** Le positionnement acquiert deux des trois notes de `locate-s6-a`. 2/3 < 80 % : rien ne se débloque, une seule note nouvelle reste, présentée une fois avec l’aide, puis la session s’arrête.
3. **Progression cadencée par l’horloge.** Une note ne compte comme acquise qu’à froid, dans une session ultérieure, au moins 1 h après. Le déblocage dépend de l’acquis : chaque ensemble coûte au moins une heure, quelle que soit la vitesse du joueur.

Cause commune : la mesure de la rétention (à froid, espacée) sert aussi à cadencer l’apprentissage, et la session n’a pas de contenu minimal.

## Principes conservés

- Seuls les essais à froid comptent pour la rétention, FSRS, l’acquis et la maîtrise.
- **Acquis** et **maîtrisé** gardent leur définition (`PRODUCT.md`, Terminologie).
- Les nombres sont des constantes nommées dans `domain/progress/constants.ts`, à calibrer.

## Terminologie

- **En apprentissage** : la note a une carte, mais n’est pas encore apprise (`learnedAt` nul).
- **Apprise** (nouveau) : 2 rappels directs sans aide dans une même session, après la présentation. État à chaud, de court terme. Ne compte pas pour la rétention.
- **Apprise non acquise** : `learnedAt` renseigné, `acquiredAt` nul.
- **Rappel direct** : `isDirectRecall` existant (juste et sous le seuil).

## 1. Déroulé d’une session d’Apprentissage

### Sélecteur

La session ne suit plus une liste figée. À chaque consigne, un sélecteur pur choisit la suivante, d’après l’état de la session et les cartes. Il prend la première option disponible :

1. **Retest d’apprentissage échu** : une note en apprentissage dont l’écart est écoulé.
2. **Révision à froid** : une carte apprise, due (`scheduling.due <= now`) et _éligible au froid_ (aucune tentative depuis `MIN_COLD_DELAY_MS`, toutes phases confondues, et pas encore jouée dans la session). Au plus `LEARN_COLD_CAP = 20` révisions par session, les plus anciennement dues d’abord (ordre actuel de `dueCards`).
3. **Note en apprentissage à reprendre** : une carte en apprentissage d’une session précédente, pas encore présentée dans cette session.
4. **Note nouvelle** : la suivante de la file d’introduction (section 2), si les deux limites le permettent.
5. **Consolidation** : une carte apprise, à chaud, choisie par faiblesse (section 1.4).

Si aucune option n’est disponible mais qu’un retest attend, le retest le plus proche de son échéance est servi en avance. Si rien du tout n’est disponible, la session se termine.

### 1.1 Apprentissage d’une note

- **Présentation** : avec l’aide `show-position`, `LEARN_PRESENT_LEAD_BEATS = 8` temps d’avance. La carte est créée à ce moment (`introduceCard`, `learnedAt: null`), même si la réponse est fausse.
- **Retests** : sans aide, temps d’avance `leadForThreshold(tempo)` (le plus long qui compte encore comme rappel direct ; 2 temps à 80 bpm). Le premier vient après `LEARN_RETEST_GAPS[0] = 2` autres consignes, le second après `LEARN_RETEST_GAPS[1] = 4`.
- **Apprise** après `LEARN_SUCCESSES = 2` rappels directs sans aide consécutifs : `learnedAt = now`, `leadBeats = leadForThreshold(tempo)`, et la carte reçoit `introScheduling(now)` (premier contrôle à froid dû après `MIN_COLD_DELAY_MS`).
- **Erreur** (fausse note, absence de réponse, ou réponse juste mais pas en rappel direct) : le compteur de réussites retombe à 0, la note revient **avec l’aide** après 2 consignes, puis les retests sans aide reprennent à l’écart 2.
- Une réponse juste avec l’aide ne compte pas comme réussite.
- L’état des retests (écart, réussites, aide) vit dans la session seulement. Une note non apprise en fin de session reste en apprentissage, et repart de la présentation à la session suivante (option 3).
- Tous ces essais sont à chaud (`phase: 'learning'`).

### 1.2 Limites de la fenêtre

- `LEARNING_SLOTS = 3` : au plus 3 cartes en apprentissage à la fois (en base, toutes sessions confondues).
- `MAX_UNCONSOLIDATED = 10` : au plus 10 cartes apprises non acquises. Au-delà, aucune note nouvelle n’entre ; la session se consacre aux révisions et à la consolidation.
- Une note nouvelle (option 4) n’entre que si les deux limites sont respectées.

### 1.3 Fin de session

- `LEARN_SESSION_MS = 5 * 60 * 1000`. Une fois cette durée écoulée depuis le début de la session, le contrôleur ne demande plus de consigne : la session se termine après le verdict en cours, puis le bilan s’ouvre.
- **Fatigue** (`detectFatigue` existant) : plus aucune note nouvelle ni reprise (options 3 et 4) ni consolidation. Seuls les retests des notes déjà présentées dans la session peuvent encore passer, dans la limite des 5 minutes ; la session se termine dès qu’il n’en reste plus.
- Quitter garde le comportement actuel.

### 1.4 Consolidation

Parmi les cartes apprises, hors celles des 2 dernières consignes de la session :

1. celles avec une confusion lors de leurs 3 dernières tentatives ;
2. puis par `scheduling.stability` croissante.

Égalité départagée par la clé de carte. Essai à chaud, `phase: 'consolidation'`, sans aide, temps d’avance de la carte. Ne met à jour ni FSRS, ni l’acquis, ni la maîtrise.

### 1.5 Temps d’avance

- Présentation : 8. Retests : `leadForThreshold(tempo)`. Révisions et consolidation : `leadBeats` de la carte (ajusté comme aujourd’hui par `adjustLeadBeats` sur les essais à froid).
- Mode 2 (identification) : pas de temps d’avance, comme aujourd’hui.

## 2. File d’introduction

`introductionOrder(): Target[]` remplace `buildCurriculum`, `unlockedSets`, `nextNewTargets` et `UNLOCK_RATIO`. Fonction pure et isolée : l’ordre doit pouvoir changer sans toucher au reste.

### Positions

- Cases 1 à `MAX_PROMPT_FRET` (11), sur les 6 cordes. **La case 0 sort du curriculum** : les cordes à vide sont un prérequis (la consigne nomme la corde par sa note à vide).
- 66 positions en mode 1, 66 en mode 2.

### Ordre en mode 1

1. **Naturelles**, en alternant les cordes (6, 5, 4, 3, 2, 1, puis on recommence). Pour chaque corde, celles sur un point du manche (cases 3, 5, 7, 9) d’abord, par case croissante, puis les autres naturelles par case croissante.
2. **Altérées**, même alternance, par case croissante.

### Mode 2

La position en mode 2 (`identify`, même corde, même case) devient candidate dès que sa version mode 1 est **acquise**. Les candidates mode 2 passent avant la suite de la file mode 1, dans l’ordre de la file mode 1.

### Ce qui est sauté

Toute position qui a déjà une carte (positionnement, apprentissage en cours ou appris) n’est pas une note nouvelle.

### Positionnement et jeu libre

- `placementTargets()` : cases 1 à 11, 66 positions.
- Une carte issue du positionnement réussi est apprise et acquise : `learnedAt = acquiredAt = now`.
- Le jeu libre tire dans la même liste de positions (sans case 0, modes 1 et 2).

## 3. Froid en jeu libre

- En jeu libre, pour une position qui a une **carte apprise**, la température est classée comme en révision (`classifyTemperature`). Un essai à froid passe par `applyColdAttempt` : FSRS, temps d’avance, acquis, maîtrise.
- Une position sans carte, ou en apprentissage, reste à chaud en jeu libre et ne crée pas de carte.
- Partout où le code retient « une tentative de révision à froid » (`phase === 'review' && temperature === 'cold'`, par exemple `leadTempoBpm` dans `stats.ts`), une tentative de jeu libre à froid compte aussi. La règle devient : `temperature === 'cold' && (phase === 'review' || phase === 'free')`.
- Le bilan du jeu libre ne change pas (pool `all`, note S+ à F+).

## 4. Données

### `CardState`

Gagne `learnedAt: number | null`.

- `introduceCard` : `learnedAt: null`, échéance non pertinente tant que la carte n’est pas apprise (le sélecteur ne propose jamais en révision une carte en apprentissage).
- `placementCard` : `learnedAt = now`.

### `Phase`

Gagne `'consolidation'`. Toujours à chaud. Le validateur de sauvegarde accepte cette phase.

### `SessionKind`

`'daily'` devient `'learn'`, partout : type, `buildLearnSelector` (remplace `buildDailyPlan`), `homeAction`, validation des sauvegardes, paramètre `?kind=learn` de `/session` (valeur par défaut), fixtures de test.

### Remise à zéro

Pas de migration : l’application n’a qu’un utilisateur, qui repart de zéro.

- `db.ts` passe en version 2. Le passage de la version 1 à la version 2 vide toutes les tables.
- Le validateur de sauvegarde exige `learnedAt` sur chaque carte et n’accepte plus `'daily'`. Un ancien export est refusé.

## 5. Application

### Contrat du sélecteur

```ts
interface SessionSelector {
	/** Next prompt, or null when the session is over. */
	next(context: { now: number; elapsedMs: number; fatigued: boolean }): PlannedItem | null;
	/** Feeds a judged attempt back so retests and counters advance. */
	record(attempt: Attempt): void;
}
```

- `buildLearnSelector({ cards, attempts, now, sessionId })` pour l’Apprentissage.
- Positionnement et jeu libre : un sélecteur qui déroule leur liste actuelle. Le contrôleur n’a plus qu’un chemin.
- `SessionController` ne garde plus `series` ni `queue` ; il appelle `next()` après chaque verdict et `record()` après chaque tentative. La logique de durée et de fatigue est passée au sélecteur via `context`.
- Les cartes créées ou modifiées pendant la session (présentation, apprise, essai à froid) sont écrites par le contrôleur comme aujourd’hui ; le sélecteur garde sa propre copie en mémoire, mise à jour par `record()`.

### `SessionPlan`

Disparaît. `startSession(kind)` construit le sélecteur adapté et le passe au contrôleur avec `sessionId`, `kind` et `createdAt`.

## 6. Écrans

### Accueil

- Après le positionnement, le bouton affiche « Apprentissage » (EN : « Learn ») et n’est jamais désactivé. `HomeStats.nextAction` vaut `'placement' | 'learn'`.
- `HomeStats` gagne `dueCount` : nombre de cartes qui seraient proposées en révision maintenant (apprises, dues, éligibles au froid).
- Ligne d’information sous le bouton :
  - `dueCount > 0` : « 6 révisions dues » ;
  - sinon, si une révision est à venir : « Prochaines révisions dans 2 h ». `nextReviewAt` devient le minimum, sur les cartes apprises, de `max(scheduling.due, dernière tentative + MIN_COLD_DELAY_MS)` ;
  - sinon rien.
- Texte d’explication réécrit en FR et EN : session d’environ 5 minutes, cordes à vide supposées connues.

### Écran de jeu

- Pas de changement de forme. L’aide `show-position` sert à la présentation et au retour après une erreur.
- La fin à 5 minutes arrive après le verdict en cours.
- En mode 2, l’aide de présentation affiche le nom de la note (il n’existe pas d’autre aide pour ce sens).

### Bilan

- Précision et temps médian **à froid**, comme aujourd’hui. Sans aucun essai à froid, le bilan affiche « Aucune révision à froid cette fois » au lieu de zéros.
- « N notes apprises » : cartes dont `learnedAt` tombe dans la session.
- « N notes reprendront la prochaine fois » : cartes en apprentissage présentées dans la session et non apprises.
- L’heure conseillée devient une information : « Prochaines révisions dans … », calculée comme `nextReviewAt`. `NEXT_SESSION_GAP_MS` disparaît.

### Carte du manche

- Plus de colonne case 0.
- Les essais à froid du jeu libre l’alimentent (section 3). Pas d’autre changement.

## 7. Tests

TDD, specs colocalisées.

- **`introductionOrder`** : 66 positions mode 1, aucune case 0 ; naturelles avant altérées ; alternance des cordes ; points du manche d’abord dans chaque corde.
- **Sélecteur Apprentissage** :
  - ordre de priorité retest > révision > reprise > nouvelle > consolidation ;
  - écarts 2 puis 4 ; apprise après 2 rappels directs sans aide ;
  - erreur : retour de l’aide après 2 consignes, compteur à 0 ; réponse juste mais lente = erreur ;
  - limites 3 et 10 ;
  - carte touchée il y a moins de `MIN_COLD_DELAY_MS` (jeu libre compris) : pas proposée en révision ;
  - carte en apprentissage : jamais proposée en révision ;
  - mode 2 candidat seulement après acquisition du mode 1 ;
  - fin à 5 minutes ; fatigue : plus de nouvelle note ;
  - retest servi en avance quand rien d’autre n’est disponible ;
  - consolidation : confusions récentes d’abord, puis stabilité croissante, pas les 2 dernières consignes.
- **Froid en jeu libre** : essai à froid sur carte apprise → FSRS mis à jour ; position sans carte → aucune carte créée ; carte en apprentissage → à chaud.
- **Régression** : carte due jouée en jeu libre 10 minutes avant → absente des révisions, `dueCount` ne la compte pas.
- **`SessionController`** (`FakeClock`) : appelle le sélecteur après chaque verdict, s’arrête après le verdict en cours au-delà de 5 minutes, écrit `learnedAt`.
- **Stockage** : passage en version 2 vide les tables ; le validateur exige `learnedAt`, accepte `'learn'`, refuse `'daily'`.
- **Écrans** : accueil jamais désactivé après positionnement, ligne d’information selon `dueCount` / `nextReviewAt` ; bilan sans froid ; carte sans case 0.
- Barrière : `npm test && npm run check`.

## 8. Documentation

Dans la même branche :

- `PRODUCT.md` : « Session du jour » devient « Apprentissage » (déroulé de la section 1) ; « Progression par petits ensembles » devient la file d’introduction ; cordes à vide en prérequis ; jeu libre compté quand l’essai est à froid ; « Apprise » ajoutée à la Terminologie ; le bouton de l’accueil est toujours actif.
- `CLAUDE.md` : `'learn'`, sélecteur, file d’introduction.

## Corrections apportées à la planification

1. **Retests à `leadForThreshold(tempo)` au lieu de 4 temps.** `isDirectRecall` exige que l’annonce tienne dans `RECALL_THRESHOLD_MS` (1,5 s) : à 80 bpm, 4 temps durent 3 s, aucune note n’aurait jamais été apprise.
2. **Une carte apprise prend ce temps d’avance.** Sinon son premier contrôle à froid se ferait à 8 temps, ne pourrait pas être un rappel direct, et l’acquis demanderait 2 ou 3 sessions de plus ; la limite de 10 notes apprises non acquises bloquerait la fenêtre.
3. **Le bilan s’ouvre à la fin de l’Apprentissage, et en quittant.** Aujourd’hui, seule la fin du jeu libre y mène ; la session du jour restait sur « Série terminée » avec un bouton qui rejouait la même liste.
4. **Aide du mode 2** : le nom de la note (section 6).
5. **`repeatUntilCorrect` disparaît** de `PlannedItem` : le sélecteur gère les retours ; positionnement et jeu libre ne répètent rien.

## Hors périmètre

- Affichage des jalons de progression (« naturelles des cordes graves… »). À ajouter si la progression paraît floue.
- Ordre d’introduction fondé sur les repères du manche plutôt que sur les naturelles : possible plus tard, en changeant `introductionOrder` seul.
- Calibration des constantes.
