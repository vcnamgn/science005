# Note de méthode — espace Sûreté

## Objet et portée

Le moteur de `safety-engine.js` est un modèle global déterministe conçu pour **illustrer** les relations entre perte de réfrigérant, arrêt du réacteur, concentration en bore, circulation et refroidissement du cœur. Le simulateur de conduite d'origine continue de fonctionner dans ses onglets ; l'espace Sûreté est un calcul indépendant, avec son propre état et son horloge.

Une brèche primaire constitue une perte de réfrigérant lorsque le débit sortant dépasse l'appoint ; la perte de refroidissement peut provoquer un échauffement du cœur. Cette définition et le rôle général des systèmes d'injection sont décrits par la [NRC — LOCA](https://www.nrc.gov/education-regulatory-research/glossary/loss-of-coolant-accident-loca) et dans son [manuel des systèmes REP, chapitre 4](https://www.nrc.gov/reading-rm/basic-ref/students/for-educators/04.pdf). La succession « injection à haute pression / accumulateurs / injection à basse pression » reprend le **principe fonctionnel** du manuel, sans reproduire les caractéristiques d'un palier ou d'une centrale.

L'[AIEA, TECDOC-1887](https://www-pub.iaea.org/MTCD/Publications/PDF/TE-1887_web.pdf) distingue les simulateurs pédagogiques de principes des simulateurs et codes destinés aux analyses de sûreté. La présente application appartient à la première catégorie.

## État et équations

### Réactivité et grappes

Quatre groupes A–D sont suivis séparément, avec position `p` de 0 % (inséré) à 100 % (extrait). En conduite, la vitesse est limitée à 0,53 %/s. Après ordre d'arrêt et délai de 0,45 s, chaque groupe mobile atteint 0 % en 2,7 s au plus. Un groupe déclaré bloqué reste immobile. La courbe de valeur intégrale normalisée est `w(p) = [1 − cos(πp/100)]/2`, et la réactivité relative de chaque groupe vaut `valeur_i × [w(p_i) − w(p_i, initial)]`. Les valeurs 650, 750, 1 050 et 1 450 pcm sont des **paramètres d'exercice**. Elles ne décrivent aucune configuration de cœur réelle.

La réactivité totale utilisée par la cinétique est :

```text
ρ [pcm] = Σ Δρgrappes − 7 × (B − 1 200)
          − 28 × (Tprimaire − 306) − 1,2 × (Tcombustible − 800)
```

`B` est la concentration massique de bore en ppm. Les coefficients de bore, de température modérateur et Doppler sont des hypothèses constantes. Ils ignorent leur variation avec le cycle, la puissance, la température et la distribution spatiale.

La puissance de fission provient d'une cinétique ponctuelle à six groupes retardés, intégrée de manière semi-implicite au pas maximal de 0,05 s. La somme des fractions retardées est 0,0065. La durée de génération utilisée, 0,1 s, reste un choix numérique simplifié de la maquette d'origine : les temps rapides et pics de réactivité ne doivent pas être interprétés comme ceux d'un REP réel.

### Bore soluble

Le moteur conserve une quantité de bore `I_B = M × B` et applique le bilan :

```text
dM/dt   = Qinj − Qbrèche
dI_B/dt = Qinj × Binj + Qcharge × Bcharge
          − (Qbrèche + Qsoutirage) × B
Qsoutirage = Qcharge
```

L'injection de secours apporte une solution à 2 200 ppm. La borication RCV utilise 2 400 ppm ; la dilution 0 ppm. Le débit de charge et de soutirage associé est 3 kg/s. Le calcul conserve la masse globale pendant ces manœuvres RCV. Il n'inclut pas le retard de transport, le mélange imparfait ni la stratification du bore.

### Volume primaire et brèche

Le volume est représenté par un inventaire initial de 269 064 kg, une température moyenne, une pression et un indicateur de couverture du cœur. Les équations de débit et de pression sont :

```text
Qbrèche = A × min[0,68 × √(2ρΔP), 25 000 × √(P/155)]
dP/dt   = (Qinj − Qbrèche) / [620 × (1 + 2αvide)]
          + 0,28 × dTprimaire/dt
```

`A` est la section en m², `P` la pression en bar absolus, `Q` en kg/s. Le deuxième terme de débit borne le flux pour suggérer une décharge critique. Le coefficient de pression est une capacité apparente choisie pour obtenir une réponse qualitative ; **ce n'est pas une équation d'état diphasique**.

La fraction de vide et la couverture sont des indicateurs algébriques déduits de l'inventaire et d'une approximation de saturation. Ils ne sont pas des mesures du niveau réel de cuve, de la qualité locale ni d'une marge d'ébullition. La circulation et le transfert thermique diminuent avec la pression et la couverture. La puissance de fission, une chaleur résiduelle simplifiée (6 % à l'arrêt, puis décroissance lente), le transfert combustible–fluide, l'échange vers les GV, le refroidissement par injection et la détente de brèche composent les bilans énergétiques. Un seul volume primaire homogène et un seul GV équivalent sont utilisés.

### Automatismes de sauvegarde

| Fonction | Logique du modèle |
|---|---|
| Ordre d'arrêt | `P < 130 bar` ou puissance de fission `> 115 %` |
| Chute des grappes | après 0,45 s, sauf groupe bloqué |
| Signal d'injection | `P < 120 bar` |
| Injection HP | 140 kg/s sous 125 bar, après 2 s |
| Accumulateurs | 2 000 kg/s sous 45 bar, réserve 35 t |
| Injection BP | 1 000 kg/s sous 25 bar, après 2 s |

Ces nombres sont **inventés pour l'exercice**. Le modèle n'inclut ni redondance, ni perte d'alimentation électrique, ni critères de disponibilité par train, ni source d'eau épuisable pour les pompes, ni recirculation de puisard.

## Indicateurs proposés à l'écran

Les quatre indicateurs sont : ordre d'arrêt demandé, réactivité négative, couverture minimale d'au moins 80 %, et température combustible maximale inférieure à 1 200 °C. Ils servent à comparer des scénarios simulés ; ils **ne sont pas des critères réglementaires**. L'affichage « oui/non » ne doit jamais être assimilé à une conclusion de sûreté.

## Limites et travaux nécessaires pour une étude technique

La maquette ne résout pas la propagation des ondes, l'écoulement diphasique, le débit critique validé, la décharge des accumulateurs avec dynamique de gaz, la distribution dans les boucles et la cuve, le niveau de cœur, le flux critique, la température de gaine, l'oxydation, la chimie du bore, les systèmes électriques, le confinement ni les incertitudes. Elle ne couvre pas les brèches par branche ou localisation, ni les défaillances multiples.

Une véritable démonstration de sûreté demanderait un référentiel de conception explicite, des données de centrale, des scénarios et défaillances postulés, des critères d'acceptation applicables, des codes qualifiés et validés, une étude des incertitudes et une revue indépendante. La séparation entre simulateur pédagogique et analyse de sûreté est cohérente avec l'[AIEA, TECDOC-1887](https://www-pub.iaea.org/MTCD/Publications/PDF/TE-1887_web.pdf). La [NRC — Three Mile Island](https://www.nrc.gov/regulations-legislation/fact-sheets-brochures/backgrounder-on-the-three-mile-island-accident) illustre aussi pourquoi un indicateur global de niveau du pressuriseur ne suffit pas à conclure sur la couverture effective du cœur ; l'espace Sûreté évite volontairement cette confusion en affichant un indicateur de couverture distinct, qui reste lui-même très simplifié.

## Vérification effectuée

Les tests automatisés vérifient la stabilité de l'état initial, les bilans de masse et de bore, la chronologie de déclenchement, le groupe bloqué, la divergence avec injection indisponible, la proximité des résultats pour deux pas de temps et l'absence de valeurs non finies sur 30 minutes simulées. Aucune confrontation à un essai ou à un code de référence n'a été effectuée.
