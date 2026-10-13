---
name: Protection documentaire
description: Périmètre décidé pour l'antimalware, la quarantaine et les documents historiques.
---

La protection concerne tous les documents, y compris les pièces déjà enregistrées. Aucun fichier non contrôlé ne doit être délivré ; une analyse échouée ou indisponible bloque l'accès. Les pièces historiques sont contrôlées à leur premier accès, sans suppression physique.

**Why:** L'utilisateur a choisi explicitement « Tous les documents », plutôt que les seuls nouveaux dépôts, après avoir été averti que l'indisponibilité de l'antivirus pourrait aussi bloquer les téléchargements historiques.

**How to apply:** Conserver cette règle lors des évolutions du dépôt, du téléchargement, des archives et des reprises de contrôle. Ne pas ajouter de mode permissif de secours ou de purge automatique des pièces refusées.

L'analyse est locale. Le recours à un service tiers qui recevrait les documents nécessite une décision explicite.

**Why:** Les documents sont stockés dans un circuit privé ; introduire un nouveau destinataire externe serait un changement de confidentialité, pas simplement un remplacement technique du moteur.

**How to apply:** Ne pas envoyer les fichiers à une API antimalware externe sans accord distinct.

Les métadonnées fournies lors d'un dépôt ne constituent jamais une preuve d'analyse réussie.

**Why:** Le téléversement direct permet de présenter des métadonnées prétendant que le fichier est déjà propre. Un nouveau dépôt doit toujours être effectivement analysé, puis lié à la version exacte de son contenu.

**How to apply:** Ne pas utiliser une déclaration « propre » provenant du dépôt pour éviter les contrôles ; préserver le lien entre analyse et contenu immuable.
