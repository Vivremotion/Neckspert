# Design — journal d’essais : observations brutes

Date : 2026-10-06. Statut : approuvé dans la conversation de développement du 2026-10-06.

Étape 2 de la feuille de route de `docs/plateforme.md`, dont cette spec reprend le vocabulaire sans le répéter. La première moitié de l’étape (champs communs d’un côté, données propres à la mécanique de l’autre) est déjà faite par l’étape 1 : `Attempt<D>` sépare les champs communs de `data` (`docs/superpowers/specs/2026-10-05-mecaniques-exercices-design.md`, section « Essai »). Reste la seconde : enregistrer les observations brutes, pour calculer après coup des mesures et des graphes non prévus.

Aucun verdict, aucun seuil, aucun écran ne change.

## Objectifs

- Chaque essai garde **tout ce que les capteurs ont perçu pendant sa plage**, pas seulement l’observation qui le règle.
- Les **attaques rejetées par le détecteur** (sans hauteur, clarté trop basse, hauteur instable, hors plage) sont enregistrées avec leurs deux fenêtres d’analyse. Elles ne répondent jamais à une consigne.
- Chaque observation dit **ce que la manche en a fait** et **ce que le juge en pensait** au moment du jeu.
- La **latence retirée** pendant la session est enregistrée, pour rejuger après coup avec une autre calibration.
- Le cœur ne nomme toujours aucune mécanique.

## 1. Ce que l’essai enregistre

Dans `domain/types.ts` :

```ts
/** Ce que la manche a fait d’une observation. */
type ObservationFate =
	| 'answer' // elle a réglé la manche
	| IgnoreReason // 'before-window' | 'settled' | 'after-capture'
	| 'other-sensor' // venue d’un autre capteur que celui de la consigne
	| 'unreadable'; // le capteur l’a perçue sans pouvoir la lire

interface RecordedObservation<P = unknown> {
	/** ms depuis la consigne (heure audio de la manche), latence retirée ; négatif si avant. */
	atMs: number;
	/** Le capteur qui l’a perçue (`SensorKind`, une chaîne). */
	sensor: string;
	fate: ObservationFate;
	/** Avis du juge de la mécanique au moment du jeu ; null si illisible ou autre capteur. */
	correct: boolean | null;
	/** Propre au capteur, stocké tel que le capteur l’a émis. */
	payload: P;
}

interface Attempt<D = unknown> {
	// … champs actuels inchangés
	/** null : essai enregistré avant l’étape 2 ; [] : rien d’observé. */
	observations: RecordedObservation[] | null;
}

interface SessionRecord {
	// … champs actuels inchangés
	/** Latence calibrée retirée des attaques pendant la session ; null avant l’étape 2. */
	latencyMs: number | null;
}
```

`IgnoreReason` reste défini dans `domain/timing/types.ts` ; `ObservationFate` l’importe.

`correct` est l’avis du juge au moment du jeu, gardé plutôt que recalculé parce qu’un juge peut changer. `answer` et `confusion` restent dans `data`, pour la seule réponse retenue.

Le temps est relatif à la consigne (`Round.promptTime`), en ms. Avec `leadBeats` et `tempoBpm`, déjà sur l’essai, il place chaque observation par rapport au temps cible.

### Charges des capteurs

| Capteur | Lisible                          | Illisible                                                                                                                                  |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `note`  | `{ midi, frequencyHz, clarity }` | `{ reason: 'no-pitch' \| 'unclear' \| 'unstable' \| 'out-of-range', attack: { frequencyHz, clarity }, sustain: { frequencyHz, clarity } }` |
| `tap`   | le nom de note touché            | —                                                                                                                                          |

La charge lisible de `note` est le `NoteOnset` sans son temps, qui est déjà celui de l’observation. Le juge de `locate` et ses `debugLines` lisent cette charge ; la ligne de débogage « t brut » disparaît.

Motif d’un rejet, dans cet ordre : une fenêtre sans fréquence → `'no-pitch'` ; une clarté sous son seuil (`attackClarityThreshold` pour la fenêtre d’attaque, `clarityThreshold` pour la fenêtre tenue) → `'unclear'` ; un écart entre les deux fenêtres au-delà de `CONFIRM_CENTS` → `'unstable'` ; une hauteur confirmée hors de `minMidi`–`maxMidi` → `'out-of-range'`.

