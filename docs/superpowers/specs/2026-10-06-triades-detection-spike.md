# Triades sur sol-si-mi : spike de détection

Date : 2026-10-06. Statut : spike clos le 2026-10-07, recommandation ci-dessous. Branche `spike/triades-detection`. Le code d’évaluation est jetable ; le format du corpus est conservé (fixtures futures).

## Décisions pédagogiques (conversation de recherche du 2026-10-06)

- **Contenu.** Triades majeures et mineures sur les cordes sol-si-mi seulement, pas de septièmes pour l’instant. D, A, F#m, puis les triades de la grille « I Only Have Eyes for You », lignes 1–2 : Dm, G, C, F, Em, Ebm, Ab.
- **Nom du renversement.** Il est nommé par la corde qui porte la fondamentale : « D · fondamentale sur si ».
- **Deux voies parallèles.**
  - _Mémoire_ (par triade, FSRS, froid/chaud) : « ancrer la fondamentale » (fondamentale sur le temps 1, accord plaqué ou arpégé librement sur le 3) introduit la triade ; « plaquer dans une zone » la révise à froid, en continu, dès qu’elle est apprise.
  - _Geste_ (courbe de performance, tempo tenu) : relier les formes (les 3 renversements d’un accord en montant puis en descendant le manche), puis contrainte de déplacement (grille en montant / en descendant), puis rester dans une zone (zone imposée et tournante), puis jam (grille lue en avance, rythme libre : arpège, plaqué, mélange ; accompagnement de batterie seule). Chaque étape s’ouvre quand ses triades sont apprises ; le sondage rend acquises d’emblée les triades déjà sues.
- **Principe.** La pédagogie décide, la technique suit. Aucune consigne n’est simplifiée pour arranger le détecteur (pas d’arpège « une note par temps »).

## Question

Sur sol-si-mi, dans une fenêtre ouverte à l’attaque (datée par le détecteur d’attaques actuel), peut-on dire lequel de ces candidats a sonné ?

- la triade attendue ;
- ses deux autres renversements, et le même renversement à une autre position ;
- l’autre qualité (majeur/mineur) ;
- l’accord précédent qui sonne encore ;
- aucun (une autre triade).

On répond par condition : plaqué, arpégé, mélangé ; entrée directe (DI) ou micro ; accord isolé, ou accord précédent (ou fondamentale) qui sonne encore. On cherche aussi la fenêtre minimale.

**Critère de « faisable ».** Par condition, sur les accords bien joués : au moins 95 % de renversements et de qualités justes acceptés, au plus 2 % de faux acceptés dans chaque relation, et en plaqué une décision possible en 500 ms au plus (un temps à 120 bpm). L’arpège peut avoir sa propre fenêtre (une mesure).

**Point dur attendu.** Deux renversements voisins partagent deux notes à l’identique, octave comprise. Exemple de D : le 2e renversement A3 D4 F#4 donne, à l’état fondamental, D4 F#4 A4. Seul A3 → A4 change, et l’harmonique 2 de A3 tombe sur A4. Si l’accord précédent sonne encore, tout se joue sur une note.

## Protocole

### Corpus : `/dev/corpus`

La page enregistre des prises guidées. Elle sert le métronome de l’app (le clic sonne vraiment dans la pièce au micro) et capte les trames du `frame-processor` de l’app, brutes (sans annulation d’écho, réduction de bruit ni contrôle automatique de gain). Une prise donne `<id>.wav` (PCM 16 bits mono) et `<id>.json` (format `neckspert-triads-corpus` v1, `src/lib/spike/triads/corpus.ts`). Le JSON note pour chaque événement : accord, corde de la fondamentale, cases et notes MIDI, style, accord précédent, ce qui sonne encore (`ringing`), temps prévu, et `ok` (décoché quand l’événement a été mal joué). Il garde aussi l’entrée, le tempo et la latence calibrée.

Scripts, joués chacun plaqué, arpégé et mélangé :

