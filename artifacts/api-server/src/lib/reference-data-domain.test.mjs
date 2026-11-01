import assert from "node:assert/strict";
import test from "node:test";
import {
  construireReferentiel,
  directionConnue,
  maitriseOuvrageConnue,
} from "./reference-data-domain.ts";

const lignes = {
  directions: [
    { id: 1, nom: "Direction A" },
    { id: 2, nom: "Direction B" },
  ],
  divisions: [
    { id: 10, directionId: 1, nom: "Division A1" },
    { id: 11, directionId: 1, nom: "Division A2" },
    { id: 20, directionId: 2, nom: "Division B1" },
  ],
  services: [
    { id: 100, divisionId: 10, nom: "Service A1" },
    { id: 101, divisionId: 10, nom: "Service A2" },
    { id: 200, divisionId: 20, nom: "Service B1" },
  ],
  servicesDgs: [{ id: 300, nom: "Service Coopération" }],
  maitrisesOuvrage: [{ id: 400, nom: "Commune A" }],
};

test("construireReferentiel relie chaque division à sa direction et chaque service à sa division", () => {
  assert.deepEqual(construireReferentiel(lignes), {
    organisation: [
      {
        id: 1,
        direction: "Direction A",
        divisions: [
          {
            id: 10,
            nom: "Division A1",
            services: [
              { id: 100, nom: "Service A1" },
              { id: 101, nom: "Service A2" },
            ],
          },
          { id: 11, nom: "Division A2", services: [] },
        ],
      },
      {
        id: 2,
        direction: "Direction B",
        divisions: [{
          id: 20,
          nom: "Division B1",
          services: [{ id: 200, nom: "Service B1" }],
        }],
      },
    ],
    maitrisesOuvrage: [{ id: 400, nom: "Commune A" }],
    servicesDgs: [{ id: 300, nom: "Service Coopération" }],
  });
});

test("construireReferentiel conserve directions sans division et gère des listes vides", () => {
  assert.deepEqual(construireReferentiel({
    directions: [{ id: 1, nom: "Direction vide" }],
    divisions: [],
    services: [],
    servicesDgs: [],
    maitrisesOuvrage: [],
  }), {
    organisation: [{ id: 1, direction: "Direction vide", divisions: [] }],
    maitrisesOuvrage: [],
    servicesDgs: [],
  });
  assert.deepEqual(construireReferentiel({
    directions: [],
    divisions: [],
    services: [],
    servicesDgs: [],
    maitrisesOuvrage: [],
  }), { organisation: [], maitrisesOuvrage: [], servicesDgs: [] });
});

test("directionConnue et maitriseOuvrageConnue distinguent les valeurs présentes", () => {
  const reference = construireReferentiel(lignes);
  assert.equal(directionConnue(reference, "Direction A"), true);
  assert.equal(directionConnue(reference, "direction a"), false);
  assert.equal(directionConnue(reference, "Direction absente"), false);
  assert.equal(maitriseOuvrageConnue(reference, "Commune A"), true);
  assert.equal(maitriseOuvrageConnue(reference, "Commune absente"), false);
});
