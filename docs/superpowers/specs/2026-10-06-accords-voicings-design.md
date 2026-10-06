# Design — accords et voicings

Date : 2026-10-06. Statut : approuvé dans la conversation du 2026-10-06, section par section.

Sous-projet A de l’étape 3 de la feuille de route de `docs/plateforme.md`, dont cette spec reprend le vocabulaire (mécanique, exercice, item, carte). Logique pure, sans mécanique, sans interface, sans stockage ni capteur : le savoir musical sur les accords dont les exercices de triades et de renversements ont besoin, général dès maintenant parce qu’il ne coûte presque rien de plus.

## Contexte : les exercices de triades

Décisions de la conversation de recherche du 2026-10-06, tirées du bilan du cours du 2026-09-24 (renversements, déplacements sur le manche ; devoirs : la grille de « I Only Have Eyes for You », lignes 1 et 2, en montant puis en descendant, et retrouver plusieurs formes d’un même accord). Elles cadrent les sous-projets suivants ; cette spec n’en construit que le domaine.

- **La pédagogie décide, la technique suit.** Aucune consigne n’est simplifiée pour arranger un capteur. Le but est de jouer comme en jam : arpéger joliment, plaquer, mélanger les deux, improviser un rythme.
- **Contenu de départ** : triades majeures et mineures sur les cordes sol‑si‑mi ; pas de septièmes tant que les triades ne sont pas maîtrisées. D, A et F#m (vus en cours), puis les triades de la grille (Dm, G, C, F, Em, Ebm, Ab).
- **Un renversement est nommé par la corde qui porte la fondamentale** : « D · fondamentale sur si ».
- **Deux voies parallèles** :
  - **mémoire**, par voicing, avec FSRS, froid et chaud : _ancrer la fondamentale_ (la fondamentale sur le temps 1, l’accord plaqué ou arpégé librement sur le 3) introduit un voicing ; _plaquer dans une zone_ le révise à froid, en continu, dès qu’il est appris ;
  - **geste**, mesuré par une courbe de performance (le tempo tenu) : _relier les formes_ (les trois renversements d’un accord en montant puis en descendant le manche), puis _contrainte de déplacement_ (une grille en montant ou en descendant), puis _rester dans une zone_ (zone imposée et tournante), puis _jam_ (grille lue en avance, rythme libre, accompagnement de batterie seule). Chaque étape s’ouvre quand ses voicings sont appris ; le sondage rend acquis d’emblée ceux déjà sus.
- **Détection** : un POC mené à part (branche `spike/triades-detection`) dit si l’on peut reconnaître, à l’oreille de la machine, quel voicing a sonné. Ce domaine n’en dépend pas : il fournit des candidats, et le capteur, quel qu’il soit, en désignera un.

Découpage :

|       | Sous-projet                                                                                  | Dépend du POC            |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------ |
| **A** | Accords et voicings (cette spec)                                                             | non                      |
| B     | Contrat du capteur d’accords et capteur factice                                              | en partie                |
| C     | Voie de la mémoire : mécaniques, file d’introduction, lien avec la file des notes            | pour le branchement réel |
| D     | Voie du geste : rapport au temps « grille », performance, contraintes, exercices             | idem                     |
| E     | Session à deux voies : blocs, métronome relancé au changement de tempo, ouverture des étapes | non                      |

## Objectifs

- Les notions d’accord, de groupe de cordes et de voicing existent dans `src/lib/domain/music/`, générales : triades et accords à quatre sons, groupes de cordes de toute taille, voisines ou non, degrés manquants ou doublés.
- Un voicing calcule ses occurrences sur le manche, avec la case, la hauteur exacte et le degré de chaque corde.
- Les notes d’un accord s’écrivent selon son nom (Ebm : Eb‑Gb‑Bb).
- Un seul générateur : les triades serrées sur trois cordes.
- Chaque occurrence fournit ses candidats, le vocabulaire commun du juge et des confusions.

## 1. Orthographe (`spelling.ts`)

`NoteLabel` (hauteur + dièse ou bémol) ne sait pas écrire Cb, E# ou Bbb. Il reste tel quel pour les notes isolées des modes 1 et 2. Les accords ont leur propre notion :

```ts
type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

interface SpelledNote {
	letter: Letter;
	/** −2 à +2 : bb, b, naturel, #, ##. */
	accidental: -2 | -1 | 0 | 1 | 2;
}
```

- `pitchOfSpelled(note): PitchName` : la hauteur, dans l’orthographe canonique en dièses (`Cb` → `B`).
- `parseSpelledNote('Eb')`, `formatSpelledNote(note)` : `C`, `C#`, `Db`, `Bbb`, `F##`. Le parseur rejette ce qui n’est pas une lettre suivie d’au plus deux altérations identiques.
- `spellInterval(root, degree): SpelledNote` : la lettre avance du nombre de pas du degré, l’altération corrige d’après les demi-tons. Une altération hors de −2..+2 lève une erreur (aucun accord de la table n’en produit).

