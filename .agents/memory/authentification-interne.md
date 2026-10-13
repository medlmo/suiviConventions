---
name: Authentification interne
description: Choix métier derrière la connexion et les périmètres d'accès des conventions.
---

Les utilisateurs se connectent avec un identifiant **sans adresse e-mail** et un mot de passe. La création des comptes relève exclusivement de l'administration, sans inscription publique. Les directeurs voient toutes les conventions mais ne les modifient pas ; le Directeur Général des Services dispose du même accès global en lecture seule, sans rattachement à une direction. Les chefs de division et de service peuvent créer, modifier et supprimer seulement celles de leur périmètre.

**Why:** L'utilisateur a explicitement choisi ces règles et demandé le rôle global en lecture seule du Directeur Général des Services. La configuration gérée d'authentification disponible par défaut était orientée e-mail/mot de passe et inscription publique ; l'imposer aurait modifié le parcours demandé. Les anciennes conventions sans rattachement ne peuvent pas être attribuées de façon sûre à un chef.

**How to apply:** Garder la règle d'autorisation côté serveur sur toutes les lectures, écritures et exports ; ne pas élargir silencieusement l'accès aux enregistrements historiques non affectés. Préserver la visibilité globale en lecture pour le Directeur et le Directeur Général des Services, sans leur accorder de droits d'écriture.

Lors d'une connexion, d'une déconnexion ou d'une expiration, conserver la requête de session observée par l'interface et mettre sa donnée à jour ; nettoyer séparément les autres données mises en cache.

**Why:** Évincer tout le cache alors que l'interface observe la session peut rompre sa mise à jour immédiate : le serveur accepte la connexion ou la déconnexion, mais l'écran ne change qu'après un rechargement.

**How to apply:** Ne pas vider globalement le cache React Query pendant une transition d'authentification ; préserver l'abonnement de session, retirer les autres données privées et publier explicitement le nouvel utilisateur ou l'état déconnecté.

Les libellés de l'organigramme ne sont pas de simples étiquettes d'affichage : ils servent aussi à déterminer le périmètre des comptes et des conventions. Un renommage doit conserver leur correspondance.

**Why:** Les périmètres historiques sont enregistrés sous forme de texte. Changer seulement le référentiel ferait perdre l'accès aux conventions concernées ou rendrait leur affectation invalide, même si le rôle de l'utilisateur n'a pas changé.

**How to apply:** Effectuer les renommages et la mise à jour des périmètres utilisateurs/conventions dans une même transaction, avec les changements de version nécessaires ; sérialiser cette opération avec les créations et modifications qui valident ces mêmes libellés. Ne jamais traiter un renommage comme une simple retouche visuelle.

La limitation des connexions doit réserver une tentative avant toute vérification asynchrone du mot de passe. Un plafond de capacité ne doit pas effacer les restrictions encore actives : les nouvelles clés sont temporairement refusées jusqu'à l'expiration de places existantes.

**Why:** Enregistrer seulement les échecs après le contrôle laisserait passer une rafale simultanée. Évincer des clés actives pour borner la mémoire permettrait à une attaque de forte cardinalité d'effacer les blocages ; le refus temporaire privilégie ici la protection plutôt que la disponibilité des nouvelles clés.

**How to apply:** Conserver une admission synchrone et bornée, des limites indépendantes par compte et par IP, et des expirations fixes. Une connexion réussie ne doit pas effacer le compteur collectif de l'IP.