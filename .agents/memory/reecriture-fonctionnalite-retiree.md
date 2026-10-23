---
name: Réécriture d’une fonctionnalité retirée
description: Précautions lors de la purge d’une fonctionnalité ajoutée puis supprimée de l’historique Git.
---

Avant de supprimer des commits d’ajout et de retrait d’une fonctionnalité, examiner aussi les commits antérieurs plus larges : l’implémentation peut avoir été introduite sous un message sans rapport direct, et le commit de retrait peut avoir supprimé d’autres changements avec elle.

**Why:** une réécriture basée uniquement sur les commits explicitement nommés a réintroduit du code de détection des doublons dans l’arbre final.

**How to apply:** inventorier tous les commits qui touchent la fonctionnalité, préserver uniquement la branche autorisée, puis comparer l’arbre de fichiers avant et après la réécriture.
