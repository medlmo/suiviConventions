---
name: Authentification interne
description: Choix métier derrière la connexion et les périmètres d'accès des conventions.
---

Les utilisateurs se connectent avec un identifiant **sans adresse e-mail** et un mot de passe. La création des comptes relève exclusivement de l'administration, sans inscription publique. Les directeurs voient toutes les conventions mais ne les modifient pas ; les chefs de division et de service peuvent créer, modifier et supprimer seulement celles de leur périmètre.

**Why:** L'utilisateur a explicitement choisi ces règles. La configuration gérée d'authentification disponible par défaut était orientée e-mail/mot de passe et inscription publique ; l'imposer aurait modifié le parcours demandé. Les anciennes conventions sans rattachement ne peuvent pas être attribuées de façon sûre à un chef.

**How to apply:** Garder la règle d'autorisation côté serveur sur toutes les lectures, écritures et exports ; ne pas élargir silencieusement l'accès aux enregistrements historiques non affectés. Préserver la visibilité globale en lecture pour les directeurs, même lorsqu'ils ont une direction associée.