| script                         | ce qu’il mesure                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Relier les formes              | les voicings d’une triade en montant puis en descendant, un par mesure, accord précédent qui sonne |
| Grille en montant / descendant | la grille saisie, chaque accord plus haut (plus bas) que le précédent                              |
| Ancrer la fondamentale         | fondamentale seule sur le 1, accord sur le 3 (la fondamentale sonne encore)                        |
| Accord isolé                   | un voicing, puis « Étouffe », une mesure de silence                                                |

Les voicings sont les positions serrées sur sol-si-mi, cases 0 à 15 (`voicingsOf`). Le corpus reste hors git (`/corpus`). Un petit extrait servira de fixtures.

### Évaluateur : `spikes/triades/`

```sh
node --experimental-transform-types spikes/triades/evaluate.ts corpus/<dossier> [sortie]
python spikes/triades/basic_pitch_notes.py corpus/<dossier>   # facultatif, avant evaluate
```

Basic Pitch demande Python ≤ 3.11 : `uv venv -p 3.11 && uv pip install basic-pitch "setuptools<81"` (resampy importe encore `pkg_resources`).

- **Attaque.** `OnsetDetector` du dépôt, rejoué sur le WAV. On retient l’attaque la plus proche de l’instant attendu (clic + latence calibrée), entre −200 et +350 ms.
- **Fenêtres.** 250, 500, 1000 et 2000 ms après l’attaque, arrêtées 80 ms avant l’événement suivant.
- **Spectre.** Maximum par case de fréquence des spectres de magnitude (Hann 8192, pas 1024 à 48 kHz) sur la fenêtre : une note compte dès qu’elle a sonné (la moyenne, essayée d’abord, noie la dernière note d’un arpège). Blanchi à la manière de Klapuri.
- **Fenêtres.** 250, 500, 1000, 2000 ms, et « mesure » (jusqu’à 80 ms avant l’événement suivant). Variante _différentielle_ : magnitude après l’attaque moins magnitude des 250 ms qui la précèdent.
- **Juges.** Chacun note les ~96 voicings de toutes les triades majeures et mineures sur sol-si-mi :
  - `sal-*` : corrélation de la saillance par demi-ton (somme d’harmoniques, octave gardée) avec le gabarit des trois notes ;
  - `nnls-*` : analyse par synthèse. Ajustement non négatif de peignes harmoniques sur les notes du candidat ; score = énergie expliquée × facteur de présence (chaque note doit porter de l’énergie). `nnls-prev` ajoute au modèle les notes de l’accord précédent quand il sonne encore ;
  - `basic-pitch` : indice de Jaccard entre les notes que Basic Pitch voit commencer dans la fenêtre et celles du candidat (arbitre hors ligne).
- **Décision.** L’app connaît l’accord attendu E et l’accord précédent. E est accepté si son score atteint un seuil et dépasse d’une marge chaque membre de sa famille : les voicings de E, ceux de l’autre qualité, et l’accord précédent.
- **Mesures.** Pour chaque accord joué, on teste toutes les hypothèses : la juste (TAR) et les fausses, rangées par relation à l’accord joué (FAR renversement, octave, qualité, précédent, autre triade à ±3 cases). Le seuil et la marge sont choisis par type d’entrée : TAR maximal avec FAR ≤ 2 % dans chaque relation. Le rapport donne ce point de fonctionnement par juge et fenêtre, la matrice par condition (entrée × style × ce qui sonne encore), et l’identification sans connaître l’attendu (premier de tous les voicings). Seuils choisis sur les mêmes données : chiffres optimistes, à confirmer sur des prises tenues à l’écart.

## Résultats

### Corpus synthétique (validation de la chaîne seulement)

`spikes/triades/synth.ts` produit 192 prises au format réel : cordes additives inharmoniques, gratté de 8 à 25 ms, arpège en croches, mélange (fondamentale, gratté, note), accord précédent atténué mais qui sonne, et au micro une pièce sommaire, du bruit et le clic. Ses chiffres ne disent rien d’une vraie guitare. Ils montrent que la chaîne marche :

