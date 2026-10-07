# Design — voie de la mémoire des triades

Date : 2026-10-08. Statut : approuvé dans la conversation du 2026-10-07/08, section par section.

Sous-projet C1 de l’étape 3 de `docs/plateforme.md`. S’appuie sur le domaine des accords (A, `2026-10-06-accords-voicings-design.md`), le capteur d’accords (B1, `2026-10-07-capteur-accords-design.md`) et le journal de diagnostic (C0, `2026-10-07-journal-diagnostic-design.md`), qui ne demande rien ici : il est découplé.

## Décisions de pédagogie

- **Contenu.** Triades serrées majeures et mineures sur **ré‑sol‑si et sol‑si‑mi**, les 12 fondamentales, les trois renversements : 144 voicings par mécanique. Ce sont les renversements que les guitaristes utilisent ; mi‑la‑ré et la‑ré‑sol n’en font pas partie. Pas de septièmes tant que les triades ne sont pas maîtrisées.
- **Les formes pleines** (accords ouverts et barrés, CAGED) seront un sous-projet à part, **obligatoire** : le guitariste ne les joue pas encore du tac au tac. Elles n’apparaissent pas comme repères pendant l’exercice (trop de texte à lire en jouant).
- **Deux consignes, deux processus de rappel, deux cartes.** Trouver « D, fondamentale sur si » et trouver « D en position 2 » ne sont pas le même accès en mémoire : ce qui est appris avec un indice ne se transfère pas entièrement à un autre. Chaque voicing a donc deux cartes FSRS, une par mécanique, comme la localisation et l’identification pour une position du manche.
- **Le rythme est propre à chaque exercice** : temps d’avance, respiration, nombre de réussites pour qu’une triade soit apprise. Changer une valeur pour un exercice ne change rien ailleurs.
- **Le jugement de l’accord dans l’ancrage est volontairement souple** (n’importe où entre le temps 2 et la fin de la mesure), pour la musicalité, puisque tout le reste se joue sur le temps. Décision réversible : si le jeu devient approximatif, on demandera un temps précis.

## 1. Les deux mécaniques

L’item des deux mécaniques est le voicing, toutes octaves confondues (clé de A, par exemple `D|maj|3:5,2:1,1:3`). Le groupe de cordes s’affiche en petit sous la consigne.

### Ancrage — `triad-anchor`

- **Consigne** : « D · fondamentale sur si ».
- **Capteurs** : notes et accords.
- **Rapport au temps** `anchorTiming` (section 3) : cible 1, la fondamentale sur le temps 1 de la mesure cible ; cible 2, l’accord, attaqué entre le temps 2 et la fin de cette mesure.
- **Jugement** :

|               | Juste si                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fondamentale  | la bonne note sur la corde nommée (toute octave jouable sur cette corde), jugée comme en localisation : parfait, en avance, en retard, hors temps, mauvaise note |
| Accord        | n’importe quelle occurrence du voicing demandé, attaquée dans sa fenêtre                                                                                         |
| Essai         | les deux ; le verdict de temps est celui de la fondamentale                                                                                                      |
| Rappel direct | essai juste et fondamentale pas hors temps                                                                                                                       |

Les confusions disent où ça a coincé : celles de la localisation pour la fondamentale ; pour l’accord, autre renversement, autre qualité, autre octave n’est pas une faute ici, rien de reconnu, ou pas d’accord dans la fenêtre.

- **Présentation aidée** : la consigne et les cases d’une occurrence, « D · fondamentale sur si · 2‑3‑2 ».
- **Correction** pendant la respiration après un raté : « 2‑3‑2 · A D F# ».

### Zone — `triad-zone`

