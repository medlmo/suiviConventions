---
name: Remplacement d'un secret
description: Précaution lorsque le formulaire sécurisé reconfirme un secret au lieu de le remplacer.
---

Lorsqu'un secret existant est redemandé, une confirmation du formulaire peut laisser l'ancienne valeur en place. Si une validation au démarrage continue d'échouer après la confirmation, ne pas supposer que la valeur a changé ; utiliser une nouvelle entrée sécurisée ou guider un remplacement explicite.

**Why:** Deux confirmations successives ont laissé la même erreur de longueur au démarrage, tandis qu'une nouvelle entrée sécurisée a permis le démarrage. La valeur elle-même n'a jamais été consultée.

**How to apply:** Contrôler uniquement l'existence et le résultat fonctionnel, jamais afficher ou lire la valeur ; préférer une nouvelle clé lorsque la modification d'une clé existante est incertaine.