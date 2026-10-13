---
name: Limites d'audit App Storage
description: Ce que les contrôles officiels et les permissions GCS permettent réellement d'affirmer sur un bucket App Storage.
---

La documentation Replit indique que les buckets App Storage sont privés par défaut, empêchent l'accès public et rejettent les autorisations `allUsers` et `allAuthenticatedUsers`. Le panneau App Storage n'expose pas les stratégies IAM, les ACL ni leurs paramètres. Quand les appels GCS en lecture retournent 403, on ne peut donc pas certifier les principaux ni les ACL effectifs du bucket concerné à partir de l'environnement applicatif.

**Why:** Une garantie générale de la plateforme et des essais anonymes refusés ne constituent pas une lecture de la configuration effective d'un bucket donné.

**How to apply:** Rapporter séparément les garanties documentées, les essais d'accès anonymes et les réglages du bucket vérifiés. Ne jamais déduire l'absence de permissions à partir d'un simple 403 ; ne pas modifier les permissions pour tenter de vérifier.
