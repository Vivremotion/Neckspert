# Flux de travail

Comment un ticket va du backlog à la prod. L’ordre des chantiers est dans `docs/feuille-de-route.md` ; le travail est sur le [tableau du projet](https://github.com/users/Vivremotion/projects/1). Ce document vaut pour l’auteur comme pour les agents : chaque état s’écrit sur GitHub, rien ne reste dans une conversation.

## Les rôles

- **L’auteur** décide du produit et de la pédagogie, et joue ce qui est livré. Il ne relit pas le code.
- **Les agents** conçoivent, codent, testent et se relisent. Ils ne tranchent jamais une question de produit ou de pédagogie : ils la posent (voir « Questions »).

## Les colonnes

| Colonne  | Qui a la main | On y entre quand                                                              |
| -------- | ------------- | ----------------------------------------------------------------------------- |
| À trier  | l’auteur      | le ticket existe mais ne remplit pas encore la Definition of Ready            |
| Prêt     | un agent      | il la remplit ; n’importe quel agent peut le prendre                          |
| En cours | un agent      | un agent travaille dans son worktree                                          |
| À tester | l’auteur      | la Definition of Done est remplie, la preview tourne, la passation est postée |
| Fait     | —             | l’auteur l’a validé en jouant ; mergé sur `main`, donc déployé                |

Un ticket refusé en jeu repart en « En cours » avec le retour de l’auteur en commentaire.

## Les pistes et le travail en cours

Champ « Piste » du tableau. **Au plus un ticket « En cours » par piste**, et une seule branche touche le cœur à la fois (feuille de route, « Une seule piste touche le cœur à la fois ») :

- **Cœur** : `application/session/`, `domain/`, le langage d’exercices ;
- **Visuel** : écrans, vues, tokens ;
- **Capteurs** : détection audio, derrière ses ports ;
- **Mise en ligne** : déploiement, domaine.

Un ticket qui touche le cœur est sur la piste Cœur, même s’il se voit à l’écran. Les dépendances sont des liens « bloqué par » sur les issues ; un ticket bloqué n’est pas « Prêt ». Les chantiers sont des issues parentes (epics) avec leurs sous-issues.

## Definition of Ready

Un ticket est « Prêt » quand :

- il dit ce que le joueur vit avant et après, pas seulement ce que le code fait ;
- il a un critère **« Fait quand »** vérifiable ;
- il a un **protocole de test en jeu** : ce que l’auteur joue, ce qu’il doit constater (un ticket sans effet en jeu le dit, et passe directement de la revue à « Fait ») ;
- il n’a plus le label `attend-auteur` ;
- rien ne le bloque ;
- il tient dans une branche ; sinon c’est un epic à découper.

## Definition of Done

Avant « À tester », l’agent a :

1. suivi le TDD pour la logique ;
2. passé `npm test && npm run check` ;
3. fait relire sa branche par un agent relecteur et traité ses retours (superpowers, `requesting-code-review`) ;
4. pour un écran, passé `scripts/functional-ui.mjs` et vérifié le jeu **au-delà de l’écran de départ**, micro simulé, jusqu’après la respiration ;
5. lancé la preview locale (ci-dessous) ;
6. posté la passation sur l’issue et ouvert la PR qui la ferme.

## Questions

Une question pour l’auteur s’écrit **en commentaire sur l’issue**, avec son contexte en deux ou trois lignes, les options et celle que l’agent recommande. L’agent pose le label `attend-auteur`, puis continue sur ce qui ne dépend pas de la réponse. L’auteur répond sur l’issue et retire le label.

## La passation

À chaque arrêt (fin de séance de travail, blocage, passage en « À tester »), l’agent poste ce commentaire sur l’issue :

```markdown
## Passation — <date>

**État** : <En cours | À tester | Bloqué>
**Branche** : `<branche>` · **PR** : #<n>

**Fait**

- …

**Reste**

- …

**Attend l’auteur**

- … (ou « rien »)

**Tester**

- Preview : `node scripts/preview.mjs <issue>` dans le worktree, http://localhost:<port>
- Protocole : …
```

## Les previews locales

Chaque ticket a sa preview sur son propre port, `5200 + numéro de l’issue` (#10 → 5210). Une origine est protocole, hôte **et port** : chaque preview a sa propre base IndexedDB, séparée de neckspert.app et des autres previews. On peut y importer une sauvegarde de la prod sans rien écraser. Le port reste le même d’une fois à l’autre, la base de test aussi.

```bash
node scripts/preview.mjs 10
```

Le script construit l’app (`vite build`) et sert ce build (`vite preview`) : on teste ce qui partira en prod, `/dev/*` et `/diagnostic` en 404 compris. `--dev` lance plutôt le serveur de développement sur le même port, pour un ticket qui a besoin des écrans `/dev`, du diagnostic ou des exercices locaux (lus seulement en développement).

Un agent démarre sa preview avec l’outil de preview, pas depuis un shell : il ajoute à `.claude/launch.json` de son worktree une configuration `preview-<issue>` (`runtimeExecutable: "node"`, `runtimeArgs: ["scripts/preview.mjs", "<issue>"]`, `port: 5200 + issue`).

Le worktree reste en place tant que le ticket est « À tester » ; il est supprimé une fois le ticket « Fait ».

## Le déploiement

Déploiement continu : un ticket validé en jeu est mergé sur `main`, et `main` se publie sur neckspert.app (#2). Pas de branche d’intégration, pas de release.
