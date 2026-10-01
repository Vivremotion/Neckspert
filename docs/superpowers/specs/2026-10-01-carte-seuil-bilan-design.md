# Design — durée sur la carte, seuil d’identification, bilan du Jeu libre

Date : 2026-10-01. Statut : approuvé.

Trois changements indépendants. La session du jour et le positionnement ne gagnent pas de note, et ne redirigent pas vers le bilan.

## 1. Carte du manche — durée en secondes

Le délai d’une case de localisation reste stocké en temps (`leadBeats` : 8, 4, 2 ou 1). L’écran affiche la durée de ce délai au tempo de la session qui l’a fixé, en secondes. Changer le tempo des réglages ensuite ne change pas le nombre déjà affiché.

### Tempo de session

`SessionRecord` gagne `tempoBpm: number | null`.

- Au démarrage de la session, la valeur est copiée depuis les réglages.
- La clôture de la session réécrit l’enregistrement sans perdre ce tempo.
- Une session a un seul tempo, celui du début. Un changement de tempo en cours de session n’est pas suivi.
- Les sessions déjà en base, et les sauvegardes version 1 qui n’ont pas le champ, ont un tempo vide. Le champ est facultatif à l’import : absent ou `null` est valide ; s’il est présent, c’est un nombre fini strictement positif. Pas de migration, pas de nouvelle version de sauvegarde.

### Quelle session, quelle durée

Pour une carte de localisation, la session retenue est :

1. la dernière tentative de cette carte en phase `review` et à température `cold`, s’il en existe une (la plus grande `promptedAt`) ;
2. sinon `introducedInSession` (apprentissage ou positionnement).

Les tentatives à chaud, en jeu libre, ou de positionnement une fois qu’une révision à froid a eu lieu, ne choisissent pas la session.

`locateLeadMs = Math.round(leadBeats × 60 000 / tempoBpm)`.

Si la session est absente ou si son tempo est vide, `locateLeadMs` est `null`. On ne redescend pas vers une session plus ancienne.

`buildNeckMap` reçoit aussi la liste des sessions et remplit `locateLeadMs` sur chaque `NeckMapCell`. `locateLeadBeats` reste sur la cellule. L’écran n’affiche plus les temps.

### Affichage

- `locateLeadMs` présent : le texte visible et le libellé d’accessibilité utilisent le formateur déjà utilisé pour l’identification, deux décimales et virgule. 2000 ms → `2,00 s`. 500 ms → `0,50 s`.
- `locateLeadMs` vide : la case affiche seulement le statut (« non vu », « en cours », « acquis », « maîtrisé »), sans durée.
- La ligne d’identification ne change pas.

`/map` charge les sessions avec les cartes et les tentatives. `/dev/map` fournit `locateLeadMs` directement dans ses cellules d’exemple.

Exemples :

- Réussite à 60 BPM, le délai passe de 4 temps à 2. La case affiche `2,00 s`. Les réglages passent ensuite à 120 BPM sans rejouer la carte : la case affiche toujours `2,00 s`.
- Une session suivante à 120 BPM raccourcit le délai à 1 temps : la case affiche `0,50 s`.
- Carte ancienne, session sans tempo : statut seul.

## 2. Identification — rappel direct à 3 s

`IDENTIFY_RECALL_THRESHOLD_MS = 3000` vit à côté de `RECALL_THRESHOLD_MS` dans les types du domaine.

`RECALL_THRESHOLD_MS` (1500) reste le seuil de la localisation : choix du délai au positionnement (`leadForThreshold`) et rappel direct quand `leadBeats` est renseigné.

`3000` sert quand `leadBeats` est `null`, c’est-à-dire pour nommer une note :

- `judgeIdentify` : juste et `reactionMs ≤ 3000` → verdict `perfect` ; juste et plus lent → `late`. Une réponse fausse reste `wrong`. Il n’y a pas de délai qui retire la question.
- `isDirectRecall`, dans `src/lib/domain/scoring/recall.ts` et dans `src/lib/domain/progress/lead.ts` : la branche `leadBeats === null` compare `reactionMs` à 3000. La branche localisation reste sur 1500.

Conséquence assumée : une identification juste entre 1,5 s et 3 s devient un rappel direct. Elle reçoit Good plutôt que Hard, et elle peut compter pour acquis et maîtrisé. La localisation ne bouge pas.

Les tests qui fixent la frontière d’identification à 1500 ms passent à 3000 ms. La phrase du brief qui donne « environ 1 à 1,5 s » comme seul seuil est précisée : 1,5 s pour jouer une note, 3 s pour la nommer.

## 3. Bilan du Jeu libre

`/dev/summary` est une maquette. L’écran réel est `/summary`. Aujourd’hui une partie libre se termine sur « Rejouer », et ses tentatives sont enregistrées à chaud, donc un bilan limité au froid serait vide.

### Arrivée

Quand une session `free` passe à `finished`, y compris après « Quitter », la page de session ouvre `/summary?sessionId=<id>`. La décision est une fonction pure `finishDestination(kind, sessionId): string | null` : elle retourne ce chemin pour `free`, et `null` pour `daily` et `placement`.

La session existe déjà depuis le démarrage, et la dernière réponse est enregistrée avant `finished`. Les questions restées sans réponse ne sont pas des tentatives.

La session du jour et le positionnement restent sur l’écran de jeu, avec « Rejouer ».

### Chiffres

`SessionSummary` porte :

