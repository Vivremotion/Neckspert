# Plan — rythme, consigne et pilotage de l’Apprentissage

Spec : `docs/superpowers/specs/2026-10-04-rythme-et-consigne-design.md`. Branche `plan/rythme-et-consigne`.

Méthode : TDD pour chaque fonction de domaine et d’application (test rouge, code, test vert). Garde-fou à la fin de chaque lot : `npm test && npm run check`, puis Prettier sur les fichiers touchés (la base signalait déjà 40 fichiers hors `src`, voir la spec). Au moins un commit par lot, Conventional Commits en minuscules.

## Lot 1 — Débloquer FSRS et l’échelle des temps d’avance

Fichiers : `domain/types.ts`, `progress/scheduling.ts`, `progress/lead.ts`, `progress/cards.ts`, `infrastructure/storage/db.ts`, `validateBackup.ts`, `DexieBackup.ts`, leurs specs.

1. Test `scheduling.spec.ts` : une carte neuve notée Good passe en Review (state 2) ; une carte en Learning (D 9,8) passe en Review au Good suivant.
2. `generatorParameters({ learning_steps: [], relearning_steps: ['1h'] })`.
3. Tests `lead.spec.ts` : `adjustLeadBeats(2, true)` reste 2 ; `leadForThreshold(60)` = 2 ; `LEAD_STEPS` = [8, 4, 2].
4. `LEAD_STEPS = [8, 4, 2]`, `RecordedLeadBeats = LeadBeats | 1` sur `Attempt.leadBeats`, cartes `identify` à 2.
5. Test `db.spec.ts` : la version 4 passe les cartes à `leadBeats: 1` en 2, sans toucher aux tentatives.
6. Tests `validateBackup.spec.ts` / `DexieBackup.spec.ts` : un export avec une carte à 1 s’importe, la carte est écrite à 2.
7. Commit `fix: stop shortening the lead below two beats and let a first good review graduate`.

## Lot 2 — Grille calée sur la mesure, respiration, correction

Fichiers : `application/session/grid.ts` (nouveau), `SessionController.svelte.ts`, `contract.ts`, `prompt.ts`, `ui/play/PlayScreen.svelte`, `ui/play/messages.ts`, démos.

