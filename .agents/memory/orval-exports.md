---
name: Exports générés par Orval
description: Collision d'exports entre validateurs Zod et types lors de la régénération du contrat API.
---

Les validateurs et les modèles générés peuvent porter exactement le même nom. Les modèles doivent donc rester exportés sous un espace de noms distinct plutôt qu'être réexportés globalement avec les validateurs.

**Why:** La génération Orval peut ajouter automatiquement une réexportation globale des modèles au point d'entrée Zod et provoquer une erreur de compilation pour un nom partagé, alors que les schémas générés sont corrects.

**How to apply:** La commande de génération doit retirer la réexportation globale ajoutée par Orval avant son contrôle de types ; conserver l'espace de noms des modèles. En cas de mise à jour d'Orval, vérifier que deux générations consécutives laissent ce point d'entrée stable.