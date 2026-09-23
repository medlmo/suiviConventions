---
name: Cache HTTP de l'API et affichage des échecs
description: Pourquoi les réponses de l'API ne doivent jamais être mises en cache, et pourquoi une requête échouée ne doit jamais s'afficher comme une section vide.
---

## Règle 1 — aucune réponse de l'API n'est cacheable

L'ETag d'Express est désactivé et `Cache-Control: no-store` est posé sur `/api`.

**Pourquoi :** le niveau d'alerte est recalculé en SQL par rapport à `CURRENT_DATE`, donc une
réponse identique d'un jour à l'autre n'a pas le même sens. De plus, une réponse 304 est traitée
comme un échec par le client HTTP partagé (`response.ok` est faux pour 304), ce qui transforme
une revalidation banale en erreur applicative.

**Quand cela s'applique :** à toute nouvelle route de l'API, et avant d'ajouter une quelconque
en-tête de cache pour « améliorer les performances ».

## Règle 2 — un échec réseau ne s'affiche jamais comme une absence de données

Les pages doivent lire `isError` et non pas seulement `data`. Sans cela, une requête en échec
laisse `data` à `undefined` et l'interface affiche un tableau de bord vide ou « Introuvable »,
ce qui ressemble à une base sans données plutôt qu'à une panne.

**Pourquoi :** un signalement d'utilisateur (« les compteurs ne se chargent plus, les priorités
sont vides, la fiche affiche Introuvable ») a été impossible à diagnostiquer, car les quatre
symptômes étaient en réalité le même échec de requête masqué par des états vides silencieux.

**Comment l'appliquer :** distinguer le 404 (ressource réellement absente) des autres statuts,
afficher le code technique dans le message, et proposer un bouton de nouvelle tentative
(`refetch`).
