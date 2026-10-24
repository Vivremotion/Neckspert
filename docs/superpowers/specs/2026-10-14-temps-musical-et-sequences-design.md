# Design — temps musical et séquences (chantier 1, tranche « rythme pur »)

Chantier 1 de `docs/vision.md` (« Ordre des chantiers »). Conçu dans la conversation du 2026-10-14 à partir du test du langage sur deux ans de cours (15 exercices du corpus demandent des séquences, 8 du rythme, 5 un clic paramétrable), puis relu (section « Revue »). Specs liées : `2026-10-10-voie-geste-design.md` (passages enchaînés, vue choisie par l’exercice), `2026-10-06-journal-observations-design.md` (enveloppes d’observations), `2026-10-07-capteur-accords-design.md` (variantes en ombre, vérification par candidats).

## Décisions

- **Une tranche verticale de rythme pur** prouve le temps musical de bout en bout sur trois exercices du corpus, tels que le professeur les donne : mesures silencieuses, métronome sur 2 et 4 (lecture rythmique), contretemps sur une puis deux mesures. Seules les attaques comptent, pas les hauteurs.
- **Approche : un cœur de temps musical écrit au modèle cible, à côté de l’existant, puis la migration.** Les quatre relations actuelles (`beat`, `anchor`, `gridChange`, `free`) ne bougent pas pendant la tranche ; elles migrent dès la validation (section 11) et l’ancien code est supprimé. Aucun legacy à la fin du chantier.
- **Le contenu musical et ce que le juge écoute sont deux objets.** La _figure_ est de la musique (des voix, des durées, plus tard des hauteurs) ; le _plan d’attentes_ est ce que les capteurs doivent entendre et quand. Le plan se compile depuis la figure et l’exercice. Les quatre relations existantes s’écrivent dans ce plan (vérifié sur papier, section 3).
- **On joue en continu.** Les cycles s’enchaînent sans arrêt, comme les reprises des partitions du professeur ; chaque cycle reste l’essai jugé ; une respiration lisible vient tous les N cycles. Le retour n’est jamais affiché pendant le jeu.
- **Une mesure dit ce qu’elle prouve.** Précision et placement sont deux mesures ; « accélérer » n’est dit que d’une dérive ; une mesure qui dépend de la latence n’entre dans la réussite que si la latence a été mesurée sans le joueur.
- **Les niveaux** : une échelle en données par exercice ; on monte après des cycles réussis sans aide, on redescend après des échecs répétés. Un seul nom partout : **niveau** dans l’interface et le langage, `level` dans le code ; c’est toujours le niveau que l’exercice donne (à un item s’il en a), jamais celui du joueur.
- **La vérité est le modèle, pas la notation texte.** Figures écrites en LilyPond, stockées en JSON versionné ; rien d’autre que le catalogue ne dépend du parseur.
- **Changement de règle déclaré** : jusqu’ici le tempo ne changeait jamais pendant une séance (`CLAUDE.md`). Pour les exercices à niveaux, un changement de niveau peut changer le tempo **à une respiration**, précédé de mesures d’écoute puis d’une mesure comptée.

## 1. Le temps musical (`src/lib/domain/time/`, pur)

### Positions et durées

Toutes les positions et durées sont des **fractions exactes de ronde**, comme les _moments_ de LilyPond et les `divisions` de MusicXML : une noire vaut `1/4`, un triolet de croches `1/12`. Pas de millisecondes, pas de ticks.

```ts
/** An exact rational, always normalized (gcd 1, positive denominator). JSON: "3/8". */
class Fraction {
	static of(n: number, d?: number): Fraction;
	static parse(text: string): Fraction; // "3/8"
	add(o: Fraction): Fraction;
	sub(o: Fraction): Fraction;
	mul(o: Fraction): Fraction;
	div(o: Fraction): Fraction;
	compare(o: Fraction): -1 | 0 | 1;
	toNumber(): number;
	toString(): string;
}
```

### Mètre

```ts
interface Meter {
	count: number; // 4 dans 4/4, 7 dans 7/8
	unit: Fraction; // 1/4, 1/8
	grouping: number[]; // [1,1,1,1] en 4/4, [3,3] en 6/8, [2,2,3] en 7/8
}
```

La tranche n’utilise que 4/4 ; rien ne présuppose 4 dans `domain/time/`.

### Carte de tempo

```ts
interface TempoSegment {
	at: Fraction;
	bpm: number;
	unit: Fraction;
	ramp?: 'linear';
}
interface TempoMap {
	readonly origin: number; // temps audio (s) de la position 0
	readonly segments: readonly TempoSegment[]; // un seul segment dans la tranche
	toSeconds(position: Fraction): number;
	toPosition(seconds: number): Fraction; // approchée au 1/3840 de ronde, pour l’affichage
}
```

Seul endroit où le temps musical devient du temps audio. L’unité du tempo est explicite et s’écrit partout avec elle (`♩ = 100 bpm` : `{ bpm: 100, unit: 1/4 }` ; `♩. = 60 bpm` : `{ bpm: 60, unit: 3/8 }`). « Clic sur 2 et 4, 100 ressenti » se dit `♩ = 100 bpm` avec un clic sur les temps 2 et 4 : c’est l’accompagnement qui change, pas le tempo.

Le modèle porte d’emblée les changements de tempo en cours de série et même en cours de cycle (segments, rampes) : accélération progressive façon _speed trainer_, modulation métrique, rubato écrit. Le moteur ne s’y oppose plus (plus de `setTempo` qui lève, les sons sont datés par la carte). Cette tranche ne les utilise qu’à une respiration ; les autres usages viendront avec les exercices qui les demandent.

### Figure : le contenu musical

```ts
type FigureElement =
	| { kind: 'note'; duration: Fraction; tieToNext?: boolean; content: null } // hauteur plus tard
	| { kind: 'rest'; duration: Fraction };

interface Voice {
	id: string;
	elements: FigureElement[];
	tuplets?: { from: number; to: number; ratio: [number, number] }[];
}

interface Figure {
	schema: 1; // version du JSON
	meter: Meter;
	bars: number;
	voices: Voice[]; // une voix dans la tranche ; polyrythmie, accompagnement plus tard
}
```

`validateFigure` refuse une voix qui ne remplit pas exactement `bars` mesures. Le JSON a un schéma versionné (`schema`), fractions en chaînes `"3/8"` : première pierre du format d’exercice v1.

### Notation texte : LilyPond, comme surface

- Module isolé : `domain/time/notation/lilypond.ts`, `parseLilyPondRhythm(text): Figure`.
- **Sous-ensemble valide de LilyPond** : la convention de la portée rythmique, où la hauteur est ignorée (`c8 c8 r8 c8 r8 c8 r8 c8`). Durées `1 2 4 8 16 32`, points, silences `r`, liaisons `~`, `\tuplet 3/2 { c8 c8 c8 }`, barres `|` vérifiées. Le texte reste lisible et vérifiable par LilyPond.
- **Refus de tout le reste**, en particulier `#` et `$` (le Scheme embarqué) : le parseur est déclaratif, il n’évalue rien.
- **Seul le catalogue** (et plus tard l’Atelier) importe ce module (test d’architecture). Remplacer LilyPond = changer un parseur, sans migration de données.
- Règle de correspondance pour la suite : les hauteurs dans le temps en LilyPond ; les accords en symboles d’accord ; les positions en tablature ; les degrés en chiffrage. Tous vers le même modèle.

## 2. Accompagnement et sons

- **L’accompagnement est une figure** : une voix de sons (clic accentué, clic, son de démonstration…), avec un masque de mesures `on`/`off`. Le clic sur 2 et 4, sur les contretemps, ou sur le 1 une mesure sur deux s’écrit comme n’importe quelle figure.

```ts
interface Accompaniment {
	figure: Figure; // les sons, une voix ; content = identifiant de son
	bars: ('on' | 'off')[]; // répété sur la série : 3+1 = ['on','on','on','off']
}
```

- **Un seul chemin pour tout ce que l’application fait sonner** : clic, démonstration, « joué avec », clic resynthétisé à la réécoute, et plus tard le backing. Le transport (section 7) rend les figures en sons datés par la `TempoMap` et les confie à un port réduit :

```ts
interface SoundSchedulerPort {
	play(time: number, sound: SoundId): void; // temps audio, fraction de temps comprise
	at(time: number, callback: () => void): () => void; // réveil, comme metronome.at
	cancelAll(): void;
}
```

- **Journal des sons émis** : chaque son programmé est consigné (temps, identifiant). La réécoute s’en sert ; plus tard, les juges pourront écarter ce que l’application a elle-même joué.
- `MetronomePort` (indexé par temps, `onBeat`, `beatTime`, `setTempo`) reste pour les relations existantes jusqu’à leur migration, puis disparaît (section 11).

## 3. Le plan d’attentes (`domain/time/plan/`)

Ce que le juge écoute, compilé depuis la figure, l’exercice et le niveau :

```ts
interface Expectation {
	at: Fraction; // position dans le tour
	span: 'point' | { until: Fraction }; // ponctuelle, ou étendue (accord de l’ancrage)
	role: 'target' | 'judged-rest'; // une attaque attendue, ou un silence jugé
	sensor: SensorKind; // quel capteur l’entend
	content: unknown | null; // ce qu’il faut jouer ; null en rythme pur
	window: { ms: number } | { ofGap: Fraction }; // absolue, ou relative à l’écart local
}

interface RoundPolicy {
	unit: 'response' | 'cycle'; // une réponse fait le tour, ou tout le cycle est jugé
	firstAnswerOnly: boolean;
	lateCapture: boolean; // « hors temps »
	provisional: boolean; // verdict provisoire puis corrigé
}

interface RoundPlan {
	prompt: Fraction | null; // position de la consigne (−avance), si le tour en a une
	expectations: Expectation[];
	length: Fraction;
	policy: RoundPolicy;
	handover?: Fraction; // où le tour suivant s’ouvre sans trou, dans (0, length] (ajouté, voir « Réalisation »)
	mutedBars: number[]; // mesures muettes du cycle (ajouté)
}
```

**Vérification sur papier** (le contrat doit les porter avant d’écrire le moteur) :

| Relation               | Plan                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| rythme (cette tranche) | N attentes `target` ponctuelles (une par note de la figure), capteur `attack`, `unit: 'cycle'`                                                    |
| `beat` (localiser)     | `prompt` à −avance ; une attente ponctuelle sur le 1, capteur `note` ; `response`, première réponse, capture tardive                              |
| `anchor` (triades)     | deux attentes : la fondamentale ponctuelle sur le 1 (`note`), l’accord étendu du temps 2 à la fin de la mesure (`chord`) ; `response`, provisoire |
| `gridChange` (geste)   | une attente ponctuelle par changement (`chord`), tours enchaînés par passage de main                                                              |
| `free` (identifier)    | **n’est pas une figure** : le temps libre (`FreeRound`, sans carte de tempo) est nommé pour ce qu’il est et récrit sur le même contrat de tour    |

## 4. Le juge du cycle (`domain/time/judge/`, pur)

### Alignement

- **Alignement monotone optimal** des attaques sur les attentes (programmation dynamique, coûts d’appariement selon l’écart, coûts d’insertion — attaque ajoutée — et de suppression — attente manquée), le cas général du suivi de partition. Un temps ajouté ou perdu y apparaît comme un **chemin d’alignement décalé** à partir d’une mesure : le rapport le signale (`shift: { bar, by }`) au lieu d’une suite de manquées et d’ajoutées.
- Zones admissibles : au plus la moitié de l’écart avec les attentes voisines, plafonnée à `MATCH_LIMIT` (1/16 de ronde, un quart de temps en 4/4).
- **Invariant** : la fenêtre de verdict ne dépasse jamais la demi-distance entre deux attentes ; une fenêtre absolue trop large pour une subdivision serrée est ramenée à cette borne (et le rapport le dit).

### Verdict de chaque attente

```ts
type ExpectationVerdict = 'on-time' | 'early' | 'late' | 'missed';
```

`on-time` si l’écart tient dans la fenêtre du niveau, `early` / `late` au-delà, `missed` sans attaque. Les attaques non appariées sont listées comme **ajoutées**.

### Mesures du cycle

| Mesure (lexique)         | Ce qu’elle dit                          | Calcul                                                                   | Dépend de la latence ? |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| **Fidélité à la figure** | la figure est-elle jouée ?              | appariées / attendues ; ajoutées ; décalage                              | non                    |
| **Placement**            | devant ou derrière le temps             | écart moyen signé (ms)                                                   | **oui**                |
| **Précision**            | à quelle distance du temps              | moyenne des écarts absolus (ms)                                          | **oui**                |
| **Régularité**           | ta constance                            | écart-type des écarts (ms)                                               | non                    |
| **Tenue · décalage**     | sans clic, tu passes devant ou derrière | moyenne sur les mesures muettes − moyenne sur les mesures avec clic (ms) | non                    |
| **Tenue · dérive**       | sans clic, tu accélères ou ralentis     | pente des écarts pendant le silence (ms par mesure)                      | non                    |

Seule la dérive autorise les mots « accélères » ou « ralentis ».

### Réussite

Un cycle est réussi quand la figure est jouée fidèlement (aucune manquée, aucune ajoutée, aucun décalage) et que régularité et tenue sont sous les seuils du niveau. **Précision et placement n’entrent dans la réussite que si la latence a été mesurée sans le joueur** (section 7, calibration) ; sinon ils sont affichés « par rapport à ta calibration » et ne jugent rien.

### Rapport

`CycleReport` : verdict par attente, ajoutées, décalage, mesures (avec leurs unités), latence utilisée et sa provenance. Il n’emprunte aucun mot au contrat existant.

## 5. Le contrat de tour cible

Écrit avant le moteur, implémenté par lui ; les relations existantes y viennent à la migration (section 11).

- **`Round`** cible : positions en `Fraction`, `TempoMap` (ou temps libre), `RoundPlan`, observations par capteur. `targetBeatIndex`, `laneBeat`, `leadBeats` n’y figurent pas. Le tour d’un plan s’appelle `PlanRound`.
- **`RoundOutcome`** :

```ts
interface RoundOutcome {
	success: boolean; // la notion commune (stats, progression)
	correct: boolean | null; // le mot du juge ; null quand rien n’a été jugé en hauteur
	verdict: { relation: string; version: number; value: unknown }; // opaque au cœur
	measures: Partial<
		Record<MeasureId, { value: number; unit: 'ms' | 'ms/bar' | 'ratio' | 'count' }>
	>;
	aids: Aid[];
	detail: unknown; // CycleReport pour le rythme
}
```

