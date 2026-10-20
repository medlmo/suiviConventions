import assert from "node:assert/strict";
import test from "node:test";
import { erreurSituationVersements } from "./situation-versements.ts";

const ligne = (valeurs = {}) => ({
  annee: 2026,
  montantProgramme: 100,
  montantVerse: 0,
  dateDernierVersement: null,
  ...valeurs,
});

test("une situation sans années est valide", () => {
  assert.equal(erreurSituationVersements([]), null);
});

test("un montant versé nul est valide sans date", () => {
  assert.equal(erreurSituationVersements([ligne()]), null);
});

test("un montant versé positif exige une date valide", () => {
  assert.equal(erreurSituationVersements([
    ligne({ montantVerse: 25, dateDernierVersement: "2026-03-15" }),
  ]), null);

  assert.match(
    erreurSituationVersements([ligne({ montantVerse: 25 })]) ?? "",
    /Renseignez la date du dernier versement/,
  );
});

test("une date de versement est interdite si le montant versé est nul", () => {
  assert.match(
    erreurSituationVersements([
      ligne({ dateDernierVersement: "2026-03-15" }),
    ]) ?? "",
    /laissez-la vide si le montant versé est nul/,
  );
});

test("les dates calendaires impossibles sont refusées", () => {
  assert.match(
    erreurSituationVersements([
      ligne({ montantVerse: 25, dateDernierVersement: "2026-02-30" }),
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