## 2. Accords (`chord.ts`)

Un degré est un identifiant de la table des degrés, avec ses demi-tons et ses pas de lettre :

| Degré         | `1` | `b3` | `3` | `b5` | `5` | `#5` | `6` | `b7` | `7` |
| ------------- | --- | ---- | --- | ---- | --- | ---- | --- | ---- | --- |
| demi-tons     | 0   | 3    | 4   | 6    | 7   | 8    | 9   | 10   | 11  |
| pas de lettre | 0   | 2    | 2   | 4    | 4   | 4    | 5   | 6    | 6   |

Une qualité est une liste nommée de degrés, avec son suffixe d’affichage. La table contient les quatre qualités de triade ; les septièmes arriveront avec le sous-projet D, une ligne chacune.

```ts
type Degree = '1' | 'b3' | '3' | 'b5' | '5' | '#5' | '6' | 'b7' | '7';

interface ChordQuality {
	id: string; // 'maj', 'min', 'dim', 'aug'
	suffix: string; // '', 'm', 'dim', 'aug'
	degrees: readonly Degree[];
}

interface Chord {
	root: SpelledNote;
	quality: ChordQuality;
}
```

| Qualité | Degrés    | Suffixe |
| ------- | --------- | ------- |
| `maj`   | 1, 3, 5   |         |
| `min`   | 1, b3, 5  | m       |
| `dim`   | 1, b3, b5 | dim     |
| `aug`   | 1, 3, #5  | aug     |

- `chordTones(chord)` : pour chaque degré, la note écrite et la hauteur.
- `chordLabel(chord)` : `Ebm`, `C#`, `Bdim`.
- Une qualité est une donnée : un test en construit une (maj7 : 1, 3, 5, 7) sans toucher à la table.

## 3. Groupes de cordes et voicings (`voicing.ts`)

```ts
/** Cordes ordonnées de la plus grave à la plus aiguë, sans doublon, au moins une. */
type StringSet = readonly StringNumber[];

/** L’item : un accord et le degré porté par chaque corde du groupe. */
interface Voicing {
	chord: Chord;
	strings: readonly { string: StringNumber; degree: Degree }[];
}
```

- Le groupe de cordes peut avoir n’importe quelle taille et des cordes non voisines (6‑4). Un degré de l’accord peut manquer (shell sans quinte) ou être doublé (forme ouverte). Chaque degré du voicing doit appartenir à la qualité de l’accord ; sinon `RangeError`.
- **Clé d’item** : `voicingKey(voicing)` donne `${hauteur}|${qualité}|${corde}:${degré},…`, cordes de la plus grave à la plus aiguë, hauteur canonique. Exemple : D, fondamentale sur si, sur sol‑si‑mi → `D|maj|3:5,2:1,1:3`. Ebm et D#m donnent la même clé : même forme sous les doigts, même carte. L’orthographe vient de l’exercice, à l’affichage. Cette clé sera stockée dans les cartes : un test la fige. `parseVoicingKey` fait l’inverse, avec une fondamentale écrite en dièses.

### Occurrences

```ts
interface VoicingNote {
	string: StringNumber;
	fret: number; // 0 = corde à vide
	midi: Midi;
	degree: Degree;
	note: SpelledNote;
}

interface VoicingOccurrence {
	voicing: Voicing;
	notes: readonly VoicingNote[]; // dans l’ordre des cordes du voicing
}
```

