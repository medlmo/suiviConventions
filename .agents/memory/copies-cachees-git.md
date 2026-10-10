---
name: Copies cachées dans Git
description: Vérification d'une purge de données confidentielles malgré les copies internes automatiques.
---

Ne pas valider une purge Git uniquement par l'absence des chemins signalés. Comparer aussi les identifiants des objets confidentiels d'origine avec tous les objets accessibles depuis les références publiques réécrites.

**Why:** Des snapshots internes de conversation avaient copié à l'identique le JSON métier, le classeur Excel et le brief sous un dossier caché. Le premier retrait des chemins visibles laissait encore ces copies dans l'historique public.

**How to apply:** Enregistrer les identifiants des objets avant la purge, sans afficher leurs contenus. Rechercher les copies par identité d'objet, retirer aussi leurs chemins, puis vérifier l'ensemble des références publiques depuis un nouveau clone du dépôt distant. L'absence dans l'historique référencé ne prouve pas l'effacement des caches ni des objets non référencés chez l'hébergeur.
