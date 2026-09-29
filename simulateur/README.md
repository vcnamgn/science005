# Simulateur Centurion REP 1300

## Démarrer

Ouvrir [`centurion.html`](centurion.html) dans Chrome, Edge ou Firefox. Le chargement direct du fichier (`file://`) est prévu ; les fichiers CSS, JavaScript et SVG doivent rester dans cette arborescence. **Démarrer** lance l'horloge, **Pause** la suspend, **Réinitialiser** revient au régime nominal. La vitesse sélectionnée vaut ×1 à ×50.

## Parcours

- **Synoptiques** : RCP général, pressuriseur, grappes et GV1 à GV4. La page utilise toute la largeur du navigateur ; à partir de 1 900 px, le tableau de bord passe à six colonnes et le synoptique exploite la hauteur disponible. La conduite manuelle reste à droite du schéma. Les noms complets des instruments sont disponibles au survol. Les flèches RCP, PZR, GRAPPES et GV ouvrent leur vue. Les flèches RIS, RRA et RCV sans vue dédiée sont grises, leur texte reste noir. Les quatre GV ont des inventaires et des débits ARE distincts. Le débit primaire est affiché en pourcentage du débit nominal.
- **Graphique** : historique des puissances, températures, pressions, niveaux et débits, plus la réactivité. La légende indique l'échelle de chaque courbe.
- **CC-RÉGUL** : éditeur historique de blocs, copié dans `centurion-cc-regul.html` et relié au moteur Centurion. Le schéma initial reprend les régulations du simulateur précédent et ajoute la courbe G3 et les quatre régulations de niveau GV. Les sorties reliées commandent le modèle lorsque **Activer régulations** est sélectionné.
- **CC-PROTECT** : second éditeur de blocs, indépendant de CC-RÉGUL. Ses sorties AAR et IS sont des signaux prioritaires qui déclenchent la protection et l'injection. Il est actif au démarrage. Les disponibilités RIS et les forçages manuels restent accessibles au-dessus du graphe.
- **Initiateurs** : brèche primaire paramétrable, éjection ou retrait intempestif de grappe et perte totale des alimentations.
- **Transitoires** : cinq programmes de charge hérités du simulateur pédagogique, avec choix de scénario, aperçu de la trajectoire et démarrage immédiat de l'horloge. La consigne rejoint d'abord le point initial à 20 % PN/min au maximum ; le retour vers 100 % suit la même pente.
- **Modèle** : vue d'ensemble, seuils d'alarme éditables, lois physiques expliquées par chapitres et paramètres réglables. Les alarmes colorent les valeurs du tableau de bord ; elles ne déclenchent pas les ordres de protection.

Au démarrage, **CC-RÉGUL est désactivé** et **CC-PROTECT est actif**. Le curseur RGL001MM commande directement le groupe R en pas extraits et lance l'horloge lorsqu'on le déplace. Quand CC-RÉGUL est actif, les glissières d'actionneurs grisées suivent les valeurs appliquées ; elles reprennent ces valeurs au retour en manuel. La puissance demandée, le décalibrage GCP et la concentration en bore de charge restent disponibles. La charge RCV part de 15 m³/h et peut être reprise par la sortie QCHARGE ; la décharge reste à 15 m³/h. Au point initial, les vannes réglantes d'aspersion sont fermées, mais **0,46 m³/h circule en continu**. Les 288 kW de chaufferettes compensent ce refroidissement et un échange thermique passif d'étude du PZR. À 100 % d'ouverture, les vannes réglantes débitent 250 m³/h, auxquels s'ajoutent les 0,46 m³/h continus aux conditions nominales. Le débit dépend de la pression motrice fournie par les GMPP. T RIC représente la sortie moyenne du cœur, avant le mélange avec le débit de bypass de 7 %. Une demande d'IS entraîne un AAR et l'arrêt des GMPP ; leur débit décroît ensuite jusqu'à 0 % en environ une minute. Le rapport DNBR affiché est un indicateur simplifié, pas un calcul de sûreté qualifié.

L'ancien [`simulateur-rep.html`](simulateur-rep.html) est conservé sans modification. La copie [`centurion-cc-regul.html`](centurion-cc-regul.html) fournit les deux éditeurs à Centurion ; elle possède ses propres sauvegardes locales, séparées de l'ancien simulateur. Les références documentaires supplémentaires sont organisées dans le dossier local `support/`, décrit dans [`../support/README.md`](../support/README.md).

## Vérifier

Depuis la racine du projet :

```powershell
node --test simulateur/tests/*.test.js
```

Ces essais couvrent le point nominal, le comptage G3, l'IL de R, la dilution RCV, la chronologie brèche/AAR/IS, les domaines de pression RIS, les quatre GV, les initiateurs, la vue axiale et les transitoires. Ils ne constituent pas une validation de sûreté. Les équations, sources et hypothèses à calibrer figurent dans [`METHODE-CENTURION.md`](METHODE-CENTURION.md).
