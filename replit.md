# Suivi des conventions — Région Souss-Massa

Application interne de suivi des conventions de partenariat de la Région Souss-Massa. Objectif métier n°1 : ne jamais rater la date d'un comité de suivi.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — serveur API
- `pnpm --filter @workspace/conventions run dev` — interface web
- `pnpm run typecheck` — typecheck de tous les paquets
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — régénère hooks React Query et schémas Zod depuis l'OpenAPI
- `pnpm --filter @workspace/db run push` — applique le schéma en base (dev)
- `pnpm --filter @workspace/scripts run seed` — importe uniquement l'exemple fictif `data/conventions_example.json` ; ne pas exécuter sur une base métier.
- Env requis : `DATABASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API : Express 5 ; DB : PostgreSQL + Drizzle ORM
- Validation : Zod (`zod/v4`) ; codegen : Orval
- Front : React + Vite + wouter + TanStack Query + shadcn/ui

## Where things live

- Contrat d'API : `lib/api-spec/openapi.yaml` (source de vérité — toute modif d'endpoint passe par lui puis `codegen`)
- Schéma base : `lib/db/src/schema/` (`conventions.ts`, `auth.ts`)
- Pool PostgreSQL et fuseau horaire des connexions : `lib/db/src/index.ts`
- Authentification et sessions : `artifacts/api-server/src/lib/auth.ts`, routes dans `artifacts/api-server/src/routes/auth.ts`
- Calcul d'alerte : `artifacts/api-server/src/lib/alertes.ts`
- Mapping colonnes ↔ API et normalisation arabe : `artifacts/api-server/src/lib/conventions-mapper.ts`
- Routes : `artifacts/api-server/src/routes/conventions.ts`
- Écrans : `artifacts/conventions/src/pages/` (dashboard, conventions-list, convention-detail, convention-create)
- Données de démonstration publiques : `data/conventions_example.json` (entièrement fictives).
- Import privé : extracteur `scripts/extract_excel.py` ; sa sortie `data/conventions_seed.json` et les fichiers source sont exclus de Git et de la publication.

## Confidentialité des fichiers

- Ne jamais versionner ni publier de données métier réelles, de sources Excel internes, de briefs internes ou de captures contenant des données métier.
- Les dossiers `attached_assets/`, `screenshots/`, `.conversation/`, `.agents/memory/` et le fichier `data/conventions_seed.json` sont exclus de Git et des images publiées.
- Les fichiers `.env*` (sauf `.env.example`) et les clés privées ne doivent jamais être versionnés.
- Les données réelles restent dans les bases protégées. Tout exemple public doit être créé de toutes pièces, clairement fictif, et non simplement pseudonymisé à partir de données réelles.
- Installer les contrôles locaux avec `pnpm run security:install-hooks`. Le hook de pré-commit bloque l'ajout de chemins confidentiels et le hook de pré-push contrôle l'historique envoyé vers GitHub. GitHub Actions contrôle aussi les chemins suivis et lance Gitleaks.
- Après une purge, ne jamais fusionner un ancien clone ou pousser les branches internes historiques de Replit vers GitHub ; les règles locales et CI ne suppriment pas les données déjà présentes dans l'historique distant.

## Architecture decisions

- **Le statut d'alerte n'est jamais stocké.** Il est recalculé en SQL à chaque requête par rapport à `CURRENT_DATE`. Calcul en SQL et non en TypeScript pour que le filtre, le tri par urgence et la pagination restent délégués à la base. Seuils : échéance dépassée → `EN_RETARD`, 0–30 j → `A_DECLENCHER`, 31–60 j → `A_PREPARER`, au-delà → `A_JOUR` ; sans échéance mais avec une fréquence conditionnelle (« كلما دعت الضرورة », « عند الحاجة »…) → `A_SURVEILLER`, sinon → `A_QUALIFIER`.
- **Recherche textuelle ciblée, insensible aux variantes arabes.** Elle porte sur le nom et l'objet français de la convention, le responsable et le porteur du projet, les maîtrises d'ouvrage (y compris les valeurs historiques), mais pas sur les champs volumineux tels que les comités, la fréquence, les commentaires ou le PV. `translate()` est appliqué à la colonne *et* au terme recherché (variantes arabes, tatweel et diacritiques) pour ne pas manquer des résultats.
- **Dates validées strictement avant Zod.** Les schémas générés utilisent `z.coerce.date()`, qui transformerait silencieusement « 2025-02-30 » en 2 mars. Les corps de requête passent d'abord par `normaliserCorps()` (format `AAAA-MM-JJ` + contrôle calendaire) ; une date fausse est refusée, pas corrigée.
- **Les réponses sont validées sans être réécrites** (`valide()`) : renvoyer le résultat de `.parse()` convertirait les jours calendaires en horodatages UTC, avec risque de décalage d'un jour côté client.
- **Export Excel hors contrat OpenAPI** (`GET /api/conventions/export`) : mêmes filtres et périmètres que la liste, plafond de 5 000 conventions sans troncature silencieuse. Lecture par lots dans un instantané SQL ; ExcelJS streaming vers un fichier temporaire privé, puis transfert et suppression du fichier. Un export simultané par instance, délai maximal de 120 secondes et plafond de texte de 32 Mio. Le bouton affiche les refus du serveur. Les colonnes « PV », « Convention (document) » et « Fiche technique » sont exclues ; « Porteur de projet » précède « Maîtrise d'ouvrage ».
- **Surveillance opérationnelle** : `/api/healthz` reste un contrôle de vie du processus ; `/api/readyz` vérifie séparément la base sans exposer de détails. La page d’administration « État du service » affiche les dépendances, compteurs HTTP et alertes actives. Les métriques/alertes sont en mémoire, locales à l’instance, fenêtre glissante de 5 minutes ; elles sont perdues au redémarrage et ne sont pas agrégées entre instances. Les seuils d’alerte sont 5 % d’erreurs 5xx (au moins 20 requêtes), p95 ≥ 2 s (au moins 20 requêtes), indisponibilité DB ou antivirus. Les alertes apparaissent dans l’application et dans les journaux Pino, sans canal externe.
- **Authentification interne** : connexion par identifiant et mot de passe, sans inscription publique ; seuls les administrateurs créent les comptes. Les droits et périmètres sont contrôlés côté API. Les directeurs et le Directeur Général des Services ont un accès global en lecture seule ; les chefs de division et de service écrivent dans leur périmètre.
- **Services directement rattachés à la DGS** : Coopération et Juridique n'appartiennent à aucune autre direction ni division. Leurs chefs de service peuvent être créés sans rattachement intermédiaire et n'accèdent qu'aux conventions de leur propre service ; ne pas créer de direction ou division fictive pour ces services.
- **Sessions** : les nouvelles sessions sont conservées dans PostgreSQL et expirent après 24 heures ; les expirées sont refusées par le middleware. L'API purge les lignes expirées au démarrage, puis toutes les heures.
- **Dernière connexion** : enregistrer l'instant uniquement après une connexion réussie et le conserver après déconnexion. L'historique avant l'ajout de cette mesure n'étant pas disponible, ne pas inventer de date pour les comptes existants.
- **Interface des conventions** : afficher 20 conventions par page. Le champ Décision propose notamment « A clôturer » ; conserver les valeurs historiques existantes tant que l'utilisateur ne les remplace pas.
- **Fuseau PostgreSQL** : chaque connexion du pool est démarrée avec `Africa/Casablanca`. Configurer le fuseau dans le pool (`lib/db/src/index.ts`) afin qu'il s'applique aussi aux connexions ouvertes ultérieurement ou recréées.

## État des données importées

Les colonnes *rattachement*, *responsable du projet*, *statut de la convention*, *nature des fonds* et *décision* sont vides pour les 230 lignes du fichier Excel d'origine. Les filtres correspondants n'apparaissent dans l'interface qu'une fois des valeurs saisies.