- Chaque relation type son propre verdict : **`ResponseVerdict`** (l’actuel `Verdict` : `perfect | early | late | offbeat | corrected | wrong`, renommé) pour les tours à une réponse, **`CycleVerdict`** = `{ passed: true } | { passed: false; reasons: CycleFailure[] }` pour les cycles, avec `ExpectationVerdict` par attente. La correspondance `perfect` ↔ `on-time` est écrite une fois.
- **`correct: boolean | null`** dans `RoundOutcome`, `RoundObservation`, `Attempt` et le retour de `MechanicRules.judge` ; leurs lecteurs sont recensés ; un test vérifie qu’aucune réussite ne lit `correct`.
- **Un seul concept d’aide** : `Attempt.aid: AidLevel` devient `aids: Aid[]` (`'show-position'`, `'string-aid'`, `'cursor'`, `'listen'`, `'play-along'`, `'aid-level'`). Le curseur de lecture est une aide.

## 6. Le cycle et la série

> Remplacée par l’« Amendement (2026-10-17) : la séance en segments », en fin de document.

- **Cycles enchaînés** : la figure se joue en boucle, chaque cycle est un tour (`unit: 'cycle'`) qui passe la main au suivant sans trou.
- **Respiration tous les `cyclesPerBreath` cycles** (donné par le niveau, défaut `CYCLES_PER_BREATH` = 4), d’au moins `BREATH_MIN_MS` (4 s) arrondis à des mesures entières, clic audible, on ne joue pas. Elle montre le retour des cycles de la suite qui vient de finir (section 10).
- **Atterrissage** : pour un exercice à mesures muettes, **le cycle commence à la première mesure muette** (les mesures avec clic qui la précèdent appartiennent au cycle précédent, ou à l’entrée en jeu au début de la série). Le 1 où le clic revient est donc dans le même cycle que le silence : il est jugé une seule fois, et c’est là que le joueur vérifie à l’oreille qu’il est resté calé.
- **Entrée en jeu** : au début de la série et à chaque changement de tempo, `LISTEN_IN_BARS` mesures d’accompagnement seul (on écoute, on ne joue pas), puis la mesure comptée.
- **Consigne** (`howTo`) seulement quand elle change (nouvel exercice, nouvel accompagnement, nouvelle figure). Les changements de niveau s’annoncent à la respiration, sans arrêt.

## 7. Transport, écoute, réécoute, calibration

### Transport (`application/session/transport.ts`)

Possède la `TempoMap` courante, rend accompagnement et démonstrations par le `SoundSchedulerPort`, gère entrée en jeu, mesure comptée, respirations, réveils, et le changement de tempo à une respiration. Le contrôleur ne parle aux sons que par lui. Dans la tranche, il sert le nouveau moteur ; les exercices existants y passent à la migration.

### Écouter la figure

- Bouton **sur la vue**, touche affichée : **E** (« Écouter la figure ») en français, **L** (_Listen_) en anglais.
- Appuyer pendant un cycle remplace **le cycle suivant par un cycle d’écoute** (la figure sonne, le joueur écoute), puis le jeu reprend ; rien ne s’arrête.
- Le niveau dit ce que vaut l’écoute (`listen: 'free' | 'aid' | 'none'`) : en lecture, écouter transforme la lecture en imitation, le cycle suivant porte l’aide `'listen'` ; en imitation (à venir), l’écoute est la consigne.

### Réécouter

- Une mémoire tampon (`TakeBufferPort`, sur `WebAudioInput`) garde l’audio d’entrée **de la suite depuis la dernière respiration**, en mémoire seulement.
- À la respiration (bouton) ou dans la pause, « Réécouter » (touche **R**, _Replay_) rejoue la suite avec le clic resynthétisé depuis le journal des sons, mesures muettes comprises ; alignement par la latence calibrée.

### Contre le blocage

- Après `BLOCK_AFTER_FAILS` cycles ratés d’affilée au niveau le plus bas, `diagnoseBlock` distingue :
  - **lecture** (les attaques ne dessinent pas la forme de la figure, aux mêmes positions sur plusieurs cycles) → un cycle d’écoute, puis un cycle **joué avec** (la figure sonne en même temps, autre timbre) ;
  - **exécution** (la forme est juste, l’écart dérape ou un décalage revient) → les **niveaux d’aide** de l’exercice : des niveaux sous le niveau 1, écrits dans ses données, car le sens de la facilité dépend de l’exercice (pour les mesures silencieuses, plus lent est plus dur : l’aide y est un accompagnement sans silence, pas un tempo plus lent).
- **Au bout** : « On change d’air » : l’application propose tout de suite l’exercice voisin ; l’exercice bloqué revient à la série suivante (`LevelState.resumeAfter`), et le bilan nomme la mesure qui casse.
- Un cycle joué avec une aide la porte dans `aids` et ne compte jamais pour monter.

### Calibration

- La calibration actuelle fait jouer le guitariste sur des clics (`computeCalibration` : médiane des écarts) : la latence obtenue mêle la latence du système, le retard du détecteur et l’habitude du joueur. Un joueur qui traîne toujours de 20 ms y obtient 0.
- **Ce qu’il faut corriger** pour une attaque entendue par l’interface : `L = L_sortie + L_interface` (le clic met `L_sortie` à être entendu, l’attaque met `L_interface` à arriver). Le cas recommandé est la guitare branchée sur une interface audio, sans câble de bouclage.
- **Calibration par comparaison, avec deux entrées** (étalonnage d’un instrument par un instrument déjà étalonné) :
  1. **Étalonner le micro de l’appareil.** Phase d’écoute : `BLEED_CHECK_CLICKS` clics joués sur la sortie utilisée pour jouer, le guitariste ne joue pas ; s’il joue au casque, il pose le casque contre le micro de l’appareil. Le micro entend les clics : `R_micro = L_sortie + L_micro` (sans joueur).
  2. **Comparer les deux entrées sur les mêmes attaques.** Le guitariste joue des notes (pas besoin d’être sur le clic) ; chaque attaque est entendue à la fois par l’interface (`t_interface = attaque + L_interface`) et par le micro de l’appareil, qui capte le son acoustique des cordes (`t_micro = attaque + d + L_micro`, `d` ≈ 1 ms par 34 cm entre la guitare et le micro). D’où `L_interface − L_micro = médiane(t_interface − t_micro) + d`.
  3. **Composer.** `L = R_micro + médiane(t_interface − t_micro) + d`. Le geste du joueur s’annule : seules comptent les deux lectures d’une même attaque. La précision attendue tient à la datation des attaques (capteur d’attaques, ±2 à 3 ms par attaque, médiane sur `CALIBRATION_ATTACKS` attaques).
  - Conditions : les deux entrées ouvertes en même temps dans le même `AudioContext` (une seule horloge) ; pendant l’étape 2, le micro de l’appareil doit entendre la guitare, par ses cordes ou par les enceintes que l’interface alimente (monitoring direct) ; pas de retour de la guitare par l’ordinateur (le micro l’entendrait en double) ; `d` estimé par la distance indiquée, ou négligé sous 50 cm.
  - **Faisabilité à prouver d’abord** : ouvrir deux entrées audio différentes en même temps dépend du navigateur. Un petit essai jetable (Chrome, l’interface de l’auteur et le micro du Mac) ouvre le plan 1 ; s’il échoue, la calibration reste celle du joueur (provenance `player`) et le plan le dit.
- Au micro seul (sans interface), l’étape 1 suffit : `L = R_micro`.
- La calibration enregistre la latence par capteur et sa provenance (`system` quand elle est établie sans le geste du joueur, `player` sinon). Le juge du cycle n’utilise placement et précision dans la réussite qu’avec une latence `system`.
- **Fuite du clic** : si au moins `CLICK_BLEED_RATIO` des clics de la phase d’écoute sont entendus comme des attaques, la fuite est enregistrée ; les exercices qui écoutent les attaques demandent un casque (ou une interface). On ne soustrait pas le clic (sur le temps, il se confond avec la bonne attaque).
- Pendant la journée de validation, le journal de diagnostic peut enregistrer au débit natif (option de développement) pour que les attaques au-dessus de 8 kHz soient rejouables.

## 8. Le capteur d’attaques

```ts
interface AttackDetectorPort {
	/** One event per attack: audio time before latency correction, relative strength 0..1, input channel. */
	onAttack(
		callback: (attack: { time: number; strength: number; channel?: number }) => void
	): () => void;
}
```

- Toute attaque compte : médiator, cordes étouffées, percussion, pied. `strength` et `channel` sont enregistrés (accents, constance du son, micro hexaphonique plus tard).
- **`SpectralFluxAttackDetector`** (`infrastructure/audio/attacks/`), abonné aux trames de `WebAudioInput`. Paramètres en millisecondes, indépendants de la fréquence d’échantillonnage (pas d’analyse ≈ 2,5 ms ; écart minimal `MIN_ATTACK_GAP_MS`).
- **SuperFlux** (Böck et Widmer, _Maximum Filter Vibrato Suppression for Onset Detection_, DAFx 2013 ; référence : madmom) : flux spectral positif sur spectre logarithmique par bandes proches du demi-ton, contre la trame de référence filtrée par un maximum en fréquence, pour qu’un vibrato, un bend ou un slide ne déclenche pas. Seuil adaptatif local, sélection des pics, affinage du temps dans la trame.
- La transformée spectrale est un module à part (`infrastructure/audio/spectral/`), réutilisable par d’autres capteurs.
- `attackSensor(detector)` dans `SessionDeps.sensors` : observations `{ time − latence, payload: { strength, channel }, readable: true }`.
- **Validation** : signaux synthétiques (attaques à 75, 50, 30 ms ; salves étouffées ; notes tenues avec vibrato : aucune attaque) ; en ombre à côté du détecteur RMS pendant les exercices existants ; et l’oracle annoté de la journée de validation (section 11). Critères : deux attaques à 30 ms séparées ; datation à ±5 ms de l’oracle ; aucune fausse attaque sur une note tenue.

## 9. La mécanique, les exercices, les niveaux, le stockage

### Mécanique `rhythm-figure` (`domain/mechanics/rhythmFigure.ts`)

`learner: 'skill'` ; item : la figure jouée à un niveau, clé `${figureId}@${level}` ; le juge accepte toute attaque et rend `correct: null` ; relation : le plan d’attentes en `unit: 'cycle'` ; présentateur : modèle d’écran de la vue `rhythm-figure` ; contestable (section 10).

### Les trois exercices (catalogue, données)

| Exercice                                        | Figures (LilyPond, stockées en JSON)                                                                                     | Niveaux                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mesures silencieuses** (`rhythm-silent-bars`) | croches continues `c8 c8 c8 c8 c8 c8 c8 c8`                                                                              | accompagnement 3+1 → 2+2 → 1+3 à ♩ = 80 bpm, puis la même échelle à ♩ = 65 bpm (plus lent est plus dur) ; niveau d’aide : 4+0                                  |
| **Métronome sur 2 et 4** (`rhythm-two-four`)    | un jeu de lignes de **4 mesures** (noires, croches, blanches), une ligne nouvelle à chaque cycle (lecture d’un trait)    | clic sur 2 et 4 ; ♩ = 100 bpm → 120 bpm → 140 bpm ; niveau d’aide : clic sur chaque temps                                                                      |
| **Contretemps** (`rhythm-offbeats`)             | une mesure : `c8 c8 r8 c8 r8 c8 r8 c8` ; deux mesures : la première puis `r8 c8 r8 c8 r8 c8 r8 c8` (sans appui sur le 1) | une mesure, critère du professeur : « sans ajout ni suppression de temps » (fidélité seule, seuils larges) → deux mesures → tempo ; niveau d’aide : ♩ − 10 bpm |

Les consignes (`howTo`) sont écrites par nous d’après le principe de l’exercice, pas recopiées d’un cours.

### Niveaux

- Un niveau est une **surcharge partielle des paramètres de l’exercice**, avec ses conditions en données :

```ts
interface Level {
	params: Partial<{
		accompaniment: Accompaniment;
		cycleBars: number;
		tempo: TempoSegment;
		window: Expectation['window'];
		feedback: 'every-cycle' | 'summary' | 'out-of-tolerance';
		listen: 'free' | 'aid' | 'none';
		cursor: boolean;
		cyclesPerBreath: number;
		thresholds: Partial<Record<MeasureId, number>>;
	}>;
	pass?: { successes: number }; // défaut PASS_AFTER_CYCLES, sans aide, d’affilée
	drop?: { failures: number }; // défaut DROP_AFTER_FAILS, d’affilée
	aid?: true; // niveau d’aide, sous le niveau 1
}
```

- Le curseur de lecture est un paramètre du niveau : présent aux premiers niveaux, il s’efface ; un cycle joué avec lui porte l’aide `'cursor'`.
- L’état de niveau est tenu par **(exercice, portée, item)** dans `LevelState` (`item` absent pour les trois exercices de rythme ; la migration de « localiser » y mettra l’avance par carte).

### Stockage

- **Une seule version de schéma pour tout le chantier : Dexie 8**, au modèle cible dès le premier plan :
  - `Attempt` : `success`, `correct: boolean | null`, `verdict: { relation, version, value }`, `measures`, `aids`, et le **plan résolu** du tour (figure, carte de tempo, accompagnement, fenêtres, seuils), pour que chaque tentative reste rejouable même si le catalogue change ;
  - une table `levelStates` (`LevelState` : exercice, portée, item, niveau, `resumeAfter`), clé `[exerciseId+scope+item]` (chaînes vides pour une portée ou un item absents) ; `Progression` garde le tempo.
- Les tentatives existantes sont converties à la mise à niveau : `success = correct && verdict !== 'offbeat'`, `verdict = { relation: <leur relation>, version: 1, value: <ancien verdict> }`, `aids` depuis `aid`.
- **Une seule chaîne de migration** : des fonctions pures `vN → vN+1` sur les enregistrements, appliquées par la mise à niveau Dexie comme par l’import de sauvegarde (les chaînes actuelles, `db.ts` et `legacy/`, y sont ramenées). **Sauvegarde version 4** ; les versions 3, 2, 1 passent par la même chaîne.

### Entrée dans l’application

Séance `'exercise'` + `exerciseId` (le jeu libre de n’importe quel exercice), au lieu d’une sorte de séance de plus ; à l’accueil, « Rythme » ouvre la liste des trois exercices ; `/session?kind=exercise&exercise=…`.

## 10. La vue `rhythm-figure`

### Cadre et logique

Entrée de `PLAY_VIEWS`, affichée dans `PlayFrame` (pause sur Espace, décompte, erreur audio). Tout ce qui se calcule est dans un module pur testé, `ui/play/views/rhythmFigure.ts`.

### Notation