## 2. Capteurs

`NoteDetectorPort` gagne un événement, `onNote` ne change pas (la calibration et `/diagnostic` restent tels quels) :

```ts
interface NoteRejection {
	/** Attaque sur l’horloge audio, en secondes, avant correction de latence. */
	time: number;
	reason: 'no-pitch' | 'unclear' | 'unstable' | 'out-of-range';
	attack: { frequencyHz: number; clarity: number };
	sustain: { frequencyHz: number; clarity: number };
}

interface NoteDetectorPort {
	// … inchangé
	/** Une attaque dont la hauteur n’a pas été confirmée. Rend la fonction de désabonnement. */
	onRejected(callback: (rejection: NoteRejection) => void): () => void;
}
```

`NoteTracker` rend désormais, pour chaque attaque, soit une note, soit un rejet (il le calcule déjà pour le journal de détection). `WebAudioNoteDetector` relaie les rejets du processeur comme les notes. Le détecteur factice de `testing/fakes.ts` peut émettre les deux.

`Observation` gagne `readable` :

```ts
interface Observation {
	time: number;
	payload: unknown;
	/** false : perçue sans pouvoir être lue ; jamais passée au juge, jamais une réponse. */
	readable: boolean;
}
```

`noteSensor` émet les notes (`readable: true`) et les rejets (`readable: false`), tous datés latence retirée. `tapSensor` émet `readable: true`.

## 3. La plage d’un essai

**Principe** : une observation appartient à l’essai dont la manche était en cours **à son arrivée**, pas selon son horodatage. La manche décide de son sort, l’essai la garde : les deux restent cohérents.

La **plage** d’un essai court de l’ouverture de sa manche (`beginNextItem`) à l’ouverture de la manche suivante, ou à la pause, ou à la fin de la session. Elle couvre la mesure de respiration et les mesures comptées entre deux séquences.

### `ObservationSpan` (`application/session/observationSpan.ts`)

Classe pure, sans Svelte :

- `constructor(promptTime)` : heure audio de la consigne, en secondes.
- `add(observation, fate, correct)` : convertit `observation.time` en `atMs` relatif à la consigne, garde `sensor` et `payload`.
- `snapshot()` : copie de la liste à cet instant.
- `close()` : la liste finale ; plus aucun `add` ensuite.

### Dans le contrôleur

Le contrôleur garde la plage à côté de la manche, pas dedans : la manche (et `current`) passent à null quand la consigne suivante est choisie, la plage, elle, reste ouverte. Elle garde donc la consigne planifiée de son essai : c’est elle qui donne le capteur attendu et le juge, même après la remise à null.

1. À l’ouverture d’une manche : la plage précédente se ferme (section 4), une nouvelle s’ouvre.
2. Une observation arrive (`onObservation`) :
   - aucune plage ouverte (décompte initial, décompte après reprise, session finie) → journal de détection seulement, comme aujourd’hui ;
   - illisible → `'unreadable'`, `correct: null`, sans juge ;
   - d’un autre capteur que celui de la consigne → `'other-sensor'`, `correct: null` ;
   - manche réglée et remise à null (respiration, mesure comptée) → `'settled'`, avec l’avis du juge ;
   - sinon jugée puis passée à `round.observe` : `'answer'` si elle règle la manche, la raison d’`ignored` sinon ; avec l’avis du juge.
3. Au règlement, l’essai s’écrit avec `span.snapshot()`.

Conséquence assumée : une note jouée pendant l’aperçu de la corde de la consigne suivante (`STRING_PREVIEW_BEATS`) reste dans la plage de l’essai précédent, en `'settled'`. Elle est horodatée ; une analyse pourra la réattribuer.

Le journal de détection (`logDetection`) garde ses messages actuels ; les rejets du détecteur y restent écrits par `NoteTracker`.

## 4. Écriture

- `AttemptRecorder.record(planned, outcome, promptTime, judged, execution, observations)` écrit l’essai au verdict, comme aujourd’hui, avec l’instantané de la plage. La partie synchrone (essai poussé, sélecteur prévenu) ne change pas.
- `AttemptRecorder.completeObservations(attempt, list)` attend que l’essai soit écrit (`stored`), puis appelle `attempts.setObservations(id, list)`. L’identifiant vient de `AttemptRepositoryPort.add`, qui le rend déjà ; le recorder le garde pour chaque essai. En mémoire, `attempt.observations` prend aussi la liste finale.
- `AttemptRepositoryPort` gagne `setObservations(id: number, observations: RecordedObservation[]): Promise<void>`.
- À la fermeture d’une plage dont la manche a produit un essai, le contrôleur appelle `completeObservations`. Une plage sans essai (manche jetée sans verdict à la pause, à l’arrêt) est perdue : il n’y a pas d’essai pour la porter.

