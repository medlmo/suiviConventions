import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import type { SessionUser } from "./auth";
import type { ReferenceData } from "./reference-data";
import { getConventionScopeFilter } from "./convention-access-domain";

export { isConventionAccessible, areAssignmentsValid } from "./convention-access-domain";

export function canEditConventions(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "chef_division" || user.role === "chef_service";
}

/** Toutes les consultations excluent les suppressions et respectent le périmètre. */
export function buildVisibleConventionConditions(user: SessionUser, reference: ReferenceData, filter?: SQL): SQL {
  return and(isNull(conventionsTable.deletedAt), buildScopeSqlFilter(user, reference), filter)!;
}

/** Shared with lists and notifications, including after account/organisation changes. */
export function buildScopeSqlFilter(user: SessionUser, reference: ReferenceData): SQL | undefined {
  const scopeFilter = getConventionScopeFilter(user, reference);
  if (scopeFilter.type === "global") return undefined;
  if (scopeFilter.type === "division") {
    return and(
      eq(conventionsTable.rattachement, scopeFilter.rattachement),
      scopeFilter.services.length === 0 ? isNull(conventionsTable.responsableProjet) : or(
        isNull(conventionsTable.responsableProjet),
        inArray(conventionsTable.responsableProjet, scopeFilter.services),
      ),
    );
  }
  if (scopeFilter.type === "service") return and(
    eq(conventionsTable.rattachement, scopeFilter.rattachement),
    eq(conventionsTable.responsableProjet, scopeFilter.service),
  );
  return sql`FALSE`;
}