- **VexFlow** (MIT) derrière un adaptateur `ui/notation/` qui reçoit le **modèle de domaine** (figure multi-voix, et plus tard portée et tablature), jamais des concepts VexFlow ; seul l’adaptateur importe VexFlow (test d’architecture).
- **Polices embarquées** (Bravura), jamais chargées depuis un CDN. `scripts/functional-ui.mjs` vérifie que la police est chargée (`document.fonts.check`) et qu’un glyphe a une largeur non nulle.

### Pendant la suite

La figure en grand ; « mesure 2 / 4 » ; « clic » ou « silence » en toutes lettres ; « Contretemps · niveau 3 sur 6 » ; le bouton « Écouter la figure ». Le curseur seulement si le niveau le donne, et jamais pendant une mesure muette (ce serait un clic visuel) ; avec `prefers-reduced-motion`, il saute de temps en temps. Rien sur les attaques du joueur.

### À la respiration (disposition A, validée en maquette)

- **La disposition suit l’ordre du temps, de gauche à droite** : la suite jouée, estompée, avec ses marques, à gauche ; la figure à jouer, en grand, à droite.
- **Marques lisibles à un mètre** : le décalage est dessiné sur une échelle exagérée, avec un écart minimal visible (`MARK_MIN_OFFSET_PX`) et le chiffre en grand ; trait décalé à gauche (devant) ou à droite (derrière), cercle vide (manquée), marque entre deux notes (ajoutée), « temps perdu » sur la mesure concernée ; couleurs lisibles par les daltoniens et doublées d’une forme.
- **Mots simples d’abord, terme en étiquette** : « Sans clic, tu passes devant (−35 ms) · _tenue_ » (décalage) ; « Sans clic, tu accélères · _tenue_ » (dérive) ; après `PLAIN_WORDS_SESSIONS` séances sur l’exercice, la phrase s’efface et le terme reste.
- Mode du niveau : `every-cycle` (marques de chaque cycle), `summary` (« réussi » ou « raté » par cycle, résumé de la suite), `out-of-tolerance` (seules les marques hors tolérance).
- Annonces : changement de niveau, aide (« On réécoute la figure », « On la joue ensemble », « Niveau d’aide »), « On change d’air ».
- Bouton : Réécouter (R). En mode développement seulement : « C’était en place » (contester).

### Contester : un outil de développement

- **L’application doit juger juste et précisément ; le joueur ne corrige pas le juge.** On ne s’auto-évalue pas de façon fiable, même de bonne foi (l’auteur s’est trompé en contestant des jugements des exercices actuels). La contestation est donc un **outil de développement**, présent seulement dans les versions de développement (comme `/diagnostic`, derrière `requireDev()`), pour trouver les erreurs du juge ; elle n’existe pas dans l’application publiée.
- En développement, « C’était en place » se donne depuis la respiration, la réécoute ou le bilan, cycle par cycle, avec la raison : le détecteur (`missed`, `extra`, `shift`) ou la mesure (`regularity`, `hold`, `precision`). Elle étiquette la tentative, rien d’autre, et désigne les prises à examiner (et à annoter pour l’oracle).
- « Joué juste » des mécaniques existantes suit la même règle à la migration (H).

### Le lexique

Lexique en données (`domain/glossary/`, fr/en), une définition par terme (fidélité à la figure, placement, précision, régularité, tenue, contretemps…), adressable (`term:hold`), partagé par toute l’application. Le terme est souligné en pointillés à sa première occurrence par écran ; la définition s’ouvre au survol, au toucher et au focus clavier ; jamais pendant le jeu.

### Pause, avant de jouer, bilan

- Pause : Reprendre (Espace, ou Échap qui ferme le menu), Réécouter (R), **« Quitter l’exercice », sans raccourci**.
- Avant de jouer : écran « casque » si la fuite est enregistrée ; démonstration à la première rencontre, la figure soulignée au fil du son.
- Bilan (`SessionSummary.rhythm`) : par exercice, le niveau atteint, les cycles réussis (aidés à part), les écoutes, la tendance des mesures, la part du temps joué, les changements de niveau, la mesure qui casse en cas de blocage, les cycles ratés réécoutables (contestables en développement), et une **note de ressenti** libre, facultative.
- Style : tokens existants, aucun élément propre au monde Game Boy ; texte jamais sous 16 px.

## 11. Ordre de construction, validation, migration

### Plans

| Plan                           | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Cœur                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **A**                          | Capteur d’attaques, module spectral, en ombre ; option d’enregistrement au débit natif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | non, **en parallèle** dès le départ |
| **1. Première séance jouable** | `domain/time/` (fractions, mètre, carte de tempo, figure, parseur), plan d’attentes, juge et `CycleReport`, contrat de tour cible, `PlanRound`, `SoundSchedulerPort` et transport pour le nouveau moteur, essai jetable des deux entrées, calibration par comparaison (latence par capteur et provenance), mécanique, les trois exercices, niveaux et niveaux d’aide, vue (VexFlow, marques, respiration), réécoute, séance `'exercise'`, **Dexie 8 et sauvegarde 4 au modèle cible** avec la chaîne de migration unique et ses lecteurs (statistiques, notes, `AttemptRecorder`, validation de sauvegarde) | oui                                 |
| **2. Avant la validation**     | **revu par l’amendement du 2026-10-17** : anti-blocage (`diagnoseBlock`, « joué avec », « on change d’air »), lexique, bilan complet, contestation par raison (développement), export et comparaison de l’oracle                                                                                                                                                                                                                                                                                                                                                                                            | oui                                 |
| **G**                          | Validation en usage réel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                   |
| **H. Migration**               | les quatre relations sur le contrat cible, les consommateurs en mémoire de l’ancien `Verdict` (vues, sons), le transport pour les exercices existants, suppression de `MetronomePort` et de l’ancien code                                                                                                                                                                                                                                                                                                                                                                                                   | oui                                 |

Les plans 1, 2 et H traversent le contrôleur : une branche à la fois. Les relations existantes ne changent pas avant H ; elles écrivent déjà dans le schéma cible (leurs valeurs converties).

### G — validation

Une **journée de pratique intensive** des trois exercices par l’auteur, au moins `VALIDATION_MIN_CYCLES` cycles par exercice. Le volume compte, pas la durée. On examine ensemble :

- **l’oracle** (procédure ci-dessous) : la vérité de terrain du capteur d’attaques ;
- les contestations (développement) par raison, par exercice, comme liste de prises à examiner ;
- la comparaison en ombre du capteur d’attaques ;
- la part du temps joué, les changements de niveau par série, les notes de ressenti.

La décision (migrer, ou recalibrer d’abord) se prend sur ces résultats.

**Fait (2026-10-23).** Le capteur d’attaques tient sur l’oracle annoté ; les corrections demandées sont dans le code. Décision : migrer (H).

#### L’oracle, concrètement

Il valide **le capteur** (les attaques entendues et leurs instants) ; les calculs du juge sont validés par les tests, ses seuils par l’écoute musicale des réécoutes.

1. L’application (page de développement) exporte `ORACLE_TAKES` suites, choisies parmi les contestées et au hasard : pour chacune, un **WAV** de l’entrée et un fichier d’**étiquettes Audacity** (`.txt`, une ligne par attaque détectée : `début<TAB>fin<TAB>étiquette`, début = fin = l’instant de l’attaque, étiquette = son numéro).
2. Dans Audacity : _Fichier › Importer › Audio_ (le WAV), puis _Fichier › Importer › Étiquettes_ (le `.txt`). On voit la forme d’onde et une piste d’étiquettes, une par attaque détectée.
3. On parcourt la prise, zoomée, en regardant (et en écoutant) chaque attaque :
   - une étiquette sans attaque réelle → on la **supprime** ;
   - une attaque réelle sans étiquette → on en **ajoute** une (_Édition › Étiquettes › Ajouter une étiquette à la sélection_, Ctrl/⌘+B) au début de l’attaque ;
   - une étiquette mal placée → on la **déplace** au début de l’attaque.
     Convention : le début d’une attaque est le premier point où la forme d’onde monte nettement au-dessus du bruit (l’annexe de la page d’export le montre sur un exemple). On ne note aucun verdict ni aucun timecode à la main.
4. _Fichier › Exporter › Exporter les étiquettes_ → un `.txt` par prise, déposé dans la page d’export.
5. Un script compare tes étiquettes à celles du capteur : attaques manquées, fausses attaques, écart de datation (biais moyen et dispersion), puis rejoue le juge sur tes étiquettes pour voir quels verdicts auraient changé.

Durée : une suite de 20 à 30 s compte 40 à 60 attaques, soit 3 à 5 minutes ; 10 suites, environ 45 minutes.

### H — critère de fin

`domain/timing/beat.ts`, `anchor.ts`, `gridChange.ts`, `free.ts`, `grid.ts` (`BEATS_PER_BAR`, `alignedPromptBeat`), `MetronomePort` et `isSuccess` n’existent plus ; `leadBeats`, `initialLead`, `learnedLead`, `adjustLead`, `targetBeatIndex`, `laneBeat` sortent du contrat (l’avance devient la position de la consigne dans le plan, son ajustement passe dans les niveaux de « localiser », par carte) ; une recherche dans le dépôt ne trouve plus aucun de ces noms. Le schéma de stockage ne change pas à H. **Revu par l’amendement du 2026-10-23** : le critère complet y est, et l’avance quitte la carte pour `levelStates` (Dexie 9, sauvegarde 5).

## 12. Constantes (à calibrer)

| Constante                    | Valeur        | Rôle                                                                                                                                                            |
| ---------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATCH_LIMIT`                | 1/16 de ronde | plafond des zones d’alignement                                                                                                                                  |
| `SHIFT_MIN_MATCHES`          | 3             | attentes gagnées par la grille décalée pour signaler un temps ajouté ou perdu                                                                                   |
| `PASS_AFTER_CYCLES`          | 3             | cycles réussis sans aide, d’affilée, pour monter (défaut)                                                                                                       |
| `DROP_AFTER_FAILS`           | 2             | cycles ratés d’affilée pour redescendre (défaut)                                                                                                                |
| `BLOCK_AFTER_FAILS`          | 3             | cycles ratés au niveau le plus bas avant l’aide contre le blocage                                                                                               |
| `CYCLES_PER_BREATH`          | 4             | cycles par suite avant une respiration (défaut)                                                                                                                 |
| `BREATH_MIN_MS`              | 4000          | durée minimale d’une respiration, arrondie en mesures                                                                                                           |
| `LISTEN_IN_BARS`             | 2             | mesures d’écoute avant la mesure comptée                                                                                                                        |
| `PLAIN_WORDS_SESSIONS`       | 3             | séances avant que la phrase simple s’efface                                                                                                                     |
| `MARK_MIN_OFFSET_PX`         | 6             | écart visuel minimal d’une marque décalée                                                                                                                       |
| `WORDS_MIN_MS`               | 15            | sous cet écart (ms), un cycle réussi ne dit ni sa tenue, ni sa régularité, ni son placement, ni sa précision (un cycle raté dit toujours ce qui l’a fait rater) |
| `WORDS_MIN_DRIFT_MS_PER_BAR` | 5             | sous cette dérive (ms par mesure), un cycle réussi ne dit ni « accélères » ni « ralentis »                                                                      |
| `MIN_ATTACK_GAP_MS`          | 25            | écart minimal entre deux attaques                                                                                                                               |
| `SETTLE_AFTER_BARS`          | 1/4 de mesure | délai après la fin d’un cycle avant de le juger, pour qu’une attaque signalée en retard l’atteigne                                                              |
| `TAKE_BUFFER_MAX_S`          | 120           | durée maximale de la suite gardée pour la réécoute (environ 23 Mo à 48 kHz)                                                                                     |
| `BLEED_CHECK_CLICKS`         | 8             | clics de la phase d’écoute de la calibration                                                                                                                    |
| `CLICK_BLEED_RATIO`          | 0,2           | part de ces clics entendus comme attaques au-delà de laquelle un casque est demandé                                                                             |
| `RHYTHM_SERIES_MS`           | 300 000       | durée d’une série de rythme                                                                                                                                     |
| `VALIDATION_MIN_CYCLES`      | 100           | volume par exercice pour la validation                                                                                                                          |
| `ORACLE_TAKES`               | 10            | suites annotées à la main pour l’oracle                                                                                                                         |
| `CALIBRATION_ATTACKS`        | 16            | attaques comparées sur les deux entrées                                                                                                                         |

## 13. Tests (écrits avant le code)

- **Domaine** (node) : fractions et leur JSON ; mètre et carte de tempo (segments, unités) ; parseur (valides, mesure incomplète ou trop pleine, n-olets, liaisons, refus de `#` et `$`) ; `validateFigure` ; compilation du plan d’attentes ; **les plans papier des quatre relations** (section 3) construits en tests ; alignement (juste, devant, derrière, manquée, ajoutée, temps perdu, subdivision serrée et invariant de fenêtre) ; mesures et leur dépendance à la latence ; réussite avec latence `system` ou `player` ; niveaux (montée, descente, niveaux d’aide) ; `diagnoseBlock` ; atterrissage (le 1 du retour du clic jugé une fois) ; `PlanRound` avec un faux ordonnanceur de sons.
- **Application** : série de rythme de bout en bout avec un faux capteur d’attaques (sur le modèle de `thirdMechanic.spec.ts`) ; transport (entrée en jeu, mesure comptée, respiration, changement de tempo à une respiration, cycle d’écoute) ; réécoute ; contestation par raison (développement seulement) ; calibration (phase d’écoute, comparaison des deux entrées, composition, provenance de la latence).
- **Architecture** : seul le catalogue importe `lilypond.ts` ; seul `ui/notation/` importe VexFlow ; le cœur ne nomme pas `rhythm-figure` ; aucune réussite ne lit `correct`.
- **Infrastructure** : capteur d’attaques sur signaux synthétiques ; chaîne de migration (Dexie 7 → 8, sauvegardes 1 à 4) ; suites de contrat de stockage (nouveaux champs, plan résolu) ; journal des sons émis.
- **Interface** : `scripts/functional-ui.mjs` : police chargée, glyphe de largeur non nulle, texte ≥ 16 px, curseur absent pendant une mesure muette, écart minimal des marques.
- Barrière de fusion : `npm test && npm run check`.

## Revue (2026-10-14)

Relue sous trois angles, chacun séparément : la vérité des mesures et des noms, la généralité du modèle, le vécu du joueur. Ce que la revue a changé :

