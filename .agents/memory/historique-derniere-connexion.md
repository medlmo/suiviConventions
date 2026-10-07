---
name: Historique des connexions
description: Interprétation fiable de la date de dernière connexion affichée à l'administration.
---

Ne pas déduire une ancienne connexion depuis `updated_at` du compte ni depuis l'existence d'une session active. N'afficher une date que lorsqu'une connexion réussie a effectivement été enregistrée ; sans historique fiable, indiquer qu'aucune date n'est enregistrée.

**Why:** Les sessions sont supprimées à la déconnexion et après leur expiration ; les lignes restantes ne constituent donc pas un historique complet des connexions passées.

**How to apply:** Maintenir `last_login_at` lors d'une ouverture de session réussie et garder une valeur nulle explicite pour les comptes dont aucune date fiable n'est connue.
