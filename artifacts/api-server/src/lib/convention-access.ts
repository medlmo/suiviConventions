import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import type { SessionUser } from "./auth";
import type { ReferenceData } from "./reference-data";
import { filtrePerimetre as determinerFiltrePerimetre } from "./convention-access-domain";

export { accessible, affectationsValides } from "./convention-access-domain";

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
