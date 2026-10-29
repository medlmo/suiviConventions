---
name: Coercition Zod et dates calendaires (codegen OpenAPI)
description: Les schémas générés par Orval coercent trop ; règles pour ne pas corrompre des dates calendaires ni des montants effacés.
---

Les schémas Zod générés depuis un OpenAPI utilisent `z.coerce.date()` et `z.coerce.number()`. Ils ne valident pas, ils convertissent — et la conversion est silencieuse.

**Why:** trois dégâts concrets observés sur des champs `format: date` représentant un jour calendaire.
1. `z.coerce.date()` accepte « 2025-02-30 » et le transforme en 2 mars ; sur une date de comité qui pilote une alerte, une correction silencieuse est pire qu'un refus.
2. Renvoyer le résultat de `.parse()` dans une **réponse** transforme « 2026-07-27 » en horodatage UTC complet, avec risque de décalage d'un jour côté client.
3. `z.coerce.number()` convertit `""` en `0` : un champ montant vidé par l'utilisateur est enregistré à zéro au lieu d'être effacé.

**How to apply:**
- *Entrée* : normaliser le corps brut avant `safeParse` — vérifier le format `AAAA-MM-JJ` par regex puis contrôler que la date existe réellement (reconstruire un `Date.UTC` et comparer les composantes), et ramener `""` à `null` pour les champs numériques. Refuser, ne pas corriger.
- *Sortie* : valider la forme avec `.parse()` mais renvoyer l'objet d'origine, jamais le résultat du parse.
- Cette précaution vaut pour tout champ date-calendaire ; elle est inutile pour un vrai instant (`date-time`).

## Compatibilité lors d'une mise à jour de Zod

Conserver la distinction entre les valeurs saisies et les valeurs validées des formulaires ; ne pas supprimer une transformation métier pour résoudre une incompatibilité de types.

**Why:** les montants saisis sont des chaînes, tandis que les montants validés sont numériques ou nuls. Les valeurs par défaut rendent aussi certains champs facultatifs à l'entrée mais obligatoires en sortie. Une mise à jour du résolveur peut exposer cette différence auparavant masquée.

**How to apply:** aligner la cible du générateur et le résolveur sur la même version majeure de Zod, typer séparément entrée et sortie, et conserver la règle « montant vidé = information effacée, pas zéro ».
