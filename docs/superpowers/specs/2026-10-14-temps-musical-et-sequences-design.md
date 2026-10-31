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

| Plan   | Contenu                                                                                                                                       | Touche l’existant |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **H1** | moteur de tour, registres de modes et juges de contenu, à côté ; les specs de `beat`, `anchor`, `gridChange`, `free` rejouées sur lui (fait)  | non               |
| **H2** | procédure d’apprentissage, sources d’items, `choose`, à côté ; règles pédagogiques en invariants (faite)                                      | non               |
| **H3** | le cœur générique des séries de réponses et le geste, ses vues                                                                                | oui, le geste     |
| **H4** | les notes : Dexie 9 et les niveaux des cartes, la procédure branchée, `note-lane`, `answer-keys`                                              | oui, les notes    |
| **H5** | les triades, `triad-lane`, puis les suppressions du critère de fin et l’absorption de `PlanSessionController` sous le nom `SessionController` | oui, les triades  |

Une branche à la fois. Une famille d’exercices bascule avec sa vue : le nouveau contrôleur ne nourrit jamais l’ancien écran.

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
- **Le haut de l’échelle est le même pour tous** (C2, accepté) : le cran le plus long dont la durée tient dans le seuil de rappel direct au tempo de l’exécution. Les triades finissent à 4 temps au-dessus de 150 bpm. **Retirée par le plan L** (L2) : l’échelle est celle que l’exercice écrit, à tout tempo.
- **La réussite glissante compte tous les essais hors sondages** (C3, accepté) : identifier y entre aussi, les triades le faisaient déjà. Les essais de la séance à la construction amorcent les seuils de réussite.
- **Le seuil du rappel direct est une donnée de l’exercice** (`params.recallThresholdMs`, lu par `recallThresholdOf`) : le catalogue déclare 1500 ms pour localiser et les triades, 3000 ms pour identifier. Absent : jamais de rappel direct. La règle est `directRecallOf(thresholdMs)`, qui lit l’enveloppe `response` ou, pour les essais anciens, les champs enregistrés.
- **Au haut de l’échelle, une réponse juste qui n’est pas un rappel direct compte comme un raté** et fait descendre d’un cran, comme identifier et localiser le faisaient. Sa passe complète marque l’item appris. **Devenue une donnée du niveau par le plan L** (L3, `Level.success: 'direct-recall'`, posée par le catalogue au haut des échelles).
- **Le haut d’une échelle d’avance n’est jamais aidé** : quand un seul cran est gardé (un seul cran donné, ou le plus long tient déjà dans le seuil), l’échelle a deux niveaux à cette avance, aidé puis sans aide. Un item n’est jamais appris pendant que la réponse est montrée. **Retirée par le plan L** (L2) : les niveaux aidés sont ceux que l’exercice écrit.
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

### Réalisation du plan H3 (2026-10-24)

Branche `plan/temps-musical-h3`, plan `docs/superpowers/plans/2026-10-24-h3-controleur-et-geste.md`. Ce que la réalisation a décidé contre l’amendement ou le plan :

- **Les vues et le branchement basculent ensemble** : les vues du geste lisent leur placement dans leur modèle et le contrôleur est branché dans le même pas, pour que l’application ne montre jamais des vues du geste cassées entre deux commits.
- **Le geste joue sur `ResponseSeriesController`** (`application/session/series/` : `RoundRunner`, `recordResponse`, `PlanSource`, et `countIn` du transport), qui garde ce nom jusqu’à H5, où il absorbe `PlanSessionController` et devient `SessionController`.
- **Le lanceur de tour ne se réveille pas au passage de main** : le contrôleur planifie ce réveil, retire d’abord les attentes du capteur, puis ferme le tour ; l’issue réglée pendant ce retrait revient de `close`. Une fenêtre coupée court rapporte donc dans le tour qui finit.
- **L’entrée audio est ouverte par le contrôleur** : au démarrage, après le gain de l’entrée intégrée et avant l’enregistrement de la séance ; un échec montre l’erreur et laisse recommencer, et l’horloge reprend après la demande d’autorisation.
- **Une seule durée de séance, `SESSION_MS`** : la constante propre au geste est supprimée ; aucun nouveau passage ne commence après, un passage commencé se termine.
- **« Rejouer » commence une nouvelle série avec un nouvel identifiant** et un état neuf.
- **Le raté dessiné suit l’écran du geste** : ce qui a été entendu, ce qui était attendu et l’écart sont dans le modèle d’écran du geste (style de `Settings.chordDiagram`, sauf si l’exercice en impose un) ; les vues du lien et de la grille les dessinent avec `ChordShape` après un raté, jusqu’au changement suivant. Rien n’est dessiné après une réussite ni un hors-temps.
- **Le raté du dernier changement d’un passage reste jusqu’à la mesure comptée** : quand le passage suivant vient après une mesure comptée (et des mesures de silence), le changement réglé reste à l’écran avec son verdict, son ancre, son raté dessiné et l’offre de « Joué juste » ; le changement qui attend ne remplace l’écran qu’au premier temps de la mesure comptée, comme l’ancien cadre (« le verdict reste jusqu’à ce que la mesure comptée commence à compter »). Au démarrage, à la reprise et après une consigne, rien n’est à l’écran : le changement qui attend s’affiche tout de suite.
- **Les attentes sont retirées avant que chaque span se ferme** (`RoundRunner.withdraw`, appelé par la fermeture du span), qu’il y ait un passage de main ou non : à l’ouverture du tour suivant, à la pause, à la consigne et à la fin. Ce qu’un capteur rapporte au retrait entre dans le tour qui finit.
- **« Joué juste » n’existe qu’en développement** ; son bouton s’affiche désormais aussi pour le geste dans `PlayFrame`.
- **Les temps et l’historique de la piste repartent après une reprise ou une consigne** (nouvelle carte de tempo).
- **La consigne du premier exercice n’est pas remontrée sur « Rejouer »**.
- **Le test de frontière est textuel** : il lit les fichiers non-spec de `series/` (imports par alias et relatifs, identifiants de mécaniques et d’exercices) ; les imports de types seuls, transitifs par `SessionDeps` et `AttemptRecorder`, sont admis jusqu’à H5.
- **Les tentatives du geste portent l’enveloppe `response`** et leur plan résolu en JSON (`roundPlanRecord`, fractions en texte).

**Ce qui reste à H4 et H5**

- À H5, supprimer les anciens specs qui ne testent plus que le geste par l’ancien contrôleur (`chainedRounds`, `countdown`, `briefing`, `tempoScope`), l’ancien `stage` et `NO_PLACE` des présentateurs, la copie du bloc de raté dessiné dans `PlayFrame` (garder `DrawnMiss`) et le chemin du geste de l’ancien contrôleur.
- Quitter pendant la demande d’autorisation du micro peut laisser l’entrée ouverte (même course que l’ancien contrôleur).
- À H5, fusionner `ResponseSeriesController` et `PlanSessionController`.

### Réalisation du plan H4 (2026-10-25)

Branche `plan/temps-musical-h4`, plan `docs/superpowers/plans/2026-10-25-h4-les-notes.md`. Les notes (Apprentissage : localiser et identifier ; Jeu libre) jouent sur `ResponseSeriesController`, avec la procédure d’apprentissage de H2 branchée, dans `PlayFrame` avec leurs vues `note-lane` et `answer-keys`. Ce que la réalisation a décidé contre l’amendement ou le plan :

- **D1 — Dexie 9 et la sauvegarde 5 ne sèment que les niveaux des notes** (`storage/migrations/v9.ts`) : chaque carte `locate` et `identify` reçoit le `LevelState` de son avance sur l’échelle de localiser à 80 bpm, quel que soit le tempo de sa progression, puisque localiser passe à 80 bpm fixes (amendement du 2026-10-26 ; changé avant la fusion de H4) (échelle figée `NECK_LADDER_V9`, test fil-piège contre le catalogue) ; les cartes des triades n’en reçoivent pas. Le chemin des notes ne lit ni n’écrit plus `CardState.leadBeats` (une carte nouvelle garde le `PLACEHOLDER_LEAD`) ; le champ reste pour les triades. H5 fait la même étape pour les triades et retire le champ (Dexie 10, sauvegarde 6) ; **le chantier 2 prend la version 11**.
- **D2 — Une seule règle de placement pour tout tour minuté** (`series/placement.ts`, `timedStart`) : un tour commence au premier début de mesure `≥ earliest` dont la consigne tombe au plus `PROMPT_BEFORE_EARLIEST_BEATS` (1) temps avant `earliest` ; `earliest` est la fin de la mesure comptée, ou la fin du tour précédent quand il n’a pas de passage de main (la respiration). Elle redonne l’ancienne grille (avance 8 et 4 : consigne sur le temps 1 ; avance 2 : sur le temps 3) et l’ancien `targetOffset` du geste. **Pour l’auteur** : en 3/4, cette tolérance raccourcit la respiration à deux temps à l’avance 4 (aucun localiser en 3/4 aujourd’hui). **Remplacée par L4** (plan L) : la tolérance disparaît, le plan dit où finit le compte et où tombe la cible.
- **D3 — Le temps libre garde la carte de tempo** : un tour dont toutes les attentes sont `at: null` (identifier) s’ouvre au premier temps qui suit `earliest` (`nextBeat`), n’est réveillé par rien, se règle à sa réponse ; le suivant part du temps qui suit ce règlement. Sa consigne est l’instant réel d’ouverture par le contrôleur (passé au lanceur comme `{ promptS }`), pour que le temps de réaction et `promptedAt` aient la même origine.
- **D4 — La scène tait le clic** (`SCENE_CLICKS`, `mechanics/types.ts` : `guitar` clique, `screen` non) : la série ne programme des mesures cliquées que sur une scène qui clique, et une mesure comptée avant une scène muette se montre sans sonner. `audible` existe aussi sur `Transport.begin` et `changeTempo` (au-delà du plan, nécessaire à D4). Une séance qui commence par identifier part au tempo de localiser (ou `DEFAULT_TEMPO_BPM`), sans clic, et la première consigne de localiser vient après une mesure comptée qui sonne.
- **D5 — L’aperçu de la consigne est une donnée du présentateur** (`MechanicPresenter.previewBeats?`, `STRING_PREVIEW_BEATS` pour localiser) : l’item qui suit sans mesure comptée se montre ce nombre de temps avant sa consigne, la corde seule (`anchorBeat === null`) ; jusque-là le tour réglé reste avec sa correction.
- **D6 — Le mètre vient de l’exercice** (`ExerciseDefinition.meter?`, absent : `METER_4_4`), reçu par `PlanSource(item, meter)` ; un item d’un autre mètre que celui du transport lève une erreur. **Remplacée par le plan L** : une série garde un mètre seulement entre deux items enchaînés ; un item d’un autre mètre la fait passer à ce mètre par une mesure comptée (`Transport.changeMeter`), comme un changement de tempo.
- **D7 — écartée par l’auteur après la réalisation (2026-10-25)** : la règle « le niveau ramené n’est pas réécrit » et son exception pour la phase d’apprentissage sont retirées. Elle n’évitait qu’une révision notée Difficile, une fois, pour une note jouée à 160 bpm (seul tempo où le haut de l’échelle est l’avance 4) puis à un tempo plus lent ; elle coûtait une règle et une exception dans la procédure. Chaque essai écrit le niveau auquel la note a été annoncée : une note dont le niveau enregistré est celui de l’avance 2 est annoncée avec 4 temps d’avance dans une séance à 160 bpm (le haut de l’échelle à ce tempo) ; réussie, son niveau enregistré devient celui de l’avance 4, et dans une séance plus lente elle regagne l’avance 2 en une réussite.
- **D8 — Le journal de détection suit les présentateurs** : `RoundRunner` écrit par `logDetection` le sort de chaque observation et les `debugLines` du présentateur ; le geste y gagne aussi. Les lignes de décision de l’ancien contrôleur (réponse en attente, fenêtre close sans réponse) ne sont pas reprises.
- **L’enregistreur apprend, génériquement** : `AttemptRecorder.recordResponse(attempt, span, item)` prend la température (`probeTemperature` sur le `recall` du sujet, rendu par `prepare`), applique FSRS (`applyColdAttempt`), écrit la carte rendue par `ItemSource.record` et le niveau de l’item ; sans `recall` pour un sondage ou un apprenant `memory`, il lève une erreur de câblage.
- **La latence par capteur** vit dans `SeriesSensors.open` et `RoundRunner` (lue de `settings.latency`), et non plus `latency.note` pour tous.
- **La réponse tapée entre comme une observation** : `answer(value)` pousse la touche à chaque source nourrie par l’écran pendant qu’un tour attend ou montre son verdict ; une touche avant la consigne n’est pas une réponse, la seconde après le règlement est `settled` et rangée dans l’étendue.
- **Le Jeu libre prend l’avance de localiser dans `levelStates`** (`freeLeadOf`) : le niveau de la carte sur l’échelle du sujet au tempo de localiser, niveau 0 sans état ; plus `CardState.leadBeats`.
- **`learnSelector`, `progress/sequence.ts` et `SEQUENCES_ENABLED` sont supprimés** ; les notes ne lisent plus `LEARN_SESSION_MS` (seules les triades le gardent, à l’accueil comme en séance, jusqu’à H5 ; l’accueil affiche `SESSION_MS` pour les notes) : une séance dure `SESSION_MS`, aucun tour qui ne continue pas un passage de main ne commence après.
- **Un tour en temps libre ne prend pas de case sur la piste** : son verdict n’entre pas dans `history`, la piste de localiser qui suit ne montre que les tours sur le temps.
- **Une mesure comptée après un tour en temps libre ne commence jamais avant `START_DELAY_S`** (le délai de départ du transport) : si la mesure visée commence plus tôt, la suivante est prise (`audibleBar`).
- **`resume` termine la séance quand `SESSION_MS` a passé** pendant la pause, l’item tenu pendant la respiration compris : une reprise n’est jamais un passage de main.
- **`noteVerdict` est partagé** (`application/mechanics/noteVerdict.ts`) : identifier n’importe plus localiser ; deux vues indépendantes depuis un bloc commun.
- **`PlayFrame` prend le monde de sa vue** (tâche 8b, ajoutée en cours de plan) : chaque vue déclare son monde dans le registre (`VIEW_WORLDS` : `note-lane` et `answer-keys` en `quiet`, les autres en `pixel`), et le cadre se dessine dans ce monde, l’habillage calme partagé avec `PlayScreen` ; un écran ne mêle jamais les deux mondes. Sans vue en scène (accueil de séance, fin), le monde vient du genre de séance (`learn`/`free` → calme). La pause calme n’a ni « Réécouter » ni « Quitter l’exercice » (aucune vue calme ne joue de figure). Le joueur des notes voit donc ce qu’il voyait avant H4.
- **Les vues des notes dessinent le décompte au centre de leur champ** ; le cadre ne le dessine que sans vue en scène.
- **`/session` encadre** `learn`, `free`, `gesture` et `exercise` dans `PlayFrame` ; seules les triades gardent `PlayScreen`.
- **Le test de frontière de la série** est étendu aux capteurs : `series/` ne nomme ni `'tap'` ni `'note'`.

