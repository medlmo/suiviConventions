---
name: Applicabilité des avenants
description: Règle métier sur le visa des avenants et ses conséquences pour la situation en vigueur.
---

L'application suit normalement uniquement des conventions déjà visées. Un avenant ne devient applicable qu'après son propre visa. Par cohérence avec le périmètre de suivi, proposer l'enregistrement des avenants visés uniquement, sans introduire par défaut de workflow « en attente de visa ».

**Why:** L'utilisateur a explicitement précisé à la fois la condition de visa pour les avenants et le périmètre actuel des conventions suivies. Un statut de projet d'avenant ajouterait une gestion hors périmètre ; appliquer ses modifications avant le visa fausserait les données et les alertes.

**How to apply:** Prévoir une date de visa propre à chaque avenant, distincte de celle de la convention mère, et exiger cette date pour l'ajouter au suivi proposé. Seuls les avenants visés alimentent la situation courante, les totaux, les exports et les alertes. Si une date d'effet ultérieure figure dans un avenant, clarifier sa prise en compte sans jamais le rendre applicable avant son visa. Ne concevoir un suivi des avenants non visés que si l'utilisateur le demande explicitement.

L'ajout d'un fichier classé « Avenant » dans l'historique documentaire ne constitue pas l'application de ses dispositions : il ne modifie pas automatiquement les montants, les dates, les alertes ou la date de visa de la convention mère.

**Why:** L'utilisateur a demandé de pouvoir conserver les avenants aux côtés de la convention dans « Documents & commentaires », pas d'interpréter ou d'appliquer automatiquement leurs dispositions.

**How to apply:** Distinguer l'archivage des pièces jointes du suivi métier des avenants. Si un suivi des modifications est ensuite demandé, appliquer les conditions de visa ci-dessus, sans déduire une applicabilité de la seule présence d'un fichier.