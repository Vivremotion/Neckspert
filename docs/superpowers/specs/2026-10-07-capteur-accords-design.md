# Design — capteur d’accords

Date : 2026-10-07. Statut : approuvé dans la conversation du 2026-10-07, section par section.

Sous-projet B1 de l’étape 3 de `docs/plateforme.md`. Il s’appuie sur le domaine des accords et des voicings (sous-projet A, `docs/superpowers/specs/2026-10-06-accords-voicings-design.md`) et sur la recommandation du spike de détection (`docs/superpowers/specs/2026-10-06-triades-detection-spike.md`) : sur sol‑si‑mi, le juge `nnls-abs` dit si l’accord attendu a sonné et dans quel renversement, plaqué, arpégé ou mélangé, à condition de **vérifier parmi des candidats connus** au lieu de transcrire. C’est démontré pour la voie de la mémoire, pas pour le jam.

## Principes

- **La technique est remplaçable.** La mécanique parle à un port qui ne nomme aucune technique. Le juge `nnls` est le premier adaptateur ; un capteur hexaphonique, un modèle appris ou un juge plus indulgent pour le jam en seraient d’autres, sans toucher à la mécanique.
- **On tranche avec de vraies données, en jouant.** Les questions laissées ouvertes par le spike (quel profil de timbre, quels seuils) ne se règlent pas par de nouvelles sessions d’enregistrement : plusieurs variantes du juge tournent en parallèle pendant le vrai travail, une seule décide, toutes laissent leur avis et le spectre dans l’observation de l’essai. On compare ensuite sur l’historique.
- **Le capteur rapporte, la mécanique tranche.** Quand décider (dès 250 ms pour un accord plaqué, à la fin de l’accord pour un arpège) appartient au rapport au temps de la mécanique (sous-projet C).

## Découpage du capteur

|                     | Contenu                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** (cette spec) | port vérificateur, entrée audio partagée, adaptateur `nnls`, variantes en parallèle, spectre gardé, capteur factice, diagnostic                                |
| B2                  | accordeur avant chaque session (comme Rocksmith) ; profils de timbre tirés des cordes à vide, bruts et extrapolés par un modèle de position (micro et attaque) |
| C                   | mécaniques de la voie mémoire ; règle de décision dans le temps ; profil tiré des fondamentales d’« ancrer » ; contestation (voir plus bas)                    |
| B3                  | tableau de bord des variantes, après quelques semaines de données ; arbitre hors du jeu (Basic Pitch dans le navigateur) sur l’audio gardé                     |

**Contestation** (sous-projet C, noté ici pour mémoire) : un échafaudage, retiré quand les variantes et l’arbitre suffisent. Elle vit dans le bilan de fin de session, jamais après un verdict, pour ne pas ralentir le jeu ; elle étiquette l’essai sans réécrire FSRS.

## 1. Le port (`application/ports/ChordVerifierPort.ts`)

```ts
interface ChordCandidate {
	/** Choisi par la mécanique : clé du voicing et position. */
	id: string;
	/** Repris du domaine ('expected', 'other-inversion'…), non interprété par le capteur. */
	kind: string;
	notes: readonly { string: StringNumber; fret: number; midi: Midi }[];
}

interface ChordExpectation {
	/** Temps audio (s) de l’ouverture de la manche. */
	opensAt: number;
	/** Id du candidat attendu. */
	expected: string;
	candidates: readonly ChordCandidate[];
	style: 'strummed' | 'arpeggiated' | 'mixed' | 'unknown';
}

interface ChordVariantReport {
	id: string;
	/** Candidat retenu, ou null. */
	decided: string | null;
	/** Score de chaque candidat, par id. */
	scores: Readonly<Record<string, number>>;
}

interface ChordReport {
	/** Temps audio (s) de l’attaque, latence non retirée. */
	time: number;
	/** Durée couverte depuis l’attaque. */
	windowMs: number;
	/** Décision de la variante active. */
	decided: string | null;
	variants: readonly ChordVariantReport[];
	/** Spectre gardé, sur le rapport de la plus longue fenêtre seulement. */
	spectrum?: { fromHz: number; binHz: number; magnitudes: readonly number[] };
}

interface ChordVerifierPort {
	/** Pose l’attente de la manche qui s’ouvre ; null : plus rien à écouter. */
	expect(expectation: ChordExpectation | null): void;
	onReport(callback: (report: ChordReport) => void): () => void;
}
```