- **Mesures et noms** : la calibration absorbait le biais du joueur (latence mesurée sans lui, précision et placement hors réussite sinon) ; précision ≠ placement ; « accélères » réservé à la dérive ; « justesse » → fidélité à la figure ; `ResponseVerdict` / `ExpectationVerdict` ; `correct` nullable dans les quatre contrats ; un seul concept d’aide, curseur compris ; le sens de la facilité en données (niveaux d’aide) ; unité du tempo et changement de règle déclarés ; le temps libre nommé pour ce qu’il est ; `CycleReport` sans mot emprunté ; oracle annoté pour la validation ; noms secondaires (`resumeAfter`, port d’ordonnancement).
- **Généralité du modèle** : contenu (figure multi-voix) séparé du plan d’attentes, contrat cible dès le départ ; positions en rondes, mètre groupé, carte de tempo par segments ; accompagnement = figure et un seul chemin pour les sons, journal des sons émis ; alignement optimal au lieu d’une heuristique de décalage ; fenêtre absolue ou relative avec invariant ; verdict opaque au cœur et mesures nommées ; plan résolu stocké avec la tentative ; niveaux génériques par (exercice, portée, item) ; une seule version de schéma et une seule chaîne de migration ; capteur indépendant du débit, module spectral, canal ; séance `'exercise'`.
- **Vécu du joueur** : séries continues et respiration tous les N cycles, lisible (≥ 4 s) ; atterrissage au retour du clic ; la vraie figure de deux mesures du professeur et son critère ; lecture d’un trait (lignes de 4 mesures) et écoute avant de jouer ; descente après deux échecs, consigne seulement quand elle change ; « on change d’air » plutôt que « demain » ; marques lisibles à un mètre ; un premier plan qui mène à une séance jouable ; contestation depuis la réécoute et le bilan, part du temps joué, ressenti.
- **Décisions de l’auteur après la revue** : la contestation devient un outil de développement (le juge doit avoir raison seul) ; la latence d’une interface se calibre par comparaison avec le micro de l’appareil, lui-même étalonné sur le clic (pas de câble de bouclage) ; le tempo s’écrit toujours avec son unité (`♩ = 100 bpm`).
- **Arbitrages** : la généralité est prise **dans les types** (peu coûteuse) et l’ordre du vécu **dans les plans** (première séance jouable d’abord) ; le schéma de stockage atteint le modèle cible dès le premier plan pour qu’il n’y ait qu’une version, sans qu’aucun champ ne porte une valeur fausse entre-temps ; les consommateurs en mémoire de l’ancien verdict migrent en H, avec son critère de fin.

## Risques connus

- **La fuite du clic** au micro de l’appareil : sans casque ni interface, l’exercice n’est pas jouable ; la calibration le détecte.
- **Le pied sur la pulsation** est demandé par le professeur ; au micro, il peut produire des attaques ajoutées. La journée de validation se joue avec le pied ; les ajoutées faibles sur le temps sont relues à la réécoute avant toute décision. On n’interdit pas le pied.
- **La calibration à deux entrées** dépend de l’ouverture simultanée de deux entrées par le navigateur et d’un micro d’appareil qui entende les cordes ; sans elle, la latence reste de provenance `player` et précision et placement restent affichés sans juger.
- **Firefox et le micro de référence** : il est ouvert brut, car l’annulation d’écho effacerait les clics de la sortie. Le micro intégré brut de Firefox est très faible ; si le capteur d’attaques n’y lit pas les clics, la référence échoue dans Firefox (le joueur peut alors choisir la calibration au clic, `player`). Le micro intégré comme entrée de jeu garde, lui, le traitement de voix de Firefox, et risque le même échec. À vérifier sur le matériel.
- **Fenêtre d’écoute** : `LISTEN_WINDOW_S` (0,5 s) suppose une boucle sortie + micro sous 500 ms ; la latence de sortie de Firefox n’est pas mesurée.
- **Fuite au micro intégré** : sa vérification suppose que le joueur remette son casque, comme l’écran le demande ; s’il joue sur les haut-parleurs, la fuite est enregistrée, à raison.
- **L’alignement optimal** doit être réglé (coûts) sur l’oracle : un mauvais réglage confond un retard régulier et un temps perdu.
- **Le plan 1 est gros** (il porte le schéma cible) : sa découpe en tâches doit garder chaque étape jouable ou testable.

## Hors périmètre

Vérification de hauteur sur séquence et attaques legato (sous-projet suivant) ; mètres impairs dans un exercice ; rampes de tempo dans un cycle ; séquences de notes ; isolement de la mesure qui casse ; prises persistantes ; vue du profil de groove ; page du lexique ; nouvelle direction artistique ; partage du module spectral avec le vérificateur d’accords.

## Documentation à mettre à jour avec le code

`CLAUDE.md` (temps, sons, verdicts, aides, stockage, séance `'exercise'`, changement de tempo à une respiration) ; `docs/vision.md` (avancement) ; `PRODUCT.md` (le rythme comme compétence).

## Réalisation (2026-10-16)

Branche `plan/temps-musical` : plan A (`docs/superpowers/plans/2026-10-15-a-capteur-attaques.md`), puis plan 1 (`docs/superpowers/plans/2026-10-15-1-premiere-seance-rythme.md`). Ce qui suit dit où la réalisation s’écarte de la spec ou la précise.

### Capteur d’attaques (plan A)

- **Noms** : le SuperFlux est `AttackTracker` (pur), derrière l’adaptateur `WebAudioAttackDetector` abonné aux trames de `WebAudioInput` (`infrastructure/audio/attacks/`), au lieu de `SpectralFluxAttackDetector`. Le module spectral (`infrastructure/audio/spectral/`) garde une FFT par taille et calcule le spectre en place.
- **Réglage** : affinage du temps par résidu de prédiction, `strengthFloor` à 40, `preMax`, `preAvg` et `delta` réglés à la main : avec les formules du plan, ses propres tests échouaient. Le test sur prises réelles demande exactement une attaque par accord plaqué sur les 7 prises ; sur les prises au micro de l’appareil, le clic du corpus (vers 1,20 s) est une vraie attaque, qui doit être entendue.
- **Une note attaquée en deux** (pratique réelle, 2026-10-16, FM3) : dans les exercices de rythme, beaucoup de notes arrivent en deux attaques, une faible (force 0,12–0,29, le médiator qui touche la corde, ≈ −42 dBFS) puis la note elle-même 25 à 40 ms plus tard, ≈ 25 dB plus fort ; le juge appariait la première et comptait la seconde comme ajoutée. Des pics de flux à moins de `ATTACK_MERGE_MS` (45 ms ; les triples croches à 160 sont à 47 ms) font une seule attaque, datée au plus fort : l’attaque est émise une fois l’intervalle passé après lui. Sur l’extrait de la prise (`attacks/fixtures/picked-notes-fm3.wav`), 6 attaques avant, 3 après, chacune à moins de 5 ms de l’attaque forte.
- **En ombre** du détecteur de notes, seulement pendant une prise du journal de diagnostic (`DiagnosticSink.onTake`) ; `scripts/attack-shadow-report.ts` compare les deux. L’enregistrement au débit natif n’est honoré que dans une version de développement.

### Le temps, le plan, le juge

- **`RoundPlan.handover`** (facultatif, dans `(0, length]`) : où le tour suivant s’ouvre sans trou. Les cycles le mettent à `length`, un changement de grille un peu avant le changement suivant. Sans lui, le passage de main du geste ne s’écrivait pas sur le contrat. `RoundPlan.mutedBars` donne les mesures muettes à la tenue. `validateRoundPlan` refuse une consigne après la première attente ; `compileCyclePlan` refuse un cycle qui n’est pas fait de boucles entières de la figure.
- **Sons** : `renderSounds` exige une seule voix ; `renderFigure` rend toutes les voix d’une figure, fusionnées dans le temps.
- **Fenêtre de capture d’un cycle** : `[début − avance, fin − avance)`, l’avance (`captureLeadIn`) valant au plus `MATCH_LIMIT` et la moitié de l’écart avant la première attente, raccourcie pour que la zone après la dernière attente reste dedans. Un 1 joué un peu tôt appartient au cycle qu’il ouvre, une dernière note jouée un peu tard au cycle qu’elle ferme, et les cycles enchaînés pavent le temps sans trou ni chevauchement.
- **Décalage** : le juge garde le décalage qui gagne le plus d’attentes (à égalité, la mesure la plus tôt), pas la première mesure qui qualifie (elle nommait la mauvaise mesure). Convention de signe, écrite sur `Alignment.shift` : `byS` négatif = temps perdu (les attaques arrivent en avance), positif = temps ajouté.
- **Attentes écartées par un décalage** : verdict `dropped` (et `CycleReport.dropped`), jamais `missed` ; fidélité = appariées / toutes les attentes. `alignAttacks` exige son contexte (`alignContext(plan, map, start)`) : facultatif, il désactivait en silence la recherche du décalage.
- **Dérive de tenue** : pente aux moindres carrés sur les seules mesures muettes ; absente sous deux mesures muettes mesurées (le décalage de tenue reste mesuré).
- **Sans latence calibrée** pour le capteur (`CycleReport.latency` nul), placement et précision ne jugent jamais.
- **Limite connue** : un temps perdu dans une figure uniforme (croches continues) est invisible à l’alignement ; un échec aux mesures silencieuses se lit alors en tenue (décalage, dérive).
- **Limite connue** : un joueur qui traîne régulièrement juste au-delà de la zone d’appariement est lu comme un décalage d’une subdivision à la première mesure (« temps ajouté » ou « perdu » au lieu de « derrière le temps »).

### Niveaux

- `LevelState` porte aussi les séries en cours (`successes`, `failures`). Au niveau le plus bas, les échecs continuent de compter : l’anti-blocage du plan 2 doit en lire `BLOCK_AFTER_FAILS` d’affilée, et les remettra à zéro.
- **Les aides que le niveau donne ne bloquent pas la montée** : son curseur et `'aid-level'` sont enregistrés dans `aids` mais ne comptent pas comme aidés (`levelAided`) ; les aides que le joueur demande (`'listen'` quand l’écoute vaut une aide, `'play-along'`) bloquent. Sinon aucun niveau à curseur ne se passerait.
- **Une suite garde son niveau jusqu’à la respiration** : le changement y est annoncé, et le tempo y change (mesures d’écoute et mesure comptée au nouveau tempo). Un cycle joué au niveau précédent et jugé après le changement ne fait pas bouger les compteurs du nouveau niveau.
- La respiration dure au moins deux mesures à chaque niveau de chaque exercice (test du catalogue) : le niveau de la suite suivante n’est lu qu’une fois le dernier cycle jugé.
- **Catalogue** (niveaux numérotés comme à l’écran ; chaque niveau ne surcharge que les paramètres de base de l’exercice) :
  - **Mesures silencieuses** (base : ♩ = 80 bpm, fenêtre 80 ms, curseur, retour à chaque cycle, 4 cycles par suite) : niveau d’aide 4+0 ; niveaux 1 à 3 : 3+1, 2+2, 1+3 à ♩ = 80 bpm ; niveaux 4 à 6 : la même échelle à ♩ = 65 bpm, sans curseur, fenêtre 50 ms, le niveau 5 en retour `summary`, le niveau 6 en `out-of-tolerance` avec une fenêtre de 30 ms et des seuils resserrés (régularité 20 ms, tenue 25 ms et 10 ms par mesure, précision 30 ms).
  - **Métronome sur 2 et 4** (base : clic sur 2 et 4, fenêtre 80 ms, curseur, écoute comptée comme aide, une respiration après chaque ligne, `cyclesPerBreath: 1`) : niveau d’aide avec un clic sur chaque temps à ♩ = 100 bpm ; niveaux 1 à 3 : ♩ = 100 bpm, ♩ = 120 bpm, ♩ = 140 bpm sans curseur.
  - **Contretemps** (base : clic sur chaque temps, ♩ = 80 bpm, une mesure, curseur, 4 cycles par suite) : niveau d’aide à ♩ = 70 bpm ; niveau 1 : une mesure, seuils larges (régularité 80 ms, tenue 200 ms et 100 ms par mesure) ; niveaux 2 à 4 : deux mesures, aux seuils de base, à ♩ = 80 bpm, ♩ = 90 bpm, puis ♩ = 100 bpm sans curseur.
- `ExerciseDefinition` gagne `title`, `base`, `levels`, `figures` et `pick` (`'loop'` : la même figure en boucle ; `'next'` : une ligne nouvelle à chaque cycle).

### Séance, transport, écoute

- **`PlanSessionController`** (`application/session/plan/`) joue la séance `'exercise'`, à côté de `SessionController` jusqu’à la migration ; `AppServices.startExercise(exerciseId)` le crée. La mécanique `rhythm-figure` n’est qu’une identité (`MechanicIdentity` : id, `learner: 'skill'`, clé d’item), sans relation, sans juge ni présentateur : le contrôleur compile le plan et construit le modèle d’écran (`rhythmStage.ts`). Elle n’est pas encore contestable (plan 2).
- **Transport** : `changeTempo` lève si des sons sont déjà programmés à la mesure du changement ou au-delà (le port ne reprend pas un son déjà confié) ; le tempo ne change donc qu’à la fin d’une respiration. Un `stop()` ou un autre `begin()` pendant `clock.settle()` ne laisse rien programmer (`TransportStopped`) : quitter pendant la mise en route est silencieux.
- **Première rencontre** (aucune tentative de l’exercice) : la consigne sur l’écran de départ, puis l’entrée en jeu allongée de la longueur de la figure, jouée en démonstration (`Transport.begin({ listenInBars })`). La consigne n’est donnée qu’à la première rencontre, pas à chaque nouvelle figure ou nouvel accompagnement.
- **Écouter la figure** : le cycle d’écoute est **inséré** avant le prochain cycle joué, sans le remplacer (un cycle de plus par écoute), et montre le curseur à tous les niveaux : une démonstration montre où en est la figure.
- Les mesures d’écoute ne sont jamais muettes. Un cycle est jugé `SETTLE_AFTER_BARS` après sa fin. Une série dure `RHYTHM_SERIES_MS` en temps réel, pauses comprises, et finit avec la suite en cours.
- `PlayView.audioError: 'bleed'` à l’écran de départ quand `Settings.clickBleed` ; le jeu n’est pas refusé. Le détecteur de notes est ouvert pour ouvrir l’entrée partagée et tourne à côté pendant la série.

### Réécoute

- `TakeBufferPort` gagne **`keepUntil(to)`** (la suite cesse d’être gardée à sa fin : une respiration ou une pause ne la pousse pas hors de la mémoire) et **`stopKeeping()`** (pause, quitter, fin : ce qui est gardé reste entier, un début demandé d’avance est abandonné). Un `keepFrom` futur n’oublie la prise précédente qu’une fois atteint : la suite reste réécoutable pendant la dernière mesure de la respiration.
- **Plafond `TAKE_BUFFER_MAX_S` = 120 s** au lieu de 60 : la suite la plus lente du catalogue (mesures silencieuses) dure environ 70 s.
- La réécoute s’arrête au plus tard une seconde après la durée de la prise ; la résonance après la fin de la suite est coupée.
- **Limite connue** : réécouter à une respiration alors que le temps de la série est écoulé fait continuer la série au lieu de la finir.