**Ce qui reste à H5**

- Les triades sur la série, et tout ce que la contrainte « les triades ne changent pas » a gardé : `SessionController`, `PlayScreen`, `triadSelector`, `AttemptRecorder.record`, `cardLeadAfter`, `CardState.leadBeats`, `domain/timing/` (avec `RESPIRATION_BARS` et `STRING_PREVIEW_BEATS`, que `neckPlans.ts` y importe encore), `LEARN_SESSION_MS`.
- Les deux mondes de `PlayFrame` jusqu’au plan visuel 3 ; le repli du monde sur le genre de séance disparaît quand chaque séance a une vue en scène dès l’accueil.

## Amendement (2026-10-26) : un langage d’exercices ouvert

Décidé dans la conversation du 2026-10-26, en relisant D7 (H4) et C2 (H2) : deux règles du moteur nées d’un exercice mal construit (localiser mêle le tempo et une avance comptée en temps pour mesurer une seule compétence, répondre en 1500 ms au plus). Il précède H5 et en change le périmètre.

### Le principe

Le langage des exercices est ouvert, comme une langue : il permet d’écrire des exercices sans valeur, sans sens, ou qui mesurent mal une compétence. Ce n’est pas un défaut du langage mais de ce qui écrit l’exercice (une personne, une IA, un générateur). **L’application doit pouvoir faire n’importe quel exercice** ; aucune « règle de conformité » utile à certains exercices ne doit en empêcher d’autres, cohérents.

Conséquences :

- **Un exercice mal construit se corrige dans ses données**, jamais par une règle du moteur qui le compense (D7 retirée le 2026-10-25 ; C2 ensuite).
- **Le moteur ne refuse que ce qu’il ne sait pas exécuter sans ambiguïté** (validité) : un tempo non positif, une vue ou un mode inconnus, un plan dont les attentes se contredisent dans le temps. Jamais ce qui manque de valeur pédagogique.
- **Les seules contraintes du moteur sont physiques** : une horloge, une transition (une mesure comptée) pour changer de tempo, un capteur qui entend ce qu’il entend.
- **Les conseils d’écriture vont dans un guide**, pas dans le code. Exemple : « un niveau d’item garde son sens à tous les niveaux d’exercice » (une avance comptée en temps change de durée avec le tempo) est un bon conseil, pas une règle.

### Les paramètres appartiennent aux pièces qui les lisent

Pas aux familles d’exercices : on ne peut pas savoir qu’un paramètre ne servira qu’à une famille (le curseur du rythme sert une lecture de tablature, qui est localiser présenté autrement). Un exercice choisit ses pièces et règle leurs paramètres ; **un niveau, d’exercice ou d’item, peut surcharger n’importe lequel**, y compris plusieurs axes à la fois (monter le tempo et raccourcir l’avance), sans que le moteur en juge.

| Pièce               | Paramètres (aujourd’hui ou à venir)                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| transport           | tempo (et sa portée), mètre, accompagnement et mesures muettes, écoute avant de jouer, mesure comptée, silence avant le compte, respiration       |
| compilateur de plan | longueur d’un tour, place de la cible dans la mesure, avance de la consigne, attentes et leur contenu                                             |
| mode d’appariement  | ouverture et fermeture des zones (`MIN_RESPONSE_MS`, `LATE_LIMIT_MS`, `LATE_CAPTURE_MS`, `GRID_EARLY_MS`), tolérance d’alignement (`MATCH_LIMIT`) |
| mode de verdict     | fenêtre de `perfect`, seuils de précision, régularité, tenue, rappel direct                                                                       |
| vue                 | ce qu’elle montre (curseur, aperçu de la consigne, mots ou termes, retour après un raté), son monde visuel                                        |
| scène               | le clic entendu ou non, l’écran ou l’instrument                                                                                                   |
| source d’items      | ordre d’introduction, voisins, condition « prêt », échelle d’un item (avance, aide), espacements, ensemble de travail, seuils d’introduction      |
| séance              | durée, fatigue, anti-blocage, « Joué juste »                                                                                                      |

Le découpage actuel de `LevelParams` (pensé pour le rythme) est remplacé par ce découpage : un socle lu par les pièces communes, et les paramètres déclarés par chaque pièce. Un paramètre qu’aucune pièce de l’exercice ne lit est sans effet ; le moteur peut le signaler à l’écriture, pas le refuser.

### Inventaire : ce que le moteur décide encore à la place de l’exercice

Relevé dans le code au 2026-10-26 (branche H4). Une constante n’est pas fautive en soi : elle l’est quand l’exercice ne peut pas la remplacer par ses données. Pour chaque ligne, la cible. Ce que le plan L a fait est marqué **Fait (L)**, ce que H5 a fait **Fait (H5)** ; le détail est dans « Réalisation du plan L » et « Réalisation du plan H5 » ci-dessous.

**Règles pédagogiques écrites dans le moteur (à retirer)**

- **C2, l’échelle ajustée au tempo** (`leadLadder` : garder les crans jusqu’au plus long qui tient dans le seuil de rappel). Elle compense un exercice dont le tempo bouge ; elle fait varier la durée exigée entre la moitié du seuil et le seuil (de 755 à 1500 ms pour localiser). Cible : l’échelle est celle que l’exercice écrit. **Fait (L2)** : `leadLadder` est supprimé, chaque exercice écrit son échelle (`params.ladder`).
- **La cible sur le premier temps d’une mesure** (règle de placement D2 : un tour commence sur un début de mesure). Cible : la place de la cible dans la mesure est une donnée du plan ; « temps 1 » reste la valeur par défaut. **Fait (L4)** : `RoundPlan.barOffset`, écrit par l’exercice dans `params.targetBarOffset` (lu par `beatPlan` seulement).
- **La tolérance d’un temps de D2** (`PROMPT_BEFORE_EARLIEST_BEATS`), réglée sur les exercices connus (le geste ouvre un temps avant son changement). Cible : le plan dit où le compte finit (sur la consigne ou sur la cible), plus de tolérance. **Fait (L4)** : `RoundPlan.countEndsOn`, `PROMPT_BEFORE_EARLIEST_BEATS` supprimé ; localiser l’écrit dans `params.countEndsOn` (lu par `beatPlan`) ; l’ancrage et le changement de grille gardent leurs valeurs écrites dans le code jusqu’à H5. **Fait (H5)** : `round.barOffset` et `round.countEndsOn`, écrits par tout gabarit (le geste : `countEndsOn: 'target'`).
- **Le haut d’une échelle d’avance n’est jamais aidé et un seul cran est doublé** (`leadLadder`, H2). Cible : les niveaux d’aide sont ceux que l’exercice écrit (`aid: true`), comme pour le rythme. **Fait (L2)** ; « au haut, seul un rappel direct compte » devient `Level.success` (L3).

**Constantes globales qui doivent devenir des données (d’exercice ou de niveau)**

- **Tempo** : `TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`, `TEMPO_STEP_BPM`, `TEMPO_RAISE_AT`, `TEMPO_LOWER_AT`, `TEMPO_MIN_PROMPTS`, l’arrondi à l’entier, `DEFAULT_TEMPO_BPM`. Cible : le tempo est un paramètre du transport, réglé par l’exercice et ses niveaux (le mécanisme du rythme, `Level`, pour tous les exercices) ; la progression de tempo séparée (`Progression`, `nextTempo`) disparaît quand tous les exercices sont passés aux niveaux. Le moteur accepte déjà des tempos décimaux. **Fait en partie (L1)** : l’exercice écrit son tempo (`tempo`, fixe ou une plage avec son pas et ses seuils), les constantes deviennent `DEFAULT_TEMPO`, plus d’arrondi ; le tempo dans les niveaux d’exercice, et la fin de `Progression` et `nextTempo`, restent à H5, **reportés à H6**.
- **Avance** : le type `LeadBeats` = 8, 4 ou 2 et `LEAD_STEPS`. Cible : un nombre de temps (ou une fraction) quelconque ; en 3/4, 6 et 3 s’écrivent. **Fait (L2)** : `LeadBeats` est un nombre, toute fraction exacte d’un temps (1,5 : une noire pointée en 4/4), lue par `beatsOf` ; `LEAD_STEPS` ne sert plus qu’à l’ancien chemin des triades (`DEFAULT_BEAT_PACING`) et à la validation des sauvegardes. **Fait (H5)** : `LEAD_STEPS` est supprimé ; l’avance est le niveau de l’item, la validation des sauvegardes 1 à 5 garde sa liste figée.
- **Séance** : `SESSION_MS`, `LEARN_SESSION_MS`. Cible : la durée est une donnée de la séance ou de l’exercice, `SESSION_MS` sa valeur par défaut. **Fait pour la série (L7)** : la préparation rend `durationMs`, que `createAppServices` écrit `SESSION_MS` jusqu’au chantier 2 ; `LEARN_SESSION_MS` reste aux triades jusqu’à H5. **Fait (H5)** : `LEARN_SESSION_MS` est supprimé, toute série dure `SESSION_MS`.
- **Respiration et aperçu** : `RESPIRATION_BARS` (que `neckPlans.ts` lit en dur au lieu de `pacing.respirationBars`), `STRING_PREVIEW_BEATS` (`previewBeats`, propriété du présentateur, donc de la mécanique). Cible : paramètres du transport et de la vue, réglés par l’exercice. **Fait (plan L, tâche 3 et L5)** : `neckPlan` lit `params.pacing.respirationBars` (`pacingOf`), l’aperçu est `flow.previewBeats` ; les défauts restent dans `domain/timing/` jusqu’à H5. **Fait (H5)** : `DEFAULT_RESPIRATION_BARS` et `DEFAULT_PREVIEW_BEATS` dans `pacing.ts`, l’aperçu résolu en un lieu (`previewBeatsOf`).
- **Fenêtres de réponse** : `PERFECT_WINDOW_MS`, `LATE_LIMIT_MS`, `LATE_CAPTURE_MS`, `MIN_RESPONSE_MS`, `GRID_EARLY_MS`, `GRID_EARLY_MAX_BEATS`, `ANCHOR_CHORD_FROM_BEATS`. Ce sont déjà des réglages du plan, mais les plans sont construits par du code (`beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan`) qui lit ces constantes : l’exercice ne peut pas les changer. Cible : les constructeurs de plan prennent ces valeurs des paramètres de l’exercice, les constantes devenant des valeurs par défaut. **Fait (plan L, tâche 3)** : `params.windows` (`windowsOf`, `DEFAULT_RESPONSE_WINDOWS`) ; `freePlan` n’en prend pas ; l’ancien chemin des triades garde les constantes jusqu’à H5. **Fait (H5)** : les constructeurs de plan sont remplacés par le gabarit du tour, qui lit les fenêtres par `{ param: 'windows.…' }` ; les constantes n’existent plus que comme `DEFAULT_RESPONSE_WINDOWS`.
- **Procédure d’apprentissage** : `LEARNING_SLOTS`, `MAX_WORKING_SET`, `MAX_UNCONSOLIDATED`, `LEARN_COLD_CAP`, `LEARN_RETEST_GAPS`, `NEW_NOTE_MIN_CARD_SUCCESS`, `NEW_NOTE_CARD_WINDOW`, `NEW_NOTE_MIN_SESSION_SUCCESS`, `SUCCESS_WINDOW`, `RECOVERY_AFTER_MISSES`, `STRING_AID_FADE_SUCCESSES`, `CONSOLIDATION_POOL`, `CONSOLIDATION_SKIP_RECENT`, `CONFUSION_LOOKBACK` ; l’ordre des catégories (retests, révisions à froid, repris, nouveaux, consolidation). Cible : paramètres de la source d’items, donnés par l’exercice ; les valeurs actuelles par défaut. **Fait (L6)** : réglages de l’item dans `params.learning` (`itemLearningOf`), réglages de l’ensemble donnés par la séance (`createLearningProcedure({ set })`, `DEFAULT_SET_LEARNING`), ordre des catégories compris.
- **Mémoire** : `MIN_COLD_DELAY_MS`, les réglages de FSRS (sans étapes d’apprentissage), `MASTERY_ACCURACY`, `MASTERY_SESSIONS`, `MASTERY_MIN_GAP_MS`. Cible : paramètres de l’apprenant « mémoire », par exercice. Hors de L (L8).
- **Rythme** : `PASS_AFTER_CYCLES`, `DROP_AFTER_FAILS`, `CYCLES_PER_BREATH`, `LISTEN_IN_BARS` sont déjà surchargeables par niveau (bien) ; `BLOCK_AFTER_FAILS`, `BLOCK_SAME_SPOT_CYCLES`, `BLOCK_REST_MS`, `BREATH_MIN_MS`, `SETTLE_AFTER_BARS`, `PLAIN_WORDS_SESSIONS` ne le sont pas. Cible : paramètres de la séance et de la vue. Hors de L (L8).
- **Fatigue** : `FATIGUE_*`. Cible : paramètres de la séance. Hors de L (L8).
- **Geste** : `LINK_SHAPES`, `ZONE_FRETS`, `ZONE_STEP_FRETS`, `PASSAGE_SUCCESS`, `LINK_AID_AFTER_MISSES`, `LINK_REST_BARS`, `NEIGHBOUR_FRETS`. Cible : paramètres du générateur du geste, donnés par ses exercices. Hors de L (L8).

