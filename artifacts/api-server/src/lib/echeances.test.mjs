import assert from "node:assert/strict";
import test from "node:test";
import { calculerEcheance } from "./echeances.ts";

test("calcule trois mois après le visa pour les natures concernées", () => {
  assert.deepEqual(
    calculerEcheance({ nature: " Infrastructure ", dateVisa: "2025-01-15", frequenceReunions: "inconnue" }),
    { date: "2025-04-15", source: "visa", mois: 3 },
  );
  assert.deepEqual(
    calculerEcheance({ nature: "SUBVENTIONS", dateVisa: "2025-01-15" }),
    { date: "2025-04-15", source: "visa", mois: 3 },
  );
  assert.deepEqual(
    calculerEcheance({ nature: "Prestation", dateVisa: "2025-01-15" }),
    { date: "2025-04-15", source: "visa", mois: 3 },
  );
});

test("le dernier comité prime sur le visa et détermine l'intervalle", () => {
  assert.deepEqual(
    calculerEcheance({
      nature: "Infrastructure",
      dateVisa: "2024-01-10",
      dernierComite: "2025-02-10",
      frequenceReunions: " 6 Mois ",
    }),
    { date: "2025-08-10", source: "dernier-comite", mois: 6 },
  );
  assert.deepEqual(
    calculerEcheance({ dernierComite: "2025-02-10", frequenceReunions: "2" }),
    { date: "2025-04-10", source: "dernier-comite", mois: 2 },
  );
});

test("respecte les fins de mois et les années bissextiles", () => {
  assert.deepEqual(
    calculerEcheance({ dernierComite: "2024-01-31", frequenceReunions: "1" }),
    { date: "2024-02-29", source: "dernier-comite", mois: 1 },
  );
  assert.deepEqual(
    calculerEcheance({ dernierComite: "2023-01-31", frequenceReunions: "1 mois" }),
    { date: "2023-02-28", source: "dernier-comite", mois: 1 },
  );
  assert.deepEqual(
    calculerEcheance({ dernierComite: "2024-11-30", frequenceReunions: "3" }),
    { date: "2025-02-28", source: "dernier-comite", mois: 3 },
  );
});

test("ne retombe pas sur le visa si le comité existe mais sa fréquence est invalide", () => {
  for (const frequenceReunions of [null, "", "0", "-1", "1.5", "tous les mois", "9007199254740992"]) {
    assert.equal(
      calculerEcheance({
        nature: "Infrastructure",
        dateVisa: "2025-01-01",
        dernierComite: "2025-02-01",
        frequenceReunions,
      }),
      null,
      `fréquence attendue invalide : ${String(frequenceReunions)}`,
    );
  }
});

test("refuse les dates impossibles, les formats non ISO et les dépassements d'année", () => {
  for (const dateVisa of ["2025-02-30", "2025-13-01", "01/02/2025", "0099-01-01", "9999-12-31", null]) {
    assert.equal(
      calculerEcheance({ nature: "Subvention", dateVisa }),
      null,
      `date attendue invalide : ${String(dateVisa)}`,
    );
  }
  assert.equal(
    calculerEcheance({ dernierComite: "2025-02-30", frequenceReunions: "3" }),
    null,
  );
});

test("ignore une nature inconnue quand aucun comité n'a eu lieu", () => {
  assert.equal(calculerEcheance({ nature: "Autre", dateVisa: "2025-01-01" }), null);
  assert.equal(calculerEcheance({ nature: "Infrastructure", dateVisa: null }), null);
});