### Stockage

- Dexie 8 et sauvegarde 4 au modèle cible, comme prévu ; le plan résolu d’un cycle est `CyclePlanRecord` (figure en JSON versionné, accompagnement, tempo, fenêtre, seuils). `Settings.latency` (par capteur, avec sa provenance) et `clickBleed` remplacent `calibrationOffsetMs`, qui devient la latence `player` des capteurs `note` et `chord`. `SessionRecord.exerciseId` nomme l’exercice d’une séance `'exercise'` ; `levelReached`, facultatif, garde le niveau tenu en fin de série pour le bilan.
- **La chaîne `migrations/` ne porte encore que l’étape 7 → 8** (sauvegarde 3 → 4), appliquée par la mise à niveau Dexie comme par l’import. Elle fige la correspondance mécanique → relation de la version 7 (`V7_RELATIONS`, confrontée au registre vivant par un test) ; une mécanique inconnue fait échouer la mise à niveau et laisse la base en version 7. Les étapes plus anciennes (`db.ts`, `legacy/`) y seront ramenées à la migration (H) ; les sauvegardes 1 et 2 passent d’abord par les conversions anciennes (`fromV1`, `legacy/v2.ts`).
- Le fichier de sauvegarde version 3 des tests est produit par l’export actuel sur des données représentatives, en attendant un vrai export.
- `Verdict` devient `ResponseVerdict` ; jusqu’à H, l’enregistreur calcule la réussite des relations existantes par `isResponseSuccess`, et `TimingRelation.isDirectRecall` lit `success`. `correct: boolean | null` n’est pas encore dans `RoundObservation` ni dans le retour de `MechanicRules.judge` : il y vient en H.

### Vue `rhythm-figure`

- **`notationReady()`** : la gravure attend la police Bravura (gravée avant, `noteX` était décalé de 12,8 px). `FigureLayout` gagne `noteLine`, `lineY`, `rowHeight` et `barWidth`, pour placer curseur et marques sur une figure repliée ; toutes les mesures ont la même largeur.
- **`cycleMarks(…, beatMs)` et `Mark.line`** : le rapport ne porte pas le tempo (les marques sont mises à l’échelle du tempo de la suite jouée) et `noteX` repart à chaque ligne.
- **Phrase du retour** : un cycle raté dit d’abord les raisons du juge, dans l’ordre du juge ; les seuils `WORDS_MIN_MS` et `WORDS_MIN_DRIFT_MS_PER_BAR` ne coupent que les cycles réussis.
- **Reporté au plan 2** : « temps perdu » n’est pas dessiné sur sa mesure. Les attaques ajoutées sont dessinées là où elles sont tombées, entre les notes qui les entourent (`CycleReport.extraAtMs`, en ms depuis le début du cycle, latence retirée) ; un rapport d’avant ce champ les dessine encore après la dernière note.
- Les marques de toute la suite sont dessinées sur sa dernière figure : juste pour le catalogue (une seule ligne de lecture par suite, aucun cycle qui commence au milieu d’une figure).
- `PlayFrame` garde l’apparence Game Boy pendant ce plan ; seul le contenu de la vue de rythme suit la nouvelle direction (tokens existants, aucun élément de pixel art). `/dev/rhythm` montre la vue ; `scripts/functional-ui.mjs` la vérifie (police, glyphes, curseur absent d’une mesure muette, texte ≥ 16 px).
- **Bilan minimal** (`SessionSummary.rhythm`) : niveau atteint, cycles réussis, dont réussis avec une aide que le niveau ne donne pas ; le reste au plan 2. À l’accueil, « Rythme » ouvre la liste des trois exercices.

### Calibration et essai à deux entrées

- **Essai à deux entrées** (page jetable `/dev/two-inputs`, retirée ensuite ; 2026-10-16, Fractal FM3 et micro d’un MacBook Pro) : **les deux entrées s’ouvrent ensemble** dans Chrome comme dans Firefox, et les attaques de l’interface trouvent presque toutes leur paire au micro.

  |                                              | Chrome                | Firefox                            |
  | -------------------------------------------- | --------------------- | ---------------------------------- |
  | Attaques interface / micro                   | 43 / 137              | 26 / 29                            |
  | Paires (sans paire : interface, micro)       | 42 (1, 95)            | 25 (1, 4)                          |
  | Décalage `t_interface − t_micro`             | −29,73 ms             | −121,42 ms                         |
  | Dispersion (MAD), écart maximal à la médiane | 2,32 ms, 13,53 ms     | 4,79 ms, 20,06 ms                  |
  | Canaux, débit annoncés (interface ; micro)   | 2, 48 kHz ; 1, 48 kHz | 4, 0 Hz ; 3, 0 Hz (non renseignés) |

  Ce qu’on en retient pour la calibration :
  - **La comparaison est faisable** : le décalage est stable (MAD de 2 à 5 ms), mais il dépend du navigateur (−30 ms dans Chrome, −121 ms dans Firefox). La latence se mesure donc par navigateur et par appareil, jamais une fois pour toutes.
  - **Le micro de Chrome entend tout** : la respiration, les clics, le clavier, la main posée sur l’ordinateur (95 attaques sans paire). Firefox traite le micro intégré (gain bien plus faible). La comparaison n’utilise donc que des paires : on part des attaques de l’interface, et une attaque du micro ne compte que si elle tombe dans la fenêtre d’une attaque de l’interface. Le décalage retenu est une médiane, et la calibration exige un nombre minimal de paires.
  - **L’étalonnage du micro sur les clics** (étape 1) demande le silence : les bruits de la pièce y deviennent des attaques. Il ne garde que les clics entendus à un écart commun (voir la calibration ci-dessous).
  - **Le niveau de l’interface était très bas** (jauge presque vide), et pourtant les attaques ont été détectées. Un niveau trop faible reste à signaler au joueur.

- **Calibration par comparaison faite** (`CalibrationService`, `calibration/compare.ts`), sur l’entrée choisie à l’écran (`run(deviceId, …)`), écrite (entrée, `latency`, `clickBleed`) seulement en cas de réussite :
  - écoute de `BLEED_CHECK_CLICKS` clics (`loopLatency`) : chaque attaque dans `LISTEN_WINDOW_S` après un clic est un écart candidat ; on garde l’amas du mode (à `PAIR_WINDOW_S` près) et un clic n’est entendu que par un candidat de l’amas, le plus proche de son centre. `R` compte si au moins `LISTEN_MIN_HEARD_RATIO` des clics sont dans l’amas et sa dispersion sous `LISTEN_MAX_SPREAD_MS`. La fuite du clic (`clickBleed`) se compte de même, sur l’amas, au moins `CLICK_BLEED_RATIO` des clics ;
  - interface : la fuite est mesurée sur l’interface pendant l’écoute ; le micro de l’ordinateur, deuxième `WebAudioInput` ouvert brut (`raw`, sans le traitement de voix de Firefox), donne `R`. Micro intégré comme entrée de jeu : l’écoute donne `R` (casque contre le micro), puis une vérification de la fuite à part (`'bleed'`, « Remets ton casque, et ne joue pas. », `BLEED_CHECK_CLICKS` clics) décide `clickBleed` ;
  - puis `CALIBRATION_ATTACKS` notes libres (comptées sur les attaques de l’interface, ou sur les notes au micro intégré, qui entend la pièce) : `pairedDelay` cherche le décalage constant sur ±`OFFSET_SEARCH_S` (mode des écarts), apparie un à un dans `PAIR_WINDOW_S` autour, en partant des attaques de l’interface, et exige `COMPARE_MIN_PAIRS` paires et une dispersion sous `COMPARE_MAX_SPREAD_MS` (sinon `inconsistent` ; micro muet pendant le jeu : `second-input`) ;
  - `note` = `chord` = `attack` + retard du détecteur de notes, apparié en partant des notes (au moins `NOTE_DELAY_MIN_PAIRS` et `MIN_PAIRED_SHARE` des notes) ;
  - **aucun repli silencieux** (après le premier essai sur le matériel, Chrome, FM3, enceintes de studio par l’interface : la référence avait échoué et la calibration était passée sans le dire au clic, qui comptait même les notes à contretemps) : quand la référence échoue, le run s’arrête sur `{ ok: false, reason: 'reference', detail }` (micro trouvé et son nom, ouvert ou non, clics entendus sur `BLEED_CHECK_CLICKS`, écart commun et dispersion), dit à l’écran avec « Réessayer » ; la calibration au clic (`runOnClick`, `player` pour toutes les entrées, fuite non vérifiée : `clickBleed: null`, la valeur connue est gardée) n’est qu’un second choix du joueur, « Calibrer sur mon jeu au clic », qui « mesure aussi ton jeu ». Une note n’y compte qu’à `PLAY_MAX_OFFSET_MS` (150 ms) d’un clic ;
  - **la mesure est montrée** (`CalibrationMeasure`) : `R` du micro sur les clics et sa dispersion, interface − micro, paires sur notes jouées, dispersion, latence obtenue ; de même sur un échec `inconsistent`. La comparaison ne joue aucun clic : elle ne compare que les attaques du joueur ;
  - **le micro de référence a son propre seuil** (`REFERENCE_ATTACK_CONFIG`, `delta` 2 au lieu de 3,5) : au seuil par défaut, un clic de l’application sous environ −25 dBFS au capteur (−43 dBFS au micro brut, gain 8) n’est pas entendu du tout ; à 2, il l’est jusqu’à environ −30 dBFS, daté à moins d’une milliseconde. Sur les prises réelles au micro de l’appareil, le clic du corpus revient à 52,3, 53,4 et 53,4 ms : la datation n’est pas en cause, `LISTEN_MAX_SPREAD_MS` (5 ms) non plus. En développement, chaque phase écrit ses données brutes à la console (`[calibration] listen`, `bleed`, `compare`, `play`) ;
  - `MIC_DISTANCE_MS` (`d`) est négligé ; quand le micro entend la guitare par les enceintes de l’interface (monitoring direct), le traitement de l’interface et l’air jusqu’au micro y ajoutent quelques millisecondes, dont la latence de l’interface se trouve minorée d’autant (le micro l’entend plus tard, l’écart interface − micro diminue).
  - **Essai de la calibration (2026-10-16, FM3, enceintes sur l’interface)** : dans Chrome, le micro entend les 8 clics à 50,5–51 ms (± 0,1–0,5 ms). Une comparaison réussit (16 paires, interface − micro −27,1 ms, dispersion 0,03 ms) ; une autre est refusée (dispersion 9,4 ms) : au seuil abaissé (`delta` 2), le micro lit la tenue des notes dans les enceintes comme des attaques toutes les 30 ms environ, et l’appariement s’y trompe. Dans Firefox, le micro de l’ordinateur n’entend aucun clic en brut (0/8, même très fort), et en traitement de voix seulement le premier : l’annulation d’écho efface la suite. La calibration se fait donc dans Chrome ; l’écran le dit. Laissé en l’état : la lecture du micro pendant la comparaison (seuil propre à cette phase) et Firefox.
  - Sans recalibration, `attack` prend toujours la latence `note` en `player`. Une erreur d’ouverture de l’entrée est dite à l’écran.
- `clickBleed` à l’écran de départ : la consigne d’une première rencontre est montrée sous l’alerte, plus remplacée par elle.

### Risques connus (plan A)

- **Accord plaqué lentement** (prise 12) : lu comme une seule attaque seulement pour `delta` entre 3,25 et 3,75 ; aucun test ne fixe cette borne, à régler à la journée de validation.
- **Micro de l’appareil** : 0 à 2 fausses attaques par extrait dans le bruit ; à régler à la journée de validation.
- `delta` et `strengthFloor` sont absolus, alors que l’échelle du flux dépend du débit : 16 kHz n’est pas essayé sur du son réel.
- **Bandes graves dédoublées** : une bande plus étroite qu’une raie de la FFT prend la raie la plus proche, si bien que plusieurs bandes graves lisent la même raie et que le grave pèse plus dans le flux ; laissé au réglage de la journée de validation.
- **`AttackTracker` ne se charge pas sous Node** (imports sans extension) : le script de l’oracle (plan 2) devra le charger par Vite ou corriger ses imports.
- **Un cycle par série** (provisoire, pour juger le moteur) : `LevelParams.cyclesPerSeries` (absent : la série dure `RHYTHM_SERIES_MS`) vaut 1 sur les trois exercices ; la série s’arrête une fois ce cycle réglé, sans souffle, les niveaux avançant comme avant. Le bilan (`RhythmSummary.lastCycle`) montre le rapport du cycle : verdict, mesures et seuils, fidélité, décalage, latence, chaque attaque.
- **Départ d’un exercice, en données** : `LevelParams.listenInBars` (entier ≥ 0, défaut `LISTEN_IN_BARS` = 2) et `countIn` (défaut vrai) ; `Transport.begin`, `changeTempo` et la reprise après une pause les suivent : sans mesure comptée le jeu commence juste après la mise en oreille, aucun clic de compte, `countdownAt` nul. `resolveLevel` refuse `countIn: false` avec `listenInBars: 0`. « Métronome sur 2 et 4 » est sans mesure comptée.

## Amendement (2026-10-17) : la séance en segments

Décidé dans la conversation du 2026-10-17, en préparant le plan 2. Il remplace la section 6, réoriente le plan 2 et étend H. Constat de départ : le plan 2 tel qu’il était listé développait des exercices (une durée de série propre au rythme, un diagnostic du rythme, un bilan du rythme), alors que le but est un moteur qui permet de les construire.

### Décisions

