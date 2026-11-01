import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import { accessible, affectationsValides, filtrePerimetre } from "./convention-access-domain.ts";

const direction = "Direction A";
const division = "Division A";
const service = "Service A";
const serviceVoisin = "Service voisin";
const serviceDgs = "Service DGS";
const reference = {
  organisation: [{
    id: 1,
    direction,
    divisions: [
      { id: 1, nom: division, services: [{ id: 1, nom: service }, { id: 2, nom: serviceVoisin }] },
      { id: 2, nom: "Division B", services: [{ id: 3, nom: "Service B" }] },
    ],
  }],
  servicesDgs: [{ id: 4, nom: serviceDgs }],
  maitrisesOuvrage: [],
};
const user = (role, overrides = {}) => ({
  id: 1, username: "test", role, active: true, direction: null, division: null, service: null, ...overrides,
});
const chefDivision = user("chef_division", { direction, division });
const chefService = user("chef_service", { direction, division, service });
const chefServiceDgs = user("chef_service", { service: serviceDgs });
const convention = (rattachement = division, responsableProjet = service) => ({
  rattachement, responsableProjet,
});

test("filtrePerimetre décrit le périmètre valide de la division et ses services", () => {
  assert.deepEqual(filtrePerimetre(chefDivision, reference), {
    type: "division", rattachement: division, services: [service, serviceVoisin],
  });
});

test("filtrePerimetre refuse une division absente, incohérente ou inconnue", () => {
  for (const candidate of [
    user("chef_division", { direction, division: null }),
    user("chef_division", { direction: null, division }),
    user("chef_division", { direction: "Direction inconnue", division }),
    user("chef_division", { direction, division: "Division inconnue" }),
    user("role_inconnu"),
  ]) {
    assert.deepEqual(filtrePerimetre(candidate, reference), { type: "refuse" });
  }
  assert.deepEqual(filtrePerimetre(user("admin"), reference), { type: "global" });
  assert.deepEqual(filtrePerimetre(user("directeur"), reference), { type: "global" });
  assert.deepEqual(filtrePerimetre(user("directeur_general_services"), reference), { type: "global" });
});

test("filtrePerimetre limite une division sans service aux conventions sans responsable", () => {
  const referenceSansServices = {
    ...reference,
    organisation: [{ ...reference.organisation[0], divisions: [{ id: 3, nom: "Division vide", services: [] }] }],
  };
  assert.deepEqual(
    filtrePerimetre(user("chef_division", { direction, division: "Division vide" }), referenceSansServices),
    { type: "division", rattachement: "Division vide", services: [] },
  );
});

test("filtrePerimetre exige le service et reconnaît un rattachement direct à la DGS", () => {
  assert.deepEqual(
    filtrePerimetre(user("chef_service", { direction, division, service }), reference),
    { type: "service", rattachement: division, service },
  );
  assert.deepEqual(filtrePerimetre(user("chef_service", { direction, division }), reference), { type: "refuse" });
  assert.deepEqual(filtrePerimetre(chefServiceDgs, reference), {
    type: "service", rattachement: DIRECTION_GENERALE_SERVICES, service: serviceDgs,
  });
  assert.deepEqual(
    filtrePerimetre(user("chef_service", { direction, division: null, service }), reference),
    { type: "refuse" },
  );
});

test("accessible applique les limites de division et tolère un responsable non encore affecté", () => {
  assert.equal(accessible(convention(), chefDivision, reference), true);
  assert.equal(accessible(convention(division, null), chefDivision, reference), true);
  assert.equal(accessible(convention(division, serviceVoisin), chefDivision, reference), true);
  assert.equal(accessible(convention("Division B", "Service B"), chefDivision, reference), false);
  assert.equal(accessible(convention(division, "Service inconnu"), chefDivision, reference), false);
  assert.equal(accessible(convention(), user("chef_division", { direction, division: null }), reference), false);
});

