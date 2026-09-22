# Suivi des conventions — Région Souss-Massa

Application interne de suivi des conventions de partenariat de la Région Souss-Massa. Objectif métier n°1 : ne jamais rater la date d'un comité de suivi.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — serveur API
- `pnpm --filter @workspace/conventions run dev` — interface web
- `pnpm run typecheck` — typecheck de tous les paquets
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — régénère hooks React Query et schémas Zod depuis l'OpenAPI
- `pnpm --filter @workspace/db run push` — applique le schéma en base (dev)
- `pnpm --filter @workspace/scripts run seed` — importe `data/conventions_seed.json` (230 conventions)
- Env requis : `DATABASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API : Express 5 ; DB : PostgreSQL + Drizzle ORM
- Validation : Zod (`zod/v4`) ; codegen : Orval
- Front : React + Vite + wouter + TanStack Query + shadcn/ui

## Where things live

- Contrat d'API : `lib/api-spec/openapi.yaml` (source de vérité — toute modif d'endpoint passe par lui puis `codegen`)
- Schéma base : `lib/db/src/schema/conventions.ts`
- Calcul d'alerte : `artifacts/api-server/src/lib/alertes.ts`
- Mapping colonnes ↔ API et normalisation arabe : `artifacts/api-server/src/lib/conventions-mapper.ts`
- Routes : `artifacts/api-server/src/routes/conventions.ts`
- Écrans : `artifacts/conventions/src/pages/` (dashboard, conventions-list, convention-detail, convention-create)
- Données d'import : `data/conventions_seed.json`, extracteur `scripts/extract_excel.py`

## Architecture decisions

- **Le statut d'alerte n'est jamais stocké.** Il est recalculé en SQL à chaque requête par rapport à `CURRENT_DATE`. Calcul en SQL et non en TypeScript pour que le filtre, le tri par urgence et la pagination restent délégués à la base. Seuils : échéance dépassée → `EN_RETARD`, 0–30 j → `A_DECLENCHER`, 31–60 j → `A_PREPARER`, au-delà → `A_JOUR` ; sans échéance mais avec une fréquence conditionnelle (« كلما دعت الضرورة », « عند الحاجة »…) → `A_SURVEILLER`, sinon → `A_QUALIFIER`.
- **Recherche insensible aux variantes arabes.** Les deux blocs du fichier Excel d'origine n'utilisaient pas les mêmes caractères ; `translate()` est appliqué à la colonne *et* au terme recherché (yeh farsi, keheh, alefs hamzés, ta marbouta, tatweel, diacritiques). Sans cela, une recherche correcte rate un tiers des résultats.
- **Dates validées strictement avant Zod.** Les schémas générés utilisent `z.coerce.date()`, qui transformerait silencieusement « 2025-02-30 » en 2 mars. Les corps de requête passent d'abord par `normaliserCorps()` (format `AAAA-MM-JJ` + contrôle calendaire) ; une date fausse est refusée, pas corrigée.
- **Les réponses sont validées sans être réécrites** (`valide()`) : renvoyer le résultat de `.parse()` convertirait les jours calendaires en horodatages UTC, avec risque de décalage d'un jour côté client.
- **Export CSV hors contrat OpenAPI** (`GET /api/conventions/export`) : c'est un téléchargement, consommé par un lien direct. Séparateur `;`, BOM UTF-8 obligatoire (sans lui Excel rend l'arabe illisible), et neutralisation des préfixes de formule (`=`, `+`, `-`, `@`).
- **Pas d'authentification pour l'instant** — décision explicite du commanditaire, à instaurer avant toute mise en ligne publique : toutes les routes, y compris la suppression, sont ouvertes.

## État des données importées

Les colonnes *rattachement*, *responsable du projet*, *statut de la convention*, *nature des fonds* et *décision* sont vides pour les 230 lignes du fichier Excel d'origine. Les filtres correspondants n'apparaissent dans l'interface qu'une fois des valeurs saisies.