- **Aucune frontière entre familles d’exercices.** `SessionKind` (`learn`, `free`, `triads`, `triads-zone`, `gesture`, `exercise`) disparaît : une séance est une suite de **séries**, une série étant un exercice joué d’affilée. Ce qui distingue aujourd’hui les sortes de séance devient soit une donnée de l’exercice, soit le **choix des items**, qui ne dépend d’aucune famille (section « Le choix des items » ci-dessous). Les types propres à une famille (`isTriadsKind`, `AppServices.triads()`, `gesture()`) disparaissent avec elle. **Quand** : au chantier 2 de `docs/vision.md`, avec les parcours en données qui remplacent les entrées de l’accueil ; le plan 2 et H n’ajoutent aucune dépendance à `SessionKind` et s’appuient sur les séries et le choix des items.
- **La durée d’une séance appartient à la séance.** `LEARN_SESSION_MS`, `GESTURE_SESSION_MS` et `RHYTHM_SERIES_MS` (trois fois 5 minutes) deviennent un seul paramètre de séance, `SESSION_MS` par défaut, que le planificateur fixera (chantier 5). `LevelParams.cyclesPerSeries` (provisoire, un cycle par série) est retiré.
- **Deux pièces, aucune théorie de plus** : une **trace** (ce qui a eu lieu) et une **politique** (ce qui vient ensuite). Les ensembles décrivent la trace (des intervalles emboîtés), pas la génération : une série réagit (niveau, écoute demandée, blocage, fin du temps), ce qu’aucun ensemble ni aucune grammaire ne dit. Les statecharts seraient la théorie exacte du problème ; ils ne sont pas introduits tant qu’aucun exercice ne l’exige.
- **La trace n’est pas stockée pour l’instant** : elle vit en mémoire le temps de la séance et sert au bilan. **On la stockera pour l’analyse entre séances** (profil de groove, part du temps joué au fil des jours) quand la première analyse la lira ; ajouter un champ non indexé ne demande pas de nouvelle version de schéma. Les tentatives gardent déjà leur plan résolu et leurs instants ; seuls les segments sans tentative (mise en oreille, respirations, écoutes) sont perdus d’ici là.
- **Pas de note de ressenti** pour l’instant : une donnée n’a de valeur que si on l’utilise. Si elle revient, ce sera du texte libre (`SessionRecord.remark`), lisible par un prof ou un LLM.
- **Pas de champ « exercice voisin »** : une arête du graphe des compétences écrite avant le graphe. « On change d’air » propose les autres exercices (section « Contre le blocage » ci-dessous) ; le voisin viendra du graphe (chantier 5).

### La trace : des segments emboîtés

```ts
type TimePoint = { at: Fraction } | { ms: number }; // sur la carte de tempo, ou en temps libre

interface Segment {
	role: SegmentRole;
	start: TimePoint;
	end: TimePoint; // l’instant réel de fin, coupure comprise
	ended: 'done' | 'interrupted'; // une pause, « Quitter », la fin du temps
	exerciseId?: ExerciseId;
	item?: string;
	level?: number;
	attemptId?: string; // pour un tour joué
	children: Segment[];
}
```

- **Famille laminaire** : deux segments sont disjoints ou l’un contient l’autre. Le bilan, la réécoute et les observations la lisent (une suite réécoutée est la prise découpée sur son intervalle).
- **La trace dit ce qui s’est passé, pas ce qui était prévu** : un segment prévu mais jamais joué n’y entre pas ; un segment coupé finit à l’instant de la coupure et porte `interrupted`.
- **Temps musical ou temps libre** : un segment est placé sur la carte de tempo (en fractions, un changement de tempo n’y casse rien), sauf en temps libre (identifier, une consigne, une pause), où il l’est en millisecondes.
- **Rôles, avec le mot de l’écran** (noms à valider avec le plan) :

| Rôle        | À l’écran       | Ce que c’est                                                              |
| ----------- | --------------- | ------------------------------------------------------------------------- |
| `session`   | séance          | la racine                                                                 |
| `series`    | série           | un exercice joué d’affilée                                                |
| `run`       | (aucun)         | les tours entre deux respirations ; mot d’écran seulement s’il en faut un |
| `listen-in` | mise en oreille | l’accompagnement seul, on ne joue pas                                     |
| `rest`      | silence         | les mesures muettes avant une mesure comptée                              |
| `count-in`  | mesure comptée  |                                                                           |
| `round`     | tour, cycle     | un tour jugé ; un cycle est un tour de `unit: 'cycle'`                    |
| `listen`    | écoute          | la figure jouée par l’application, sans jugement                          |
| `breath`    | respiration     | on ne joue pas, le retour s’affiche                                       |
| `briefing`  | consigne        | l’arrêt sur le `howTo`                                                    |
| `pause`     | pause           |                                                                           |

- **« Séquence » retrouve un seul sens** : plusieurs cibles dans un tour (titre de cette spec). L’essai `SEQUENCE_LENGTH` / `SEQUENCES_ENABLED` des notes, qui portait le même mot, est supprimé à H s’il n’a pas été justifié par l’usage (comme le prévoit `docs/vision.md`), renommé sinon.

### La politique : une seule fonction `next`

- **Pure, dans le domaine, une pour tous les exercices** : `next(state, event) → SegmentIntent | end`. L’état porte la série en cours, l’état de niveau, les derniers résultats, les demandes du joueur (écouter), le temps écoulé et le budget de la séance ; l’événement est un tour jugé, une demande, une pause, une reprise, la fin d’un segment. Elle rend le prochain segment à jouer (rôle, longueur, plan du tour, accompagnement, tempo) ou la fin.
- **L’exercice ne donne que des données** (paramètres résolus par niveau : mise en oreille, mesure comptée, tours par respiration, longueur de la respiration, échelle de niveaux) ; ce que la série joue (quel exercice, quel item) vient du choix des items, pas de l’exercice.
- **Le contrôleur exécute** : il programme les segments par le transport, ouvre et règle les tours, enregistre les tentatives et la trace. Il ne décide plus de l’enchaînement.
- À H, les sélecteurs actuels (`learnSelector`, `triadSelector`, `gestureSelector`, `createListSelector`) passent sur ce même contrat ; aucun chemin parallèle ne reste.

### Le choix des items

- **Un choix parmi des candidats** (exercice × item), comme le planificateur de `docs/vision.md` : urgence (probabilité d’oubli), frange (le graphe des prérequis : acquis, pas maîtrisé), faiblesse (confusions récentes), objectif, moins la fatigue et la répétition. Le graphe en est une source parmi d’autres ; aucune source n’est propre à une famille d’exercices.
- **La mémoire n’est pas une famille d’exercices.** Elle vaut pour tout ce qui s’apprend : les notes du manche, les formes, le geste (la mémoire musculaire). Le modèle de l’apprenant pose deux questions aux mêmes observations de n’importe quelle compétence : **ce qui reste sans pratique** (rétention : le froid, FSRS) et **ce qui progresse avec la pratique** (acquisition : courbes de tempo, de précision). Les deux sont deux projections d’un seul état par (compétence, item). L’actuel `learner: 'card' | 'skill'` par mécanique, qui range les notes du côté « mémoire » et le geste du côté « compétence », est l’erreur que le chantier 5 corrige (`docs/vision.md`, « À reconstruire »).
- **Les niveaux ne sont pas un modèle de l’apprenant** : ils règlent la difficulté que l’exercice présente ; le choix des items les lit comme un état, au même titre que la rétention.
- **La création n’est pas de la récitation** : un exercice d’improvisation ne rappelle pas une réponse, il est jugé sur un ensemble admis (chantier 3). Ce qui s’y retient (le vocabulaire, les formes) relève de la rétention ; ce qui s’y produit relève de l’acquisition.
- **Dans ce chantier** : le contrat du choix (`choose(candidates, state)`), avec le seul cas d’une séance d’un exercice (son item, ou ses figures dans l’ordre de l’exercice) ; les sélecteurs actuels y passent à H ; le score et le graphe viennent au chantier 5.

### Contre le blocage, dans la politique

- Après `BLOCK_AFTER_FAILS` tours ratés d’affilée au niveau 1, `diagnoseBlock(reports)` lit les verdicts **par attente** des derniers tours (tout tour sur un plan en a ; il ne sait rien du rythme) et rend :
  - `reading` : les mêmes attentes ratent, ou des ajoutées reviennent aux mêmes endroits, sur au moins `BLOCK_SAME_SPOT_CYCLES` des tours (le joueur ne sait pas quoi jouer : il joue le 1 que la figure n’a pas) ;
  - `execution` : la figure est jouée fidèlement, ce sont les mesures (régularité, tenue) ou un décalage qui reviennent qui font rater (il sait quoi jouer, pas en place) ;
  - `unclear` : les signes se mêlent ; l’application ne prétend pas savoir.
- **Remèdes**, dans l’ordre : `reading` → un tour d’écoute, puis un tour « joué avec » si l’exercice sait faire sonner son contenu, sinon le niveau d’aide ; `execution` → le niveau d’aide (le plus proche du niveau 1) ; `unclear` → un tour d’écoute, puis le niveau d’aide. Un tour joué avec une aide la porte dans `aids` et ne compte jamais pour monter.
- **Au bout** (encore `BLOCK_AFTER_FAILS` échecs au niveau d’aide le plus bas) : « On change d’air » : la série se termine, le bilan nomme la mesure qui casse, l’écran propose les autres exercices ; l’exercice bloqué n’est pas proposé avant la séance suivante (`LevelState.resumeAfter`). La boucle a donc une fin.
- Seuils en constantes nommées, réglés à la journée de validation.

### Le bilan, sur la trace

Calculé sur la trace de n’importe quel exercice à plan, sans branche par famille : par série, le niveau atteint et les changements de niveau, les tours réussis (aidés à part), les écoutes, la part du temps joué (tours sur la durée de la série), la tendance des mesures par suite, la mesure qui casse en cas de blocage, et **une réécoute par suite** (la mémoire tampon garde toute la séance, en mémoire seulement, plafond `SESSION_TAKE_MAX_S` ; environ 29 Mo pour 5 minutes en mono 16 bits à 48 kHz). En développement, chaque tour raté se conteste avec sa raison.

### Le lexique et l’oracle, génériques

- **Lexique** : un terme pour chaque `MeasureId`, chaque raison d’échec, chaque rôle montré et « niveau » / « niveau d’aide » ; un test exige qu’aucun identifiant affiché n’en manque.
- **Oracle** : un format par capteur (un WAV tiré du journal de diagnostic, des étiquettes Audacity des événements du capteur) ; le script compare les événements et rejoue le juge sur les étiquettes corrigées. Le capteur d’attaques en premier ; le vérificateur d’accords et la vérification de hauteur passeront par le même banc.

### Vérification sur le papier

| Exercice ou relation    | En segments                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesures silencieuses    | `series` := `listen-in` `count-in` (`run` := `round`×4 `breath`)\* ; un tour commence sur la première mesure muette ; un changement de tempo à une respiration : `listen-in` `count-in` à nouveau           |
| Métronome sur 2 et 4    | `series` := `listen-in` (`run` := `round` `breath`)\*, sans `count-in` (une ligne par tour)                                                                                                                 |
| Contretemps             | comme les mesures silencieuses                                                                                                                                                                              |
| `beat` (localiser)      | `series` := `count-in` (`round` `breath`)\* ; la consigne est dans le plan du tour (`prompt` à −avance) ; `breath` = la mesure de respiration ; un changement d’avance : `rest` facultatif puis `count-in`  |
| `anchor` (triades)      | comme `beat`, un tour d’une mesure                                                                                                                                                                          |
| `gridChange` (geste)    | `run` := `round`+ enchaînés par `handover`, sans respiration ; entre deux passages, `count-in` si la scène, le tempo ou `countIn` change ; un tour de relier raté rejoué tout de suite, enchaîné            |
| `free` (identifier)     | `round`\* en temps libre (`{ ms }`), sans carte de tempo                                                                                                                                                    |
| Apprentissage des notes | une `series` de « localiser » dont les items viennent du choix des items (aujourd’hui : retests, révisions à froid, introduction, consolidation) ; changement d’exercice dans la séance = nouvelle `series` |
| `howTo`, pause          | `briefing` et `pause` en temps libre ; le segment coupé par une pause porte `interrupted`                                                                                                                   |

Rien n’échoue sur le papier. Ce qui reste hors des segments, et y reste : la fatigue (une lecture des tentatives), la fenêtre de contestation (un état de l’écran).

### Ce que ça change à l’ordre de construction

- **Plan 2**, réglé sur ce que la journée de validation (G) demande : la trace et la politique pour les séances d’exercice (`PlanSessionController` exécute `next`), retrait de `cyclesPerSeries`, l’anti-blocage dans la politique, la mémoire tampon de séance et le bilan sur la trace (une réécoute par suite), le lexique, la contestation par raison (développement), l’oracle, « temps perdu » dessiné sur sa mesure. Ce que G ne lit pas attend : le contrat `choose` au-delà d’une séance d’un exercice, les segments en temps libre, `SESSION_MS` pour les séances des notes, des triades et du geste.
- **H** : les quatre relations et les sélecteurs passent sur la politique et la trace (segments en temps libre compris) ; `SESSION_MS` devient la durée de toutes les séances. Le schéma ne change pas à H (revu le 2026-10-23 : Dexie 9 à H, voir l’amendement).
- **Chantier 2** : la fin de `SessionKind` avec les parcours en données ; `SessionRecord.kind` est remplacé par ses séries (Dexie 10, sauvegarde 6, une étape de plus dans `migrations/` ; la version 9 est prise par H).

### Réalisation du plan 2 (2026-10-17)

Branche `plan/temps-musical-2`, plan `docs/superpowers/plans/2026-10-17-2-avant-validation.md`. Ce que la réalisation a décidé contre l’amendement ou le plan :

- **Les instants de la trace sont des secondes de l’horloge audio** (`startS`, `endS`), pas des `TimePoint` : le transport recrée sa carte de tempo à chaque reprise après une pause ; l’horloge audio est la seule commune à toute la séance et vaut aussi pour le temps libre. `TraceBuilder.startOf` s’ajoute : une coupure est ramenée au début d’un segment ouvert par un réveil en avance.
- **`resumeAfter`** = l’instant du « On change d’air » + `BLOCK_REST_MS` (1 h) ; l’exercice reste jouable, l’accueil le marque « On y revient plus tard ». Une fois l’air changé, les cycles qui se règlent encore (posés d’avance) ne touchent plus l’état de niveau.
- Un blocage `unclear` d’un exercice qui ne sait pas faire sonner son contenu passe directement au niveau d’aide.
- **La mémoire des prises garde des `Float32`**, pas des entiers 16 bits : environ 69 Mo pour 6 min à 48 kHz, en mémoire seulement.
- **Contester** se fait depuis le bilan seulement (la réécoute de chaque suite y est), et seulement en développement (`development`, depuis `dev`) ; le rapport complet du dernier cycle aussi.
- **Le bilan détaillé** n’existe que tant que la séance est dans `SessionMemory` : rouvert après un rechargement, il ne montre que les comptes.
- La ligne sans phrase simple dit le terme entier et son nombre (« fidélité à la figure 3/4 », « tenue −35 ms »).
- **L’oracle se compare dans la page** `/diagnostic/oracle` (`DiagnosticsService.oracleReport`), pas par un script Node : les modules du domaine ne se chargent pas sous Node sans Vite. Les types du rapport sont dans `application/ports/oracle.ts`.
- `SessionSummary.rhythm` devient `SessionSummary.exercise` (`ExerciseSummary`, `summarizeExercise`).
- `scripts/functional-ui.mjs` échoue sur 9 vérifications anciennes (accueil, bilan, carte, calibration) au commit de départ comme après ; les nouvelles (temps perdu, jouer avec) passent, aucun texte sous 16 px.
- **Après la relecture de la branche** : l’anti-blocage n’agit que sur les échecs de la série en cours (`recent`), jamais sur ceux gardés d’une séance précédente ; « On change d’air » écarte le cycle déjà posé d’avance mais pas commencé (le clic de la mesure suivante sonne encore jusqu’au règlement du cycle en cours, un quart de mesure) ; une pause une fois la fin décidée termine la série ; un tour coupé ne compte pas comme joué dans le bilan ; le plan résolu d’un cycle garde son instant audio (`CyclePlanRecord.startAudioS`), sur lequel l’oracle le place (sans lui, par la correspondance horloge murale ↔ audio de la prise, décalée de la latence de sortie).

