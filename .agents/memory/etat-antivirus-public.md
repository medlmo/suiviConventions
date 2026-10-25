---
name: État antivirus public
description: Contrat minimal de l'endpoint public de disponibilité antivirus.
---

L'endpoint antivirus sans authentification expose uniquement `{ ready }`. Il conserve le statut HTTP 200/503 pour permettre la supervision de la disponibilité, tandis que l'état du moteur, les détails de mise à jour et l'âge de la base restent internes.

**Why:** La réponse précédente révélait des détails opérationnels qui n'étaient pas nécessaires au public ; un indicateur de disponibilité suffit sans retirer la fonction de supervision.

**How to apply:** Maintenir la réponse publique minimale et mettre à jour en même temps le contrat OpenAPI et les clients générés si sa forme change.
