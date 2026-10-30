import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import type { SessionUser } from "./auth";
import {
  divisionDeDirection, perimetreChefService, servicesDeDivision, type ReferenceData,
} from "./reference-data";

/** Shared with lists and notifications, including after account/organisation changes. */
export function filtrePerimetre(user: SessionUser, reference: ReferenceData): SQL | undefined {
  if (user.role === "admin" || user.role === "directeur" || user.role === "directeur_general_services") {
    return undefined;
  }
  if (user.role === "chef_division" && user.direction && user.division &&
      divisionDeDirection(reference, user.direction, user.division)) {
    const services = servicesDeDivision(reference, user.division);
    return and(
      eq(conventionsTable.rattachement, user.division),
      services.length === 0 ? isNull(conventionsTable.responsableProjet) : or(
        isNull(conventionsTable.responsableProjet),
        inArray(conventionsTable.responsableProjet, services),
      ),
    );
  }
  const scope = user.role === "chef_service" ? perimetreChefService(reference, user) : null;
  if (scope) return and(
    eq(conventionsTable.rattachement, scope),
    eq(conventionsTable.responsableProjet, user.service!),
  );
  return sql`FALSE`;
}
