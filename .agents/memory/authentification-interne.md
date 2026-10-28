---
name: Authentification interne
description: Choix métier derrière la connexion et les périmètres d'accès des conventions.
---

Les utilisateurs se connectent avec un identifiant **sans adresse e-mail** et un mot de passe. La création des comptes relève exclusivement de l'administration, sans inscription publique. Les directeurs voient toutes les conventions mais ne les modifient pas ; le Directeur Général des Services dispose du même accès global en lecture seule, sans rattachement à une direction. Les chefs de division et de service peuvent créer, modifier et supprimer seulement celles de leur périmètre.

Les chefs de service n'ont pas besoin d'un filtre par rattachement dans la liste : ils ne voient déjà que les conventions liées à leur service.

**Why:** L'utilisateur a précisé que le périmètre de service suffit pour les chefs de service.

**How to apply:** Masquer le filtre de rattachement à ces utilisateurs et ne pas transmettre ce critère dans leurs requêtes de liste ou d'export ; conserver la restriction de périmètre côté serveur.

Les chefs de division filtrent leurs conventions par service au sein de leur division, pas par division.

**Why:** L'utilisateur a demandé un filtre par service et le masquage du filtre par division pour ce profil.

**How to apply:** Proposer seulement les services rattachés à la division de l'utilisateur ; garder la restriction de division appliquée par le serveur et inclure le filtre de service dans la liste et l'export.

**Why:** L'utilisateur a explicitement choisi ces règles et demandé le rôle global en lecture seule du Directeur Général des Services. La configuration gérée d'authentification disponible par défaut était orientée e-mail/mot de passe et inscription publique ; l'imposer aurait modifié le parcours demandé. Les anciennes conventions sans rattachement ne peuvent pas être attribuées de façon sûre à un chef.

**How to apply:** Garder la règle d'autorisation côté serveur sur toutes les lectures, écritures et exports ; ne pas élargir silencieusement l'accès aux enregistrements historiques non affectés. Préserver la visibilité globale en lecture pour le Directeur et le Directeur Général des Services, sans leur accorder de droits d'écriture.

Lors d'une connexion, d'une déconnexion ou d'une expiration, conserver la requête de session observée par l'interface et mettre sa donnée à jour ; nettoyer séparément les autres données mises en cache.

**Why:** Évincer tout le cache alors que l'interface observe la session peut rompre sa mise à jour immédiate : le serveur accepte la connexion ou la déconnexion, mais l'écran ne change qu'après un rechargement.

**How to apply:** Ne pas vider globalement le cache React Query pendant une transition d'authentification ; préserver l'abonnement de session, retirer les autres données privées et publier explicitement le nouvel utilisateur ou l'état déconnecté.

Les libellés de l'organigramme ne sont pas de simples étiquettes d'affichage : ils servent aussi à déterminer le périmètre des comptes et des conventions. Un renommage doit conserver leur correspondance.

**Why:** Les périmètres historiques sont enregistrés sous forme de texte. Changer seulement le référentiel ferait perdre l'accès aux conventions concernées ou rendrait leur affectation invalide, même si le rôle de l'utilisateur n'a pas changé.

**How to apply:** Effectuer les renommages et la mise à jour des périmètres utilisateurs/conventions dans une même transaction, avec les changements de version nécessaires ; sérialiser cette opération avec les créations et modifications qui valident ces mêmes libellés. Ne jamais traiter un renommage comme une simple retouche visuelle.

Les limites de connexion et d'analyse documentaire restent locales à chaque instance, conformément au choix explicite de l'utilisateur pour une mise en œuvre plus légère, sans coordination en base.

**Why:** L'utilisateur a choisi les limites par instance plutôt que des limites partagées entre serveurs.

**How to apply:** Ne pas présenter ces limites comme persistantes après redémarrage ni comme une protection globale entre instances. Une coordination partagée nécessiterait une nouvelle décision de portée.

Plusieurs comptes utilisés dans une même administration peuvent partager la même adresse IP publique.

**Why:** L'utilisateur a précisé que plusieurs comptes connectés à cette application dans une administration partagent la même IP publique.

**How to apply:** Ne jamais traiter une limite par IP comme une limite par personne. Calibrer les budgets IP pour l'usage simultané de l'administration et éviter qu'une protection globale par IP pénalise les autres comptes.

Après examen du trafic de production, l'utilisateur a choisi de conserver les seuils actuels et de ne pas ajouter de sonde révélant l'adresse effectivement reçue par l'application.

**Why:** Les journaux n'enregistrent pas `req.ip`, aucun blocage 429 n'a été observé sur la période consultée, et l'utilisateur a refusé une instrumentation temporaire.

**How to apply:** Ne pas ajouter de sonde ou de journalisation d'adresse IP sans nouvel accord. Garder les seuils en place jusqu'à ce que de nouvelles données de trafic ou un signal de blocage justifient une révision ; tenir compte du fait qu'Autoscale n'offre pas d'affinité de session et que les compteurs en mémoire restent locaux à chaque instance.

La limitation des connexions réserve une tentative avant toute vérification asynchrone du mot de passe et contrôle l'IP ainsi que le couple identifiant/IP, sans verrouillage global du compte. Une connexion réussie ne remet à zéro que ce couple, jamais le budget collectif de l'IP. Un plafond de capacité ne doit pas effacer les restrictions encore actives.

**Why:** Un verrouillage sur le seul identifiant permettait à un tiers de bloquer le compte depuis une autre adresse. Réserver après le contrôle laisserait passer une rafale simultanée, et évincer des clés actives permettrait d'effacer leurs restrictions.

**How to apply:** Conserver une admission synchrone, bornée et à expirations fixes. Ne pas réintroduire un blocage global par identifiant sans protection supplémentaire. Ce compromis ne supprime ni les limites communes aux utilisateurs d'une même IP, ni le risque de tentatives réparties entre de nombreuses IP.

La connexion ignore la casse de l'identifiant, en cohérence avec l'unicité en base ; le nom stocké reste inchangé.

**Why:** L'utilisateur a choisi que la casse ne distingue pas les noms de compte, car la base empêche déjà leur coexistence.

**How to apply:** Comparer les noms avec la fonction SQL `lower()` et conserver la normalisation sans casse de la clé identifiant/IP utilisée par la limitation des tentatives. Ne pas renommer les comptes lors de la connexion.