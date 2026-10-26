import assert from "node:assert/strict";
import test from "node:test";
import { erreurSituationVersements } from "./situation-versements.ts";

const ligne = (valeurs = {}) => ({
  annee: 2026,
  montantProgramme: 100,
  montantVerse: 0,
  tranches: [],
  ...valeurs,
});

test("une situation sans années est valide", () => {
  assert.equal(erreurSituationVersements([]), null);
});

test("un montant versé nul est valide sans date", () => {
  assert.equal(erreurSituationVersements([ligne()]), null);
});

test("les tranches datées totalisent le montant versé", () => {
  assert.equal(erreurSituationVersements([
    ligne({
      montantVerse: 25,
      tranches: [{ montant: 25, dateVersement: "2026-03-15" }],
    }),
  ]), null);

  assert.match(
    erreurSituationVersements([ligne({ montantVerse: 25 })]) ?? "",
    /total versé doit être égal à la somme des tranches/,
  );
});

test("une tranche doit avoir un montant positif", () => {
  assert.match(
    erreurSituationVersements([
      ligne({ tranches: [{ montant: 0, dateVersement: "2026-03-15" }] }),
    ]) ?? "",
    /montant de chaque tranche doit être supérieur à zéro/,
  );
});

test("les dates calendaires impossibles sont refusées", () => {
  assert.match(
    erreurSituationVersements([
      ligne({ montantVerse: 25, tranches: [{ montant: 25, dateVersement: "2026-02-30" }] }),
    ]) ?? "",
    /date réelle/,
  );
});

test("les années dupliquées et les montants invalides sont refusés", () => {
  assert.match(
    erreurSituationVersements([ligne(), ligne()]) ?? "",
    /années de la situation des versements doivent être uniques/,
  );
  assert.match(
    erreurSituationVersements([ligne({ montantProgramme: -1 })]) ?? "",
    /montants programmés et versés sont requis/,
  );
});
