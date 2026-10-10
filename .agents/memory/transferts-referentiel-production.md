---
name: Transferts de référentiel en production
description: Précautions pour transférer des valeurs validées sans écraser les références propres à la production.
---

Ne pas considérer un ancien manifeste de fusion comme l'état courant de la production. Vérifier indépendamment son état actuel en lecture seule, puis vérifier que la connexion de transfert correspond exactement à cet état avant toute écriture.

**Why:** La production peut recevoir des ajouts indépendants du développement ; un manifeste historique peut donc être périmé sans qu'il y ait une erreur de connexion. Un remplacement complet ferait perdre ces ajouts.

**How to apply:** Limiter le transfert aux valeurs explicitement approuvées, préserver toutes les lignes préexistantes, sauvegarder le référentiel avant l'écriture et vérifier les insertions dans une transaction. Garder ce transfert séparé d'une fusion des comptes ou conventions.
