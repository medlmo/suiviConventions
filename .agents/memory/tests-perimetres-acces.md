---
name: Tests des périmètres d’accès
description: Pourquoi les règles pures d’autorisation restent séparées de la traduction SQL.
---

Les décisions de périmètre d’accès doivent rester testables sans ouvrir de connexion à la base. Les tests Node natifs du serveur ne résolvent pas directement les imports TypeScript de répertoires présents dans l’entrée `@workspace/db`.

**Why:** Le lanceur natif `node --experimental-strip-types --test` ne sait pas charger certaines chaînes d’imports de schéma Drizzle du monorepo.

**How to apply:** Tester les résolutions de rôles, rattachements, services manquants et accès DGS dans le module sans dépendance DB ; réserver la couche SQL aux tests dédiés qui utilisent le dialecte ou une base de test.
