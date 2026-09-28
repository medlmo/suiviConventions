---
name: Valeurs historiques des conventions
description: Comment remplacer les champs libres par des listes sans perdre les données déjà importées.
---

Quand un champ de convention auparavant libre devient une liste de choix, conserver sa valeur historique même si elle n'appartient pas aux nouvelles options. Ne la remplacer que lorsque l'utilisateur choisit explicitement une nouvelle valeur ou efface le champ.

**Why:** Les conventions importées peuvent contenir des intitulés antérieurs à l'organigramme actuel. Une sauvegarde sans modification du champ ne doit pas supprimer silencieusement ces informations.

**How to apply:** Sur les formulaires de modification et les futures listes dépendantes, distinguer la valeur historique conservée des nouvelles options sélectionnables. Si un parent change, effacer explicitement le choix enfant devenu incompatible.