test("accessible conserve l'accès global des directeurs et de l'administration", () => {
  const conventionHistorique = convention(null, "Service inconnu");
  assert.equal(accessible(conventionHistorique, user("admin"), reference), true);
  assert.equal(accessible(conventionHistorique, user("directeur"), reference), true);
  assert.equal(accessible(conventionHistorique, user("directeur_general_services"), reference), true);
});

test("accessible refuse un chef de service sans service ou avec un périmètre incohérent", () => {
  assert.equal(accessible(convention(), chefService, reference), true);
  assert.equal(accessible(convention(division, serviceVoisin), chefService, reference), false);
  assert.equal(accessible(convention("Division B", service), chefService, reference), false);
  assert.equal(accessible(convention(), user("chef_service", { direction, division, service: null }), reference), false);
  assert.equal(accessible(convention(), user("chef_service", { direction, division: null, service }), reference), false);
  assert.equal(accessible(convention(), user("role_inconnu"), reference), false);
});

test("accessible reconnaît les services DGS uniquement dans le périmètre DGS", () => {
  assert.equal(
    accessible(convention(DIRECTION_GENERALE_SERVICES, serviceDgs), chefServiceDgs, reference),
    true,
  );
  assert.equal(
    accessible(convention(DIRECTION_GENERALE_SERVICES, "Service inconnu"), chefServiceDgs, reference),
    false,
  );
  assert.equal(accessible(convention(division, serviceDgs), chefServiceDgs, reference), false);
  assert.equal(
    accessible(convention(DIRECTION_GENERALE_SERVICES, serviceDgs),
      user("chef_service", { direction, division, service: serviceDgs }), reference),
    false,
  );
});

test("affectationsValides vérifie les chefs de division, y compris service null", () => {
  assert.equal(affectationsValides(division, service, chefDivision, reference), true);
  assert.equal(affectationsValides(division, null, chefDivision, reference), true);
  assert.equal(affectationsValides(division, serviceVoisin, chefDivision, reference), true);
  assert.equal(affectationsValides("Division B", "Service B", chefDivision, reference), false);
  assert.equal(affectationsValides(division, "Service inconnu", chefDivision, reference), false);
  assert.equal(affectationsValides(null, service, chefDivision, reference), false);
  assert.equal(affectationsValides(division, service,
    user("chef_division", { direction: null, division }), reference), false);
});

test("affectationsValides exige le rattachement et le service exacts du chef de service", () => {
  assert.equal(affectationsValides(division, service, chefService, reference), true);
  assert.equal(affectationsValides(division, serviceVoisin, chefService, reference), false);
  assert.equal(affectationsValides(null, service, chefService, reference), false);
  assert.equal(affectationsValides(division, null, chefService, reference), false);
  assert.equal(affectationsValides(division, service,
    user("chef_service", { direction, division, service: null }), reference), false);
  assert.equal(affectationsValides(division, service,
    user("chef_service", { direction, division: null, service }), reference), false);
});

test("affectationsValides accepte uniquement les rattachements DGS connus", () => {
  assert.equal(
    affectationsValides(DIRECTION_GENERALE_SERVICES, serviceDgs, chefServiceDgs, reference),
    true,
  );
  assert.equal(
    affectationsValides(DIRECTION_GENERALE_SERVICES, "Service inconnu", chefServiceDgs, reference),
    false,
  );
  assert.equal(
    affectationsValides(DIRECTION_GENERALE_SERVICES, serviceDgs,
      user("chef_service", { direction, division, service: serviceDgs }), reference),
    false,
  );
});

test("affectationsValides applique les règles des administrateurs et refuse les autres rôles", () => {
  const admin = user("admin");
  assert.equal(affectationsValides(null, null, admin, reference), true);
  assert.equal(affectationsValides(division, null, admin, reference), true);
  assert.equal(affectationsValides(null, service, admin, reference), false);
  assert.equal(affectationsValides(division, service, admin, reference), true);
  assert.equal(affectationsValides(division, "Service inconnu", admin, reference), false);
  assert.equal(affectationsValides(DIRECTION_GENERALE_SERVICES, serviceDgs, admin, reference), true);
  assert.equal(affectationsValides(division, service, user("role_inconnu"), reference), false);
});