**Propriétés de la mécanique qui doivent être de l’exercice**

- `scene` (et donc le clic), `previewBeats`, `contestable`, et la forme du modèle d’écran sont portés par le présentateur, c’est-à-dire par la mécanique : deux exercices d’une même mécanique ne peuvent pas les régler autrement (une lecture de tablature est localiser avec une autre vue et un autre aperçu). Cible : le présentateur donne des valeurs par défaut, l’exercice les remplace. **Fait (L5)** pour la scène, l’aperçu et « Joué juste » (`ExerciseDefinition.flow`) ; la forme du modèle d’écran reste au présentateur (ci-dessous).

**Le présentateur rattaché à une mécanique et à une vue**

- Un présentateur (`application/mechanics/`) appartient à une mécanique et fabrique le modèle d’écran d’une vue donnée : une lecture de tablature qui reprend la mécanique de localiser avec une autre vue demanderait un autre présentateur, donc du code. Cible : le modèle d’écran se construit par vue, depuis le contenu attendu, la réponse et le verdict, pas par mécanique. Hors de L. **Fait (H5)** pour les exercices à réponse qui écrivent leur présentation (`PromptStageModel`, vue `lane`) ; le geste garde le modèle de son présentateur (D9 de H5).

**Code par famille (la limite connue, pas des règles de conformité)**

Une famille entièrement nouvelle demande encore du code : un sujet d’apprentissage (`neckSubject`, `triadSubject` : ordre d’introduction, voisins et miroirs, condition « prêt », échelle), un constructeur de plan, un générateur (le geste), un juge de contenu, un présentateur et souvent une vue. La règle de `docs/vision.md` (généraliser quand un deuxième exercice réel le demande) s’applique ; le corpus des cours de l’auteur est le banc qui dira quelles de ces pièces doivent devenir des données du langage. **Fait en partie (H5)** : le constructeur de plan, le présentateur et la vue d’un exercice à réponse sont des données et du vocabulaire enregistré ; ce qui reste est la frontière nommée par D9 de H5.

**Simplifications du modèle à examiner**

- **Le temps libre comme cas des fenêtres.** Une attente en temps libre (`at: null`, identifier) n’est pas un mode à part : c’est une attente datée à la consigne, dont la zone de réponse n’a pas de fin et dont le verdict lit le temps de réaction au lieu de l’écart à la cible. À vérifier : si cette écriture remplace `at: null` sans perte, une notion du moteur disparaît.
- **Appariement et verdict restent deux pièces.** Ils répondent à deux questions : quelle observation répond à quelle attente (la zone de capture : une note jouée 300 ms en retard peut encore être la réponse), et ce que vaut la réponse (sa fenêtre de `perfect`, ses seuils). Les deux parlent de tolérance, mais pas de la même : une capture large et un verdict strict se combinent.

### Le cas de localiser

Corrigé dans ses données : tempo fixe à 80 bpm (2 temps y font exactement le seuil de 1500 ms), échelle 8 → 4 → 2 telle qu’écrite, sans niveaux de tempo. Un niveau d’item garde alors le même sens d’une séance à l’autre. Travailler la vitesse au-delà de 1500 ms serait un autre exercice, avec son propre seuil. Les triades (même échelle, même seuil) suivent le même choix, sauf décision contraire de l’auteur. **Fait (L)** : localiser et les triades à 80 bpm fixes, leurs échelles écrites dans le catalogue.

### Ce qui reste à décider

- **L’ordre** : un plan « langage ouvert » avant H5 (les triades basculeraient directement sur le modèle cible), ou ses morceaux répartis dans H5 et après. Le retrait de la progression de tempo touche aussi le geste et les données en base (progressions enregistrées au-dessus de 80 pour localiser). **Tranché** : le plan L, avant H5.
- **Le guide d’écriture** : où il vit (un document, un analyseur qui conseille sans refuser) et ce qu’il contient d’abord.

### Réalisation du plan L (2026-10-26)

Branche `plan/langage-ouvert` (worktree `.worktrees/langage-ouvert`), partie de `main` après la fusion de H4, plan `docs/superpowers/plans/2026-10-26-langage-ouvert.md`. Pas encore fusionnée à l’écriture de cette section. Aucun changement de schéma : Dexie 9 et la sauvegarde 5 restent, les index de niveau de localiser gardent leur sens (l’échelle écrite est celle qu’avait C2 à 80 bpm). Ce que le code fait de chaque décision :

- **L1 — Le tempo** : `ExerciseDefinition.tempo` (`ExerciseTempo` : `{ fixed }`, ou une plage `{ start, min, max, step, raiseAt, lowerAt, minPrompts }`), lu par `tempoOf` ; absent, `DEFAULT_TEMPO` (les anciennes constantes, 80 à 160 par 5), dont `startTempoBpm` donne le départ quand il est écrit (une plage écrite l’emporte sur `startTempoBpm`). `startTempo`, `nextTempo(definition, tempoBpm, attempts)` et `clampTempo` lisent l’exercice, sans arrondi à l’entier. Localiser et les deux exercices des triades écrivent `tempo: { fixed: 80 }` : une progression enregistrée (120, 160 bpm) est ignorée, aucune n’est écrite en fin de séance, le niveau de la carte est gardé. `legacy/v1.ts` garde sa propre borne figée (80–160, arrondie). Le geste, sans tempo écrit, bouge dans `DEFAULT_TEMPO` comme avant.
- **L2 — L’échelle** : chaque exercice écrit la sienne (`params.ladder`, ou `params.ladders[mechanic]`), lue par `ladderOf(definition, mechanic?)`, vérifiée par `validateLadder` (une liste non vide, une avance nulle ou positive et fraction exacte d’un temps, `aided` booléen et `success` `'any'` ou `'direct-recall'` quand ils sont écrits, des passages et descentes entiers positifs) ; `LadderParams` et `Ladder` vivent dans `domain/exercise/types.ts`. `leadLadder` et `aidLadder` sont supprimés ; `LearningSubject.ladder(mechanic)` ne prend plus de tempo, ni `createLearningProcedure` ses `tempos`, ni `freeLeadOf`. Le catalogue écrit localiser et les triades `8 aidé → 4 → 2`, identifier `null aidé → null`. `LeadBeats` est un nombre ; `ladderLevel` ramène toujours un niveau au-dessus du haut, mais le haut ne dépend plus du tempo.
- **L3 — `Level.success`** (`'any'` par défaut, `'direct-recall'`) : le catalogue le pose au haut des échelles de localiser, d’identifier et des triades. Seule la procédure d’apprentissage le lit (la politique du rythme l’ignore).
- **Les fenêtres et la respiration** (tâche 3) : `params.windows` (`ResponseWindows`, `DEFAULT_RESPONSE_WINDOWS`, `windowsOf`, champ par champ) ; `beatPlan`, `anchorPlan` et `gridChangePlan` exigent leurs fenêtres. `neckPlan(item, meter, definition)` lit la respiration (`pacingOf`, `ExercisePacing` réduit à `respirationBars`), les fenêtres et le seuil de rappel de l’exercice de l’item, `gesturePlan(item, meter, definition)` de même ; `PlanSource(item, meter, definition)` reçoit la définition.
- **L4 — Le placement** : `RoundPlan.countEndsOn?: 'prompt' | 'target'` et `RoundPlan.barOffset?: Fraction`, gardés sur l’essai (`RoundPlanRecord`, `barOffset` en texte). `timedStart` prend le premier `start ≥ earliest` qui tombe `barOffset` dans sa mesure et, quand le compte finit sur la consigne, dont la consigne n’est pas avant `earliest` ; un `barOffset` hors de sa mesure lève une `RangeError`. `PROMPT_BEFORE_EARLIEST_BEATS` est supprimé ; `gridChangePlan` pose `countEndsOn: 'target'`. Mêmes positions qu’en H4 en 4/4 aux avances 8, 4, 2 et pour le geste ; en 3/4 à l’avance 4, la respiration redevient entière ; quand `earliest` tombe dans une mesure, la cible peut venir une mesure plus tard qu’avec la tolérance. Un tour placé après une mesure comptée (`place()`) ou sans elle (`placeFollowing`) n’a jamais sa consigne déjà passée : il recule d’une mesure tant qu’elle le serait (`comingStart` ; possible quand le compte finit sur une cible loin de sa consigne).
- **L5 — Le déroulé** : `ExerciseDefinition.flow` (`ExerciseFlow` : `scene`, `previewBeats`, `contestable`), lu par `SeriesItems.flowOf` par-dessus les défauts du présentateur. `Scene` vit dans `domain/exercise/types.ts`, l’application le réexporte.
- **L6 — La procédure** : les réglages de l’item (`ItemLearning` : `retestGaps`, `aidFadeSuccesses`) viennent de `params.learning` de l’exercice de chaque item (`itemLearningOf`, `LearningSubject.itemLearning(mechanic)`) ; ceux de l’ensemble (`SetLearning`, avec `order`, l’ordre des `LearningCategory`, et `recoveryAfterMisses`, la suite de ratés comptée sur tout l’ensemble) de la séance, `createLearningProcedure({ set })` ; `createAppServices` donne aujourd’hui `DEFAULT_SET_LEARNING`. Défauts : les constantes de `progress/constants.ts`, qui restent pour l’ancien chemin des triades. `cardSuccessRate` prend sa fenêtre en paramètre.
- **L7 — La durée** : la préparation d’une série rend `durationMs` (absent : `SESSION_MS`), que `createAppServices` écrit `SESSION_MS` pour les notes et le geste.
- **La validation** (tâche 7) : `validateExercise(definition): string | null` (`domain/exercise/validate.ts`), une erreur `<exercice> : <champ> …` pour ce qui ne s’exécute pas (mètre, tempo, `flow.scene` et `flow.previewBeats`, échelles, fenêtres, `params.learning`, `params.pacing.respirationBars`, `params.recallThresholdMs`, `params.targetBarOffset`, `params.countEndsOn`, une avance ou `params.windows.anchorChordFromBeats` qui ne soit pas une fraction exacte d’un temps : la validation et les constructeurs de plan partagent `beatsOf`/`isBeatCount`, `domain/time/meter.ts`, sur `Fraction.fromNumber` jusqu’au dénominateur `BEAT_RESOLUTION`), rien de pédagogique ; un tempo de 300 bpm, une échelle qui monte de 1 à 16 temps ou une fenêtre de 5 s passent. `dataOnlyExercise.spec.ts` joue un localiser écrit en données seulement (3/4, ♩ = 90 fixe, échelle 6 aidé → 3 en rappel direct, deux mesures de respiration, `perfectMs` 120, aperçu de 2 temps, cible sur le temps 2) ; pour cela `createAppServices` lit les exercices des notes par `deps.exercise` (le catalogue par défaut), plus par les constantes `LOCATE_NECK` et `IDENTIFY_NECK`.

Ce que la réalisation a tranché contre le plan ou en plus :

- **L’ancien chemin des triades lit l’échelle écrite par des adaptateurs « until H5 »** : `leadStepsOf` et `learnedAfterOf` (`domain/exercise/ladder.ts`), `BeatPacing`, `DEFAULT_BEAT_PACING` et `beatPacingOf` (`pacing.ts`) ; `LEAD_STEPS` n’y sert plus que de défaut. Le test fil-piège de `NECK_LADDER_V9` compare l’échelle figée à `leadStepsOf`/`learnedAfterOf` du catalogue.
- **`freePlan` ne prend pas de fenêtres** : elles sont structurelles au temps libre, et sa seule fenêtre est le seuil de rappel, déjà une donnée.
- **Le clic de la mesure qui suit un compte** : depuis H4 (déjà sur `main`), après une mesure comptée, les temps avant une consigne en milieu de mesure (avance 2) ne sonnaient pas. `place()` accompagne désormais jusqu’au début du tour ; la mesure qui suit le compte clique en entier. Corrigé dans `main` quand L fusionne.
- **`previewBeats` est obligatoire dans `beatPlan` et `anchorPlan`** (il donne `listenUntil`, qui lisait `STRING_PREVIEW_BEATS`) ; `neckPlan` passe `flow.previewBeats ?? STRING_PREVIEW_BEATS`, la même valeur que l’aperçu à l’écran ; `validateExercise` le veut entier, positif ou nul.
- **`params.pacing.respirationBars` vaut au moins 1** : une respiration nulle donne un plan de longueur nulle, qui ne s’exécute pas.
- **La place de la cible a un chemin de données** : `params.targetBarOffset`, une fraction écrite en texte (`"1/4"` : le temps 2 en noires), lue par `targetBarOffsetOf` et passée par `neckPlan` à `beatPlan` seulement ; `validateExercise` la veut dans la mesure de l’exercice. La fin du compte de même : `params.countEndsOn` (`'prompt'` ou `'target'`), lue par `countEndsOnOf`. Un localiser sans avance nomme l’exercice et le niveau de l’échelle qui n’en donne pas.
- **Une série change de mètre entre deux items par une mesure comptée** (D6 de H4 remplacée) : refuser un autre mètre était une règle de conformité, qui faisait aussi tomber une séance de notes dès son premier identifier quand localiser n’était pas en 4/4. `Transport.changeMeter` garde la carte de tempo (les positions continuent) et compte les mesures du nouveau mètre depuis sa première mesure entière (la fraction de mesure entre les deux reste muette), avec un segment de tempo seulement s’il change ; la série prend le mètre de l’item (`meterOf`, `setMeter`), n’enchaîne que dans un même mètre (`chainable`), et `beginWith` commence au mètre du premier item.
- **`recoveryAfterMisses` passe à l’ensemble** : la suite de ratés qu’il lit se compte sur tout l’ensemble, c’est donc à la séance de fixer le seuil ; il est dans `SetLearning` (`DEFAULT_SET_LEARNING`), lu par la procédure en `this.set.recoveryAfterMisses`, et `params.learning` ne le porte plus. Sans effet avec les défauts.
- **`validateExercise` n’est pas appelé en jeu** jusqu’au chantier 2 : le catalogue est du code, le test sur `EXERCISES` est la garde ; un exercice de données invalide échouerait en jeu, pas au chargement.
- **La fin d’une séance de l’ancien contrôleur cherche la définition de chaque exécution** (`deps.exercise`, sinon `exerciseById`) pour sa progression de tempo, et lève une erreur pour un exercice inconnu (elle ne la cherchait pas avant).

