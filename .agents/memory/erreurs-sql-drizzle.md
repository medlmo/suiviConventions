---
name: Erreurs SQL de Drizzle
description: Traitement sûr des violations PostgreSQL et des messages d'erreur contenant des paramètres de requête.
---

Ne pas supposer que le code SQLSTATE se trouve directement sur l'erreur renvoyée par Drizzle : inspecter la cause enveloppée pour reconnaître les violations d'unicité. Ne jamais journaliser directement cette erreur lorsqu'une requête contient des identifiants ou un vérificateur de mot de passe.

**Why:** En production, une création de compte utilisant un identifiant existant a renvoyé une erreur technique 500 au lieu du conflit attendu : Drizzle avait enveloppé l'erreur PostgreSQL. Le message de cette enveloppe incluait aussi les paramètres SQL, dont un vérificateur de mot de passe, dans les anciens journaux.

**How to apply:** Pour les nouvelles routes avec écritures SQL, extraire le code PostgreSQL depuis la chaîne des causes ; envoyer des erreurs métier adaptées et ne consigner que des métadonnées sûres (type et code) pour les erreurs inattendues. Cette précaution s'applique aussi à la délégation au gestionnaire Express par défaut : transmettre une erreur assainie, sans message SQL ni cause brute, pour éviter que ses propres journaux exposent les paramètres.

## Compromis de diagnostic en production

Privilégier les événements, opérations et codes techniques autorisés plutôt que les messages, piles ou causes bruts, y compris pour les outils documentaires. Une panne de requête doit produire une seule entrée finale, en conservant le contexte le plus précis.

**Why:** Les erreurs SQL enveloppées et les sorties d'outils peuvent contenir des données sensibles dans une simple chaîne ; masquer les champs « password » ou « cookie » ne protège pas ces chaînes. Multiplier les traces de la même panne fausse aussi le comptage des incidents.

**How to apply:** Pour enrichir le diagnostic, ajouter une métadonnée contrôlée ou un code d'événement stable, sans réintroduire une sérialisation complète de l'exception ni un second log à chaque niveau de traitement.
