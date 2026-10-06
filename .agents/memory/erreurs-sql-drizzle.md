---
name: Erreurs SQL de Drizzle
description: Traitement sûr des violations PostgreSQL et des messages d'erreur contenant des paramètres de requête.
---

Ne pas supposer que le code SQLSTATE se trouve directement sur l'erreur renvoyée par Drizzle : inspecter la cause enveloppée pour reconnaître les violations d'unicité. Ne jamais journaliser directement cette erreur lorsqu'une requête contient des identifiants ou un vérificateur de mot de passe.

**Why:** En production, une création de compte utilisant un identifiant existant a renvoyé une erreur technique 500 au lieu du conflit attendu : Drizzle avait enveloppé l'erreur PostgreSQL. Le message de cette enveloppe incluait aussi les paramètres SQL, dont un vérificateur de mot de passe, dans les anciens journaux.

**How to apply:** Pour les nouvelles routes avec écritures SQL, extraire le code PostgreSQL depuis la chaîne des causes ; envoyer des erreurs métier adaptées et ne consigner que des métadonnées sûres (type et code) pour les erreurs inattendues.
