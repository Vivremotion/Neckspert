# Design — journal de diagnostic

Date : 2026-10-07. Statut : approuvé dans la conversation du 2026-10-07, section par section.

Sous-projet C0 de l’étape 3 de `docs/plateforme.md`, avant les mécaniques de la voie mémoire (C1). Il prolonge le capteur d’accords (`docs/superpowers/specs/2026-10-07-capteur-accords-design.md`) et le principe « on tranche avec de vraies données, en jouant ».

## Pourquoi

Pour décider à froid s’il faut un meilleur système de reconnaissance d’accords, et pour comprendre les performances de l’app, il faut garder ce qui a sonné et ce que les détecteurs en ont fait : le son, les attentes, les rapports complets du juge, les temps de calcul, les trames perdues. Deux contraintes :

- **Découplé de l’exercice.** Ni le cœur ni les mécaniques ne savent que le journal existe ; les adaptateurs y écrivent.
- **Sobre en production.** On ne stocke pas des dizaines de Mo sur l’appareil d’un utilisateur qui n’a rien demandé : coupé par défaut dans la version publiée, activable dans les Réglages, toujours sous un budget.

## Deux familles de données

|             | Données d’apprentissage           | Données de diagnostic                                                                                             |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Quoi        | essais, observations, cartes FSRS | son des prises, attentes et rapports complets des capteurs, temps de calcul, trames perdues, réglages de l’entrée |
| Producteurs | le cœur et les mécaniques         | les adaptateurs (entrée audio, capteurs)                                                                          |
| Taille      | petite                            | grande                                                                                                            |
| Stockage    | toujours, dans la sauvegarde      | base à part, budget borné, coupé par défaut en production                                                         |
| Usage       | jouer, réviser, statistiques      | export pour l’analyse à froid                                                                                     |

**Correction de B1.** Le spectre quitte l’observation : `ChordReport.spectrum` disparaît du port, l’observation garde les scores et les décisions des variantes (légers, ils servent à comparer les variantes sur l’historique de chacun). Le spectre part au journal, s’il est actif.

**Jointure.** Rien n’est relié en dur. Le journal découpe le temps en prises ; chaque prise note la correspondance entre l’heure audio et l’heure réelle. Les essais portent l’heure réelle de leur consigne ; on les rattache à leur prise par l’heure, à l’analyse. Ce qui était demandé est dans l’essai (l’item) et, du côté du capteur, dans l’attente qu’il a notée.

## 1. Le port (`application/ports/DiagnosticSink.ts`)

```ts
interface DiagnosticAudioChunk {
	/** Temps audio (s) du premier échantillon. */
	audioTime: number;
	sampleRate: number;
	samples: Int16Array;
}

interface DiagnosticSink {
	/** Faux : rien n’est enregistré, les adaptateurs ne préparent rien. */
	readonly enabled: boolean;
	event(kind: string, audioTime: number, data: unknown): void;
	audio(chunk: DiagnosticAudioChunk): void;
}
```

- `NullDiagnosticSink` : `enabled` faux, ne fait rien.
- `DexieDiagnosticSink` : écrit dans sa base (section 4). `enabled` est vrai seulement pendant une prise ouverte avec le réglage activé.
- Les types d’événements sont des chaînes libres, préfixées par leur producteur : `input.opened`, `input.closed`, `input.gap`, `chord.expectation`, `chord.report`. Le journal ne les interprète pas.

## 2. Les prises

Une prise va de l’ouverture de l’entrée audio à sa fermeture. Le cœur ouvre et ferme déjà l’entrée à chaque session et à chaque calibration ; une prise correspond donc à une session, sans que le journal connaisse les sessions.

- `WebAudioInput.start` ouvre une prise (`DexieDiagnosticSink.openTake`) avec : heure réelle (`Date.now()`), heure audio (`context.currentTime`) au même instant, nom de l’entrée, fréquence, nombre de canaux, gain du micro intégré appliqué. Il écrit `input.opened`.
- `WebAudioInput.stop` écrit `input.closed` et ferme la prise.
- Le réglage est lu à l’ouverture de la prise : coupé, la prise n’existe pas et `enabled` reste faux jusqu’à la suivante.

`openTake` / `closeTake` ne sont pas sur le port : seules l’entrée et la composition les connaissent (`DiagnosticTakes`, interface à part implémentée par `DexieDiagnosticSink` et par un double de test).

## 3. Les producteurs

