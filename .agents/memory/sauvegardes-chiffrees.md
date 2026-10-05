---
name: Sauvegardes chiffrées de transfert
description: Précaution de rotation du secret utilisé pour chiffrer les sauvegardes avant fusion de données.
---

Avant de remplacer `SESSION_SECRET`, préserver la capacité de déchiffrer les sauvegardes de transfert existantes : les rechiffrer avec la nouvelle clé ou conserver l'ancienne clé uniquement dans un stockage sécurisé de secrets.

**Why:** Une sauvegarde préalable à la fusion de données a été chiffrée avec une clé dérivée de ce secret. Sa rotation peut donc rendre une sauvegarde historique illisible, même si les sessions et l'application continuent de fonctionner normalement.

**How to apply:** Lors d'une rotation de `SESSION_SECRET` ou d'une restauration, vérifier les sauvegardes chiffrées présentes dans `.local/backups/` et leur capacité de déchiffrement avant de retirer l'ancien secret.