- attaques trouvées à 100 %, écart médian ≤ 4 ms ;
- plaqué : 100 % accepté dès 250 ms, FAR ≤ 0,3 % ;
- mélangé : environ 95–98 % à 500 ms ;
- arpégé : 0 % à 250–500 ms, environ 100 % à 1000 ms. **Un arpège n’est jugeable qu’une fois ses trois notes jouées.** La fenêtre d’un arpège est donc la durée de l’arpège, pas une durée fixe après l’attaque.

### Corpus réel, lot 1 : DI, relier les formes, plaqué et arpégé

20 prises (les 10 triades × plaqué / arpégé), Fractal FM3, micro manche, 80 bpm, latence calibrée 25 ms. 127 accords bien joués : 63 plaqués, 64 arpégés. Plaqué au médiator ou pincé aux doigts. Arpèges variés : en croches pour la plupart (3e note vers 0,7 s), une note par temps pour Dm (1,5 s), très rapides par endroits (0,2 s).

Juge retenu : `nnls-abs` (peignes de 10 harmoniques en 1/h, maximum par case). La saillance seule (`sal-*`) reste loin derrière ; ajouter l’accord précédent au modèle (`nnls-prev`) ou retrancher l’avant-attaque (`nnls-diff`) n’aide pas.

| jeu                        | erreurs de famille (le mauvais candidat bat le joué)             | TAR à FAR ≤ 2 % |
| -------------------------- | ---------------------------------------------------------------- | --------------- |
| plaqué                     | 3 / 63 à toutes les fenêtres, dès 250 ms                         | 87 % dès 250 ms |
| arpégé                     | 50 / 64 à 250 ms, 11 / 64 à 1 s, **0 / 64 à 2 s et à la mesure** | 100 % à 2 s     |
| jeu inconnu (seuil commun) | —                                                                | 98 % à 2 s      |

- Les 3 échecs du plaqué sont tous des formes « fondamentale sur si » jouées juste après une forme qui partage deux notes, et le juge choisit l’accord précédent ou un autre renversement : le piège d’octave prévu (Ab [8 9 8] après [5 4 4] : C5 contre C4 ; D [2 3 2] après [7 7 5] : A3 contre A4). Basic Pitch entend bien l’accord étiqueté.
- À 1 s, 7 des 11 échecs de l’arpège sont Dm, joué une note par temps : la 3e note n’a pas encore sonné. Le juge a raison de ne pas trancher. **On juge un arpège quand ses trois notes ont sonné** : à la fin de l’accord, ou dès que l’attendu l’emporte nettement.
- Le seuil de 2 % ne se mesure pas sur 53 accords : un seul faux accepté vaut 1,9 %. Le point de fonctionnement en dépend ; les erreurs de famille comptées une à une sont plus parlantes.
- Les réglages (nombre d’harmoniques, décroissance, inharmonicité, largeur) font varier le TAR de 30 points sur ce petit corpus : ils ne sont pas réglés, le défaut est gardé.
- **Effets.** Certaines prises DI du lot 1 passent par un délai (double croche à 100 bpm, une seule répétition, éteinte avant le changement d’accord) et une réverbération, dont l’Ab plaqué (2 des 3 échecs ; le D, sans effet, échoue aussi). La répétition se superpose au nouvel accord : les deux copies d’une harmonique interfèrent selon leur phase (le « phasing » entendu), ce qui peut fausser les rapports entre harmoniques dont dépend le juge. Le juge doit travailler sur un signal sec ; les prochaines prises DI sont sèches.
- **Attaque.** Le détecteur d’attaques actuel (rapport RMS) manque 28 % des premières notes d’arpège quand l’accord précédent sonne encore. Sans conséquence sur l’identification (repli sur l’instant attendu), mais il faudra une autre attaque pour juger le rythme d’un arpège.

### Corpus réel, lot 2 : micro, relier les formes, plaqué et arpégé

