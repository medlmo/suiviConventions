import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import type { SessionUser } from "./auth";
import type { ReferenceData } from "./reference-data";
import { filtrePerimetre as determinerFiltrePerimetre } from "./convention-access-domain";

export { accessible, affectationsValides } from "./convention-access-domain";

export function peutEcrire(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "chef_division" || user.role === "chef_service";
}

/** Toutes les consultations excluent les suppressions et respectent le périmètre. */
export function conditionsVisibles(user: SessionUser, reference: ReferenceData, filtre?: SQL): SQL {
  return and(isNull(conventionsTable.deletedAt), filtrePerimetre(user, reference), filtre)!;
}

/** Shared with lists and notifications, including after account/organisation changes. */
export function filtrePerimetre(user: SessionUser, reference: ReferenceData): SQL | undefined {
  const filtre = determinerFiltrePerimetre(user, reference);
  if (filtre.type === "global") return undefined;
  if (filtre.type === "division") {
    return and(
      eq(conventionsTable.rattachement, filtre.rattachement),
      filtre.services.length === 0 ? isNull(conventionsTable.responsableProjet) : or(
        isNull(conventionsTable.responsableProjet),
        inArray(conventionsTable.responsableProjet, filtre.services),
      ),
    );
  }
  if (filtre.type === "service") return and(
    eq(conventionsTable.rattachement, filtre.rattachement),
    eq(conventionsTable.responsableProjet, filtre.service),
  );
  return sql`FALSE`;
}
