---
name: Alerte recalculée en SQL (suivi des conventions)
description: Pourquoi le niveau d'alerte est calculé en SQL et jamais stocké, et les pièges Postgres rencontrés en l'implémentant.
---

Le niveau d'alerte d'une convention est une expression SQL évaluée à chaque requête contre `CURRENT_DATE`. Rien n'est persisté, aucun job de recalcul n'existe.

**Why:** deux raisons distinctes. Métier : un statut stocké devient faux dès le lendemain sans que personne ne s'en aperçoive, et l'enjeu du produit est précisément de ne pas rater une date. Technique : la liste doit pouvoir être filtrée par niveau, triée par urgence et paginée par la base ; un calcul en TypeScript obligerait à charger les 230+ lignes avant de paginer et ferait diverger le tri de l'affichage.

**How to apply:** toute nouvelle vue, tout nouvel export ou tout nouveau filtre par alerte réutilise l'expression partagée plutôt que de refaire le calcul côté application. Si un jour le calcul doit être dupliqué côté client, garder la version SQL comme référence.

## Pièges Postgres rencontrés (non devinables)

- Une expression SQL qui apparaît à la fois dans le `SELECT` et dans le `GROUP BY` doit être **textuellement identique** après paramétrage. Si elle contient un paramètre lié, Drizzle lui attribue des numéros `$n` différents aux deux endroits et Postgres refuse la requête d'agrégat. Les constantes du code (motifs regex, seuils) doivent donc être injectées littéralement, pas en paramètre.
- Un entier passé en paramètre dans une arithmétique de date n'a pas de type inféré : `CURRENT_DATE + $1` et `make_interval(months => $1)` échouent. Il faut un cast explicite `::int`.
