---
name: Exports générés par Orval
description: Collision d'exports entre validateurs Zod et types lors de la régénération du contrat API.
---

Les validateurs et les modèles générés peuvent porter exactement le même nom. Les modèles doivent donc rester exportés sous un espace de noms distinct plutôt qu'être réexportés globalement avec les validateurs.

**Why:** La génération Orval peut ajouter automatiquement une réexportation globale des modèles au point d'entrée Zod et provoquer une erreur de compilation pour un nom partagé, alors que les schémas générés sont corrects.

**How to apply:** Après une régénération du contrat, vérifier le point d'entrée de la bibliothèque Zod. Si cette réexportation globale est revenue, conserver l'export des modèles sous son espace de noms et effectuer le contrôle de types sur tout le projet.