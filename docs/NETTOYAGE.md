# Nettoyage du dépôt public — 6 octobre 2026

Le dépôt public conserve l'application Centurion actuelle, ses six SVG actifs, ses curseurs d'atelier, son manifeste de liaisons, ses tests et sa documentation.

## Fichiers retirés de la version courante

| Fichier | Motif |
| --- | --- |
| `simulateur/simulateur-rep.html` | Ancien simulateur autonome, remplacé par l'entrée Centurion |
| `simulateur/synoptique-rep-edit_v0.2.svg` | Ancien synoptique ; les vues utilisent les fichiers du dossier `synoptiques/` |
| `simulateur/safety-engine.js` | Moteur du prototype de sûreté précédent |
| `simulateur/safety-app.js` | Interface du prototype précédent |
| `simulateur/safety.css` | Styles du prototype précédent |
| `simulateur/METHODE-SURETE.md` | Note du prototype précédent ; la méthode actuelle est documentée séparément |
| `simulateur/tests/safety-engine.test.js` | Tests de ce prototype, dépendant de ses fichiers retirés |

Les exemplaires locaux sont conservés. L'historique Git n'est pas réécrit : une ancienne version reste récupérable dans les anciens commits.

## Dépendances corrigées

- Suppression des deux scripts et de la feuille de style du prototype dans la page d'atelier CC.
- Suppression du chargement de l'ancien SVG dans l'élément caché de l'atelier. L'élément DOM reste présent pour ne pas casser les routines héritées.
- Remplacement de la lecture de l'ancien simulateur par `tests/fixtures/cc-regul-legacy.json` dans les tests de migration. Ce fichier contient seulement le graphe historique nécessaire à ces tests.
- Correction des liens et du nombre de SVG dans les modes d'emploi.
- Publication de la note de conception et de l'index des fonctions, avec leur générateur et vérificateur.

Les exclusions sont recensées dans `scripts/publication-exclusions.json`. Les prototypes conservés localement ne doivent pas être réintroduits par un export ultérieur du dossier de travail.