- `pool: 'cold' | 'all'`
- `attemptCount` et `correctCount` (remplacent `coldCount` et `coldCorrect`)
- `medianOffsetMs` (remplace `medianColdOffsetMs`)
- `identifyMedianReactionMs`
- `learnedCount`, `fatigueDetected`, `nextSuggestedAt`
- `grade: SessionGrade | null`

`pool` vaut `all` si `record.kind === 'free'`, sinon `cold`.

Pour `cold`, les filtres actuels restent : précision, écart au temps (localisations justes) et temps pour nommer ne comptent que les tentatives à froid. Pour `all`, les mêmes mesures comptent toutes les tentatives de la session, quelle que soit la température. L’écart au temps ignore toujours les identifications et les localisations fausses ou sans offset. Le temps pour nommer ignore toujours les localisations et les réponses sans `reactionMs`.

`learnedCount`, `fatigueDetected` et `nextSuggestedAt` se calculent comme aujourd’hui, pour chaque type de session. Une partie libre n’introduit en général aucune carte : la ligne des positions apprises vaut souvent 0. `nextSuggestedAt` reste sur l’objet ; le bilan du Jeu libre ne l’affiche pas.

Zéro tentative : `attemptCount` 0, médianes `null`, `grade` `null`. L’écran affiche `—` pour la précision et les médianes, comme quand un ratio est vide.

### Note

```ts
type SessionGrade =
	| 'S+' | 'S'
	| 'A+' | 'A'
	| 'B+' | 'B'
	| 'C+' | 'C'
	| 'D+' | 'D'
	| 'F+';
```

`sessionGrade(attempts)` vit dans le domaine de progression.

- Aucune tentative → `null`.
- Aucune réponse juste → `F+`.
- Sinon la lettre suit la part de réponses fausses (`(n - justes) / n`) :
  - 0 → S
  - strictement moins de 25 % → A
  - strictement moins de 50 % → B
  - strictement moins de 75 % → C
  - 75 % ou plus, avec au moins une juste → D
- Un `+` s’ajoute si au moins la moitié des réponses justes ont le verdict `perfect`. À égalité (exactement 50 %), le `+` est là. Pas de signe moins.

`perfect` porte déjà les seuils : localisation dans les 80 ms, identification en 3 s ou moins. La note ne relit pas ces constantes.

À 20 réponses : 4 fausses → A ; 5 fausses → B ; 0 fausse et au moins la moitié `perfect` → S+ ; 0 fausse et moins de la moitié `perfect` → S ; 20 fausses → F+.

`grade` est `null` hors Jeu libre, et pour un Jeu libre sans tentative.

### Écran

Le composant de bilan existant sert pour les deux pools.

- Note présente : sous le titre, en grand (`PixelText` à l’échelle 4), le texte de la note et rien d’autre sur cette ligne.
- `pool === 'all'` : le libellé de précision est « Précision » / « Accuracy ». La ligne « Prochaine session » n’est pas affichée.
- `pool === 'cold'` : le libellé reste « Précision à froid » / « Cold accuracy ». La ligne « Prochaine session » reste. Pas de note.

Les boutons Accueil et Carte du manche restent. Pas de bouton Rejouer sur le bilan.

`/dev/summary` montre un exemple de partie libre : `pool: 'all'`, une note `S+`, et les autres lignes remplies, pour voir cet écran sans jouer. Le cas « précision à froid, sans note, avec prochaine session » reste couvert par le test du composant.

### Erreurs

- `sessionId` absent sur `/summary` : l’alerte actuelle.
- Session inconnue : l’erreur actuelle de `sessionSummary`.
- Tempo de session invalide dans une sauvegarde : rejet, message explicite, comme pour le tempo des réglages.

## Hors scope

- Rediriger la session du jour ou le positionnement vers le bilan.
- Afficher « Prochaine session » sur le bilan du Jeu libre.
- Notes avec un signe moins, ou une note sous F+.
- Reconstituer le tempo des sessions déjà jouées.
- Suivre un changement de tempo au milieu d’une session.
- Fusionner les deux copies de `isDirectRecall`.
- Modifier le seuil de 1,5 s de la localisation, ou ajouter un couperet de temps à l’identification.

## Tests

- `buildNeckMap` : 2 temps et session à 60 BPM → `locateLeadMs` 2000 ; une révision à froid plus récente l’emporte sur la session d’introduction ; tempo vide → `null`, sans repli.
- `NeckMapScreen` : `2,00 s` à la place de « 2 temps » ; sans `locateLeadMs`, le statut seul, dans le texte et dans le libellé d’accessibilité.
- La session enregistre le tempo au démarrage et le conserve à la clôture.
- Import de sauvegarde : tempo absent accepté ; tempo 0 rejeté.
- Identification : 3000 ms → `perfect` et rappel direct ; 3001 ms → `late` et pas un rappel direct. Localisation : 2 temps à 80 BPM reste un rappel direct ; 4 temps non.
- `sessionGrade` : les frontières du tableau ci-dessus, le seuil exact de 50 % de `perfect`, et `null` sans tentative.
- `summarizeSession` : une session daily ignore le chaud et a `grade: null` ; une session free compte le chaud dans la précision, l’écart et le temps pour nommer, et porte une note.
- `SummaryScreen` : partie libre → note visible, libellé « Précision », pas de « Prochaine session » ; partie du jour → pas de note, « Précision à froid », « Prochaine session » visible.
- `finishDestination` : `free` retourne le chemin du bilan ; `daily` et `placement` retournent `null`.