- **Consigne** : « D · position 2 ». La position d’une occurrence est sa case appuyée la plus basse (la case de l’index) ; les cordes à vide ne comptent pas ; une forme toute à vide est « à vide ». Une carte par voicing ; à chaque consigne, la position est tirée parmi les occurrences du voicing (de la case 0 à `MAX_VOICING_FRET`), en évitant celle de la dernière consigne de cette carte.
- **Capteur** : accords. **Rapport au temps** : celui du mode 1 (cible au temps 1, échelle des temps d’avance, hors temps), paramétré par le rythme de l’exercice.
- **Jugement** : juste si le capteur retient l’occurrence demandée. Confusions : même forme à l’autre octave (mauvaise position), autre renversement, autre qualité, rien de reconnu.
- **Entrée dans la file** : un voicing n’entre en zone qu’une fois **acquis en ancrage**.
- **Présentation aidée** : la consigne d’ancrage en indice, « D · position 2 (fondamentale sur si) ».
- **Correction** : comme pour l’ancrage.

### Quelle lecture du capteur fait foi

Le capteur d’accords donne son avis plusieurs fois après une attaque (250 ms, 500 ms, 1 s, 2 s), chaque fois sur tout ce qui a sonné depuis l’attaque. Règle :

- la première attaque dans la fenêtre de réponse est la réponse (la règle de la première note, étendue aux accords) ;
- dès qu’un avis reconnaît l’occurrence attendue, la manche est tranchée, le temps de réponse étant l’instant de l’attaque ;
- sinon, le dernier avis (2 s, ou fenêtre coupée par la manche suivante) dit ce qui a été joué.

Les avis suivants de la même attaque restent dans les observations, sans changer le verdict.

### Risque connu

Le juge peut retenir un autre renversement alors que le joueur a joué juste (fixture B1 : D 2‑3‑2 après 7‑7‑5 qui sonne encore). Le joueur voit alors un raté sur un accord juste. La contestation dans le bilan l’étiquette ; le journal garde le son. C1 ne corrige pas le juge : c’est le rôle des variantes et de B3.

## 2. Contenu, introduction, sélection

**Définitions d’exercice** (données) : `triads-anchor` (mécanique `triad-anchor`) et `triads-zone` (mécanique `triad-zone`). Paramètres :

```ts
{
	stringSets: [[3, 2, 1], [4, 3, 2]],   // dans l’ordre d’introduction
	qualities: ['maj', 'min'],
	pacing: { leadSteps: [8, 4, 2], respirationBars: 1, learnedAfter: 2 }
}
```

Chaque exercice a son tempo (progression), comme les autres.

**Ordre d’introduction en ancrage** (fonction pure, paramétrée par la définition) :

1. groupe par groupe, dans l’ordre de `stringSets` ;
2. dans un groupe, par familles : une fondamentale en majeur, ses trois renversements dans l’ordre du manche (du plus grave au plus aigu, par la position de leur plus basse occurrence), puis la même fondamentale en mineur ;
3. les fondamentales sont rangées par le nombre de positions (corde et note) de leurs voicings déjà **acquises en localisation**, du plus grand au plus petit ; à égalité, naturelles avant altérées, puis ordre chromatique depuis C.

**Sélection** (`createTriadSelector`) : la logique de l’Apprentissage, sur les cartes des deux mécaniques :

1. retests des triades en cours d’apprentissage ;
2. révisions à froid ;
3. reprises ;
4. nouvelles triades, sondées d’abord (en ancrage, la suivante de la file ; en zone, une triade acquise en ancrage), présentation aidée après un sondage raté ;
5. consolidation.

Mêmes garde-fous : ensemble de travail limité, taux de réussite exigé avant une nouvelle triade, rattrapage sur une triade solide après un raté, fatigue. Propre aux triades : **jamais deux fois de suite le même voicing**, quelle que soit la mécanique (l’accord qui sonne encore n’est jamais un candidat, il ne peut donc pas être demandé). Les consignes vont par **séquences de 4 d’une même mécanique**.

**Candidats donnés au capteur** : ceux de `voicingCandidates` pour l’occurrence attendue, plus, en ancrage, les autres occurrences du même voicing marquées attendues ; jamais l’accord de la manche précédente.

