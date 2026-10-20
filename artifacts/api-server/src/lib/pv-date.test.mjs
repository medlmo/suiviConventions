import assert from "node:assert/strict";
import test from "node:test";
import { normaliserDatePv } from "./pv-date.ts";

test("une date de PV absente ou vide est acceptée comme null", () => {
  for (const valeur of [undefined, null, ""]) {
    assert.deepEqual(normaliserDatePv(valeur), { ok: true, date: null });
  }
});

test("une date calendaire valide est conservée", () => {
  assert.deepEqual(normaliserDatePv("2026-10-20"), {
    ok: true,
    date: "2026-10-20",
  });
});

test("une date invalide ou un format autre que AAAA-MM-JJ est refusé", () => {
  for (const valeur of ["2026-02-30", "20/10/2026", "2026-1-02", 20261020]) {
    assert.deepEqual(normaliserDatePv(valeur), { ok: false });
  }
});

test("une date historique de type Date est normalisée en jour calendaire", () => {
  assert.deepEqual(normaliserDatePv(new Date("2026-10-20T23:30:00.000Z")), {
    ok: true,
    date: "2026-10-20",
  });
  assert.deepEqual(normaliserDatePv(new Date(Number.NaN)), { ok: false });
});