### Cas limites

- **Pause** : `abandonRound` règle une capture hors temps ouverte (l’essai s’écrit), puis la plage se ferme. Une manche qui écoutait encore est jetée sans essai, comme aujourd’hui, et sa plage avec elle.
- **Arrêt et fin** : la plage se ferme ; `finish()` attend les compléments en cours avant d’écrire la `SessionRecord`.
- **Fermeture de l’application pendant la respiration** : l’essai est écrit, seule la fin de sa liste manque.
- `SessionRecord.latencyMs` prend la latence lue au démarrage de la série (`settings.calibrationOffsetMs ?? 0`).

## 5. Stockage et sauvegarde

- **Dexie version 6**, sans nouvel index : la mise à niveau ajoute `observations: null` aux essais et `latencyMs: null` aux sessions existants. `DexieAttemptRepository.setObservations` fait un `update` ciblé. Le contrat `attemptRepositoryContract` le spécifie ; le dépôt factice le suit.
- **Sauvegarde version 3** : l’export porte `observations` et `latencyMs`. Une version 2 s’importe encore : essais à `observations: null`, sessions à `latencyMs: null`. Une version 1 passe par sa conversion actuelle puis par celle de la version 2. `legacyImport.spec.ts` garde sa fixture intacte.
- **Validation** : stricte sur l’enveloppe (`observations` null ou tableau ; `atMs` fini ; `sensor` chaîne non vide ; `fate` dans la liste ; `correct` booléen ou null ; `payload` présent), et sur `latencyMs` (nombre fini ou null). La charge n’est pas validée plus loin : elle appartient au capteur, que la couche de stockage ne connaît pas. Un validateur par capteur viendra si une donnée importée doit un jour être relue par un juge.

## 6. Tests

TDD, specs colocalisées.

- **Domaine** : aucun changement de comportement ; les specs existantes servent de filet.
- `NoteTracker.spec.ts` : chaque motif de rejet rend un rejet avec ses deux fenêtres ; une note confirmée est inchangée.
- `WebAudioNoteDetector.spec.ts` : les rejets du processeur arrivent par `onRejected`.
- `sensors.spec.ts` : `noteSensor` émet les rejets latence retirée, `readable: false` ; les notes sans `time` dans leur charge.
- `observationSpan.spec.ts` : temps relatif, valeurs négatives, instantané puis fermeture, plage vide, `add` refusé après `close`.
- `AttemptRecorder.spec.ts` : instantané écrit au verdict ; complément écrit après l’essai ; un complément demandé avant la fin de l’écriture attend.
- `SessionController.spec.ts` : dans un même essai de mode 1, une note avant la fenêtre, la réponse, une note après le verdict, une note pendant la respiration et un rejet, chacun avec son `fate` et son `correct` ; une note pendant le décompte initial n’est pas enregistrée ; une note à la guitare pendant une consigne de mode 2 donne `'other-sensor'` ; pause pendant la capture hors temps ; `finish` attend les compléments ; `latencyMs` sur la `SessionRecord`.
- `thirdMechanic.spec.ts` : la mécanique factice voit ses observations enregistrées sans que le cœur la nomme.
- **Stockage** : mise à niveau 5 → 6, aller-retour de l’export version 3, import d’une version 2, refus d’une enveloppe invalide.

Porte de fusion : `npm test && npm run check`.

## 7. Documentation

- `CLAUDE.md` : Dexie version 6, sauvegarde version 3, une règle « observations » (plage d’un essai, rattachement à l’arrivée, rejets jamais réponses).
- `docs/plateforme.md` : étape 2 marquée faite, avec un renvoi à cette spec.

## Hors périmètre

Écrans, graphes et nouvelles mesures calculées ; changement de verdict ou de seuil ; flux d’observations par session indépendant des essais ; table d’observations séparée ; validation des charges par capteur ; capteur d’accord (étape 3).
