import assert from "node:assert/strict";
import test from "node:test";
import { getPaymentSituationValidationError as erreurSituationVersements } from "./situation-versements.ts";

const ligne = (valeurs = {}) => ({
  annee: 2026,
  partenaire: "Région Souss-Massa",
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

test("les lignes dupliquées et les montants invalides sont refusés", () => {
  assert.match(
    erreurSituationVersements([ligne(), ligne({ partenaire: "Région Souss-Massa" })]) ?? "",
    /partenaire ne peut avoir qu'une ligne de versement par année/,
  );
  assert.match(
    erreurSituationVersements([ligne({ montantVerse: -1 })]) ?? "",
    /montant versé doit être en MAD/,
  );
});