### Réalisation du plan H5 (2026-10-27)

Branche `plan/temps-musical-h5` (worktree `.worktrees/temps-musical-h5`), partie de `main` (`ca67f1c`), plan `docs/superpowers/plans/2026-10-26-h5-les-triades.md`. Fusionnée dans `main` le 2026-10-27, en une seule fois (D1). Un exercice à réponse dit en données son tour et son écran ; un seul compilateur fait son plan, une seule piste le dessine ; les triades jouent sur `ResponseSeriesController` avec la procédure d’apprentissage, dans `PlayFrame` ; l’ancien chemin est supprimé. Ce que le code fait de chaque décision :

- **D1 — Une branche, fusionnée une fois** : partie A, le langage et l’écran (tâches 1 à 6) ; partie B, les triades et le ménage (tâches 7 à 12) ; chaque tâche verte. Aucun joueur ne rejoue ses triades depuis le niveau 0 : le niveau arrive avec Dexie 10, dans la même fusion que les triades sur la série.
- **D2 — Dexie 10 et sauvegarde 6** (`storage/migrations/v10.ts` : `TRIAD_LADDER_V10`, `triadLevelOfCard`, `levelStatesV10`, `cardToV10`, `backupV5ToV6`) : chaque carte de triade reçoit un `LevelState` depuis son avance (non apprise → 0 ; apprise → le cran de son avance sur `8, 4, 2` ; plus courte que 2 → le haut), un état déjà là est gardé, puis `leadBeats` est retiré de toutes les cartes. L’échelle figée a son fil-piège contre `ladderOf` du catalogue, comme `NECK_LADDER_V9` désormais. Les fichiers 1 à 5 se valident avec leur liste d’avances figée (`[8, 4, 2, 1]`, écrite dans `validateBackup.ts`) ; un fichier 6 refuse une carte qui porte une avance. Une triade apprise à l’avance 4 revient à l’avance 4, sans aide.
- **D3 — Le gabarit du tour remplace les constructeurs de plan** (`domain/exercise/round/` : `RoundTemplate`, `compileRound`, `roundParamsOf`, `roundProblem`) : `beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan`, `neckPlan`, `gesturePlan` et `PlanSource` sont supprimés, la série compile elle-même (`compileRound(definition, item, meter, { previewBeats })`). Un nombre du gabarit est un `Num` : écrit, lu dans les paramètres résolus de l’item (`{ param: 'windows.perfectMs' }`, `{ param: 'leadBeats' }`), ou mesuré sur l’item (`{ item: 'change-beats' }`, la longueur d’une grille). `round.barOffset` et `round.countEndsOn` remplacent `params.targetBarOffset` et `params.countEndsOn` : la forme du tour est en un seul endroit. Le catalogue écrit cinq formes : localiser (sur le temps, écoute jusqu’à l’aperçu suivant), identifier (temps libre, fenêtre = seuil de rappel), l’ancrage (racine ponctuelle sur la cible, accord de `windows.anchorChordFromBeats` à la fin de la mesure, correction), la zone (sur le temps, entendue par le capteur d’accords, capture tardive) et le geste (changement de grille, `handover: 'end'`, compte fini sur la cible). Les tours des triades écoutent jusqu’à leur fin (pas de `listenBeforeEnd`, R2/R5). Les dérivations et les nombres d’item sont du vocabulaire enregistré (`domain/derivations/` : `note-of-item`, `name-of-item`, `voicing-root`, `voicing-anywhere`, `voicing-at-position`, `grid-change` ; `change-beats`), qui déclare les mécaniques qu’il lit. **Ce qu’un niveau règle aujourd’hui** (`roundParamsOf`) : l’avance seule (`{ param: 'leadBeats' }`, celle du niveau de l’item, avec l’aide) ; l’aperçu vient du déroulé ; tout autre `{ param }` se lit dans les paramètres de l’exercice (`params`, fenêtres, respiration, seuil de rappel), le même à tous les niveaux. La surcharge des autres paramètres par un niveau arrive avec les niveaux sur deux axes (H6).
- **D4 — Le verdict raconte chaque attente ratée, par sa sorte de contenu** (`CONTENT_VIEWS` : `note`, `name`, `chord-voicing`) : une note ratée dit sa position ; un accord raté dessine l’entendu, l’attendu (la forme à la position demandée, sinon la plus proche de l’entendue, R6) et l’écart, et dit la forme juste (« cases · notes ») ; le libellé de la réponse donne chaque réponse entendue, dans l’ordre des attentes. Ce que le joueur voit de nouveau : après une racine fausse, l’ancrage dit où était la racine (et dessine l’accord s’il était faux aussi) ; une note fausse en localiser est écrite telle qu’elle a été jouée.
- **D5 — Une seule piste, `lane`**, dans le monde calme, pour localiser et les triades (`LaneView`, placement pur dans `views/laneView.ts`, dessins par `PICTURE_VIEWS`) ; `answer-keys` lit le même modèle. Le modèle d’écran unique est `PromptStageModel` (`application/presentation/promptStage.ts`), construit par la série depuis le plan placé : la consigne rendue par `presentPrompt` depuis `ExerciseDefinition.presentation` (`PromptPresentation`, des textes à champs `{note}`, un par langue ou commun), la place, les bandes des attentes étendues (`StagePlace.bands`) et le verdict par attente (`StageVerdict.misses`). La présentation passe par trois registres : les champs d’un item (`ITEM_FIELDS`), les dessins (`PICTURES` : `string`, `lowest-shape`, `shape-at-position`), les vues d’un contenu (`CONTENT_VIEWS`). `NoteLaneView`, `NoteLaneModel`, `AnswerKeysModel`, `PlayScreen` et `MechanicPresenter.stage` sont supprimés ; `/session` encadre toutes les séances dans `PlayFrame` ; `/session/demo?shot=triad` montre la piste d’une triade. Le geste garde `stageOf`, `link-lane` et `grid-scroll` (D9).
- **D6 — Plus de son de verdict** : `SoundCuePort`, `WebAudioCues` et la page d’écoute `cues/listen.ts` sont supprimés ; seul le clic sonne.
- **D7 — L’aperçu se résout en un seul lieu** : `previewBeatsOf(definition, presenterDefault)` (`domain/exercise/pacing.ts`), lu par `SeriesItems.flowOf` et passé au compilateur (`{ param: 'previewBeats' }`, 0 sans aperçu) ; `DEFAULT_RESPIRATION_BARS` = 1, `DEFAULT_PREVIEW_BEATS` = 1 (R4).
- **D8 — `leadBeats`** reste le nom de l’avance d’un niveau (`LadderParams.leadBeats`, `PlannedItem.leadBeats`, `{ param: 'leadBeats' }`) et disparaît de `CardState` (avec `cardLeadAfter`, `PLACEHOLDER_LEAD`, `LEAD_STEPS`).
- **D9 — La frontière du code de famille**, telle que le plan la nomme ; aucune ligne n’a bougé pendant la réalisation :

  | Reste du code                                                                                                                         | Pourquoi pas en H5                                                                               | Quand                                                                      |
  | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
  | Les sujets d’apprentissage (`neckSubject`, `triadSubject`) : ordre d’introduction, voisins, ouverture de la zone, position de la zone | « une autre forme que la dernière », « ouverte par l’ancrage » sont des relations entre réponses | avec les relations (5 exercices du corpus), au passage du geste en données |
  | Les candidats du capteur d’accords (`MechanicPresenter.expectation`, les renversements par `closeTriadVoicings`)                      | les confusions d’un accord de quatre sons demandent les familles de voicings                     | chantier 3 (familles de voicings, juge dans le grave)                      |
  | La forme stockée d’un essai (`attemptData`), `debugLines`, les touches de réponse                                                     | les statistiques du manche lisent la forme stockée                                               | chantier 5 (mesures par compétence)                                        |
  | Le geste : sélecteur, présentateurs (`stageOf`, `feedback`), `link-lane`, `grid-scroll`                                               | montée, zone et lien sont des relations                                                          | avec les relations                                                         |

- **D10 — Le format laisse la place aux séquences** : `round.expectations` est une liste ; `roundProblem` refuse toute clé de `round` ou d’une attente qu’il ne connaît pas, si bien qu’aucun exercice n’écrit `round.figure` avant qu’elle existe.
- **D11 — L’accompagnement en données** pour toute série n’est pas fait : il vient avec le geste en données.

**Les pièces, classées**

