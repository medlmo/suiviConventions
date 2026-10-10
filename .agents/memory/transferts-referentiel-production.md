---
name: Transferts de référentiel en production
description: Précautions pour transférer des valeurs validées sans écraser les références propres à la production.
---

Ne pas considérer un ancien manifeste de fusion comme l'état courant de la production. Vérifier indépendamment son état actuel en lecture seule, puis vérifier que la connexion de transfert correspond exactement à cet état avant toute écriture. Pour dédupliquer des libellés institutionnels, comparer une forme normalisée (casse, accents, apostrophes et ponctuation), mais conserver la graphie déjà enregistrée.

**Why:** La production peut recevoir des ajouts indépendants du développement ; un manifeste historique peut donc être périmé sans qu'il y ait une erreur de connexion. Des noms équivalents peuvent aussi différer par une apostrophe ou la casse, ce qui rend une comparaison textuelle stricte fragile.

**How to apply:** Comparer l'empreinte et le nombre de lignes du référentiel complet entre lecture et connexion d'écriture. Limiter l'insertion aux valeurs explicitement approuvées et réellement absentes après normalisation, préserver toutes les lignes préexistantes, sauvegarder avant l'écriture et vérifier les insertions dans une transaction. Garder ce transfert séparé d'une fusion des comptes ou conventions.
