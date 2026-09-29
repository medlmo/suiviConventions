---
name: Authentification interne
description: Choix métier derrière la connexion et les périmètres d'accès des conventions.
---

Les utilisateurs se connectent avec un identifiant **sans adresse e-mail** et un mot de passe. La création des comptes relève exclusivement de l'administration, sans inscription publique. Les directeurs voient toutes les conventions mais ne les modifient pas ; les chefs de division et de service peuvent créer, modifier et supprimer seulement celles de leur périmètre.

**Why:** L'utilisateur a explicitement choisi ces règles. La configuration gérée d'authentification disponible par défaut était orientée e-mail/mot de passe et inscription publique ; l'imposer aurait modifié le parcours demandé. Les anciennes conventions sans rattachement ne peuvent pas être attribuées de façon sûre à un chef.

**How to apply:** Garder la règle d'autorisation côté serveur sur toutes les lectures, écritures et exports ; ne pas élargir silencieusement l'accès aux enregistrements historiques non affectés. Préserver la visibilité globale en lecture pour les directeurs, même lorsqu'ils ont une direction associée.

Lors d'une connexion, d'une déconnexion ou d'une expiration, conserver la requête de session observée par l'interface et mettre sa donnée à jour ; nettoyer séparément les autres données mises en cache.

**Why:** Évincer tout le cache alors que l'interface observe la session peut rompre sa mise à jour immédiate : le serveur accepte la connexion ou la déconnexion, mais l'écran ne change qu'après un rechargement.

**How to apply:** Ne pas vider globalement le cache React Query pendant une transition d'authentification ; préserver l'abonnement de session, retirer les autres données privées et publier explicitement le nouvel utilisateur ou l'état déconnecté.

Les libellés de l'organigramme ne sont pas de simples étiquettes d'affichage : ils servent aussi à déterminer le périmètre des comptes et des conventions. Un renommage doit conserver leur correspondance.

**Why:** Les périmètres historiques sont enregistrés sous forme de texte. Changer seulement le référentiel ferait perdre l'accès aux conventions concernées ou rendrait leur affectation invalide, même si le rôle de l'utilisateur n'a pas changé.

**How to apply:** Effectuer les renommages et la mise à jour des périmètres utilisateurs/conventions dans une même transaction, avec les changements de version nécessaires ; sérialiser cette opération avec les créations et modifications qui valident ces mêmes libellés. Ne jamais traiter un renommage comme une simple retouche visuelle.