## Amendement (2026-10-23) : la migration (H) comme généralisation

Décidé dans la conversation du 2026-10-23, après la journée de validation (G, faite : voir section 11). Il précise H et remplace, pour H, ce que la section 11 et l’amendement du 2026-10-17 en disaient quand ils le contredisent.

### Le principe

H ne vaut que s’il **généralise** : supprimer les quatre relations et les sélecteurs n’a d’intérêt que si ce qui les remplace sert à écrire de nouveaux exercices **sans nouveau code**. Réécrire la même spécialisation ailleurs n’est pas un gain. Chaque pièce de H est donc une primitive du moteur, branchée par des données ; ce qui reste propre à un exercice passe derrière une interface, et n’est généralisé que quand un deuxième exercice réel le demande (règle de `docs/vision.md`).

Corollaire, pour tout ce que H remplace : on ne reproduit pas l’ancien comportement pour lui-même. Ce qui compte est que le joueur progresse ; un autre ordre des items, une règle en moins, sont bienvenus s’ils ne nuisent pas à l’apprentissage et simplifient le moteur.

### Décisions

- **H porte aussi les notes et les triades sur `PlayFrame`** (fin de `PlayScreen`) : la forme du verdict que l’écran lit change à H, le travail ne se fait qu’une fois. Retiré du chantier 2 (`docs/vision.md`).
- **Les séquences (`SEQUENCES_ENABLED`, `sequence.ts`) sont supprimées** : l’usage ne les a pas justifiées ; l’auteur testera sans elles. Un changement d’avance n’est plus annoncé par une mesure comptée.
- **Un seul moteur de tour** pour tous les plans, à emplacements (ci-dessous) ; écarté : deux moteurs côte à côte (la séquence avec contenu en demanderait un troisième), un compilateur et une machine par relation (la spécialisation déplacée).
- **Une seule procédure d’apprentissage** pour les items à retenir, qui remplace `learnSelector` et `triadSelector` (les mêmes notions en double) ; le générateur du geste passe derrière l’interface des sources d’items sans être réécrit.
- **Un seul contrôleur**, `PlanSessionController` élargi et découpé, qui reprend le nom `SessionController`.
- **Le stockage change à H** : l’avance quitte `CardState` pour `levelStates` (Dexie 9, sauvegarde 5). Le chantier 2 prend la version 10.

### 1. Les pièces et les plans

De bas en haut :

1. **Le moteur de tour** (domaine) : juge tout `RoundPlan` par trois emplacements (juge de contenu, appariement, verdict) ; le direct est une responsabilité à part.
2. **La procédure d’apprentissage, les sources d’items, `choose`** (domaine).
3. **Le contrôleur unique** (application) : exécute ce que la politique `next` décide, en temps musical ou en temps libre.
4. **Les vues** (interface) : la piste et le clavier entrent dans le registre de `PlayFrame`.

| Plan   | Contenu                                                                                                                                 | Touche l’existant   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **H1** | moteur de tour, registres de modes et juges de contenu, à côté ; les specs de `beat`, `anchor`, `gridChange`, `free` rejouées sur lui   | non                 |
| **H2** | procédure d’apprentissage, sources d’items, `choose`, à côté ; règles pédagogiques en invariants                                        | non                 |
| **H3** | le contrôleur unique joue tout ; notes, triades et geste y basculent une mécanique à la fois ; suppression de l’ancien chemin ; Dexie 9 | oui, la bascule     |
| **H4** | briques et vues piste et clavier dans `PlayFrame` ; suppression de `PlayScreen`                                                         | interface seulement |

Une branche à la fois. H4 après H3 : brancher les vues sur l’ancien contrôleur serait du travail fait deux fois.

### 2. Le moteur de tour

**La politique du plan nomme ses modes.** `RoundPolicy` cesse d’être une liste de drapeaux (`firstAnswerOnly`, `lateCapture`, `provisional`) :

```ts
interface RoundPolicy {
	unit: 'response' | 'cycle';
	pairing: { mode: 'first-answer'; lateCaptureMs: number | null } | { mode: 'alignment' };
	verdict: 'response' | 'cycle';
	/** Un premier verdict faux peut être corrigé par une réponse juste plus tard dans l’étendue. */
	correction: boolean;
}
```

`unit` reste ce qu’il est (ce qui clôt le tour : une réponse ou le cycle entier ; la trace le lit) ; `verdict` nomme le mode de verdict, qui porte aujourd’hui le même nom que l’unité sans lui être lié. Les noms de champs sont ceux du plan H1 ; les réglages d’un mode (`lateCaptureMs`, et ce que H1 y trouve) sont des données du mode, pas du moteur. Le plan résolu reste du JSON stocké avec la tentative.

**`Expectation.at` peut être `null`** : une attente en **temps libre** (identifier), à laquelle on répond quand on veut ; seul le temps de réaction se mesure.

**Les trois emplacements, chacun un registre** (comme `PLAY_VIEWS`, `MECHANIC_RULES`) :

1. **Juge de contenu**, par sorte de contenu, pas par mécanique : `note` (la hauteur sur la corde, avec ses confusions : nom de la corde à vide, une case à côté…), `chord` (la forme lue par le vérificateur), `name` (le nom tapé). Il rend `{ correct, answer, confusion }`. Les `judge` des mécaniques y migrent ; un nouvel exercice qui attend une note sur une corde réutilise `note`.
2. **Appariement** : quelle observation répond à quelle attente, et le sort de chaque observation (`answer`, `IgnoreReason`, `other-sensor`, `unreadable`).
   - `first-answer` : la fenêtre s’ouvre `MIN_RESPONSE_MS` après la consigne ; la première observation est la réponse, les suivantes sont ignorées ; capture tardive facultative, bornée par l’aperçu de la consigne suivante (`lateCaptureEnd`) ;
   - `alignment` : l’aligneur actuel (`alignAttacks`), tel quel.
3. **Verdict** : de l’appariement au `RoundOutcome` (l’enveloppe déjà stockée).
   - `response` : `perfect` / `early` / `late` / `offbeat` / `corrected` / `wrong`, et `success` (ce que fait `isResponseSuccess` aujourd’hui) ; il porte aussi la lecture du rappel direct (`isDirectRecall`) et celle des verdicts stockés (`responseVerdictOf`) ;
   - `cycle` : `cycleReport`, `cycleVerdict` et les mesures, tels quels.

**Le direct est à part.** Le tour émet des événements communs à tous les modes (`pending`, `provisional`, `settled`) ; c’est le modèle d’écran de l’exercice qui en fait un affichage. L’appariement ne sait pas qu’il y a un écran.

**Le moteur** (`PlanRound` élargi) ne fait que router : il date les attentes sur la carte de tempo, donne chaque observation à l’appariement, celui-ci au juge de contenu, et le tout au verdict à la clôture. Il ne connaît que les interfaces : ajouter ou changer un mode ne le touche pas.

**Les relations actuelles, en plans** :

| Relation                | Attentes                                                  | Appariement                       | Verdict    | Particularité                             |
| ----------------------- | --------------------------------------------------------- | --------------------------------- | ---------- | ----------------------------------------- |
| `beat` (localiser)      | `note` à 0, consigne à −avance                            | `first-answer`, capture tardive   | `response` | respiration après le tour                 |
| `anchor` (triades)      | `note` à 0, puis `chord` du temps 2 à la fin de la mesure | `first-answer`                    | `response` | `correction`                              |
| `gridChange` (geste)    | `chord` à chaque changement, fenêtre `{ ofGap }`          | `first-answer`                    | `response` | `handover` avant le changement suivant    |
| `free` (identifier)     | `name`, `at: null`                                        | `first-answer`                    | `response` | temps libre, pas d’`early` ni d’`offbeat` |
| figures de rythme       | attaques sans contenu                                     | `alignment`                       | `cycle`    | inchangé                                  |
| séquence (S, plus tard) | `note` × N                                                | l’un ou l’autre, selon l’exercice | `cycle`    | sans code de plus                         |

### 3. La procédure d’apprentissage, les sources d’items, `choose`

**La procédure** reprend, sans rien qui nomme les notes ou les triades :

- les catégories, dans l’ordre : retests dus, révisions à froid, items repris, items nouveaux (sous les seuils de réussite), consolidation ; après un raté, un item solide en rattrapage ;
- le cycle d’un item nouveau : sondage sans aide ; réussi, l’item passe en révision (`probeCard`) ; raté, la présentation aidée à la consigne suivante, puis les retests espacés ;
- l’ensemble de travail borné (`MAX_WORKING_SET`) ; le tirage au hasard (injecté) dans une catégorie.

**L’exercice donne en données** : l’univers des items et leur ordre d’introduction ; une relation **voisin** (jamais l’item précédent ni son voisin : le miroir des notes ; « une autre corde si possible » en est une préférence) ; une condition **prêt** (une note attend que son miroir soit acquis) ; son **échelle d’aides** (présentation aidée, corde dessinée qui s’efface après `STRING_AID_FADE_SUCCESSES`).

**Les invariants testés** sont les règles pédagogiques des specs d’apprentissage (2026-10-02, 2026-10-03, 2026-10-08), pas l’ancienne suite d’items : un item nouveau est d’abord sondé sans aide ; un raté revient en retest espacé ; l’aide s’efface après des réussites ; jamais deux fois de suite le même item ni son voisin ; l’ensemble de travail reste borné ; un item nouveau n’arrive que sous les seuils de réussite ; seuls les essais froids nourrissent FSRS (`probeTemperature` inchangé). L’ordre est libre, et la procédure peut viser moins de répétition. **Simplifier fait partie du travail** : une règle des sélecteurs n’est gardée que si elle sert l’apprentissage ; celles que H2 retire sont listées dans le plan avec leur raison, pour que l’auteur tranche.

**L’avance devient un niveau par item.** « Localiser » a des niveaux d’avance 8, 4, 2 tenus dans `LevelState` par carte ; `adjustLead` cède la place à `nextLevelState`, avec `pass = 1` et `drop = 1` (une réussite raccourcit d’un cran, un raté rallonge d’un cran, comme aujourd’hui). On ne descend jamais sous le niveau 1 en ratant : l’avance 8 reste la plus longue. L’avance du rappel direct reste fonction du tempo (aujourd’hui `leadForThreshold`) ; H2 l’écrit en données des niveaux.

**Les sources d’items** : l’interface derrière laquelle passent la procédure d’apprentissage, la liste fixe (jeu libre) et le générateur du geste (passages de grille, rotation des zones, montée qui tourne, tour de relier rejoué), ce dernier sans réécriture. Une source rend le prochain item et prépare son plan de tour ; elle reçoit le résultat de chaque tour.

**`choose`** au-dessus : dans H, le seul cas « une série, un exercice, sa source » ; le chantier 5 y met le score (urgence, frange, faiblesse) en lisant les candidats que les sources exposent.

### 4. Le contrôleur unique

`PlanSessionController` absorbe `SessionController` et reprend son nom. Il est découpé :

| Pièce             | Tâche                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contrôleur        | exécute ce que `next` rend (tour, écoute, respiration, mesure comptée, silence, consigne, fin), en temps musical par le transport, en temps libre par l’horloge seule |
| exécuteur de tour | ouvre le moteur de tour sur le plan, donne aux capteurs leur attente, route les observations, retire les attentes avant la clôture, passe la main (`handover`)        |
| enregistreur      | une tentative par tour et son étendue d’observations (`ObservationSpan`) ; pour les items à retenir, froid ou chaud, FSRS, inchangés                                  |
| modèle d’écran    | l’emplacement de l’exercice qui fait des événements du tour un modèle de vue (`MechanicPresenter.stage`, `rhythmStage`)                                               |
| trace, prises     | inchangées, pour tous les exercices                                                                                                                                   |

- **La politique `next` apprend, en données de l’exercice** : un tour par respiration et une respiration de `RESPIRATION_BARS` (localiser, triades) ; des tours enchaînés par passage de main sans respiration (geste) ; une mesure comptée au changement de scène, de tempo ou d’exercice, avec silence facultatif avant.
- **Une séance qui mêle plusieurs exercices** (l’Apprentissage : localiser et identifier) : chaque changement d’exercice ouvre une série, décidée par `choose` depuis la source.
- **Deviennent communs à tous les exercices** : la réécoute de la dernière suite, l’écoute quand l’exercice sait faire sonner son contenu, la consigne (`howTo`), la fatigue, « Joué juste » (en développement seulement : le juge doit avoir raison seul).
- **`SESSION_MS`** est la durée de toutes les séances (`LEARN_SESSION_MS`, `GESTURE_SESSION_MS` disparaissent).
- **Garde-fous** : le test de frontière (le cœur ne nomme aucune mécanique) couvre le contrôleur unique ; la séance de bout en bout d’une mécanique factice (`thirdMechanic.spec.ts`) passe sur le nouveau chemin.

### 5. Les vues et le contrat d’écran

- **`PlayView` ne garde que ce dont le cadre a besoin** : statut, mesure comptée, consigne, erreur audio, fatigue, « Joué juste », le tempo écrit comme la carte de tempo l’écrit (♩ = 100), et `stage: { view, model }`. Sortent : `beatsPerBar`, `promptBeatIndex`, `targetBeatIndex`, `leadBeats`, `history`, `preview`, `followUp`, `answerChoices`, `chordDiagram`, `scene`, et les champs de `PromptView` / `VerdictView` propres à une mécanique (`detail`, `diagram`, `target`, `band`, `shape`, `heard`, `expected`, `gap`). Ils entrent dans le modèle d’écran de l’exercice, opaque au cœur.
- **`PlayScreen` devient des briques puis des vues** (une vue par mécanique, assemblée de briques communes ; changer l’une ne touche pas l’autre). Briques, reprises de `PlayScreen` avec le travail visuel de da-1 tel quel : la piste, le mot de consigne, le verdict et son écart, la bande de l’accord, la corde dessinée, le clavier de réponse. Vues du registre : `note-lane` (localiser), `triad-lane` (ancrage, zone), `answer-keys` (identifier).
- **La réponse tapée est un capteur** (`tap`), lu par le juge `name` : le contrôleur ne sait plus qu’il existe un pavé.
- **`/session` n’a plus qu’un chemin** (`PlayFrame`) ; `/dev/identify` et `/session/demo` suivent.

