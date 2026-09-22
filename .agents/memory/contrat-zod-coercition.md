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