| Pièce                                                                                | Classe          | Ce qu’elle permet                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RoundTemplate`, `compileRound`, `Num` (`{ param }`, `{ item }`), `roundProblem`     | primitive       | tout tour à réponse décrit en données : attentes, capteurs, positions, étendues, fenêtres, longueur, politique ; l’avance réglée par le niveau, tout autre nombre par l’exercice (les niveaux sur deux axes en H6) |
| `CONTENT_DERIVATIONS`, `ITEM_NUMBERS`                                                | vocabulaire     | tirer un contenu ou un nombre d’un item, sans nommer d’exercice                                                                                                                                                    |
| `PromptPresentation` (champs, détail, cible, bande, aperçu, aide, aide qui s’efface) | donnée          | ce que l’écran dit d’une consigne, sans code                                                                                                                                                                       |
| `ITEM_FIELDS`, `PICTURES`, `CONTENT_VIEWS`                                           | vocabulaire     | les mots d’un item, ses dessins, ce qu’un contenu dit de sa réponse et de son raté                                                                                                                                 |
| `promptStage`, `PromptStageModel`, `StagePlace.bands`                                | primitive       | un modèle d’écran pour tout exercice à réponse, les bandes calculées depuis le plan                                                                                                                                |
| `LaneView`, `PICTURE_VIEWS`                                                          | vue générique   | une piste pour tout exercice à réponse joué sur le temps                                                                                                                                                           |
| `presentationProblem`, `screenProblem`, `previewProblem`, `seriesProblem`            | primitive       | refuser, en nommant l’exercice et le champ, une présentation, un écran, un aperçu ou un tour que la série ne joue pas                                                                                              |
| `AudioClockPort.epochNow`                                                            | primitive       | l’heure avant que le contexte audio existe (R7)                                                                                                                                                                    |
| `randomExercise`, `rightPayload` (`testing/randomExercise.ts`), `openness.spec.ts`   | test            | la promesse « tout exercice valide se joue », vérifiée sur des exercices tirés au hasard                                                                                                                           |
| `TRIAD_LADDER_V10`, `v10.ts`                                                         | migration       | figée, jamais lue par le jeu                                                                                                                                                                                       |
| sujets, candidats d’accords, `attemptData`, geste                                    | code de famille | la frontière nommée (D9)                                                                                                                                                                                           |
| aucune                                                                               | exception       | —                                                                                                                                                                                                                  |

**Le critère de fin, vérifié** (amendement du 2026-10-23, section 6) par une seule recherche en fin de branche, pas par un test gardé dans le code : `rg` sur `domain/timing`, `TimingRelation`, `MetronomePort`, `WebAudioMetronome`, `BEATS_PER_BAR`, `alignedPromptBeat`, `adjustLead`, `learnedLead`, `initialLead`, `laneBeat`, `isResponseSuccess`, `learnSelector`, `triadSelector`, `sequence.ts`, `SEQUENCES_ENABLED`, `PlayScreen`, `LEARN_SESSION_MS`, `GESTURE_SESSION_MS`, `cardLeadAfter`, `leadStepsOf`, `beatPacingOf`, `SoundCuePort`, `card.leadBeats`, les six constructeurs de plan, `PlanSource`, `NoteLaneModel`, `AnswerKeysModel` et `new SessionController`, dans `src` et `scripts` hors `migrations/` et `legacy/`. Une seule ligne reste, légitime : `card.leadBeats` dans `validateBackup.ts`, la validation des fichiers 1 à 5 avant leur migration. Les autres restes trouvés étaient des noms réutilisés dans les tests (aides de spec nommées comme les constructeurs supprimés, constantes locales `BEATS_PER_BAR`) et des assertions de noms absents ; renommés ou retirés dans le dernier commit. `PlanSessionController` garde son nom jusqu’à H6 (fusion) ; `SessionKind` reste (chantier 2).

**Écarts acceptés pendant la réalisation** (le registre en garde le détail ; chacun dit ce que le joueur vit et ce qu’il coûte s’il est faux) :

- **Un tour de triade écoute jusqu’à sa fin** (R2, R5 ; D3 le voulait) : l’ancienne relation cessait d’écouter à l’aperçu suivant. Le joueur : un accord juste joué tard, jusque dans le dernier temps de la respiration, compte hors temps (juste, noté Difficile) au lieu d’être ignoré. Si c’est faux : la capture se raccourcit en écrivant `listenBeforeEnd` dans les deux gabarits, sans code.
- **L’aperçu par défaut est d’un temps** (R4) : le plan disait 2 par erreur ; l’ancien `STRING_PREVIEW_BEATS` valait 1. Le joueur voit la corde un temps avant la note, comme avant.
- **La correction d’un accord nomme la forme attendue à la position demandée, sinon la plus proche de celle entendue** (R6), et non plus la forme la plus basse de l’ancrage ; une racine ratée n’a plus d’écart « racine entendue », elle dit sa position (D4). Si c’est faux : une correction d’ancrage peut nommer une autre forme que la plus basse ; se reformule dans `CONTENT_VIEWS` seulement.
- **L’écran de jeu s’ouvre avant que l’horloge audio existe** (R7) : un chargement à froid de `/session` montrait l’erreur « AudioContext not created yet » au lieu de l’écran de départ, parce que la série lisait l’heure de l’horloge audio avant toute reprise. **Le bogue est aussi sur `main`** pour l’Apprentissage et le Jeu libre ; corrigé ici, génériquement : `AudioClockPort.epochNow()` (l’heure audio quand le contexte existe, sinon `Date.now()`), le contexte n’étant toujours créé que par « Commencer ». Corrigé dans `main` quand H5 fusionne.
- **La capture tardive d’un point finit là où l’attente suivante est due** (R8, « le juge doit avoir raison ») : la capture d’une première note ratée ne prend jamais la deuxième note jouée à son temps. Si c’est faux : une capture un peu plus courte entre deux points d’un même capteur.
- **Un point dont la fenêtre n’ouvre qu’après la fin de l’écoute est accepté** (R9) : selon le tempo (12 graines sur 7567), il ne peut jamais être répondu ; le moteur le joue et stocke un raté. Le refuser demanderait une règle qui dépend du tempo, et il s’exécute (langage ouvert). Si c’est faux : un auteur peut écrire un exercice impossible à réussir à certains tempos, sans avertissement ; un analyseur du guide d’écriture pourra le signaler.
- **Le prompt, le libellé de réponse et la révélation du présentateur du geste sont supprimés** (R10) : seul leur spec les lisait. Rien ne change pour le joueur.
- **Une triade apprise stockée à l’avance 8 reçoit le niveau 0, aidé** (R11, D2 au pied de la lettre, comme `v9.ts` pour localiser) : la carte était revenue à l’avance la plus longue après des ratés. Le joueur voit sa forme une fois, jusqu’à une réussite. **À confirmer par l’auteur.**
- **Une série jouée sans calibration enregistre une latence nulle**, pas `null` (`SessionRecord.latencyMs`, séries de réponses et rythme) : les attaques y sont prises telles qu’entendues, la latence appliquée est 0 ; `null` reste la marque d’une séance d’avant les latences.
- **Sans effet sur le joueur** : en tâche 2, le catalogue a gardé un temps les copies `params.targetBarOffset`/`params.countEndsOn` à côté de `round`, retirées en tâche 3 (R1) ; les tests de frontière de `domain/exercise/round/`, `promptStage.ts` et `LaneView.svelte` ont été écrits par la tâche qui crée chaque fichier (R3) ; les tests de parité des tâches 1 et 2 comparaient au plan des constructeurs ajusté de ce que le gabarit dit autrement (la zone entendue par le capteur d’accords, l’écoute des triades jusqu’à la fin, R2).

**Les trous du moteur trouvés par le test au hasard** (tâche 8, `series/openness.spec.ts` : 200 graines, chaque exercice que les validateurs acceptent joué avec des réponses justes et sans réponse) ; chacun corrigé dans la pièce fautive, jamais en restreignant le tirage :

- **Capture tardive et attente suivante** : avec une fenêtre ouverte après la consigne (`afterPromptMs`), tous les points s’ouvrent à la fois ; la capture tardive d’un point finissait à l’ouverture de la fenêtre du suivant, c’est-à-dire dès la consigne : aucune note en retard n’était captée. Elle finit maintenant où le suivant est dû (R8).
- **À qui va une attaque** : une attaque dans la fenêtre d’un point allait à la capture tardive du point précédent ; puis une première correction (« le point le plus proche ») jugeait mal une première note en retard. Règle finale : une attaque va à la première attente non répondue dont la zone la contient.
- **Le verdict `response` se vérifie avant de jouer** (`VerdictMode.validate`, appelé par `PlanRound` comme `PairingMode.validate`) : un tour sans point ou sans fenêtre en millisecondes est refusé avant que rien ne soit entendu, plus au premier jugement.
- **`roundProblem` compile le tour aussi loin que l’exercice connaît ses places** et refuse ce qui ne s’exécuterait pas : une longueur nulle, des attentes hors d’ordre ou hors du tour, une écoute qui finit avant de commencer, une étendue qui commence où l’écoute est finie, un plan que son mode d’appariement ou de verdict refuse. Un point placé après la fin de l’écoute reste accepté (R9).
- **Un exercice à réponse sans écran** (ni présentation, ni `stageOf` de son présentateur) est refusé (`screenProblem`) ; **un aperçu du présentateur qui ne laisse aucune écoute** au gabarit aussi (`previewProblem`).

**Corrections de la relecture finale** (une vague ; le tirage au hasard tire désormais toute valeur du gabarit : chaque mode d’appariement et de verdict enregistré, les deux unités, les deux rôles, les attaques sans contenu, les mesures muettes et les vues ; chaque exercice accepté est joué juste, faux et sans réponse). Chaque refus dit « ne s’exécute pas », jamais « n’a pas de sens » :

- **La première réponse et le verdict `response` refusent un silence jugé** (`role: 'judged-rest'`) : ils apparient des attaques à des cibles, un silence n’est jamais répondu ; une note jouée sur un silence comptait juste. Le jugement d’un silence (juste quand rien n’est joué dans sa fenêtre) n’est pas écrit : il demande un état de plus dans l’appariement et l’écran d’un raté de silence.
- **L’alignement refuse ce qu’il ne juge pas** : une attente en temps libre, une étendue (il ne date que son début), un contenu (il ne juge que le temps : une note fausse comptait juste), deux attentes à la même place, plus d’un capteur (il apparie au temps seul). Il garde un silence jugé : une attaque là est un ajout, que le verdict `cycle` juge.
- **L’alignement s’exécute dans la série** : une autre lecture d’une attaque gardée est la même attaque, pas un ajout ; un tour qui ne boucle pas ouvre sa capture la zone de sa première cible avant son départ (une première attaque un peu tôt comptait ratée) et la ferme à sa fin ; la capture s’arrête où le plan cesse d’écouter (`listenUntil`, sinon le tour ne se réglait jamais).
- **Le verdict `cycle` refuse un plan qui n’est pas un cycle aligné** (`unit` autre que `'cycle'`, appariement autre que l’alignement, temps libre) et dit qu’il lit des seuils (`VerdictMode.readsThresholds`).
- **`seriesProblem`** (`application/session/series/seriesProblem.ts`) refuse ce que la série de réponses ne joue pas : `round.policy.unit: 'cycle'` (elle clôt un tour sur ses réponses), un verdict qui lit les seuils d’un niveau (elle n’en donne pas : le premier jugement levait une erreur en pleine séance), `round.mutedBars` non vide (elle ne coupe jamais le clic ; la mesure muette était stockée mais jamais jouée). Vérifié avec les autres vérifications de l’application (catalogue, `openness.spec.ts`, troisième mécanique).
- **La vue suit la présentation** : un exercice qui écrit sa présentation sans vue est dessiné sur la piste (`playViewOf`, `DEFAULT_PROMPT_VIEW` = `'lane'`, au lieu de `grid-scroll` qui tombait sur un modèle qu’il ne lit pas) ; `screenProblem` refuse une vue que l’écran n’a pas (`PLAY_VIEW_NAMES`, dans l’application parce qu’elle n’importe pas l’écran ; un test de l’écran la tient égale au registre `PLAY_VIEWS`), une présentation sur une vue qui lit un autre modèle (`PROMPT_STAGE_VIEWS` = `lane`, `answer-keys`) et une telle vue sans présentation.
- **Les lignes de détection d’un présentateur ne lisent que ses capteurs** : une attaque sans contenu entendue par un autre capteur faisait lever `debugLines` de localiser.
- **La piste dessine chaque attente étendue** comme sa bande (`laneTiles({ bands })`, la première seule avant) ; le nom de la bande court sur la première.
- **La ligne d’information ne montre pas de tempo** tant que la série n’en a pas (« ♩ = 0 » avant « Commencer »).
- **Le juge épinglé** : les bords d’arrondi du verdict (6,1804 s `perfect` / 6,1806 s `late` ; 13,0004 / 13,0006 en temps libre) et la note fausse de la capture tardive, qui reste `wrong`, ont leurs tests sur le moteur.

**Points mineurs laissés** : voir « Points mineurs reportés », ligne H5.

### Réalisation du plan H6 (2026-10-27)

Branche `plan/temps-musical-h6` (worktree `.worktrees/temps-musical-h6`), partie de `main` (`711028d`), plan `docs/superpowers/plans/2026-10-27-h6-niveaux-et-controleur-unique.md`. Fusionnée dans `main` le 2026-10-27, en une seule fois. Tout exercice progresse par des niveaux écrits en données, le tempo compris ; le geste monte de tempo en cours de séance ; la progression de tempo de fin de séance a disparu (Dexie 11, sauvegarde 7) ; un seul contrôleur, `SessionController`, joue tous les exercices, le rythme compris. Ce que le code fait de chaque décision :

- **D1 — Une branche, deux parties, une fusion** : partie A, les niveaux d’exercice (tâches 1 à 4) ; partie B, le contrôleur unique (tâches 5 à 10) ; tâche 11, le critère de fin et la documentation ; chaque commit vert (`npm test && npm run check`, 2 488 tests à la fin). La partie A n’a pas été fusionnée à part. Le chantier 2 prend la version 12.
- **D2 — Un niveau surcharge des chemins pointés** (`domain/exercise/levels.ts`) : `overrideParams` remplace la valeur de chaque chemin et rien d’autre, sans modifier ce qu’il reçoit ; un objet écrit à un chemin remplace celui qui y était ; un chemin absent est créé. `resolvedParamsOf(definition, { exerciseLevel, itemLevel, mechanic })` applique les paramètres de l’exercice (`exerciseParamsOf` : `params`, fenêtres, respiration, seuil de rappel, `tempo`), puis le niveau d’exercice, puis le niveau d’item sur l’échelle de sa mécanique ; les niveaux d’aide ont des index négatifs. Un exercice qui n’écrit pas de niveaux en a un implicite, vide (`exerciseLevelsOf`). `roundParamsOf` lit ces paramètres résolus : tout `{ param }` d’un gabarit peut désormais changer avec le niveau. `PlannedItem.exerciseLevel` (obligatoire, écrit par la série) et `PlannedItem.level` (le niveau d’item, écrit par les sources qui servent une échelle) portent les deux axes. Le rythme écrit ses seuils clé par clé (`'thresholds.precision': 50`) ; `resolveLevel` et `base` sont supprimés ; un tableau figé (`RESOLVED_BEFORE_H6`, `rhythmCatalog.spec.ts`) prouve que chaque niveau du rythme se résout comme avant. `validateExercise` refuse un chemin qui traverse une valeur qui n’est pas un objet, dans un niveau d’exercice ou d’item, et un tempo résolu qui n’est pas positif ; il accepte un chemin qu’aucune pièce ne lit.
- **D3 — Le tempo du geste monte en séance, à une respiration** : `ExerciseDefinition.tempo` est un nombre (absent : `DEFAULT_TEMPO_BPM`, 80), la seule source du tempo ; `tempoOf(definition, exerciseLevel)` le résout. Les quatre exercices du geste écrivent, en données, `tempo: 80` et 9 niveaux de ♩ = 80 à ♩ = 120 par pas de 5, chacun passé après 10 changements réussis de suite sans aide et quitté après 3 ratés de suite (`tempoLevels`, `domain/gesture/exercises.ts`). Ce sont les données du geste, pas une règle du moteur : un exercice plus rapide (en croches) pourra venir comme un autre exercice. La série tient un niveau par (exercice, portée) (`ExerciseLevels`, `series/exerciseLevels.ts`) : elle lit les niveaux enregistrés une fois par série, règle chaque tour (`nextLevelState`), enregistre aussitôt, et n’écrit que pour un exercice qui écrit des niveaux (localiser, identifier et les triades n’enregistrent rien). Un niveau atteint s’applique au prochain tour qui ne s’enchaîne pas : le passage suivant du geste, après sa mesure comptée ; un tour de relier rejoué à la suite (`continued`) garde son tempo. Le cadre annonce « Niveau 4 sur 9 · ♩ = 95 » (`PlayView.announcement`) ; une pause pendant la mesure comptée reprend au nouveau tempo et remontre l’annonce, sans compter le niveau deux fois. Le joueur finit son passage au tempo où il l’a commencé, puis joue le suivant au nouveau.
- **D4 — Le bilan du geste dit le premier et le dernier tempo joués** (`summarizeGesture` : `tempoBpm`, `lastTempoBpm`, lus sur les essais) : « ♩ = 80 → 85 », ou « ♩ = 80 » seul quand ils sont égaux. Il ne prédit plus de tempo suivant ; la séance suivante reprend au niveau enregistré, même s’il n’a pas été joué.
- **D5 — Dexie 11 et sauvegarde 7** (`storage/migrations/v11.ts` : `GESTURE_TEMPOS_V11`, `GESTURE_EXERCISES_V11`, `GESTURE_GRID_EXERCISES_V11`, `gestureLevelOfTempo`, `levelStatesV11`, `attemptToV11`, `backupV6ToV7`) : une progression du geste que le jeu lisait (le relier sans portée ; la montée, la zone et le jam dans la portée de leur grille) devient le niveau d’exercice de sa portée, le plus haut dont le tempo ne dépasse pas le sien (112,5 → niveau 6 ; 160 → 8 ; 70 → 0) ; un niveau déjà là est gardé ; toutes les autres progressions sont abandonnées avec les tables `progressions` et `scopedProgressions` ; `Attempt.tempoScope` devient `Attempt.scope`. Les tempos, les exercices et ceux qui jouent sur des grilles sont figés, chacun avec son fil-piège contre le catalogue. La mise à niveau ne lit aucune mécanique, donc ne s’interrompt sur aucune : elle abandonne ce qu’elle ne connaît pas. Une sauvegarde 7 refuse `progressions` et `tempoScope` ; une sauvegarde 6 passe par `backupV6ToV7`, la même fonction que la mise à niveau (test « même base » sur les données du Review Focus). `Progression`, `ProgressionRepositoryPort`, `DexieProgressionRepository`, `startTempo`, `nextTempo`, `clampTempo`, `ExerciseTempo`, `DEFAULT_TEMPO`, `startTempoBpm` et `SessionDeps.progressions` sont supprimés. Un blues travaillé jusqu’à 110 bpm reprend à 110.
- **D6 — L’anti-blocage est une donnée du déroulé** (`flow.antiBlocking`, absent : non) : les trois exercices du rythme l’écrivent `true`, et la politique ne lance ses remèdes que pour eux. Un tour jugé sans rapport de cycle (un tour à réponse) se diagnostique `unclear` (`diagnoseBlock`) et ne nomme aucune mesure qui casse. Trois changements ratés de suite à 80 bpm ne finissent donc pas une séance du geste sur « On change d’air ».
- **D7 — Une seule politique de frontières pour toute série** (`domain/session/policy.ts`) : `next(state, rules, elapsedMs, coming)`, où `coming` dit si le tour suivant s’enchaîne et s’il demande une mesure comptée. Une suite respire après `pacing.roundsPerBreath` tours (le rythme : 4, 1 et 4) ou avant un tour compté, jamais sur le compte qui l’ouvre ; passé sa durée, la série finit à la première frontière où le tour suivant ne s’enchaîne pas, ou `'complete'` quand la source n’a plus rien. La respiration du rythme dure au moins `pacing.breathMinMs` en mesures entières (4 000 ms, `SHORTEST_BREATH_MS` du catalogue ; `Transport.breath(atBar, minMs)`), sa dernière mesure comptée. `cyclesPerBreath`, `CYCLES_PER_BREATH` et `BREATH_MIN_MS` sont supprimés ; `pacingAt(definition, level)` lit la respiration d’un niveau. Le placement (`placeNext`, tâche 1) décide en un lieu pur si le tour suivant s’enchaîne, vient après la respiration, au temps suivant ou après une mesure comptée. Rien ne change pour le joueur en localiser ni dans les triades ; dans le geste, une montée de tempo entre deux passages.
- **D8 — Le cycle reste un compilateur à part jusqu’à la séquence** : `series/compilePlan.ts` est le seul lieu du cœur qui distingue un cycle (un exercice qui écrit `figures`, compilé par `compileCycle`) d’un gabarit (`compileRound`) ; il donne aussi les seuils, les aides, le réglage tardif (`settleAfter`), l’écoute préalable, l’accompagnement d’une suite et l’essai à écrire. Le code qui nomme le cycle vit dans `application/session/cycle/` : `createFigureSource` (un item par tour de figure, `atLevel` le resservant au niveau joué), `compileCycle`, `recordCycle`, `cycleStage`, `exerciseSummary`, `rhythmExercise` et `RHYTHM_PRESENTERS` (la scène et le capteur `attack`). Un cycle décide de la suite un temps avant sa fin (`DECIDE_AHEAD_BEATS`), pour que la première mesure suivante soit ordonnancée à temps, et continue de prendre ce qu’il a capté jusqu’à son réglage. Un gabarit peut désormais écrire un accompagnement (`params.accompaniment`, surchargeable par niveau) et des mesures muettes, que la série joue.
- **D9 — Annonces, réécoute et trace pour toute série** : `PlayView.announcement` (`level-up`, `level-down`, `aid-level` pour tout niveau sous 1, `listen-remedy`, `play-along`, `change-of-air`), affichée par `PlayFrame` pour toute vue pendant la respiration et la mesure comptée, effacée à la consigne suivante. `SeriesTrace` (des suites emboîtées : `listen-in`, `count-in`, `run` › `round`/`listen`, `breath`, `pause`) et `SeriesTakes` (la prise de chaque suite) valent pour toute série et passent à `SessionMemory`. La réécoute (R) rejoue la dernière suite depuis la pause ou la respiration, à la latence du capteur que cette suite écoutait (`sensorLatency`). Écouter (E) n’agit que pour un exercice dont le contenu sait sonner (`canSound` : il écrit `figures`). En pause, le joueur peut réécouter son dernier passage du geste ou ses dernières notes.
- **D10 — `PlayFrame` prend son monde de la vue de l’exercice dès l’écran de départ** : `ready()` met en scène la vue du premier item ; `/session` ne dessine le cadre qu’une fois `ready()` résolu ; le cadre garde le monde de la dernière vue montrée quand la scène se vide (la fin) ; il ne lit plus le genre de séance. Une entrée qui finit de s’ouvrir après « Quitter » (pendant la demande d’accès au micro) est refermée, si aucune ouverture plus récente ne la possède.
- **La bascule** (tâche 9) : `ResponseSeriesController` devient `SessionController` (`application/session/SessionController.svelte.ts`), `PrepareResponseSeries` `PrepareSession`, `ResponseSeriesDeps` `SessionControllerDeps` ; `PlanSessionController`, son dossier `plan/` et `PlanSessionDeps` (ses champs passés dans `SessionDeps`) sont supprimés ; `startExercise` joue un exercice de figures sur le contrôleur unique. Un test de frontière refuse les deux anciens noms dans tout `src`.

**Les pièces, classées**

| Pièce                                                                                                               | Classe    | Ce qu’elle permet                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `overrideParams`, `resolvedParamsOf`, `exerciseLevelsOf`, `tempoOf`, `pacingAt`                                     | primitive | tout niveau, d’exercice ou d’item, règle n’importe quel paramètre, tempo compris                              |
| `ExerciseDefinition.levels` pour tout exercice, `tempo` en nombre                                                   | donnée    | une progression d’exercice sans code : tempo, fenêtres, accompagnement, respiration, n’importe quel paramètre |
| `ExerciseLevels` (niveau tenu par la série, appliqué au prochain tour qui ne s’enchaîne pas)                        | primitive | un niveau qui bouge en séance pour tout exercice, annoncé, avec une mesure comptée au nouveau tempo           |
| `placeNext` (`series/placement.ts`)                                                                                 | primitive | la place du tour suivant décidée en un lieu pur : enchaîné, après respiration, au temps suivant, après compte |
| `next` avec `coming`, `pacing.roundsPerBreath`, `pacing.breathMinMs`                                                | primitive | les suites, les respirations et la fin de toute série, en données                                             |
| `flow.antiBlocking`, `flow.briefing`                                                                                | donnée    | l’anti-blocage et le moment de la consigne choisis par l’exercice                                             |
| `PlayView.announcement`                                                                                             | primitive | une annonce de niveau ou de remède pour toute vue                                                             |
| `SeriesTrace`, `SeriesTakes`, `replay`                                                                              | primitive | la trace et la réécoute de la dernière suite de tout exercice                                                 |
| `sensorLatency` (`LATENCY_FALLBACK`), `asksForHeadphones`                                                           | primitive | la latence de chaque capteur avec son repli ; le casque demandé quand le clic tromperait le capteur           |
| `ItemSource.atLevel`                                                                                                | primitive | resservir un item au niveau joué                                                                              |
| niveaux du geste (9 tempos, 80 à 120, `pass` 10, `drop` 3)                                                          | donnée    | le tempo du geste en séance                                                                                   |
| `TRACK_MECHANICS` (`createAppServices`)                                                                             | donnée    | les capteurs qu’ouvre une séance des notes, des triades ou du geste ; composition de séance, au chantier 2    |
| `GESTURE_TEMPOS_V11`, `GESTURE_EXERCISES_V11`, `GESTURE_GRID_EXERCISES_V11`, `v11.ts`                               | migration | figée, jamais lue par le jeu                                                                                  |
| `cycle/` (`createFigureSource`, `compileCycle`, `recordCycle`, `cycleStage`, `RHYTHM_PRESENTERS`), `compilePlan.ts` | exception | le rythme sur la série, en attendant `round.figure` (S) ; à absorber par la séquence                          |

**Le critère de fin, vérifié** par une seule recherche en fin de branche : `rg` sur `PlanSessionController`, `ResponseSeriesController`, `PlanSessionDeps`, `ResponseSeriesDeps`, `PrepareResponseSeries`, `Progression`, `ProgressionRepository`, `progressions`, `scopedProgressions`, `nextTempo`, `startTempo`, `clampTempo`, `ExerciseTempo`, `DEFAULT_TEMPO`, `startTempoBpm`, `tempoScope`, `nextProgressions`, `seriesEnd`, `resolveLevel`, `cyclesPerBreath`, `CYCLES_PER_BREATH`, `BREATH_MIN_MS`, `base:`, `seriesProblem`, `PlanStageModel` et `exerciseTempoOf`, dans `src` et `scripts` hors `migrations/` et `legacy/`. Restent, légitimes :

- les lecteurs des anciennes données, qui doivent les lire jusqu’à leur migration : `validateBackup.ts` (les progressions et `tempoScope` des fichiers 2 à 6, et les refus d’un fichier 7), `db.ts` (les schémas des versions 5 à 10 et la mise à niveau 11), `testing/fixtures.ts` (`makeProgressionV6`, `makeBackupV6`), la sauvegarde figée `fixtures/backup-v3.json`, et leurs tests (`db.spec.ts`, `DexieBackup.spec.ts`, `validateBackup.spec.ts`, `legacyImport.spec.ts`) ;
- `resolveLevel` dans le commentaire du tableau figé `RESOLVED_BEFORE_H6` (`rhythmCatalog.spec.ts`), qui dit d’où viennent ses valeurs ;
- `base:`, des noms locaux sans rapport (`const base` de tests, `base: RoundTimes`, « database: » dans un commentaire de `createApp.ts`).

Les assertions de noms absents (`session/boundaries.spec.ts`) construisent les noms par `join` et n’apparaissent pas. Nettoyé dans le dernier commit : le paramètre `now` de `validateBackup`, mort depuis que la sauvegarde 7 abandonne la progression qu’il datait, et l’import par `legacy/v1.ts` d’un type de `migrations/v11.ts` (le format 2 a son type figé, `ProgressionV2`).

**Écarts acceptés pendant la réalisation** (le registre en garde le détail ; chacun dit ce que le joueur vit et ce qu’il coûte s’il est faux) :

- **Le moment de la consigne est une donnée** (`flow.briefing` : `'each-series'` par défaut, `'first-encounter'`) : la série racontait la consigne d’un exercice à chaque série, le rythme seulement tant qu’il n’avait aucun essai. Les deux comportements restent : les trois exercices du rythme écrivent `'first-encounter'`. Le joueur : rien de nouveau. Si c’est faux : une donnée que l’auteur peut vouloir retirer.
- **L’annonce s’efface à la consigne**, pas à la fin de la mesure comptée (D3 disait « pendant la mesure comptée ») : dans le geste, le compte finit sur le changement (`countEndsOn: 'target'`) et la consigne paraît un temps avant ; l’annonce se voit sur les premiers temps du compte et disparaît quand la grille s’ouvre. Si c’est faux : une ligne à changer dans le contrôleur.
- **La séance enregistre la latence du premier capteur calibré qu’elle rencontre** (`SessionRecord.latencyMs`, par `sensorLatency`) : le geste garde celle du capteur d’accords (la calibration écrit `note` = `chord`, donc aucune différence enregistrée), le rythme celle de l’attaque ; une séance d’apprentissage qui commence par un nom à toucher (le toucher n’a pas de latence) puis joue des notes garde celle des notes, qui a corrigé ses essais joués ; 0 seulement quand aucun capteur de la série n’est calibré. Une série qui mêle des capteurs calibrés ne garde que le premier. Si c’est faux : l’analyse d’une séance mêlée lirait une latence qui ne vaut que pour une partie des essais.
- **Une séance n’ouvre que les capteurs de ses mécaniques** : une séance d’exercice (le rythme) ouvre son seul capteur ; les séances des notes, des triades et du geste ouvrent ceux des cinq mécaniques des voies (`TRACK_MECHANICS`), comme avant, sans le capteur d’attaques. Le joueur : rien ; leurs observations ne changent pas. Si c’est faux : un choix de produit, une ligne à changer, qui change ce que ces séances stockent.
- **Le cadre attend `ready()`** avant de se dessiner (fond neutre pendant ce temps) et garde son monde à la fin : sans cela, les notes et les triades montraient un éclair du monde Game Boy à l’ouverture et à la fin. Le joueur : un premier affichage un peu plus tardif, sans éclair. Si c’est faux : un `ready()` qui ne se résout jamais laisse `/session` vide, sans lien pour quitter (point mineur).
- **La pause des notes, des triades et du geste a celle du rythme** : R pour réécouter, Échap pour fermer la pause, « Quitter l’exercice ». Une réécoute depuis la pause reprend le jeu aussitôt après, comme le rythme. Si c’est faux : un libellé à changer, ou le drapeau de `PlayFrame` à scinder.
- **La démonstration est générique** : tout exercice pas encore rencontré dont le contenu sait sonner est démontré une fois par série, au début de sa première suite ; `listen()` existe sur toute série et ne fait rien quand le niveau ne donne pas d’écoute. Le joueur : rien de nouveau dans le rythme. Si c’est faux : sans effet aujourd’hui (seul le rythme sait sonner) ; la séquence, qui fera sonner ses figures, démontrerait chacun de ses exercices nouveaux sans que l’auteur l’ait demandé, et il faudrait en faire une donnée du déroulé, comme `flow.briefing`.
- **Les niveaux d’exercice bougent dans toute séance, jeu libre compris** ; l’ancienne progression ignorait le jeu libre. Aujourd’hui, aucune séance libre ne joue un exercice à niveaux, hors le rythme, qui bougeait déjà. Si c’est faux : sans effet aujourd’hui ; quand une séance libre jouera un exercice à niveaux (le geste, par exemple), un joueur qui s’y amuse ferait monter ou descendre le niveau de son entraînement, et le jeu libre devrait lire sans écrire.
- **Une série de réponses qui respire par `roundsPerBreath` respire d’une mesure comptée** : `breathMinMs` n’est lu qu’après un tour réglé en avance (un cycle). Aucun exercice à réponse n’écrit l’un ou l’autre ; le joueur ne vit rien. Si c’est faux : un exercice à réponse qui écrit `breathMinMs` respire moins longtemps qu’il ne l’écrit, sans avertissement.
- **Le niveau d’une suite de cycles s’applique une fois son dernier cycle réglé**, pas à la décision prise un temps avant ; la marque d’une suite reste visible pendant les mesures d’entrée de la suivante. Le joueur : la suite suivante part au niveau que la précédente a vraiment atteint. Si c’est faux : le joueur voit encore les marques de la suite jouée pendant l’écoute de la suivante ; les ôter dès la première mesure d’entrée se règle dans le modèle d’écran du cycle (`cycleStage`).
- **La dernière mesure de la respiration est tracée comme respiration**, pas comme mesure comptée (comme l’ancien contrôleur) ; une série qui finit faute d’items finit `'complete'` ; l’enregistrement de fin n’est écrit que si celui du début l’a été (une série dont l’entrée ne s’est jamais ouverte n’en laisse aucun). Sans effet visible. Si c’est faux : sans effet pour le joueur ; seule une analyse future de la trace lirait la dernière mesure de respiration sous un autre nom.
- **Un trou de validation fermé** : un gabarit dont le verdict lit des seuils (`cycle`) à un niveau qui n’en donne pas passait `validateExercise` et levait une erreur au premier jugement ; il est refusé, en nommant le niveau. Si c’est faux : sans effet, aucun exercice du catalogue n’est dans ce cas ; un auteur verrait son exercice refusé au chargement plutôt que planter au premier jugement.
- **Sans effet sur le joueur** : le contexte de placement a perdu `freeTimeBefore` (rien ne le lisait) et gagné `nowBar` ; `PlannedItem.level` est ajouté pour que `roundParamsOf` lise le niveau d’item ; le tempo du rythme passe de ses paramètres à `definition.tempo`, une seule source ; entre les tâches 3 et 4 une progression enregistrée du geste n’était pas lue (une seule fusion) ; `cycle/` a reçu les pièces du cycle avant la suppression de `plan/` (chaque commit vert) ; `seriesProblem`, qui ne refusait plus rien depuis que la série joue les cycles et les mesures muettes, est supprimé avec ses appelants ; `PlanSessionDeps` est fondu dans `SessionDeps`, l’entrée de `createAppServices`. Si c’est faux : sans effet, aucun ne change ce que le joueur vit.

**Après la séance de l’auteur (2026-10-28)** :

- **La respiration sonne comme l’exercice, et un changement de tempo se dit jusqu’au jeu** (tâche 12). La respiration joue l’accompagnement de la suite jouée, au niveau joué, ses mesures muettes rallumées (on y retrouve la pulsation, on n’y travaille pas le silence) ; sa dernière mesure est comptée à voix haute seulement quand le niveau a une mesure comptée, sinon l’accompagnement continue et le compte 4..1 s’affiche sans bruit. Un exercice sans accompagnement (notes, triades, geste) garde le clic de la série, comme avant. Toute suite qui part sans mesure comptée montre le même compte muet sur la mesure d’avant (au début de la série, après une pause, après un changement de tempo). L’annonce d’un niveau atteint reste du début de la respiration (ou de l’écoute) jusqu’à la première mesure jouée de la suite (ses mesures d’entrée comprises), et le cadre la pose par-dessus le haut du champ, hors du flux, à la taille d’une ligne de consigne : la vue ne bouge pas quand elle vient ou s’en va ; les remèdes et « On change d’air » restent dans la ligne d’état, quel que soit l’état. Le joueur : dans « Métronome sur 2 et 4 », le clic reste sur 2 et 4 pendant la respiration ; après un changement de tempo, il voit « Niveau 2 sur 3 · ♩ = 120 » en grand pendant l’écoute, puis « 4 3 2 1 » sur sa dernière mesure, et joue. Si c’est faux : un joueur qui préférait se recaler sur un clic à chaque temps l’entend moins pendant la respiration de « 2 et 4 » (le choix est dans l’accompagnement que l’exercice écrit, pas dans le code) ; le cadre décide « dans le champ » par le genre de l’annonce seul (un niveau ne s’annonce qu’avant le jeu) plutôt que par une phase que `PlayView` n’a pas : une future annonce de niveau pendant le jeu couvrirait le haut de la vue ; posée par-dessus, la ligne cache le haut de la vue (son en-tête, dans le rythme) pendant la respiration et l’écoute.

**Points mineurs laissés** : voir « Points mineurs reportés », ligne H6.

## Reprise (état au 2026-10-27, après H6)

> **Mise à jour du 2026-10-30 : la séquence (S) est faite sur sa branche** `plan/sequence-s` (pas encore fusionnée dans `main`, elle attend les deux étapes jouables avec l’auteur). Elle a absorbé le cycle (D8 de H6 : `compileCycle`, la porte de `series/compilePlan.ts`, `cycle/` et `CyclePlanRecord` n’existent plus ; la mécanique `rhythm-figure` est devenue `figure`), changé la place de la figure (D10 de H5 amendée : une entrée de figure dans `round.expectations`, pas un `round.figure`), et pris la version 12 de Dexie (sauvegarde 8) ; **le chantier 2 prend donc la version 13**. À lire : `docs/superpowers/specs/2026-10-30-sequence-design.md` et sa « Réalisation ». Dans ce qui suit, « La suite : la séquence (S) » et le point « Le cycle (D8 de H6) » décrivent l’état avant S.

Ce qu’il faut lire pour reprendre après un résumé de conversation ou dans une conversation neuve, sans rien redemander : cette section, puis l’amendement du 2026-10-23, les sections « Réalisation » de H1, H2, H3 et H4, l’amendement du 2026-10-26 (un langage d’exercices ouvert), sa « Réalisation du plan L », et les « Réalisation » de H5 et de H6, ci-dessus. Au-delà : `docs/vision.md` et `docs/reality-check-corpus-2026-10-27.md`.

### Où en est le chantier

- **H1 à H6 et le plan L sont fusionnés dans `main`** (H6, les niveaux d’exercice et le contrôleur unique, le 2026-10-27, en une fois). La migration (H) est finie : il n’y a plus d’ancien chemin.
- **Ce qui joue sur quoi** : un seul contrôleur, `SessionController` (`application/session/SessionController.svelte.ts`, ses pièces dans `series/`), joue toutes les séances : les notes, les triades, le geste et le rythme ; toutes dans `PlayFrame`, dont le monde est celui de la vue dès l’écran de départ. Localiser et les triades sur la piste `lane`, identifier sur `answer-keys`, le geste sur `link-lane` et `grid-scroll`, le rythme sur `rhythm-figure`. Le cycle du rythme garde son compilateur (`cycle/`, l’exception de D8), que la séquence absorbera.
- **Stockage** : Dexie 11, sauvegarde 7 ; `levelStates` porte le niveau de chaque item et le niveau d’exercice de chaque (exercice, portée) ; plus aucune progression de tempo.
- **Les exercices en données** : tempo, échelle, fenêtres, respiration, déroulé et réglages de l’item (L) ; le tour (`round`) et la présentation (`presentation`) (H5) ; les niveaux d’exercice, qui surchargent n’importe quel paramètre par chemin pointé, tempo compris, les suites et les respirations (`pacing.roundsPerBreath`, `pacing.breathMinMs`), l’anti-blocage et le moment de la consigne (`flow.antiBlocking`, `flow.briefing`), l’accompagnement d’un gabarit (`params.accompaniment`) (H6). `validateExercise` et les vérifications de la présentation (`presentationProblem`, `screenProblem`, `previewProblem`) sont testés sur tout le catalogue et sur des exercices tirés au hasard (`openness.spec.ts`).
- Les plans écrits sont dans `docs/superpowers/plans/` (`2026-10-23-h1-…`, `2026-10-24-h2-…`, `2026-10-24-h3-…`, `2026-10-25-h4-les-notes.md`, `2026-10-26-langage-ouvert.md`, `2026-10-26-h5-les-triades.md`, `2026-10-27-h6-niveaux-et-controleur-unique.md`).

### La suite : la séquence (S), puis le chantier 2

- **La séquence (S)** (`docs/vision.md`) vient maintenant : une suite de notes imposée, jouée en rythme, jugée note à note sur la hauteur et le moment (des figures dont les notes portent une hauteur, un appariement par le temps et la hauteur, un capteur de notes rapides). Elle débloque à elle seule 13 exercices du corpus. Dans le format, elle s’écrit `round.figure` à côté de `round.expectations`, sans changer la forme d’aujourd’hui (D10 de H5). Elle absorbe le cycle (D8 de H6) : un exercice de figures devient un gabarit qui écrit `round.figure`, `compileCycle` et la porte de `series/compilePlan.ts` disparaissent, et `cycle/` ne garde que ce qui reste propre au rythme (son modèle d’écran, peut-être), ou rien.
- **Ce que H6 laisse à S** : la respiration joue l’accompagnement que l’exercice écrit à son niveau (`accompaniment`, mesures muettes rendues) ; quand la séquence écrira son accompagnement dans `round`, la respiration devra le lire là ; une série de réponses qui respire par `roundsPerBreath` ne lit pas `breathMinMs` (une seule mesure comptée) ; les capteurs qu’ouvre une séance sont choisis par la liste `TRACK_MECHANICS`, pas par ce que ses exercices écoutent ; `PlayFrame` garde deux mondes (`VIEW_WORLDS`, calme et Game Boy) jusqu’au plan visuel 3 ; le bilan ne propose la réécoute des suites que pour une séance du rythme (`replayRun` marche pour toute séance en mémoire). Deux notes de la relecture finale : `SessionController` fait environ 2 150 lignes, et `beginNewSeries` remet à zéro une liste d’états tenue à la main (un état oublié fuit d’une série à l’autre) ; à découper quand S le touche : un état par série, créé neuf à chaque série, et le côté écran (modèle de scène, annonces, historique) en collaborateur. Et « Réécouter » dans une séance des notes rejoue toute la dernière suite, qui peut durer plusieurs minutes quand aucune mesure comptée ne la coupe (jusqu’à `SESSION_TAKE_MAX_S`) ; envisager une limite (les dernières mesures seulement).
- **Le chantier 2** (aucun exercice dans le code) prend **la version 12** : le catalogue, les grilles et la composition des séances deviennent des fichiers de données, chargés au démarrage et validés à ce moment par `validateExercise` et les vérifications de la présentation (aujourd’hui en test seulement).

### Données d’exercice encore écrites dans le code après H6

Le plan L a fait passer en données le tempo, les échelles, les fenêtres de réponse, la respiration, la place de la cible et la fin du compte, le déroulé (scène, aperçu, « Joué juste ») et les réglages de la procédure ; H5, le tour et la présentation ; H6, les niveaux d’exercice (le tempo, et tout autre paramètre), les suites et la durée de la respiration, l’anti-blocage et le moment de la consigne (voir leurs « Réalisation »). Restent, tous des **données d’exercice** que l’exercice ne peut pas encore régler ; chacune devient un paramètre de la pièce qui la lit, sa valeur actuelle en défaut, quand ce code est touché ou par un plan dédié :

- **Mémoire** (apprenant « mémoire ») : `MIN_COLD_DELAY_MS` (délai d’un essai froid), les réglages de FSRS (sans étapes d’apprentissage, `learning_steps: []`), la maîtrise (`MASTERY_ACCURACY`, `MASTERY_SESSIONS`, `MASTERY_MIN_GAP_MS`), les tendances (`TREND_WINDOW_MS`, `TREND_RATIO`), la règle de température d’un sondage (`probeTemperature`).
- **Fatigue** (séance) : `FATIGUE_MIN_ANSWERS`, `FATIGUE_WINDOW`, `FATIGUE_ACCURACY_DROP`, `FATIGUE_REACTION_INCREASE`.
- **Anti-blocage** (séance) : l’exercice le choisit (`flow.antiBlocking`) ; restent dans le code ses constantes (`BLOCK_AFTER_FAILS`, `BLOCK_SAME_SPOT_CYCLES`, `BLOCK_REST_MS`) et l’ordre des remèdes (écoute, joué avec, niveau d’aide, « On change d’air »).
- **Rythme, ce que les niveaux ne surchargent pas** : `SETTLE_AFTER_BARS` (réglage d’un cycle), `PLAIN_WORDS_SESSIONS` (vue), `MATCH_LIMIT` et `SHIFT_MIN_MATCHES` (alignement).
- **Geste** (générateur de passages) : `LINK_SHAPES`, `ZONE_FRETS`, `ZONE_STEP_FRETS`, `PASSAGE_SUCCESS`, `LINK_AID_AFTER_MISSES`, `LINK_REST_BARS`, `NEIGHBOUR_FRETS`, `ZONE_MIN_ACQUIRED_TRIADS` ; et ses écrans : le geste n’écrit pas de présentation, ses modèles d’écran restent ceux de son présentateur (`stageOf`, D9 de H5).
- **Jeu libre** : `FREE_PLAY_COUNT` (longueur de la liste).
- **Contenu de la touche** : `MAX_PROMPT_FRET`, `LEARNABLE_FRETS`, `CURRICULUM_STRINGS` (l’univers des items et l’ordre d’introduction des notes), `MAX_VOICING_FRET`, `MAX_SPAN_FRETS` (les formes d’accord admises).
- **Réglages de l’ensemble, durée et composition de la séance** : écrits dans `createAppServices` (`DEFAULT_SET_LEARNING`, `durationMs: SESSION_MS`, les mécaniques dont une séance ouvre les capteurs, `TRACK_MECHANICS`), des données de la séance qui mêle les exercices ; elles viennent des parcours du chantier 2.
- **Les capteurs que le clic trompe** (`ONSET_SENSORS`, `session/clickBleed.ts`) et **le repli de latence d’un capteur** (`LATENCY_FALLBACK`, `session/latency.ts`) : des propriétés du capteur, à porter par sa fabrique (`SensorFactory`).
- **Le code de famille** (D9 de H5) : les sujets d’apprentissage, les candidats du capteur d’accords, la forme stockée d’un essai, le geste ; chacun attend la pièce du langage nommée dans la table de D9.
- **Le cycle** (D8 de H6) : la figure, la compilation et l’enregistrement d’un tour du rythme ; la séquence en fait `round.figure`.
- **Le temps libre comme cas des fenêtres** (simplification à vérifier, amendement du 2026-10-26).
- **Le guide d’écriture** : son lieu et son premier contenu ; deux premiers conseils : un point dont la fenêtre n’ouvre qu’après la fin de l’écoute ne se réussit pas (R9 de H5) ; un chemin de niveau qu’aucune pièce ne lit est sans effet (D2 de H6).

### Points mineurs reportés

Relevés en relecture, jugés sans effet sur le comportement ou d’un effet accepté ; à reprendre quand le code concerné est touché.

- **Moteur de tour (H1)** : `captureEndS` non borné par `inTimeEndS` quand une ouverture suivante tombe dans la capture tardive ; « prochaine ouverture » suppose un plan trié ; une réponse sans juge de contenu compte juste ; `indexOf` sur les instants confond deux attaques simultanées (passer des indices) (le plan en temps libre avec `alignment`, accepté avant, est refusé depuis la relecture finale de H5).
- **Juges (H1)** : le juge `chord-grid` n’est testé que sur le relier ; `chord-voicing` en position `'open'` non testé ; les mécaniques délèguent avec des conversions de type.
- **Procédure (H2)** : une échelle d’un seul cran est doublée (aidé puis sans aide) — non testée au catalogue ; `directRecallOf` diffère de l’ancien juge sur deux combinaisons de champs qu’aucun essai ne produit ; un essai possédé sans carte tenue ne bouge pas le niveau ; trois fonctions de tirage au hasard (procédure, ancien sélecteur, sujet des triades ; deux depuis H5).
- **Série (H3)** : la locale lue une fois au départ ; la carte des sources grandit à chaque « Rejouer » ; `recordResponse` modifie l’objet reçu ; `stageOf` reçoit `success` sans le lire ; la page `/dev/gesture` retombe sur un sélecteur neuf au lieu d’échouer ; la vérification de frontière est textuelle (sous-chaînes, pas les `.svelte`).
- **Notes (H4)** : une erreur de câblage levée par `recordResponse` arrive après que la source a été informée et laisse le tour non réglé ; `ItemSource.record` reçoit `deps.now()` et non l’époque de l’horloge audio (comme l’ancien enregistreur) ; un `IgnoreReason` absent de `FATE_LOG` ne s’écrit pas au journal ; un mètre différent lève une erreur dans un réveil du transport (non rattrapée en jeu) ; le `earliest` du temps libre part du règlement, pas de l’attaque de la réponse ; un item qui attend peut encore commencer après `SESSION_MS` à la reprise d’une pause ; `deps.random` est tiré pour chaque item (le geste aussi), ce qui décale la suite partagée des sélecteurs ; `AnswerKeysView` répète le mot du verdict dans sa légende sur une réussite ; le CSS du champ et les marques de réussite sont copiés entre `LaneView` et `AnswerKeysView` ; `Transport.listenInAndCount` a cinq paramètres positionnels ; pas de test de série d’un changement de tempo muet ; le banc de `notesSession.spec.ts` relit les items dans le texte français de la consigne.
- **Langage ouvert (L)** : au changement de mètre, une fraction de mesure (moins d’une mesure du nouveau mètre) reste muette avant le compte (accepté, à revoir si l’usage montre qu’elle trouble) ; un tour réglé à l’écran ne voit pas ses temps recalculés quand l’unité change (3/4 ↔ 6/8 seulement, l’historique l’est) ; `changeMeter` n’a pas la garde de segment de `changeTempo` (inatteignable) ; les `restBars` d’un item sont ignorés sans un mot à un changement de mètre ou de tempo (comme avant) ; `barOffset` est borné à sa mesure, pas à un temps (des temps d’ancre et de consigne non entiers dans les vues) ; `Level.success` n’est lu que par la procédure ; `windowsOf` et `itemLearningOf` ne vérifient rien (seul `validateExercise` le fait) ; `set.order` et `durationMs` ne sont pas validés ; la série fabrique un `PlannedItem` pour atteindre `definitionOf` ; `stats.ts` et `neck.ts` lisent encore les constantes `LOCATE_NECK`/`IDENTIFY_NECK` ; les triades lisent leurs constantes du catalogue (`TRIADS_ANCHOR`, `TRIADS_ZONE`) dans `createAppServices` jusqu’au chantier 2 ; un tempo décimal (plage ou tempo fixe) s’afficherait sans arrondi à l’écran. Relevés par la relecture finale de L : le bilan d’une séance du geste lève une erreur si l’un de ses exercices n’est plus dans la voie (`gestureDefinition`) — sans effet tant qu’aucun écran d’historique ne rouvre une séance passée, à rendre tolérant alors (pas de ligne de tempo suivant) ; avec `countEndsOn: 'target'` et une avance de plus d’une mesure, le compte finit une mesure avant la cible et la consigne paraît pendant le compte (aucun exercice du catalogue ne le fait ; poser alors le compte sur la mesure qui précède la cible) ; `freeLeadOf` lève une erreur sans nommer l’exercice.
- **Triades et langage du tour (H5)** : le bord de fermeture corrigé de la latence n’est pas épinglé par un test sur le moteur ; un silence jugé est refusé par la première réponse (pas encore jugé, voir les corrections de la relecture finale) ; le bord d’ouverture de la capture de l’alignement n’a pas de tolérance (une attaque exactement au bord, à l’erreur de flottant près, va au voisin) ; les bancs `triadsSeries.ts` et `notesSeries.ts` relisent l’item dans le texte français de la consigne (« vers la case », « à vide ») ; le banc au hasard fait répondre faux, dans sa passe « sans réponse », les tours en temps libre (le temps libre attend une réponse ; la passe « faux » les joue faux pour de bon) ; `compileRound` et `presentPrompt` peuvent lever une erreur dans un réveil du transport sur un exercice invalide (la validation ne court qu’en test jusqu’au chantier 2), et `presentPrompt` revérifie la présentation à chaque consigne ; la vérification de premier-arrivé du constructeur de `PlanRound` peut encore lever en jeu pour une longueur que l’item décide, invisible à la vérification statique ; `voicing-at-position` rend une position `undefined` sans lever sur un item de zone qui n’en a pas ; une erreur de `Fraction.parse` sur `barOffset` ou `ofGap` ne nomme pas l’exercice ; `numberOf` rend une chaîne pour une erreur ; `leadProblem` dit « n’écrit pas d’échelle » d’une échelle mal formée ; aucun fil-piège ne lie les clés de `CONTENT_VIEWS` aux sortes de `CONTENT_JUDGES`, ni les noms d’`ITEM_FIELDS` aux clés que rend `fields()` ; le dessin `shape-at-position` n’est ni utilisé ni testé ; `showStage` compile un plan pour chaque écran en attente ; le bloc de raté de `LaneView` recopie le balisage et le CSS de `DrawnMiss` ; `StringPicture` ignore `PictureProps.size` ; plus de deux ratés à la ligne ne sont pas testés sur écran étroit ; un exercice de données hors 4/4 dessine les mesures de son mètre sur la piste (voulu) ; le commentaire de `v10.ts` sur « plus courte que le haut » est inexact ; le test sur une base réelle de `db.spec.ts` n’a ni carte d’ancrage apprise à l’avance 8 ni carte de zone apprise (couvertes dans `v10.spec.ts`) ; `params.spec.ts` épingle la liste exacte des exports de `progress/constants` ; quelques specs modifient les registres exportés sans les restaurer (isolés par fichier) ; `createAppServices` écrit les identifiants des mécaniques des triades (`ofTriads`).
- **Niveaux et contrôleur unique (H6)** : un gabarit qui lit un paramètre que seul un niveau donne est refusé ; la procédure calcule deux fois les paramètres résolus d’un item servi ; un niveau peut s’appliquer juste avant la fin de la série ; la fin de série (`writeEnd`) n’efface pas `view.announcement` ; les exécutions d’une séance ne s’écrivent qu’à sa fin (une séance coupée n’en garde aucune : le bilan du geste a ses lignes vides) ; pas de test de `placeNext` pour un tour à passage de main dont le suivant ne s’enchaîne pas ; `comingOf` est calculé deux fois ; `PlacementCurrent` et `PlacementSetting` ont presque la même forme ; une pause dans la respiration finit une suite à réponse `interrupted` (le rythme : `done`) et allonge sa prise ; une consigne placée avant sa mesure comptée (`countEndsOn: 'target'` et plus d’une mesure d’avance) emboîte mal la trace et garde l’entrée trop tard (inatteignable avec le catalogue) ; l’aide `roles` des bancs aplatit les suites ; une consigne différée coupe la fenêtre de réglage du cycle qui s’attarde (séries de plusieurs exercices seulement) ; `runSetup` ignore `listenInBars` et `countIn` d’un gabarit ; chaque tour est recompilé à son ouverture ; le tic des temps suppose un seul mètre ; la garde `opened` saute l’enregistrement de fin de toute série dont l’entrée ne s’est jamais ouverte (non testé d’une série à l’autre) ; un enchaînement décidé en avance passe l’heure de la décision comme `chainedAt` ; « une consigne n’est pas comptée deux fois » n’est épinglé que dans `exerciseLevels.spec.ts` ; une écoute demandée quand la source donnerait un autre exercice va à l’item en attente ; `presentersOf` ignore sans un mot une mécanique inconnue, et `TRACK_MECHANICS` recopie à la main les registres de présentateurs ; un `ready()` qui ne se résout jamais laisse `/session` vide, sans lien pour quitter ; une séance de zone sans rien à demander montre le cadre neutre avant de finir ; `v8.spec.ts` importe `attemptToV11` (couplage de la chaîne) ; `testing/fixtures.ts` lit le type `ProgressionV10` de `migrations/v11.ts`.
- **À régler avant que le chantier 2 charge des exercices de fichiers** (trous de la validation, inatteignables tant que le catalogue est dans le code et testé, atteignables dès qu’un auteur écrit un fichier) : la validation ne vérifie pas les valeurs qu’un niveau écrit contre leurs lecteurs (`'windows.perfectMs': 'x'` passe et lève dans `compileRound` en jeu ; le tempo d’un niveau d’item n’est pas vérifié positif) ; un chemin écrit `undefined` pose la clé à `undefined` ; un niveau qui écrit un objet et l’un de ses sous-chemins dépend de l’ordre des clés ; `pacing.roundsPerBreath` à 0, −1 ou 1,5 passe ; un `params.pacing` qui n’est pas un objet passe ; un exercice de figures sans `roundsPerBreath` ne respire ni ne finit (ses cycles s’enchaînent toujours ; aucun exercice du catalogue ne l’écrit ainsi). Le joueur, alors : un exercice mal écrit qui plante en jeu ou ne s’arrête jamais, au lieu d’être refusé au chargement en nommant le champ.
- **Prettier** signale des fichiers non touchés par H, ou seulement d’une ligne (`routes/diagnostic/oracle/+page.svelte`, `docs/superpowers/plans/README.md`).

### Façon de travailler

- **Un plan à la fois**, écrit (skill `writing-plans`) depuis cette spec, relu par l’auteur, puis exécuté en **subagent-driven** dans un worktree `.worktrees/temps-musical-hN` sur la branche `plan/temps-musical-hN` ; un registre (`.superpowers/sdd/…/progress.md`, ignoré par git) garde chaque tâche, chaque décision et les points mineurs ; une relecture par tâche, une relecture finale de la branche, une seule vague de corrections.
- **Ce qui revient à l’auteur** : une différence de comportement voulue (pédagogie, ce que le joueur voit) ; le reste se tranche et s’écrit dans « Réalisation ».
- **Règles de l’auteur** qui guident chaque choix : construire des primitives du moteur, pas des fonctions d’un exercice ; un exercice nouveau doit tenir dans des données ; aucun héritage laissé après une migration ; tester les règles pédagogiques, pas la parité avec l’ancien comportement ; « le juge doit avoir raison » (« Joué juste » seulement en développement).
- **Avant de fusionner** : si `main` porte des modifications non validées de l’auteur sur des fichiers que la branche touche, les valider d’abord avec son accord ; fusionner (`--no-ff`), résoudre un conflit de `CLAUDE.md` en faveur de la version allégée de l’auteur (les règles des adaptateurs vivent dans `src/lib/infrastructure/CLAUDE.md`, celles de l’interface dans `src/lib/ui/CLAUDE.md`), vérifier `npm test && npm run check`, puis supprimer le worktree et la branche. Ne jamais pousser sans demande.