- Les candidats portent leurs positions et pas seulement leurs hauteurs : un adaptateur qui voit chaque corde s’en servira ; l’adaptateur `nnls` n’utilise que les hauteurs.
- Le capteur rapporte le candidat qui l’emporte, pas seulement « attendu ou non » : la mécanique saura dire « tu as joué l’autre renversement ».
- **Tolérer ce qui sonnait déjà** (condition 2 du spike) : l’accord précédent n’est pas un concurrent. C’est la mécanique qui ne le met jamais parmi les candidats ; l’adaptateur n’a pas de règle propre.

## 2. Le cœur

- `ObservationSource` gagne `expect?(expectation: unknown): void`. À l’ouverture de chaque manche, le contrôleur l’appelle sur la source du capteur de la mécanique, avec ce que le présentateur a préparé ; à la pause, à l’arrêt et à la fin, il l’appelle avec `null`. Le cœur ne lit jamais l’attente.
- `MechanicPresenter` gagne `expectation?(item, round: { opensAt: number }): unknown`. Sans cette méthode, rien n’est appelé : les mécaniques actuelles ne changent pas.
- `chordSensor(verifier: ChordVerifierPort): SensorFactory`, dans `application/session/sensors.ts` : `expect` transmet au port ; chaque rapport devient une observation lisible, datée de son attaque moins la latence calibrée, avec le rapport (sans `time`) pour charge. `SessionDeps.sensors` gagne `chord`, câblé dans `createApp`.
- Stockage : la charge d’une observation est gardée telle qu’émise. Pas de nouvelle version Dexie, pas de nouvelle version de sauvegarde.

## 3. L’entrée audio partagée (`infrastructure/audio/input/`)

`WebAudioNoteDetector` ouvre aujourd’hui le micro, gère le contournement Firefox sur macOS, charge le worklet, applique le gain du micro intégré, mesure le niveau et détecte les notes. L’ouverture de l’entrée en sort :

- **`WebAudioInput`** ouvre et ferme l’entrée (même contraintes, même contournement, même gain du micro intégré), liste les entrées, mesure le niveau et diffuse les trames du `frame-processor` : `onFrame(callback: (frame: { samples: Float32Array; frameTime: number }) => void): () => void`.
- **`WebAudioNoteDetector`** consomme les trames de l’entrée. `NoteDetectorPort` ne change pas : `listInputs`, `start`, `stop`, `setBuiltInGain` et `onLevel` délèguent à l’entrée.
- **`NnlsChordVerifier`** consomme les mêmes trames.
- `createApp` crée l’entrée une fois et la donne aux deux. L’entrée reste ouverte et fermée par `detector.start` / `stop`, comme aujourd’hui.

## 4. L’adaptateur `NnlsChordVerifier` (`infrastructure/audio/chords/`)

Réécriture propre du juge `nnls-abs` du spike ; le code du spike reste jetable.

1. **Spectre.** Fenêtre de Hann de `FFT_SIZE` points (8192 à 48 kHz, la puissance de 2 la plus proche de 170 ms à la fréquence de l’entrée), pas de `HOP_SIZE` (1024 à 48 kHz, environ 21 ms). Calculé seulement quand une attente est posée.
2. **Attaques.** Un `OnsetDetector` à lui, la classe existante, sur les trames. Seules comptent les attaques survenues après `opensAt` et avant l’attente suivante.
3. **Fenêtre.** Pour chaque attaque, le maximum de chaque case de fréquence sur les spectres depuis l’attaque : une note compte dès qu’elle a sonné.
4. **Rapports.** Aux points `REPORT_POINTS_MS = [250, 500, 1000, 2000]` après l’attaque, coupés à l’attente suivante (le dernier rapport couvre alors ce qui a été entendu). Pour chaque variante :
   - blanchiment à la manière de Klapuri (gains par bande ERB, ν = 0,33) ;
   - un peigne par note de 52 à 84 (MIDI) : `COMB_HARMONICS = 10` partiels gaussiens (largeur 1,6 case, inharmonicité B = 1e‑4, jusqu’à 5 kHz), d’amplitudes données par le profil de la variante ;
   - pour chaque candidat, ajustement non négatif (NNLS, Lawson–Hanson) de ses peignes sur le spectre blanchi, de `MIN_HZ = 70` à 5 kHz ;
   - score = énergie expliquée × min(1, présence / `PRESENCE_RATIO`), où la présence est l’énergie de la note la plus faible du candidat rapportée à la plus forte, `PRESENCE_RATIO = 0,15` ;
   - décision : le meilleur candidat, s’il atteint le seuil de la variante et devance le suivant de sa marge ; sinon null.
