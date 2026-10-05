# Contrôle d'accès au simulateur

Étude au 3 octobre 2026. Aucun compte, dépôt, domaine ni déploiement n'a été modifié.

## Avec un dépôt public et GitHub Pages

**La publication à l'adresse `https://philippejacquet0-source.github.io/science005/` reste publique.** GitHub Pages sert des fichiers HTML, CSS et JavaScript, sans serveur applicatif dans lequel installer notre authentification. [Présentation officielle de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Le contrôle d'accès natif aux sites Pages privés exige une **organisation GitHub Enterprise Cloud et un dépôt privé ou interne**. Il ne s'applique pas à ce dépôt public du compte personnel. Rendre seulement le dépôt privé ne suffit donc pas à rendre automatiquement un site Pages privé. [Conditions du contrôle d'accès Pages](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site).

Il faut distinguer deux objectifs :

| Objectif | Possibilité avec le code public actuel |
| --- | --- |
| Filtrer les visiteurs de l'adresse officielle | Oui, en utilisant un hébergement qui impose une authentification côté serveur |
| Garder l'adresse `github.io` et lui imposer notre propre contrôle d'accès | Pas avec GitHub Pages public dans cette configuration |
| Empêcher quelqu'un de télécharger et d'utiliser le simulateur | Non : tous les fichiers nécessaires sont dans le dépôt public et fonctionnent en local |

Le dernier constat découle de l'architecture actuelle : le moteur, l'interface et les ressources sont entièrement livrés au navigateur. Un formulaire de mot de passe en JavaScript, une liste d'adresses autorisées ou un jeton contrôlé uniquement dans le navigateur peuvent être supprimés dans une copie locale. Ils peuvent organiser un parcours pédagogique, mais ne créent pas une restriction fiable d'utilisation.

## Option pratique : authentifier l'hébergement officiel

Pour un groupe d'étudiants autorisés, je recommande un hébergement des fichiers statiques derrière **Cloudflare Access**, par exemple avec un Worker et ses ressources statiques. Access contrôle chaque requête avant de servir l'application et permet de choisir les visiteurs autorisés. [Documentation Access pour Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Le déploiement pourrait conserver le dépôt public comme source, mais l'URL officielle changerait. Il faudrait protéger **tout le trafic**, y compris les adresses alternatives et les prévisualisations, et arrêter la copie publique sur GitHub Pages pour éviter un accès direct au même déploiement sans authentification. Les visiteurs déjà autorisés recevraient toujours le JavaScript et pourraient le conserver ; le dépôt public resterait lui aussi copiable.

Cloudflare Pages est une autre possibilité et accepte des dépôts publics ou privés. Attention à sa configuration : le simple bouton d'activation Access des prévisualisations ne protège **ni le domaine de production `pages.dev`, ni le domaine personnalisé**. La production exige une protection distincte, avec vérification de chaque adresse accessible. [Intégration Git Pages](https://developers.cloudflare.com/pages/get-started/git-integration/), [portée de la protection des prévisualisations](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

## Pour une restriction plus forte

Deux architectures peuvent être envisagées :

1. **Dépôt privé et hébergement authentifié** : empêche le téléchargement anonyme des sources. Les utilisateurs autorisés peuvent néanmoins enregistrer les fichiers reçus par leur navigateur.
2. **Interface publique et moteur indispensable sur un serveur authentifié** : le navigateur ne reçoit plus le moteur complet. Les calculs ou sessions passent par un service qui vérifie les droits. Cela demande de refondre l'exécution, la gestion des sessions et l'accélération temporelle.

Pour l'usage pédagogique actuel, protéger l'hébergement officiel est la solution la plus simple. Si l'objectif est d'empêcher toute copie utilisable du simulateur, le maintien du moteur complet dans un dépôt public est incompatible avec cet objectif.
