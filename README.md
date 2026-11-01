# Neckspert

Une plateforme d’apprentissage de la guitare. On joue sur une vraie guitare, sur le temps ; l’application écoute, juge et mesure ce qui reste d’une séance à l’autre, pas ce qui réussit pendant l’exercice. Aujourd’hui : les notes du manche, les triades, la précision rythmique et les séquences de notes.

Application web, sans compte : les données restent sur l’appareil. Une guitare branchée sur une interface audio est recommandée, le micro de l’appareil est toléré. L’interface existe en français et en anglais.

**État** : en développement. neckspert.app sert encore la v1, gardée au tag `v0.1.0`, jusqu’au déploiement de la v2.

## Documents

- [Le projet](docs/projet.md) : le produit, les principes, le moteur et le langage d’exercices.
- [La feuille de route](docs/feuille-de-route.md) : l’ordre des chantiers.
- [Les issues](https://github.com/Vivremotion/Neckspert/issues) et le [tableau](https://github.com/users/Vivremotion/projects/1) : le travail au jour le jour.
- [`PRODUCT.md`](PRODUCT.md) : les règles de jeu. [`DESIGN.md`](DESIGN.md) : le système visuel. [`CLAUDE.md`](CLAUDE.md) : le guide technique.

## Lancer

Node 22.23.3 (`.nvmrc`).

```bash
npm install
npm run dev
```

## Vérifier

```bash
npm test && npm run check
```

## Licence

Pas encore choisie (voir `docs/projet.md`, « Questions ouvertes »).