5. **Spectre gardé.** Sur le rapport de la plus longue fenêtre, les magnitudes de `MIN_HZ` à 6 kHz (environ 1000 valeurs), pour rejouer après coup d’autres variantes sur tout l’historique.
6. **Variantes.** Données passées à l’adaptateur : `{ id, profile, threshold, margin }[]` et l’id de la variante active. `profile` est la liste des amplitudes des harmoniques 1 à 10 rapportées à la fondamentale. B1 n’a qu’une variante, `default` : profil en 1/h, seuil 0,25, marge 0,01 (valeurs de départ tirées du rapport du spike, à calibrer). B2 ajoute les variantes de l’accordeur.

Calculs en fonctions pures, chacune avec sa spec : `fft.ts`, `spectrum.ts` (fenêtre, magnitude, maximum par case), `whitening.ts`, `comb.ts`, `nnls.ts`, `judge.ts` (score et décision d’une variante). `NnlsChordVerifier.ts` les assemble sur les trames. Tout tourne sur le thread principal, seulement pendant les manches d’accords.

**Hors B1** : la soustraction du clic au micro (le jeu se fait en entrée directe, sans clic ; elle viendra avec le jeu au micro) ; une attaque qui voit les débuts d’arpège (nécessaire pour juger le rythme d’un arpège, voie du geste) ; l’audio brut des essais (option de développement, avec l’arbitre de B3).

## 5. Diagnostic

La page `/diagnostic` (fermée en production) gagne une section Accords : on choisit une triade majeure ou mineure, une fondamentale et une position sur sol‑si‑mi (voicings de `closeTriadVoicings`, occurrences de `voicingOccurrences`, candidats de `voicingCandidates`), on joue, et la page affiche chaque rapport : fenêtre, score de chaque candidat, décision de chaque variante. C’est l’essai en conditions réelles, sans session d’enregistrement.

## 6. Tests

- **Fonctions pures, signaux synthétiques** : un sinus tombe dans sa case ; le maximum par case garde une note jouée en fin de fenêtre ; NNLS retrouve des coefficients connus sur une somme de peignes ; le juge préfère D 2‑3‑2 à 7‑7‑5, 11‑10‑10, Dm et Daug sur une triade synthétique, ne retient rien quand la fondamentale A3 manque, et tranche le piège d’octave A3 / A4 quand A3 est là.
- **Données réelles.** Un script de développement (`scripts/`) découpe dans le corpus local du spike (`corpus/triades`, hors git) une douzaine d’extraits de 2 s étiquetés : plaqué, arpégé et mélangé en entrée directe, plaqué au micro, et les deux pièges d’octave du spike (D 2‑3‑2 juste après 7‑7‑5, Ab 8‑9‑8 juste après 5‑4‑4). Versionnés comme fixtures (environ 2,5 Mo). Un test les fait passer dans l’adaptateur, alimenté par une entrée factice : les cas faciles doivent tous être reconnus ; pour les pièges, le résultat d’aujourd’hui est figé (non-régression, pas une promesse).
- **Cœur** : `FakeChordVerifier` dans `testing/fakes.ts` (garde les attentes, émet des rapports). Une spec du contrôleur vérifie que `expect` reçoit l’attente du présentateur à l’ouverture de chaque manche et `null` à la pause et à l’arrêt, que chaque rapport devient une observation datée moins la latence, et qu’on se désabonne à l’arrêt.
- **Entrée partagée** : les specs existantes de `WebAudioNoteDetector` passent sans changer leurs attentes.
- **Stockage** : une observation d’accord, spectre compris, survit à un aller-retour par la sauvegarde.

Barrière de fusion : `npm test && npm run check`.

## Hors périmètre

Les mécaniques de triades et leur règle de décision dans le temps (C), l’accordeur et les profils mesurés (B2), le tableau de bord et l’arbitre (B3), la soustraction du clic, l’attaque des arpèges, l’audio brut des essais, d’autres groupes de cordes que sol‑si‑mi dans le diagnostic.