20 prises, mêmes accords. Micro intégré du MacBook Pro, guitare électrique sans ampli (son acoustique ambiant), métronome sur les haut-parleurs du Mac. Latence laissée à celle de la DI (25 ms) ; l’attaque est trouvée quand même (écart médian +27 ms).

- **Le clic du métronome** arrive au micro à 7,5 dB sous le corps de l’accord (−45 contre −37,5 dBFS ; bruit de fond −61), et chaque clic de la fenêtre marque le spectre. Le métronome rejoue un seul tampon de bruit : chaque clic a la même forme d’onde. L’évaluateur la mesure sur le décompte (guitare muette) et la **soustrait** à chaque temps. Laisser de côté les trames du clic aide le plaqué mais casse l’arpège (ses notes tombent sur les temps).
- Hypothèse écartée : au micro, la fondamentale de la corde de sol n’est pas plus faible qu’en DI (H1 − H2 médian +14,7 dB contre +9,9).

`nnls-abs`, clic soustrait, erreurs de famille :

| entrée | plaqué                                  | arpégé (mesure)  | arpégé (1 s) |
| ------ | --------------------------------------- | ---------------- | ------------ |
| DI     | 3 / 63 dès 250 ms                       | 0 / 64           | 11 / 64      |
| micro  | 4 / 64 dès 250 ms (6 sans soustraction) | 5 / 63 (11 sans) | 6 / 63       |

Les échecs du micro sont presque tous des formes du haut du manche (cases 10 à 14) jouées en montant après une forme du milieu, prises pour l’accord précédent, de justesse (écart de score 0,002 à 0,03). Sur une électrique débranchée, le haut du manche sonne court et faible, l’accord précédent domine.

### Tolérer ce qui sonnait déjà

À l’écoute, les échecs du micro (D et Dm arpégés, G plaqué) viennent des cordes à vide mi-la-ré, non jouées, qui résonnent par sympathie sur les notes de l’accord précédent. Physiquement, c’est l’accord précédent qui sonne encore.

Règle essayée (`FAMILY_PREV=0`) : l’accord précédent n’est plus un concurrent. On vérifie que l’accord demandé est là et qu’il bat ses autres renversements, ses positions et l’autre qualité. Une note de l’accord précédent qui sonne encore n’est pas une faute. La relation « précédent » sort du critère : l’app ne demande jamais l’accord qui sonne encore (même règle que « jamais la carte précédente » du manche). Le garde-fou « le joueur n’a pas changé d’accord » repose alors sur la présence de la note propre au nouvel accord. Le corpus le mesure : dans « relier », demander le renversement voisin quand le joueur rejoue celui-ci tombe dans le FAR « renversement ».

`nnls-abs`, clic soustrait, jeu connu, FAR ≤ 2 % pour renversement, octave, qualité et autre triade :

| entrée | plaqué                             | arpégé (mesure) | arpégé (1 s) |
| ------ | ---------------------------------- | --------------- | ------------ |
| DI     | 96,8 % dès 250 ms                  | 100 %           | 84 %         |
| micro  | 96,9 % à 250 ms, 98,4 % dès 500 ms | 96,8 %          | 90,5 %       |

Erreurs de famille : DI plaqué 2 / 63, arpégé 0 / 64 ; micro plaqué 1 / 64, arpégé 2 / 63. Seuils choisis sur les mêmes données ; ~60 accords par condition.

### Corpus réel, lot 3 : DI sèche, micro chevalet, « relier » mélangé et « ancrer » plaqué

20 prises (10 triades × 2 scripts), son sec, micro chevalet (le lot 1 était au micro manche, avec délai et réverbération sur certaines prises). 64 accords mélangés, 37 accords « ancrer » (accord sur le 3, la fondamentale jouée seule sur le 1 sonne encore). Règle « tolérer ce qui sonnait déjà ».