| Producteur                                                                                      | Ce qu’il écrit                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DiagnosticAudioRecorder` (`infrastructure/diagnostics/`), abonné aux trames de `WebAudioInput` | le son ramené à `DIAGNOSTIC_SAMPLE_RATE = 16000` Hz (filtre passe-bas anti-repliement, puis un échantillon sur trois à 48 kHz ; à 44,1 kHz, rééchantillonnage linéaire après le filtre), en 16 bits, par blocs de `DIAGNOSTIC_CHUNK_S = 10` s ; un trou entre deux trames (plus d’une demi-trame d’écart) écrit `input.gap` (début, durée) et commence un nouveau bloc |
| `NnlsChordVerifier`                                                                             | `chord.expectation` à chaque attente reçue (attendu, candidats avec cases et hauteurs, style ; `null` quand on lui retire l’attente) ; `chord.report` pour chaque rapport : le rapport complet, le spectre (de 20 Hz à 6,3 kHz, pour que le blanchiment se refasse exactement) et le temps de calcul du jugement en ms                                                 |
| `WebAudioInput`                                                                                 | `input.opened`, `input.closed`                                                                                                                                                                                                                                                                                                                                         |

Tous ne préparent leurs données que si `sink.enabled`. Coupé, le vérificateur ne construit même pas le spectre.

## 4. Stockage, budget, réglage

**Base à part** : IndexedDB `neckspert-play-diagnostics` (Dexie), jamais dans la sauvegarde.

| Table    | Contenu                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `takes`  | `id`, `startedAt` (heure réelle, ms), `startedAudioTime` (s), `endedAt` (ms ou null), `input` (nom, fréquence, canaux, gain), `bytes`, `truncated` |
| `events` | `++id`, `takeId`, `audioTime`, `kind`, `data`                                                                                                      |
| `audio`  | `++id`, `takeId`, `audioTime`, `sampleRate`, `samples` (Int16Array)                                                                                |

**Réglage** : `Settings.diagnostics = { enabled: boolean; budgetMb: number }`. Défaut : `enabled` vrai en développement (`import.meta.env.DEV`), faux dans la version publiée ; `budgetMb` 300. Choix proposés : 100, 300, 1000. Des réglages enregistrés avant ce champ reçoivent le défaut à la lecture. La sauvegarde exporte et réimporte le champ.

**Budget** :

- `bytes` d’une prise = octets du son + longueur JSON des événements ;
- à la fermeture d’une prise, les prises les plus anciennes sont effacées en entier (prise, événements, son) jusqu’à repasser sous le budget ; jamais la prise en cours ;
- une prise qui dépasse à elle seule le budget arrête d’enregistrer son son (`truncated: true`) ; ses événements continuent.

**Écran Réglages**, bloc « Diagnostic » (textes français et anglais, `DESIGN.md`) :

- interrupteur « Enregistrer le son et les détails de la détection » ;
- place prise sur le budget (« 42 Mo sur 300 ») et choix du budget ;
- « Exporter le diagnostic » et « Effacer ».

`AppServices` gagne `diagnostics: { usage(): Promise<{ bytes: number; takes: number }>; exportArchive(): Promise<Blob>; clear(): Promise<void> }`.

## 5. Export

Un `.zip` sans compression (méthode STORE), écrit par l’app sans dépendance (`infrastructure/diagnostics/zip.ts`, CRC32 compris) :

```
neckspert-diagnostic-<date>.zip
├── apprentissage.json              la sauvegarde habituelle (DexieBackup.exportAll)
└── prises/<début ISO, ':' remplacés par '-'>/
    ├── prise.json                  la ligne de `takes`, et les trous du son
    ├── audio.wav                   16 kHz, 16 bits mono ; trou comblé de silence
    └── evenements.jsonl            un événement par ligne, dans l’ordre
```

Le WAV commence à l’heure audio du premier bloc ; un trou entre deux blocs est comblé de silence et listé dans `prise.json`.

## 6. Tests

- **Sous-échantillonnage** : un sinus de 1 kHz garde son amplitude (à 5 % près) à 16 kHz ; un sinus de 9 kHz est atténué d’au moins 40 dB ; même chose depuis 44,1 kHz.
- **Enregistreur** (entrée factice) : blocs de 10 s à la bonne heure audio ; un trou écrit `input.gap` et ouvre un nouveau bloc ; journal coupé : pas d’abonnement.
- **Journal Dexie** (`fake-indexeddb`) : ouverture et fermeture d’une prise ; effacement des plus anciennes au-delà du budget, jamais la prise en cours ; `truncated` quand une prise dépasse seule ; réglage coupé à l’ouverture : rien d’écrit.
- **Vérificateur d’accords** : journal coupé, rapports sans spectre et aucun événement ; journal factice actif, `chord.expectation` puis `chord.report` complet (spectre de 20 Hz à 6,3 kHz, temps de calcul). Le test d’aller-retour de B1 par la sauvegarde n’a plus de spectre.
- **Zip** : un lecteur minimal du test relit en-têtes locaux, répertoire central, CRC32 et contenu.
- **Export** : arborescence et noms ; le WAV, relu par le lecteur de B1, a la bonne fréquence, la bonne durée et le silence du trou.
- **Réglages** : défaut selon l’environnement ; réglages anciens complétés ; aller-retour par la sauvegarde.
- **Écran Réglages** (`*.svelte.spec.ts`) : interrupteur, budget, place prise, boutons qui appellent les services.

Barrière de fusion : `npm test && npm run check`.

## Hors périmètre

Les mécaniques de la voie mémoire (C1). L’analyse elle-même (scripts, tableau de bord des variantes : B3). La compression du son. Le détail des trames du détecteur de notes (ses observations suffisent pour l’instant). L’envoi du diagnostic hors de l’appareil.
