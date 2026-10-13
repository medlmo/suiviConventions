---
name: Protection documentaire
description: Périmètre décidé pour l'antimalware, la quarantaine et les documents historiques.
---

Les nouveaux dépôts sont analysés avant leur mise à disposition. Le téléchargement ne déclenche aucune analyse antivirus, y compris pour les documents historiques jamais analysés ; les fichiers déjà identifiés comme rejetés restent bloqués. Les pièces ne sont pas supprimées automatiquement.

**Why:** L'utilisateur a ensuite demandé explicitement de limiter l'analyse antivirus au dépôt et a choisi de télécharger les anciens documents jamais analysés sans scan, afin d'éviter le délai à chaque téléchargement.

**How to apply:** Ne jamais lancer ou relancer ClamAV depuis un chemin de téléchargement. Maintenir l'analyse obligatoire des nouveaux dépôts et ne pas servir un document dont une analyse antérieure l'a explicitement rejeté.

L'analyse est locale. Le recours à un service tiers qui recevrait les documents nécessite une décision explicite.

**Why:** Les documents sont stockés dans un circuit privé ; introduire un nouveau destinataire externe serait un changement de confidentialité, pas simplement un remplacement technique du moteur.

**How to apply:** Ne pas envoyer les fichiers à une API antimalware externe sans accord distinct.

Les métadonnées fournies lors d'un dépôt ne constituent jamais une preuve d'analyse réussie.

**Why:** Le téléversement direct permet de présenter des métadonnées prétendant que le fichier est déjà propre. Un nouveau dépôt doit toujours être effectivement analysé, puis lié à la version exacte de son contenu.

**How to apply:** Ne pas utiliser une déclaration « propre » provenant du dépôt pour éviter les contrôles ; préserver le lien entre analyse et contenu immuable.
