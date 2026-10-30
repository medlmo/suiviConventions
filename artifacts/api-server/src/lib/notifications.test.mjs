import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import {
  changementsNotification,
  estDestinataire,
  resumeNotification,
} from "./notifications-domain.ts";

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
const chefService = { id: 1, role: "chef_service", active: true, direction, division, service };
const chefDivision = { id: 2, role: "chef_division", active: true, direction, division, service: null };
const chefServiceVoisin = { id: 3, role: "chef_service", active: true, direction, division, service: serviceVoisin };
const directeur = { id: 4, role: "directeur", active: true, direction, division: null, service: null };
const dgs = { id: 5, role: "directeur_general_services", active: true, direction: null, division: null, service: null };
const admin = { id: 6, role: "admin", active: true, direction: null, division: null, service: null };
const convention = {
  id: 10, rattachement: division, responsableProjet: service, nomConvention: "Convention A",
  enveloppeBudgetaire: "100.00", contributionRegion: null, partenaires: ["A", "B"],
};

test("une création est identifiée comme telle sans inventer de champs modifiés", () => {
  assert.deepEqual(changementsNotification(null, convention), { kind: "creation", changedFields: [] });
  assert.equal(resumeNotification("creation", [], 1), "Nouvelle convention créée.");
});

test("une correction de commentaire reste mineure et nomme le champ", () => {
  const result = changementsNotification(convention, { ...convention, commentaires: "Note révisée" });
  assert.deepEqual(result, { kind: "minor", changedFields: ["Commentaires"] });
});

test("un changement de statut est important", () => {
  const result = changementsNotification(convention, { ...convention, statutConvention: "Suspendue" });
  assert.deepEqual(result, { kind: "important", changedFields: ["Statut"] });
});

test("une variation de budget est importante", () => {
  assert.equal(
    changementsNotification(convention, { ...convention, enveloppeBudgetaire: "101.00" }).kind,
    "important",
  );
});

test("une réorganisation des listes de partenaires n'est pas un changement", () => {
  assert.deepEqual(
    changementsNotification(convention, { ...convention, partenaires: ["B", "A"] }),
    { kind: "minor", changedFields: [] },
  );
});

test("une nouvelle liste de partenaires est importante", () => {
  assert.deepEqual(
    changementsNotification(convention, { ...convention, partenaires: ["A", "C"] }),
    { kind: "important", changedFields: ["Partenaires"] },
  );
});

test("une division avertit le service concerné et le directeur de sa direction", () => {
  assert.equal(estDestinataire(chefService, chefDivision, convention, reference), true);
  assert.equal(estDestinataire(directeur, chefDivision, convention, reference), true);
  assert.equal(estDestinataire(chefDivision, chefDivision, convention, reference), false);
  assert.equal(estDestinataire(chefServiceVoisin, chefDivision, convention, reference), false);
});

test("un chef de service avertit sa division, mais pas les autres services", () => {
  assert.equal(estDestinataire(chefDivision, chefService, convention, reference), true);
  assert.equal(estDestinataire(chefServiceVoisin, chefService, convention, reference), false);
  assert.equal(estDestinataire(directeur, chefService, convention, reference), false);
});

test("un service directement rattaché à la DGS avertit la DGS", () => {
  const conventionDgs = { ...convention, rattachement: DIRECTION_GENERALE_SERVICES, responsableProjet: serviceDgs };
  const chefServiceDgs = { ...chefService, id: 7, direction: null, division: null, service: serviceDgs };
  assert.equal(estDestinataire(dgs, chefServiceDgs, conventionDgs, reference), true);
  assert.equal(estDestinataire(chefDivision, chefServiceDgs, conventionDgs, reference), false);
});

test("une correction par l'administration avertit les responsables du rattachement", () => {
  assert.equal(estDestinataire(chefDivision, admin, convention, reference), true);
  assert.equal(estDestinataire(chefService, admin, convention, reference), true);
  assert.equal(estDestinataire(directeur, admin, convention, reference), false);
});

test("un compte inactif ou l'auteur ne reçoit pas de notification", () => {
  assert.equal(estDestinataire({ ...chefDivision, active: false }, chefService, convention, reference), false);
  assert.equal(estDestinataire(chefService, chefService, convention, reference), false);
});

test("les résumés de regroupement indiquent le nombre et limitent les champs", () => {
  assert.equal(
    resumeNotification("minor", ["Commentaire", "Objet"], 2),
    "2 enregistrements regroupés sur 10 minutes : Commentaire, Objet.",
  );
  assert.equal(
    resumeNotification("important", ["A", "B", "C", "D", "E", "F", "G"], 1),
    "Modification importante : A, B, C, D, E, F et 1 autre(s) champ(s).",
  );
});