- **Vérification des étiquettes par Basic Pitch.** Les 4 accords de l’Em d’« ancrer » sont décalés d’une forme : Basic Pitch entend la forme suivante à chaque fois (la forme à vide [0 0 0] sautée). Le juge avait raison. Ailleurs, 4 alertes sur 351 accords, qui ressemblent à des notes manquées par Basic Pitch.
- **Erreurs de jeu confirmées à l’écoute.** Em d’« ancrer » : la forme à vide a été sautée (4 accords). F#m [14 14 14] d’« ancrer » : sur le 3, seules C#5 et A4 ont été jouées. Ebm [3 4 2] : le Bb s’entend à peine. Le juge a refusé des accords effectivement faux ou incomplets ; hors ces cas, « ancrer » compte 0 à 1 refus contestable sur 32.
- **Justesse.** Toutes les prises DI sont à ±8 cents ; elle n’explique aucun échec.
- **Le timbre compte.** Au micro chevalet, l’harmonique 2 de la corde de sol est presque aussi forte que la fondamentale (H1 − H2 médian +2,1 dB, H2 plus forte dans 33 % des notes ; micro manche +7,6 dB, 12 %). Le juge supposait des harmoniques en 1/h. Profil mesuré sur les 37 fondamentales jouées seules d’« ancrer » (h1 à h10) : 1 · 0,79 · 0,33 · 0,30 · 0,17 · 0,09 · 0,06 · 0,02 · 0,01 · 0. Avec ce profil (`COMB='{"profile":[…]}'`) :

| condition                         | 1/h      | profil mesuré (chevalet) |
| --------------------------------- | -------- | ------------------------ |
| relier mélangé (chevalet), 1–2 s  | 8–9 / 64 | **1 / 64**               |
| relier mélangé, mesure            | 7 / 64   | 2 / 64                   |
| ancrer plaqué (chevalet), hors Em | 2 / 33   | 1–2 / 33                 |
| relier arpégé, micro, mesure      | 2 / 63   | 0 / 63                   |
| relier plaqué, DI micro manche    | 2 / 63   | 3 / 63                   |
| relier plaqué, micro              | 1 / 64   | 3–4 / 64                 |

Le profil aide là où il a été mesuré et dégrade un peu ailleurs : **il faut un profil par réglage de son**, mesuré sur quelques notes seules, comme la latence. Les fondamentales jouées seules d’« ancrer » le fournissent sans étape à part.

- **Mélangé.** Avec le bon profil, il se juge à partir d’environ 1 s (1 / 64), entre le plaqué (250 ms) et l’arpège (fin de l’accord).

## Recommandation

**Réponse à la question.** Oui : sur sol-si-mi, on peut dire si l’accord attendu a sonné et dans quel renversement, plaqué, arpégé ou mélangé, à condition de **vérifier parmi des candidats connus** et non de transcrire, dans les conditions de la voie mémoire. Ce n’est pas démontré pour le jam, et cette technique n’y est sans doute pas adaptée.

### Ce que le spike établit

- Le juge `nnls-abs` (peignes harmoniques ajustés sans coefficient négatif, maximum par case sur la fenêtre) bat la saillance seule et Basic Pitch. Ses échecs restants ont presque tous une cause physique nommée : clic du métronome dans le micro, résonance des cordes à vide, timbre du micro chevalet, arpège pas encore complet.
- Il a refusé des accords réellement faux ou incomplets (forme sautée, note manquante).
- Chiffres, sur un seul joueur et une seule guitare, seuils choisis sur les mêmes données (donc optimistes) : DI sèche, profil de timbre mesuré, plaqué ≈ 97 % justes acceptés dès 250 ms, arpège 100 % à la fin de l’accord, mélangé ≈ 98 % dès 1 s ; micro du Mac, clic soustrait, 95–98 %. FAR ≤ 2 % pour renversement, octave, qualité et autre triade, mesure fragile à ~60 accords par condition.

### Ce qui reste fragile

