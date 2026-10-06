# Accords et voicings — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le domaine sait écrire les notes d’un accord, décrire un voicing (le degré porté par chaque corde), trouver ses occurrences sur le manche, générer les triades serrées et fournir les candidats d’une occurrence.

**Architecture:** logique pure dans `src/lib/domain/music/`, quatre nouveaux fichiers plus `candidates.ts`, chacun avec sa spec colocalisée ; aucun changement ailleurs que le barrel `music/index.ts`. Aucune mécanique, interface, stockage ni capteur.

**Tech Stack:** TypeScript, Vitest (projet `server`).

**Spec:** `docs/superpowers/specs/2026-10-06-accords-voicings-design.md` (à lire avant chaque tâche).

## Global Constraints

- Node 22 via `.nvmrc` : lancer `source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx`. Le worktree n’a pas de `node_modules` : `npm ci` une fois avant la tâche 1.
- Porte de fusion de chaque tâche : `npm test && npm run check`, puis `npm run lint` (sinon `npm run format`).
- Code, identifiants et commentaires en anglais ; commits Conventional Commits en minuscules, impératifs, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `expect.requireAssertions` est actif : chaque test asserte.
- Constantes nommées, commentées « to calibrate » : `MAX_VOICING_FRET = 17`, `MAX_SPAN_FRETS = 4`.
- Qualités de la table, dans cet ordre : `maj` (1, 3, 5, suffixe `''`), `min` (1, b3, 5, `'m'`), `dim` (1, b3, b5, `'dim'`), `aug` (1, 3, #5, `'aug'`).
- Degrés : `1` 0/0, `b3` 3/2, `3` 4/2, `b5` 6/4, `5` 7/4, `#5` 8/4, `6` 9/5, `b7` 10/6, `7` 11/6 (demi-tons / pas de lettre).
- Clé d’item : `${hauteur canonique en dièses}|${quality.id}|${corde}:${degré},…`, cordes de la plus grave à la plus aiguë. Exemple figé : `D|maj|3:5,2:1,1:3`.
- Toute entrée invalide lève une `RangeError` (comme `midiOnString`).
- Écart à la spec, décidé ici : `spellInterval(root, degree)` vit dans `chord.ts` (il a besoin de la table des degrés) ; `spelling.ts` fournit l’arithmétique de lettres `transposeSpelled`.

## Review Focus

1. **Clé indépendante de l’orthographe** : Cb majeur et B majeur, Ebm et D#m donnent la même clé ; `parseVoicingKey` rend une fondamentale en dièses (tâche 3).
2. **Clé corrompue venue du stockage ou d’une sauvegarde** : `parseVoicingKey('D|sus4|3:1')`, `'D|maj|3:9'`, `'D|maj'`, `'H|maj|3:1'` lèvent une `RangeError` au lieu de rendre un voicing faux (tâche 3).
3. **Voicing comme donnée d’exercice** : un `Voicing` survit à un aller-retour JSON et garde sa clé (les définitions d’exercice sont des données) (tâche 3).
4. **Fondamentale bémol donnée au générateur** : `closeTriadVoicings` sur Ebm rend les mêmes clés que sur D#m, et des notes écrites Eb‑Gb‑Bb (tâche 4).
5. **Altération impossible** : `spellInterval(B##, '#5')` lève une `RangeError` au lieu d’écrire un triple dièse (tâche 2).

---

### Task 1: Orthographe

**Files:**

- Create: `src/lib/domain/music/spelling.ts`
- Test: `src/lib/domain/music/spelling.spec.ts`

**Interfaces:**

- Consumes: `PitchName`, `CHROMATIC_NOTES` de `./types`.
- Produces :

  ```ts
  type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  type Accidental = -2 | -1 | 0 | 1 | 2;
  interface SpelledNote {
  	letter: Letter;
  	accidental: Accidental;
  }
  function pitchOfSpelled(note: SpelledNote): PitchName;
  function parseSpelledNote(text: string): SpelledNote; // RangeError si invalide
  function formatSpelledNote(note: SpelledNote): string; // 'C', 'C#', 'Db', 'Bbb', 'F##'
  function spelledFromPitch(pitch: PitchName): SpelledNote; // orthographe en dièses : 'D#' → D +1
  function transposeSpelled(root: SpelledNote, semitones: number, letterSteps: number): SpelledNote;
  ```

- [ ] **Step 1: Write the failing tests** in `spelling.spec.ts`
  - `parseSpelledNote` / `formatSpelledNote` aller-retour sur `['C', 'C#', 'Db', 'Bbb', 'F##']` ;
  - `parseSpelledNote` lève une `RangeError` sur `'H'`, `'Eb#'`, `'Ebbb'`, `''`, `'c'` ;
  - `pitchOfSpelled` : `Cb` → `'B'`, `E#` → `'F'`, `Bbb` → `'A'`, `F##` → `'G'`, `Eb` → `'D#'` ;
  - `spelledFromPitch` : chaque `CHROMATIC_NOTES` revient à lui-même par `pitchOfSpelled` ; `'D#'` → `{ letter: 'D', accidental: 1 }` ;
  - `transposeSpelled(Eb, 3, 2)` → `Gb` ; `transposeSpelled(Ab, 3, 2)` → `Cb` ; `transposeSpelled(Eb, 6, 4)` → `Bbb` ; `transposeSpelled(B##, 8, 4)` lève une `RangeError`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/music/spelling.spec.ts` — Expected: FAIL (module absent).

- [ ] **Step 3: Implement `spelling.ts`.** `transposeSpelled` : la lettre avance de `letterSteps` (modulo 7), la hauteur de `semitones` (modulo 12) ; l’altération est l’écart entre la hauteur visée et la lettre naturelle, ramené dans −6..+5 ; hors de −2..+2 → `RangeError`.

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: spell notes by letter and accidental`

### Task 2: Accords

**Files:**

- Create: `src/lib/domain/music/chord.ts`
- Test: `src/lib/domain/music/chord.spec.ts`

**Interfaces:**

- Consumes: tâche 1.
- Produces :

  ```ts
  type Degree = '1' | 'b3' | '3' | 'b5' | '5' | '#5' | '6' | 'b7' | '7';
  const DEGREES: Readonly<Record<Degree, { semitones: number; letterSteps: number }>>;
  interface ChordQuality {
  	id: string;
  	suffix: string;
  	degrees: readonly Degree[];
  }
  const QUALITIES: readonly ChordQuality[]; // maj, min, dim, aug
  function qualityById(id: string): ChordQuality; // RangeError si inconnue
  interface Chord {
  	root: SpelledNote;
  	quality: ChordQuality;
  }
  interface ChordTone {
  	degree: Degree;
  	note: SpelledNote;
  	pitch: PitchName;
  }
  function spellInterval(root: SpelledNote, degree: Degree): SpelledNote;
  function chordTones(chord: Chord): ChordTone[]; // dans l’ordre de quality.degrees
  function chordLabel(chord: Chord): string; // 'Ebm', 'C#', 'Bdim'
  ```

- [ ] **Step 1: Write the failing tests** in `chord.spec.ts`
  - notes écrites de `chordTones` : Ebm → `['Eb', 'Gb', 'Bb']`, Abm → `['Ab', 'Cb', 'Eb']`, C# → `['C#', 'E#', 'G#']`, Ebdim → `['Eb', 'Gb', 'Bbb']` ; hauteurs d’Ebm → `['D#', 'F#', 'A#']` ; degrés de Caug → `['1', '3', '#5']` ;
  - `chordLabel` : `'Ebm'`, `'C#'`, `'Bdim'`, `'Caug'` ;
  - qualité construite dans le test `{ id: 'maj7', suffix: 'maj7', degrees: ['1', '3', '5', '7'] }` : C → `['C', 'E', 'G', 'B']`, libellé `'Cmaj7'` ;
  - `QUALITIES.map((q) => q.id)` → `['maj', 'min', 'dim', 'aug']` ; `qualityById('sus4')` lève une `RangeError` ;
  - `spellInterval(parseSpelledNote('B##'), '#5')` lève une `RangeError`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/music/chord.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `chord.ts`** avec les valeurs des Global Constraints ; `spellInterval` délègue à `transposeSpelled`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: describe chords by root and degrees`

### Task 3: Voicings et occurrences

**Files:**

- Create: `src/lib/domain/music/voicing.ts`
- Test: `src/lib/domain/music/voicing.spec.ts`

**Interfaces:**

- Consumes: tâches 1 et 2 ; `midiOnString`, `StringNumber`, `Midi`, `FretPosition`.
- Produces :

  ```ts
  const MAX_VOICING_FRET = 17; // to calibrate
  const MAX_SPAN_FRETS = 4; // to calibrate
  type StringSet = readonly StringNumber[];
  interface VoicingString {
  	string: StringNumber;
  	degree: Degree;
  }
  interface Voicing {
  	chord: Chord;
  	strings: readonly VoicingString[];
  }
  function createVoicing(chord: Chord, strings: readonly VoicingString[]): Voicing;
  function voicingKey(voicing: Voicing): string;
  function parseVoicingKey(key: string): Voicing;
  interface VoicingNote {
  	string: StringNumber;
  	fret: number;
  	midi: Midi;
  	degree: Degree;
  	note: SpelledNote;
  }
  interface VoicingOccurrence {
  	voicing: Voicing;
  	notes: readonly VoicingNote[];
  }
  function voicingOccurrences(voicing: Voicing): VoicingOccurrence[];
  function occurrencePositions(occurrence: VoicingOccurrence): FretPosition[];
  ```

  `createVoicing` lève une `RangeError` si les cordes sont vides, en double, pas de la plus grave à la plus aiguë (numéros strictement décroissants), ou si un degré n’appartient pas à la qualité. Un degré peut manquer ou être doublé.

- [ ] **Step 1: Write the failing tests** in `voicing.spec.ts` (aide locale : `frets(o) = o.notes.map((n) => n.fret)`)
  - `createVoicing` : `RangeError` pour `[]`, `[3, 3]`, `[1, 2, 3]`, et `b3` dans un accord `maj` ; accepte une quinte absente (G sur 6‑4 : `6:1, 4:5`) et une fondamentale doublée ;
  - `voicingKey` de D, fondamentale sur si (`3:5, 2:1, 1:3`) → `'D|maj|3:5,2:1,1:3'` ; Ebm et D#m, Cb et B donnent la même clé ;
  - `parseVoicingKey` : aller-retour de clé ; la fondamentale revient en dièses (`formatSpelledNote` → `'D#'` pour une clé d’Ebm) ; `RangeError` sur `'D|sus4|3:1'`, `'D|maj|3:9'`, `'D|maj'`, `'H|maj|3:1'` ;
  - `JSON.parse(JSON.stringify(voicing))` garde la même clé ;
  - occurrences sur sol‑si‑mi : D fondamentale sur si → `[[2, 3, 2], [14, 15, 14]]` ; sur sol → `[[7, 7, 5]]` ; sur mi → `[[11, 10, 10]]` ; A fondamentale sur sol → `[[2, 2, 0], [14, 14, 12]]` (pas de 14‑14‑0) ;
  - le détail de D 2‑3‑2 : midis `[57, 62, 66]`, degrés `['5', '1', '3']`, notes `['A', 'D', 'F#']` ;
  - shell Cmaj7 (qualité construite dans le test) sur 6‑4‑3 (`6:1, 4:7, 3:3`) → `[[8, 9, 9]]` ; G sur 6‑4 (`6:1, 4:5`) → `[[3, 0], [15, 12]]` (pas de 15‑0) ;
  - `occurrencePositions` de D 2‑3‑2 → `[{ string: 3, fret: 2 }, { string: 2, fret: 3 }, { string: 1, fret: 2 }]`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/music/voicing.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `voicing.ts`.** `voicingOccurrences` : pour chaque corde, les cases de 0 à `MAX_VOICING_FRET` dont la hauteur a la classe du degré ; produit cartésien ; on garde les combinaisons dont l’écart des cases jouées (cases > 0) ne dépasse pas `MAX_SPAN_FRETS` et dont les midis montent strictement dans l’ordre des cordes ; tri lexicographique des midis. Les notes écrites viennent de `spellInterval(chord.root, degree)`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: find where a voicing falls on the neck`

### Task 4: Triades serrées

**Files:**

- Create: `src/lib/domain/music/triads.ts`
- Test: `src/lib/domain/music/triads.spec.ts`

**Interfaces:**

- Consumes: tâches 2 et 3.
- Produces : `function closeTriadVoicings(chord: Chord, strings: StringSet): Voicing[]` — trois voicings : fondamentale sur la corde grave (degrés 1‑3‑5 de la qualité), sur la corde aiguë (3‑5‑1), sur celle du milieu (5‑1‑3). `RangeError` si la qualité n’a pas trois degrés ou le groupe pas trois cordes.

- [ ] **Step 1: Write the failing tests** in `triads.spec.ts`
  - clés de D sur `[3, 2, 1]` → `['D|maj|3:1,2:3,1:5', 'D|maj|3:3,2:5,1:1', 'D|maj|3:5,2:1,1:3']` ;
  - Ebm et D#m sur `[3, 2, 1]` : mêmes clés ; les notes de la première occurrence d’Ebm s’écrivent avec Eb, Gb et Bb ;
  - `RangeError` pour une qualité maj7 construite dans le test, et pour le groupe `[3, 2]` ;
  - propriétés sur les 12 fondamentales (`spelledFromPitch`) × `QUALITIES` × `[[3, 2, 1], [4, 3, 2]]` : chaque voicing a au moins une occurrence ; dans chaque occurrence, chaque hauteur est une hauteur de `chordTones`, l’écart des cases jouées ≤ `MAX_SPAN_FRETS`, chaque case ≤ `MAX_VOICING_FRET`, les midis montent strictement.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/music/triads.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `triads.ts`** avec `createVoicing`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: generate close triads on three strings`

### Task 5: Candidats et barrel

**Files:**

- Create: `src/lib/domain/music/candidates.ts`
- Test: `src/lib/domain/music/candidates.spec.ts`
- Modify: `src/lib/domain/music/index.ts` (exporte `spelling`, `chord`, `voicing`, `triads`, `candidates`)
- Modify: `src/lib/domain/music/index.spec.ts` (ajoute à `PUBLIC_FUNCTIONS` : `parseSpelledNote`, `formatSpelledNote`, `pitchOfSpelled`, `spelledFromPitch`, `chordTones`, `chordLabel`, `createVoicing`, `voicingKey`, `parseVoicingKey`, `voicingOccurrences`, `occurrencePositions`, `closeTriadVoicings`, `voicingCandidates`)

**Interfaces:**

- Consumes: tâches 2 à 4.
- Produces :

  ```ts
  type CandidateKind = 'expected' | 'other-octave' | 'other-inversion' | 'other-quality';
  interface VoicingCandidate {
  	kind: CandidateKind;
  	occurrence: VoicingOccurrence;
  }
  function voicingCandidates(
  	occurrence: VoicingOccurrence,
  	inversions: readonly Voicing[]
  ): VoicingCandidate[];
  ```

  Ordre du résultat : `expected` ; `other-octave` dans l’ordre des occurrences ; `other-inversion` dans l’ordre de `inversions` (le voicing attendu, reconnu par sa clé, en est exclu) ; `other-quality` dans l’ordre de `QUALITIES`. « Plus proche » : la somme des écarts de case corde à corde est minimale ; à égalité, la plus grave. Une autre qualité est candidate quand sa liste de degrés a la même longueur et ne diffère qu’à une position, d’un demi-ton ; chaque corde garde la position de son degré dans la liste (le degré `3` de maj devient `b3` de min).

- [ ] **Step 1: Write the failing tests** in `candidates.spec.ts` (aide : `summary(c) = [c.kind, c.occurrence.notes.map((n) => n.fret)]`, `inversions = closeTriadVoicings(D, [3, 2, 1])`)
  - D 2‑3‑2 → `[['expected', [2, 3, 2]], ['other-octave', [14, 15, 14]], ['other-inversion', [7, 7, 5]], ['other-inversion', [11, 10, 10]], ['other-quality', [2, 3, 1]], ['other-quality', [3, 3, 2]]]` ;
  - D 14‑15‑14 → `other-octave` `[2, 3, 2]`, `other-quality` `[14, 15, 13]` puis `[15, 15, 14]` ;
  - Dm 2‑3‑1 → `other-quality` `[2, 3, 2]` (maj) puis `[1, 3, 1]` (dim) ;
  - le libellé des accords `other-quality` : `chordLabel` → `'Dm'`, `'Daug'` pour D 2‑3‑2 ;
  - le test « end to end » d’`index.spec.ts` gagne : `music.voicingKey(music.closeTriadVoicings(D, [3, 2, 1])[2])` → `'D|maj|3:5,2:1,1:3'`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/music/candidates.spec.ts src/lib/domain/music/index.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `candidates.ts`** and the barrel exports.

- [ ] **Step 4: Run the merge gate** `npm test && npm run check && npm run lint` — Expected: all green.

- [ ] **Step 5: Commit** — `feat: list the voicings a played chord could be mistaken for`
