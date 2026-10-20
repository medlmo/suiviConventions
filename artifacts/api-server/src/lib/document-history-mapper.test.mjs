import assert from "node:assert/strict";
import test from "node:test";
import { documentsConvention } from "./document-history-mapper.ts";

test("la date historique est associée uniquement au PV correspondant", () => {
  const datePvComite = "2026-10-20";
  const documents = documentsConvention({
    documents: [
      { objectPath: "/pv/ancien.pdf", name: "Ancien PV", type: "pv", addedAt: null },
      { objectPath: "/pv/courant.pdf", name: "PV courant", type: "pv", addedAt: null },
    ],
    pv: "/pv/courant.pdf",
    documentConvention: null,
    datePvComite,
  });

  assert.equal(documents[0]?.datePvComite, undefined);
  assert.equal(documents[1]?.datePvComite, datePvComite);
});

test("un ancien PV sans date reste consultable sans date inventée", () => {
  const documents = documentsConvention({
    documents: null,
    pv: "/pv/ancien.pdf",
    documentConvention: null,
    datePvComite: null,
  });

  assert.deepEqual(documents, [{
    objectPath: "/pv/ancien.pdf",
    type: "pv",
    name: "PV enregistré précédemment",
    addedAt: null,
  }]);
});

test("une date déjà enregistrée sur un document n'est pas remplacée", () => {
  const documents = documentsConvention({
    documents: [{
      objectPath: "/pv/courant.pdf",
      name: "PV courant",
      type: "pv",
      addedAt: null,
      datePvComite: "2026-10-01",
    }],
    pv: "/pv/courant.pdf",
    documentConvention: null,
    datePvComite: "2026-10-20",
  });

  assert.equal(documents[0]?.datePvComite, "2026-10-01");
});
