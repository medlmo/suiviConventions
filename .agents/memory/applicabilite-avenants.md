---
name: Applicabilité des avenants
description: Règle métier sur le visa des avenants et ses conséquences pour la situation en vigueur.
---

Un avenant ne devient applicable qu'après son visa. Un avenant saisi ou signé sans visa reste dans l'historique, mais ses modifications ne changent pas les valeurs en vigueur de la convention mère.

**Why:** L'utilisateur a explicitement précisé cette règle. Appliquer un montant, une maîtrise d'ouvrage ou une échéance avant le visa fausserait les données et les alertes.

**How to apply:** Prévoir un visa propre à chaque avenant, distinct de celui de la convention mère. Tant qu'il n'est pas visé, conserver ses modifications comme en attente ; seules celles des avenants visés alimentent la situation courante, les totaux, les exports et les alertes. Si une date d'effet ultérieure figure dans un avenant, clarifier sa prise en compte sans jamais le rendre applicable avant son visa.