1. Tests `grid.spec.ts` : `alignedPromptBeat` pour 8, 4 et 2 temps (cible toujours sur un multiple de 4, consigne jamais sur les temps 2 ou 4) ; `respirationStart(T)` = T + 4.
2. Tests contrôleur : première consigne à 2 temps au temps 6 (cible 8) ; à 4 temps au temps 4 (cible 8) ; consigne suivante pas avant T + 4 ; temps perdu → recalage.
3. Contrôleur : `nextPromptBeat` calculé au choix de la consigne, démarrage au premier temps aligné ; décompte affiché sur les 4 temps qui précèdent la consigne.
4. Test `prompt.spec.ts` : `buildCorrection` (mode 1 « corde de E grave, case 5 », mode 2 « F# / Gb »).
5. `VerdictView.correction`, affichée dans le cadre du verdict après un raté.
6. Commit `feat: land every mode 1 target on the downbeat and show the answer after a miss`.

## Lot 3 — Écouter après la fenêtre

Fichiers : `domain/types.ts` (`'offbeat'`), `scoring/timing.ts`, `scoring/recall.ts`, `progress/lead.ts`, `progress/cards.ts`, `progress/grade.ts`, `progress/stats.ts`, `learnSelector.ts`, `SessionController.svelte.ts`, `VerdictSprite.svelte`, `ui/play/messages.ts`, `cues/cueSpecs.ts`, `cues/listen.ts`, `validateBackup.ts`.

1. Tests `timing.spec.ts` : `answerWindow` s’ouvre à consigne + `MIN_RESPONSE_MS` ; `judgeLocate` avec `captureUntil` : bonne note dans la zone → `offbeat`, `correct: true` ; fausse → `wrong` avec réponse ; après → pas de réponse ; `lateCaptureEnd` borné par la respiration.
2. Tests `recall.spec.ts`, `lead.spec.ts`, `cards.spec.ts` : `offbeat` jamais rappel direct, FSRS Hard, temps d’avance rallongé, ni acquis ni maîtrisé.
3. Tests `grade.spec.ts`, `stats.spec.ts` : demi-raté, exclu des écarts, raté pour la précision.
4. Tests contrôleur : bonne note à +1 s → verdict remplacé par `offbeat`, une seule tentative ; note avant la consigne ou dans les 300 ms → ignorée ; à 160 bpm la zone se ferme avant la consigne suivante.
5. Sprite, messages, son, validateur.
6. Commit `feat: hear a right note after the window as off beat`.

## Lot 4 — Ordre aléatoire sous contraintes, paires miroir

Fichiers : `music/mirror.ts` (nouveau), `progress/order.ts` (nouveau), `introduction.ts`, `learnSelector.ts`, `createAppServices.ts`.

1. Tests `mirror.spec.ts` : paires A/E grave, E/A, A/E aiguë, G/D, B/G ; pas de miroir entre modes.
2. Tests `order.spec.ts` : jamais la même carte, jamais le miroir, autre corde préférée, tirage via `random`.
3. Tests `introduction.spec.ts` : la note miroir d’une carte non acquise attend, la suivante passe.
4. Tests `learnSelector.spec.ts` : révisions dues tirées au hasard ; plus de suite fixe entre deux cartes introduites ensemble.
5. Commit `feat: draw prompts at random without repeating a card, its mirror or its string`.

## Lot 5 — Séquences

Fichiers : `progress/sequence.ts` (nouveau), `learnSelector.ts`, `types.ts` (`PlannedItem.countIn`), `SessionController.svelte.ts`.

1. Tests `sequence.spec.ts` : compatibilité, fin après 4, fin anticipée sur retard.
2. Tests sélecteur : 4 consignes au même temps d’avance ; séquence courte faute de cartes ; `countIn` au changement de temps d’avance ; constante désactivée → comportement du lot 4.
3. Test contrôleur : `countIn` → mesure décomptée.
4. Commit `feat: play prompts in sequences of four at one lead`.

## Lot 6 — Pilotage par la réussite

Fichiers : `progress/success.ts` (nouveau), `learnSelector.ts`, `constants.ts`.

1. Tests `success.spec.ts` : réussite, taux glissant, taux par carte.
2. Tests sélecteur : note nouvelle bloquée sous 0,7 ou sous 0,8 pour une carte ; rattrapage après un raté ; pas après un sondage manqué ; ensemble de travail à 6.
3. Commit `feat: gate new notes on recent success and follow a miss with a solid card`.

## Lot 7 — Tempo adapté

Fichiers : `progress/tempo.ts` (nouveau), `SessionController.svelte.ts`, `ui/screens/settings/tempo.ts`.

1. Tests `tempo.spec.ts` : +5 au-dessus de 0,9, −5 sous 0,7, bornes, seuil de consignes, pas de saut par la borne.
2. Test contrôleur : fin d’une session d’Apprentissage → réglage mis à jour ; jeu libre → inchangé.
3. Commit `feat: adapt the tempo of the next learn session to its success`.

## Lot 8 — Consigne en deux temps, corde dessinée, mesure

Fichiers : `music/confusion.ts`, `types.ts`, `validateBackup.ts`, `contract.ts`, `prompt.ts`, `SessionController.svelte.ts`, `ui/play/StringDiagram.svelte` (nouveau), `PlayScreen.svelte`.

1. Tests `confusion.spec.ts` : `string-name`.
2. Test validateur : `confusion` vérifiée.
3. Tests contrôleur : `preview` un temps avant la note ; même orthographe ensuite.
4. Tests composant `StringDiagram.svelte.spec.ts` : six traits, corde marquée, lettre ; rien sans `diagram`.
5. Commits `feat: count a played open-string name as its own confusion`, `feat: show the string a beat before the note, drawn while learning`.

## Lot 9 — Documentation

`PRODUCT.md`, `CLAUDE.md`, `docs/superpowers/plans/README.md`. Commit `docs: describe the bar grid, off beat and success-driven learning`.

## Fin

Revue de code, `npm test && npm run check && npm run lint` (résultat résumé dans le compte rendu), liste des vérifications à la guitare.