- `voicingOccurrences(voicing)` : chaque combinaison de cases où chaque corde porte son degré, de la case 0 à `MAX_VOICING_FRET`, dont l’écart entre la case jouée la plus basse et la plus haute ne dépasse pas `MAX_SPAN_FRETS`, et dont les hauteurs montent strictement d’une corde à la suivante (pas de croisement : A n’a pas d’occurrence 14‑14‑0, où le mi à vide sonnerait sous le C#). Les cordes à vide ne comptent pas dans l’écart. Tri du plus grave au plus aigu : hauteur de la corde la plus grave, puis des suivantes.
- `occurrencePositions(occurrence): FretPosition[]` : les positions de la carte du manche. C’est le point d’accroche du lien avec la file des notes (sous-projet C).

| Constante          | Valeur | Raison                                                                                            |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `MAX_VOICING_FRET` | 17     | la montée de la grille du devoir sur sol‑si‑mi y arrive (Ab, 17‑16‑16)                            |
| `MAX_SPAN_FRETS`   | 4      | une main ; les triades serrées sur cordes voisines restent en deçà, la marge sert aux futurs drop |

Toutes deux à calibrer.

## 4. Triades serrées (`triads.ts`)

Le seul générateur pour l’instant. `closeTriadVoicings(chord, strings)` prend un accord à trois degrés et un groupe de trois cordes, et rend les trois voicings serrés, un par corde de la fondamentale, dans l’ordre des degrés de la qualité tournés : fondamentale sur la corde grave (état fondamental : 1‑3‑5), sur la corde aiguë (1er renversement : 3‑5‑1), sur celle du milieu (2e renversement : 5‑1‑3). Un accord qui n’a pas trois degrés ou un groupe qui n’a pas trois cordes lève une `RangeError`. Les familles suivantes (drop 2, drop 3, shells, formes ouvertes) arrivent avec l’exercice qui les utilise.

## 5. Candidats (`candidates.ts`)

Ce que le juge comparera à ce qui a sonné. Chaque candidat est une occurrence étiquetée, donc un ensemble de hauteurs exactes ; il ne présuppose rien du capteur.

```ts
type CandidateKind = 'expected' | 'other-octave' | 'other-inversion' | 'other-quality';

interface VoicingCandidate {
	kind: CandidateKind;
	occurrence: VoicingOccurrence;
}
```

`voicingCandidates(occurrence, inversions)` :

- `expected` : l’occurrence elle-même ;
- `other-octave` : les autres occurrences du même voicing ;
- `other-inversion` : pour chaque autre voicing de `inversions` (les voicings du même accord sur le même groupe, fournis par l’appelant, par exemple `closeTriadVoicings`), son occurrence la plus proche, celle qui minimise la somme des écarts de case corde à corde ; à égalité, la plus grave ;
- `other-quality` : les accords de même fondamentale dont la qualité, dans la table, diffère d’un seul degré décalé d’un demi-ton (maj ↔ min, maj ↔ aug, min ↔ dim), joués avec les mêmes cordes et les mêmes degrés correspondants, à leur occurrence la plus proche. C’est « une case à côté sur une corde qui donne un autre accord connu ». La règle couvrira d’elle-même les accords suspendus quand la table les aura : la tierce majeure montée d’un demi-ton donne sus4 (D → Dsus4), la tierce mineure descendue d’un demi-ton donne sus2 (Dm → Dsus2). Ils n’y entrent pas maintenant : aucun exercice ne les demande, et cette erreur reste visible comme une triade incomplète.

Exemple, attendu D, fondamentale sur si, 2‑3‑2 : `expected` A3 D4 F#4 ; `other-octave` 14‑15‑14 ; `other-inversion` 7‑7‑5 et 11‑10‑10 ; `other-quality` Dm 2‑3‑1 et Daug 3‑3‑2.

Deux cas dépendent de ce qui est joué et non du voicing : la triade incomplète et l’accord précédent qui sonne encore. Le juge les traite dans le sous-projet C, avec les observations du capteur.

## 6. Tests

Colocalisés (`*.spec.ts`, projet Vitest `server`), écrits avant le code :

- orthographe : Ebm → Eb‑Gb‑Bb, Abm → Ab‑Cb‑Eb, C# → C#‑E#‑G#, Ebdim → Eb‑Gb‑Bbb ; aller-retour `parseSpelledNote` / `formatSpelledNote` ; rejet de `H`, `Eb#`, `Ebbb` ;
- occurrences de D sur sol‑si‑mi : 2‑3‑2, 7‑7‑5, 11‑10‑10, 14‑15‑14 ; A avec le mi à vide : 2‑2‑0 et 14‑14‑12 ;
- généralité : shell Cmaj7 sur 6‑4‑3 (1, 7, 3) → 8‑9‑9, avec une qualité construite dans le test ; G sur 6‑4 (1, 5), groupe non voisin sans tierce → 3‑0 et 15‑12, mais pas 15‑0 (croisement) ;
- `voicingKey` figée sur l’exemple ci-dessus, même clé pour Ebm et D#m, aller-retour avec `parseVoicingKey` ;
- candidats de D 2‑3‑2, tels que listés en section 5 ;
- propriétés sur toutes les triades serrées des 12 fondamentales × 4 qualités × sol‑si‑mi et ré‑sol‑si : chaque note est une note de l’accord, chaque occurrence respecte l’écart de main, la case maximale et l’absence de croisement, chaque voicing a au moins une occurrence.

Barrière de fusion : `npm test && npm run check`.

## Hors périmètre

Les mécaniques, les consignes et leur formulation (« fondamentale sur si »), l’interface, le stockage, le capteur, la règle « plus haut sur le manche », les septièmes dans la table, la lecture des symboles de grille (7#11, 7b9, G7/F), la règle « tel voicing peut jouer tel accord de la grille » (Dm pour Dm7), la jouabilité au-delà de l’écart de main.
