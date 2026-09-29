# science005 — Centurion

Simulateur pédagogique d'un REP 1300 à quatre boucles, avec synoptiques SVG animés, contrôle-commande de régulation et de protection, programmes de charge et initiateurs d'accidents.

## Démarrer

Télécharger le dépôt avec **Code → Download ZIP**, extraire l'archive et ouvrir [`simulateur/centurion.html`](simulateur/centurion.html) dans Chrome, Edge ou Firefox. Le dossier doit conserver son arborescence : l'application fonctionne hors ligne, sans installation ni serveur.

Ou cloner le dépôt :

```sh
git clone https://github.com/philippejacquet0-source/science005.git
```

## Fonctions

- Circuit primaire à quatre boucles, pressuriseur, positions des grappes et GV1 à GV4.
- Éditeurs de blocs indépendants **CC-RÉGUL** et **CC-PROTECT**, avec commandes manuelles, AAR et IS.
- Grappes en pas extraits, compteur G3, bore, inventaires et bilans thermiques simplifiés.
- Vannes VVP, GCT-A, gammes de niveau GV et mesures actualisées en temps réel.
- Graphiques, transitoires de charge, brèche, éjection de grappe et perte de tension.
- Lois physiques, paramètres d'étude et seuils d'alarme documentés dans l'application.

Voir le [mode d'emploi](simulateur/README.md) et les [équations et hypothèses du modèle](simulateur/METHODE-CENTURION.md). Les résultats illustrent des principes ; ils ne constituent pas une démonstration de sûreté qualifiée.

## Vérifier

Les tests utilisent uniquement Node.js, sans dépendance à installer. Depuis la racine du dépôt :

```sh
node --test simulateur/tests/*.test.js
```

## Organisation

- [`simulateur/`](simulateur/) : application, moteurs, styles et documentation.
- [`simulateur/synoptiques/`](simulateur/synoptiques/) : quatre SVG partagés entre les vues.
- [`simulateur/tests/`](simulateur/tests/) : tests des modèles, des signaux de commande et des synoptiques.
- [`support/README.md`](support/README.md) : organisation des références documentaires locales.

Le simulateur pédagogique précédent est conservé dans [`simulateur/simulateur-rep.html`](simulateur/simulateur-rep.html) comme référence autonome.