- **Dépendance au son.** Le profil d’harmoniques change d’un micro à l’autre (manche, chevalet, micro d’ambiance) et pèse sur le piège d’octave. Une autre guitare n’a pas été essayée.
- **Réglages sensibles.** Sur ce petit corpus, nombre d’harmoniques, décroissance ou largeur font varier le TAR de 30 points. Les seuils ne sont pas validés sur des prises tenues à l’écart.
- **Attaques d’arpège.** Le détecteur d’attaques actuel (rapport RMS) manque environ un quart des premières notes d’arpège quand l’accord précédent sonne : il faudra une autre attaque pour juger le rythme d’un arpège.
- **Non couvert.** Grille, jeu libre, ornements, accords partiels voulus, glissés, grattés étouffés.

### Par voie

| voie                                            | verdict                                             | conditions                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Mémoire (« ancrer », « plaquer dans une zone ») | **faisable**                                        | voir ci-dessous                                                                                                    |
| Geste (relier, déplacement, zone)               | probable pour l’accord                              | + un détecteur d’attaques qui voit les débuts d’arpège, pour le tempo tenu                                         |
| Jam                                             | **non démontré**, peu probable avec cette technique | juger la pulsation et la présence de l’accord au changement avec indulgence, ou passer par un capteur hexaphonique |

### Conditions pour la voie mémoire

1. **Vérifier, pas transcrire.** L’attendu bat ses autres renversements, ses autres positions et l’autre qualité, et franchit un seuil absolu.
2. **Tolérer ce qui sonnait déjà.** L’accord précédent et les cordes à vide qui résonnent ne sont pas des fautes ; l’app ne demande jamais deux fois de suite l’accord qui sonne encore.
3. **Fenêtre selon le jeu.** Plaqué : dès 250 ms. Mélangé : ~1 s. Arpège : quand ses trois notes ont sonné (fin de l’accord, ou dès que l’attendu l’emporte nettement). Jeu inconnu : fin de l’accord.
4. **Deux étalonnages par réglage de son.** La latence (existe) et le timbre : le profil d’harmoniques, mesuré sur quelques notes seules. Les fondamentales jouées seules d’« ancrer » le fournissent sans étape à part.
5. **Signal sec.** Pas de délai ni de réverbération dans ce que l’app écoute.
6. **Le clic hors du micro.** Métronome au casque, ou soustraction du clic par l’app (elle connaît sa forme et son instant).
7. **Contester un verdict.** Un bouton « j’ai joué juste » : un refus à tort de temps en temps ne casse pas FSRS s’il est corrigé, et la contestation est elle-même une donnée.
8. **Garder l’audio des essais** (option de développement) avec la consigne, le verdict et la contestation. Le corpus grandit pendant le vrai travail, ratés compris : ce sont de vraies erreurs de jeu, que le spike n’a fait que simuler. Basic Pitch et la remarque du joueur suffisent à étiqueter ce qui a été joué à la place. Ce corpus sert aussi à valider les seuils sur des données qui ne les ont pas choisis.

### Autres techniques, si la voie audio ne suffit pas

- **Capteur hexaphonique ou guitare MIDI** (Fishman TriplePlay, Roland GK ; lu par Web MIDI) : chaque corde séparément, renversement, corde et case observés au lieu d’être inférés. Seule voie que l’on croit robuste pour juger les formes en jam. Coût : matériel, montage sur la guitare, erreurs de suivi sur les attaques rapides.
- **Modèle appris** de vérification d’accord : plus robuste d’une guitare à l’autre, mais un vrai projet (données variées, entraînement, inférence dans le navigateur). Basic Pitch, générique, fait moins bien que le juge du spike sur ce corpus.
- **Auto-évaluation** à la manière d’Anki : valable pour la mémoire, mais sans mesure objective ni temps de réponse.

### Suite

La spec de la mécanique des triades (étape 3 de `docs/plateforme.md`) part de la voie mémoire et des conditions ci-dessus. Le juge y est réécrit proprement (le code du spike reste jetable), sur l’horloge unique, avec ses deux étalonnages et l’enregistrement des essais. Le format du corpus (`src/lib/spike/triads/corpus.ts`) et les prises enregistrées servent de fixtures. Les seuils sont revus sur l’audio des premières vraies séances avant de compter les essais à froid dans FSRS.