**Lien avec les notes** : quand une triade entre en ancrage, ses positions sur le manche qui ne sont pas encore acquises en localisation passent en tête de la file d’introduction des notes de l’Apprentissage (localisation). Le sens inverse est l’ordre ci-dessus.

## 3. La session « Triades » et le cœur

**Session** : un genre de session `triads`, lancé par un bouton « Triades » sur l’accueil (avec le nombre de révisions dues), d’environ `LEARN_SESSION_MS`, avec la fatigue et un bilan. Les deux exercices y sont exécutés, chacun à son tempo.

**Bilan** : précision et temps médian à froid, triades apprises, triades déjà sues (sondages réussis), heure des prochaines révisions, puis la liste des accords refusés avec, sur chacun, « Joué juste ». Le bouton écrit `contested: true` sur l’essai et ne touche pas à FSRS. C’est un échafaudage, à retirer quand les variantes et l’arbitre de B3 suffiront.

**Ce qui change dans le cœur** (qui ne nomme toujours aucune mécanique) :

1. **Plusieurs capteurs par mécanique.** `MechanicPresenter.sensor` devient `sensors: SensorKind[]` ; `expectation?(item, round)` rend une attente par capteur (`Partial<Record<SensorKind, unknown>>`) ; chaque source reçoit la sienne, les autres reçoivent `null`.
2. **Une réponse qui se précise.** Une observation peut annoncer qu’une meilleure lecture de la même attaque va suivre (`Observation.final === false`). La manche garde alors la réponse en attente et prend la lecture suivante de la même attaque ; elle juge sur une lecture finale ou, à défaut, sur la dernière reçue quand sa fenêtre se ferme. `chordSensor` marque finale une lecture qui retient l’attendu, et la dernière lecture d’une attaque.
3. **Rapport au temps à deux cibles** (`anchorTiming`) : cible 1 sur le temps 1 (fenêtres de la localisation), cible 2 de `beat(cible) + 1` à `beat(cible) + 4` ; respiration après la mesure cible.
4. **Le rythme lu dans l’exécution.** Les rapports au temps sur le temps et la sélection lisent `pacing` dans la définition de l’exercice. Les exercices de notes gardent les constantes actuelles comme valeurs par défaut, sans changement de comportement.
5. **Changement de tempo entre séquences** : quand la consigne suivante appartient à une exécution d’un autre tempo, le contrôleur arrête le métronome, change le tempo et compte une mesure avant la consigne (décision 4 de la plateforme).
6. **`Attempt.contested?: boolean`**, facultatif ; la sauvegarde l’accepte ; pas de nouvelle version de la base.

## 4. Tests

- **Domaine** : ordre d’introduction (groupes, familles, majeur puis mineur, notes acquises d’abord, égalités) ; position d’une occurrence ; jugements de l’ancrage et de la zone avec leurs confusions ; entrée en zone seulement après l’acquisition en ancrage ; jamais deux fois le même voicing de suite ; séquences d’une même mécanique ; positions d’une triade en tête de la file des notes.
- **Rapport au temps à deux cibles** : fondamentale en avance, en retard, hors temps ; accord avant le temps 2, après la mesure, absent.
- **Cœur** : une mécanique factice à deux capteurs jouée de bout en bout ; une réponse qui se précise (attente de la lecture finale, sinon dernière lecture à la fermeture) ; le changement de tempo entre deux séquences, avec la mesure comptée ; le rythme lu dans l’exercice (changer une valeur ne change que lui) ; les exercices de notes inchangés.
- **Bilan** : « Joué juste » étiquette l’essai, FSRS inchangé.
- **De bout en bout** : une session Triades avec capteurs factices, du sondage à l’apprentissage en ancrage, puis à la zone.

Barrière de fusion : `npm test && npm run check`.

## Hors périmètre

Les formes pleines (sous-projet à venir), la voie du geste (D), la session à deux voies (E), l’accordeur et les profils de timbre (B2), le tableau de bord des variantes et l’arbitre (B3), le jeu libre de triades, les triades sur la carte du manche.