### 6. Données, critère de fin, tests, risques

**Données**

- Les tentatives stockées ne changent pas : `success`, `correct`, l’enveloppe `verdict` et `plan` y sont ; `responseVerdictOf` passe dans le mode de verdict `response`.
- Le plan résolu d’une tentative des notes et des triades est désormais un vrai `RoundPlan`, politique comprise ; les tentatives anciennes gardent le leur.
- **Dexie 9, sauvegarde 5** : une étape pure dans `migrations/` (`v9.ts`), appliquée par la mise à niveau et par l’import, copie l’avance de chaque carte (`CardState.leadBeats`) dans `levelStates` (clé `[exerciseId+scope+item]`) et retire le champ ; son test d’aller-retour.

**Critère de fin.** Une recherche dans le dépôt ne trouve plus : `domain/timing/`, `TimingRelation`, `MetronomePort`, `WebAudioMetronome`, `BEATS_PER_BAR`, `alignedPromptBeat` ; `leadBeats` (hors migrations), `adjustLead`, `learnedLead`, `initialLead`, `laneBeat`, `isResponseSuccess` ; `learnSelector`, `triadSelector`, `sequence.ts`, `SEQUENCES_ENABLED` ; l’ancien `SessionController`, `PlanSessionController` (renommé), `PlayScreen` ; `LEARN_SESSION_MS`, `GESTURE_SESSION_MS`. `SessionKind` reste (chantier 2).

**Tests**

- H1 : les specs des quatre relations rejouées sur le moteur comme cas d’acceptation ; un mode factice branché sans toucher au moteur.
- H2 : les invariants pédagogiques (section 3), sur la procédure seule et pour chaque exercice qui l’utilise.
- H3 : les séances de bout en bout actuelles (`gestureEndToEnd`, `triadsSession`, `thirdMechanic`, `chainedRounds`…) sur le chemin unique ; le test de frontière ; la migration 8 → 9.
- H4 : les specs de `PlayScreen` reportées sur les vues ; `scripts/functional-ui.mjs` sur les mêmes écrans.
- À la fin : une séance réelle de l’auteur, notes, triades, geste et rythme, sans séquences.

**Risques nommés**

- **Perdre une règle qui comptait** en simplifiant la procédure : les invariants en couvrent une partie, la pratique réelle tranche le reste.
- **Le temps réel** : le verdict direct ne prend pas de retard en passant par le moteur ; les attentes du capteur d’accords sont retirées avant la clôture, comme aujourd’hui.
- **La taille de H3** : la bascule se fait mécanique par mécanique dans la même branche, chacune verte avant la suivante, l’ancien code supprimé à la fin.

### Réalisation du plan H1 (2026-10-23)

Branche `plan/temps-musical-h1`, plan `docs/superpowers/plans/2026-10-23-h1-moteur-de-tour.md`. Ce que la réalisation a décidé contre l’amendement ou le plan :

- **La correction ne vaut que pour une attente étendue** (`span: { until }`) dont les attentes précédentes sont justes : la bande où l’on peut rejouer. Une attente ponctuelle se joue une fois, comme l’ancrage le fait déjà.
- **Le tour écoute jusqu’à `listenUntil` les lectures de sa dernière attente.** Une attente qui n’est pas la dernière est décidée à la fin de sa zone : manquée sans réponse, jugée telle qu’elle est avec une lecture en attente. Si une chaîne est rompue (une attente plus tôt manquée, ou répondue par une réponse fausse et définitive), le tour cesse d’écouter à la fin de la dernière zone et sa lecture en attente devient définitive telle quelle ; l’ancrage sans rien joué est donc réglé à la fin de la zone de l’accord, sans attendre `listenUntil`. Un seul mécanisme décide qu’un tour perdu cesse d’écouter : il n’y a pas de `VerdictMode.lost`, le moteur se règle sur `pairing.done(now)` seulement.
- **Le direct montre un raté provisoire** dans deux cas seulement : une attente ponctuelle dont la zone « à temps » s’est fermée sans réponse ni lecture en attente, et une première réponse fausse d’une attente étendue encore corrigeable. Un même cas n’est montré qu’une fois.
- **Une attaque après un point décidé est `settled`.** Une attente ponctuelle décidée (répondue définitivement, ou close à la fin de sa zone) rend `settled` toute attaque ultérieure de son capteur qu’aucune attente encore ouverte ne prend, à n’importe quel instant. Les spans gardent les destins de zone (`before-window`, `after-capture`) : l’accord joué après sa mesure reste `after-capture` tant que le tour est ouvert. La décision est l’état posé par `offer` et `advance`, jamais calculée sur l’instant de l’attaque.
- **Le moteur dit `settled` une fois le tour réglé**, sans interroger l’appariement ; dans l’appariement, les règles de zone valent pour tous les candidats du capteur, répondus ou non. `offer` sur un capteur qu’aucune attente n’écoute lève une erreur : le moteur écarte d’abord `other-sensor`.
- **`observe` ne règle un tour que si l’appariement prend l’attaque** (`answer`) ; un destin ignoré donne l’événement `none`, et le temps ne fait avancer le tour que par `advance`. Une attaque étrangère ne règle donc jamais un cycle par avance, comme dans les anciennes relations.
- **L’appariement d’un cycle s’arrête exactement où il cesse de prendre des attaques**, pas une tolérance plus loin. L’alignement trie les attaques qu’il a retenues par temps ; l’ancien `PlanRound` les alignait dans l’ordre d’arrivée.
- **Un plan en temps libre** (identifier) a toutes ses attentes à `at: null` et une longueur sans signification (`Fraction.of(1)`) ; sa fenêtre `{ ms }` est le seuil de réaction d’un `perfect`.
- **`ResponseVerdict` et `RESPONSE_VERDICTS` déménagent** dans le mode de verdict `response` ; `domain/types.ts` les réexporte. L’enveloppe d’un tour à une réponse devient `{ relation: 'response', version: RESPONSE_VERDICT_VERSION, value: ResponseValue }` ; `responseVerdictOf` lit l’ancienne forme et la nouvelle.
- **Le rappel direct est une règle du verdict** : réussi, et la consigne précédait la cible d’au plus le seuil de l’exercice (`leadMs`) ou, en temps libre, la réaction est sous le seuil. Le geste n’a pas de seuil : jamais de rappel direct.
- **Un cycle sans seuils est une erreur de câblage** : `cycleVerdictMode` lève `a cycle verdict needs thresholds`.
- **Trois écarts du banc avec les anciennes relations** (`legacyParity.spec.ts`), tranchés par l’auteur :
  - D1, gardé : la racine d’un accord de triade se clôt à la fin exacte de sa zone, sans le retard d’un temps de l’ancienne relation. Cas rare : une lecture hésitante de la racine encore en attente à l’ouverture de la bande de l’accord est prise telle qu’elle est. Le cas est affirmé par un test écrit à la main ; les scripts aléatoires d’ancrage ne comparent pas le verdict quand une lecture tardive de la racine arrive.
  - D2 : 150 bpm est écarté des tempos tirés au hasard par le banc : l’ancienne relation n’y avait pas la tolérance de bord du moteur.
  - D3 : les scripts libres de l’identification ne tirent que des lectures définitives, comme le capteur de la touche.
- **La fenêtre d’un changement de grille est `{ ms: PERFECT_WINDOW_MS }`**, pas `{ ofGap }` comme le dit le tableau des relations : le verdict `response` ne lit qu’une fenêtre en millisecondes.
- **Les juges de contenu sont de quatre sortes** : `note`, `name`, `chord-voicing` (la forme lue par le vérificateur, au lieu de `chord`) et `chord-grid`. `chord-grid` juge par les règles du geste (lien, montée, zone, jam) : un juge proche d’une seule famille d’exercices, gardé tel quel jusqu’à ce qu’un deuxième exercice demande un juge d’accord à règles.
- **Le mode possède son temps et ses réglages.** `PairingPolicy` est ouvert, `{ mode: string } & Record<string, unknown>`, et `VerdictModeId` est une chaîne : un mode nouveau ne touche ni `plan.ts` ni le moteur. Le moteur ne calcule que les instants qu’aucun mode ne décide (`roundTimes` dans `modes/times.ts` : début, fin, consigne, `handover` et fin d’écoute là où le plan les met) ; un mode qui les décale les rend par `PairingMode.times` (premier-arrivé : `handover` et fin d’écoute avancés de la tolérance d’ouverture, consigne d’un tour enchaîné à l’ouverture de sa première attente), et ses zones restent à lui (`responseZones`, `modes/firstAnswerTimes.ts`, avec ses réglages typés `FirstAnswerSettings`). Le verdict `response` date lui-même l’attente chronométrée sur la carte de tempo. `validateRoundPlan` ne garde que les règles communes à tous les modes ; ce qu’un mode demande à un plan (premier-arrivé : des réglages lisibles, et `afterPromptMs` en temps libre), il le vérifie par `PairingMode.validate`, que le moteur appelle à sa construction (`plan unfit for pairing mode …`) : un mode injecté se valide ainsi sans passer par le registre. `EDGE_TOLERANCE_S` est défini une fois dans `modes/times.ts` (et non plus dans `zones.ts`, supprimé).
- **Le tour laisse passer le temps avant de se clore** : `close(now)` appelle `advance(now)` avant de lire le résultat, si bien qu’un tour réglé ne porte jamais de lecture `pending`.
- **Les tests d’égalité gardent leur sens après la délégation.** Les tests qui comparent les juges de contenu aux `judge` des mécaniques, et le verdict de cycle à l’ancien `PlanRound.settle()`, affirment des valeurs écrites en dur, relevées avant que les mécaniques ne délèguent ou que le moteur ne soit réécrit : comparer une fonction à elle-même ne prouverait rien.
- **Structure.** La classification pure de la grille passe dans `src/lib/domain/mechanics/gridClassify.ts`, réexportée par `chordGrid.ts`, pour éviter un cycle d’imports avec `domain/judges/`. Les plans de test partagés sont dans `src/lib/domain/time/modes/testing/plans.ts`. `legacyParity.spec.ts` est supprimé en H3 avec `domain/timing/`.

### Réalisation du plan H2 (2026-10-24)

Branche `plan/temps-musical-h2`, plan `docs/superpowers/plans/2026-10-24-h2-procedure-apprentissage.md`. Ce que la réalisation a décidé contre l’amendement ou le plan :

- **Un seul niveau par item** (C1, accepté par l’auteur) : l’avance de la carte et l’échelle d’apprentissage en séance deviennent un `LevelState` par item, déplacé à chaque essai jugé, chaud ou froid. Un item repris commence à son niveau, et n’est présenté aidé que s’il est au niveau le plus long.
- **Le haut de l’échelle est le même pour tous** (C2, accepté) : le cran le plus long dont la durée tient dans le seuil de rappel direct au tempo de l’exécution. Les triades finissent à 4 temps au-dessus de 150 bpm.
- **La réussite glissante compte tous les essais hors sondages** (C3, accepté) : identifier y entre aussi, les triades le faisaient déjà. Les essais de la séance à la construction amorcent les seuils de réussite.
- **Le seuil du rappel direct est une donnée de l’exercice** (`params.recallThresholdMs`, lu par `recallThresholdOf`) : le catalogue déclare 1500 ms pour localiser et les triades, 3000 ms pour identifier. Absent : jamais de rappel direct. La règle est `directRecallOf(thresholdMs)`, qui lit l’enveloppe `response` ou, pour les essais anciens, les champs enregistrés.
- **Au haut de l’échelle, une réponse juste qui n’est pas un rappel direct compte comme un raté** et fait descendre d’un cran, comme identifier et localiser le faisaient. Sa passe complète marque l’item appris.
- **Le haut d’une échelle d’avance n’est jamais aidé** : quand un seul cran est gardé (un seul cran donné, ou le plus long tient déjà dans le seuil), l’échelle a deux niveaux à cette avance, aidé puis sans aide. Un item n’est jamais appris pendant que la réponse est montrée.
- **`Level` est générique** (`Level<P>`) : l’échelle d’un item et les niveaux du rythme partagent `nextLevelState`.
- **Un sondage raté est présenté aidé tout de suite sur la touche, pas sur les triades** (`presentsAtOnce`, donnée du sujet) : les triades attendent une consigne où l’accord ne sonne plus. Cas limite : s’il ne reste que cette position, `next` rend null, comme avant.
- **Un sondage abandonné (pause) reprend son compte de consignes servies** : l’espacement des retests ignore une consigne non jouée.
- **`ItemSource.record` rend `{ card?, level? }`** : une carte changée, un niveau changé, ou les deux.
- **Les sources d’items portent un seul nom** : `SessionSelector` devient `ItemSource`, `createListSelector` devient `createListSource`. `choose` choisit la série parmi les candidats, avec son seul cas pour l’instant.
- **`cardLeadAfter` garde l’avance de l’ancien chemin jusqu’à H3**, et `progress/cards.ts` importe encore le type de `domain/timing` pour elle.
- **Préparer le plan de tour d’un item** est laissé à H3 : H2 rend un `PlannedItem` dont le niveau donne l’avance et l’aide.

**Ce qui reste à H3**

- Charger et écrire `levelStates` (Dexie 9) et y migrer l’avance des cartes. Une carte sans niveau est servie à l’avance la plus longue (aidée seulement dans la phase d’apprentissage) ; le vrai dommage est une révision à froid à 8 temps, qui ne peut jamais être un rappel direct : notée Difficile, jamais acquise. La migration sème donc le niveau de chaque carte en rapportant son avance à son niveau sur l’échelle, au tempo de son exercice.
- Un niveau ramené dans l’échelle (`ladderLevel`, tempo proche de `TEMPO_MAX_BPM`) est enregistré plus bas qu’il n’était : envisager de ne pas enregistrer un tel ramené quand il n’a pas d’autre effet.
- L’enregistreur doit prendre la température d’un sondage du rappel direct du sujet (`subject.recall`), plus de la `TimingRelation`.
- Le `tempoBpm: number | null` des exécutions doit être filtré avant de former `tempos`.
- Le contrôleur fait respecter `SESSION_MS` : la procédure ne finit jamais une séance par le temps.
- Préparer le plan de tour de chaque item, brancher la procédure et les sujets dans le contrôleur unique.
- Rendre obligatoire l’entrée `attempts` de `triadSubject` une fois branché.
- Supprimer `learnSelector`, `triadSelector`, `cardLeadAfter` et `CardState.leadBeats`.
