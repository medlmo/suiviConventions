import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import yauzl from "yauzl";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(packageDir, "../..");
const fixturePassword = "integration-password-not-for-use";
const startupTimeoutMs = 20_000;

let temporaryDirectory;
let databaseDirectory;
let socketDirectory;
let databaseUrl;

function isolatedEnvironment(overrides = {}) {
  const environment = {};
  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP"]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return { ...environment, ...overrides };
}

function run(command, args, options = {}) {
  const { env, ...execOptions } = options;
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...execOptions,
    env: isolatedEnvironment(env),
  });
}

function insertUnattachedHistoricalConvention(name, responsableProjet) {
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const query = `INSERT INTO conventions (nom_convention, rattachement, responsable_projet) VALUES (${literal(name)}, NULL, ${literal(responsableProjet)}) RETURNING id`;
  const output = run("psql", [
    "--no-psqlrc",
    "-qAt",
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ]);
  return { id: Number(output.trim()), nomConvention: name };
}

function insertConventionForFiche() {
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const nomConvention = "Fiche technique — suivi financier et physique";
  const suiviFinancier = JSON.stringify({
    annees: [2025, 2026],
    lignes: [{
      partenaire: "Partenaire de test",
      contributions: [
        { annee: 2025, montant: 1250.5 },
        { annee: 2026, montant: 2000 },
      ],
    }],
  });
  const avancement = JSON.stringify([
    {
      id: "constat-initial",
      dateConstat: "2025-04-15",
      taux: 32.5,
      commentaire: "Démarrage des travaux",
      enregistreLe: "2025-04-15T11:30:00.000Z",
      auteur: "Chef de projet",
    },
    {
      id: "constat-revise",
      dateConstat: "2026-03-12",
      taux: 28.75,
      commentaire: "Réestimation après contrôle",
      enregistreLe: "2026-03-12T13:10:00.000Z",
      auteur: "Direction technique",
    },
  ]);
  const situationVersements = JSON.stringify([
    {
      annee: 2025,
      montantProgramme: 10000,
      montantVerse: 7500,
      tranches: [
        { montant: 5000, dateVersement: "2025-03-08" },
        { montant: 2500, dateVersement: "2025-10-12" },
      ],
    },
    {
      annee: 2026,
      montantProgramme: 8000,
      montantVerse: 2500,
      tranches: [
        { montant: 1000, dateVersement: "2026-01-15" },
        { montant: 1500, dateVersement: "2026-06-30" },
      ],
    },
  ]);
  const query = `
    INSERT INTO conventions (
      nom_convention, nature, suivi_financier, avancement_physique_historique, situation_versements
    )
    VALUES (
      ${literal(nomConvention)},
      'Infrastructure',
      ${literal(suiviFinancier)}::jsonb,
      ${literal(avancement)}::jsonb,
      ${literal(situationVersements)}::jsonb
    )
    RETURNING id
  `;
  const output = run("psql", [
    "--no-psqlrc", "-qAt", databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", query,
  ]);
  return { id: Number(output.trim()), nomConvention };
}

function lireXmlDocumentWord(fichier) {
  return new Promise((resolveXml, reject) => {
    yauzl.fromBuffer(fichier, { lazyEntries: true }, (erreur, archive) => {
      if (erreur || !archive) {
        reject(erreur ?? new Error("Le document Word n'est pas une archive ZIP valide."));
        return;
      }
      archive.on("error", reject);
      archive.on("entry", entree => {
        if (entree.fileName !== "word/document.xml") {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entree, (erreurFlux, flux) => {
          if (erreurFlux || !flux) {
            reject(erreurFlux ?? new Error("Le contenu Word ne peut pas être lu."));
            archive.close();
            return;
          }
          const morceaux = [];
          flux.on("data", morceau => morceaux.push(morceau));
          flux.on("error", reject);
          flux.on("end", () => {
            archive.close();
            resolveXml(Buffer.concat(morceaux).toString("utf8"));
          });
        });
      });
      archive.readEntry();
    });
  });
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { port } = address;
  await new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
  });
  return port;
}

async function apiRequest(baseUrl, path, { cookie, origin, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function loginAs(baseUrl, origin, username) {
  const response = await apiRequest(baseUrl, "/auth/login", {
    origin,
    method: "POST",
    body: { username, password: fixturePassword },
  });
  assert.equal(response.status, 200, `la connexion de ${username} doit réussir`);
  const cookieHeader = response.headers.getSetCookie()
    .find(cookie => cookie.startsWith("region_session="));
  assert.ok(cookieHeader, `la connexion de ${username} doit émettre le cookie de session`);
  return cookieHeader.split(";", 1)[0];
}

async function assertAccountAdminRequired(baseUrl, origin, cookie, expectedStatus) {
  const requests = [
    { path: "/admin/users", method: "GET" },
    {
      path: "/admin/users",
      method: "POST",
      body: { username: "unauthorized-account", password: fixturePassword, role: "directeur_general_services" },
    },
    { path: "/admin/users/999999", method: "PATCH", body: { username: "unauthorized-update" } },
    { path: "/admin/users/999999", method: "DELETE" },
    { path: "/admin/users/999999/password", method: "POST", body: { password: fixturePassword } },
  ];
  for (const request of requests) {
    const response = await apiRequest(baseUrl, request.path, {
      cookie,
      origin,
      method: request.method,
      body: request.body,
    });
    assert.equal(response.status, expectedStatus, `${request.method} ${request.path} doit refuser l'accès`);
  }
}

async function createConvention(baseUrl, cookie, origin, body) {
  const response = await apiRequest(baseUrl, "/conventions", {
    cookie,
    origin,
    method: "POST",
    body,
  });
  assert.equal(response.status, 201, `la convention « ${body.nomConvention} » doit être créée`);
  return response.json();
}

function assertConventionNames(payload, expectedNames, message) {
  assert.deepEqual(
    payload.items.map(item => item.nomConvention).sort(),
    [...expectedNames].sort(),
    message,
  );
}

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "conventions-api-integration-"));
  databaseDirectory = join(temporaryDirectory, "postgres-data");
  socketDirectory = join(temporaryDirectory, "socket");
  mkdirSync(socketDirectory);

  run("initdb", [
    "-D", databaseDirectory,
    "--auth=trust",
    "--no-sync",
  ]);
  run("pg_ctl", [
    "-D", databaseDirectory,
    "-l", join(temporaryDirectory, "postgres.log"),
    "-o", `-c listen_addresses='' -c unix_socket_directories=${socketDirectory}`,
    "-w", "start",
  ]);

  const databaseUser = process.env.USER || "runner";
  databaseUrl = `postgresql:///postgres?host=${encodeURIComponent(socketDirectory)}&user=${encodeURIComponent(databaseUser)}`;

  // The database is a fresh local cluster under this test's temporary directory.
  run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    env: { DATABASE_URL: databaseUrl },
  });
});

after(() => {
  if (databaseDirectory) {
    try {
      run("pg_ctl", ["-D", databaseDirectory, "-m", "fast", "-w", "stop"]);
    } catch {
      // Still remove the temporary cluster if startup or shutdown failed.
    }
  }
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("les sessions et les périmètres de conventions sont vérifiés en base", {
  timeout: 45_000,
}, async () => {
  const port = await findAvailablePort();
  const serverProcess = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: packageDir,
    env: isolatedEnvironment({
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: "test",
      ADMIN_BOOTSTRAP_PASSWORD: fixturePassword,
      INITIAL_ADMIN_PASSWORD: "",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  serverProcess.stdout.setEncoding("utf8").on("data", chunk => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding("utf8").on("data", chunk => { serverOutput += chunk; });

  const baseUrl = `http://127.0.0.1:${port}/api`;
  let serverReady = false;
  const deadline = Date.now() + startupTimeoutMs;
  try {
    while (Date.now() < deadline) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`L’API s’est arrêtée au démarrage.\n${serverOutput}`);
      }
      try {
        const response = await fetch(`${baseUrl}/healthz`);
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Retry until the server is listening or the deadline expires.
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
    }
    assert.ok(serverReady, `L’API n’a pas démarré à temps.\n${serverOutput}`);

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("cache-control"), "no-store");

    const unauthenticated = await fetch(`${baseUrl}/auth/me`);
    assert.equal(unauthenticated.status, 401);

    const forbiddenOrigin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: fixturePassword }),
    });
    assert.equal(forbiddenOrigin.status, 403);

    const origin = `http://127.0.0.1:${port}`;
    await assertAccountAdminRequired(baseUrl, origin, undefined, 401);

    const invalidPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "incorrect-password" }),
    });
    assert.equal(invalidPassword.status, 401);

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: fixturePassword }),
    });
    assert.equal(login.status, 200);
    const user = await login.json();
    assert.equal(user.username, "admin");
    assert.equal(user.role, "admin");
    assert.equal(Object.hasOwn(user, "passwordHash"), false);

    const cookieHeader = login.headers.getSetCookie()
      .find(cookie => cookie.startsWith("region_session="));
    assert.ok(cookieHeader, "la connexion doit émettre le cookie de session");
    const cookie = cookieHeader.split(";", 1)[0];

    const conventionFiche = insertConventionForFiche();
    const ficheTechnique = await apiRequest(
      baseUrl,
      `/conventions/${conventionFiche.id}/fiche-technique`,
      { cookie },
    );
    assert.equal(ficheTechnique.status, 200);
    assert.match(
      ficheTechnique.headers.get("content-type") ?? "",
      /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
    );
    const contenuFiche = await lireXmlDocumentWord(Buffer.from(await ficheTechnique.arrayBuffer()));
    assert.ok(contenuFiche.includes("MONTAGE FINANCIER"), "le tableau financier reste présent dans la fiche");
    assert.ok(contenuFiche.includes("Partenaire de test"));
    assert.ok(contenuFiche.includes("1.250,50"), "le montant financier est rendu au format MAD");
    assert.ok(contenuFiche.includes("AVANCEMENT PHYSIQUE DU PROJET"));
    assert.ok(contenuFiche.includes("28,75"), "le taux le plus récent doit figurer dans la fiche");
    assert.ok(contenuFiche.includes("Réestimation après contrôle"));
    assert.ok(contenuFiche.includes("Direction technique"));
    assert.ok(contenuFiche.includes("SITUATION DES VERSEMENTS DE LA RÉGION SOUSS MASSA"));
    assert.ok(contenuFiche.includes("Total programmé"));
    assert.ok(contenuFiche.includes("Tranches de versement"));
    assert.ok(contenuFiche.includes("Total versé"));
    assert.ok(contenuFiche.includes("Taux de versement"));
    assert.ok(contenuFiche.includes("08/03/2025"));
    assert.ok(contenuFiche.includes("12/10/2025"));
    assert.ok(contenuFiche.includes("30/06/2026"));
    assert.ok(contenuFiche.includes("7.500,00"));
    assert.ok(contenuFiche.includes("75 %"));
    assert.ok(contenuFiche.includes("31,25 %"));
    assert.ok(
      contenuFiche.indexOf("12/03/2026") < contenuFiche.indexOf("15/04/2025"),
      "les constats doivent être présentés du plus récent au plus ancien",
    );

    const currentSession = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie },
    });
    assert.equal(currentSession.status, 200);
    assert.equal((await currentSession.json()).username, "admin");

    const direction = "Direction des Affaires Financières, Territoriales et des Ressources";
    const division = "Division des Ressources Humaines et des Moyens Généraux";
    const otherDivision = "Division des Affaires Financières, du Budget et de la Programmation";
    const otherDirectionDivision = "Division de l'Inclusion Sociale et Solidaire";
    const service = "Service de la Formation et du Développement des Compétences";
    const peerService = "Service des Moyens Généraux";
    const otherDivisionService = "Service du Budget et de la Comptabilité";
    const otherDirectionService = "Service de l'Économie Sociale et Solidaire";
    const dgsService = "Service Coopération";
    const roles = [
      {
        key: "chef_service",
        username: "chef-service-fixture",
        profile: { role: "chef_service", direction, division, service },
      },
      {
        key: "chef_division",
        username: "chef-division-fixture",
        profile: { role: "chef_division", direction, division },
      },
      {
        key: "directeur",
        username: "directeur-fixture",
        profile: { role: "directeur", direction },
      },
      {
        key: "directeur_general_services",
        username: "dgs-fixture",
        profile: { role: "directeur_general_services" },
      },
    ];
    const cookies = {};
    for (const account of roles) {
      const creation = await apiRequest(baseUrl, "/admin/users", {
        cookie,
        origin,
        method: "POST",
        body: {
          username: account.username,
          password: fixturePassword,
          ...account.profile,
        },
      });
      assert.equal(creation.status, 201, `le compte ${account.username} doit être créé`);
      cookies[account.key] = await loginAs(baseUrl, origin, account.username);
    }

    await assertAccountAdminRequired(baseUrl, origin, cookies.chef_service, 403);

    const managedAccount = await apiRequest(baseUrl, "/admin/users", {
      cookie,
      origin,
      method: "POST",
      body: {
        username: "admin-managed-account",
        password: fixturePassword,
        role: "directeur_general_services",
      },
    });
    assert.equal(managedAccount.status, 201, "l'administrateur peut créer un compte");
    const createdAccount = await managedAccount.json();
    assert.equal(createdAccount.username, "admin-managed-account");
    assert.equal(createdAccount.active, true);
    assert.equal(Object.hasOwn(createdAccount, "passwordHash"), false);

    const accountSession = await loginAs(baseUrl, origin, createdAccount.username);
    const persistedCreate = await apiRequest(baseUrl, "/admin/users", { cookie });
    assert.equal(persistedCreate.status, 200);
    const usersAfterCreate = await persistedCreate.json();
    assert.ok(
      usersAfterCreate.some(user => user.id === createdAccount.id && user.username === "admin-managed-account"),
      "le compte créé est enregistré en base",
    );

    const updateAccount = await apiRequest(baseUrl, `/admin/users/${createdAccount.id}`, {
      cookie,
      origin,
      method: "PATCH",
      body: { username: "admin-managed-account-renamed" },
    });
    assert.equal(updateAccount.status, 200, "l'administrateur peut modifier un compte");
    assert.equal((await updateAccount.json()).username, "admin-managed-account-renamed");

    const deactivateAccount = await apiRequest(baseUrl, `/admin/users/${createdAccount.id}`, {
      cookie,
      origin,
      method: "PATCH",
      body: { active: false },
    });
    assert.equal(deactivateAccount.status, 200, "l'administrateur peut désactiver un compte");
    assert.equal((await deactivateAccount.json()).active, false);
    const usersAfterDeactivate = await apiRequest(baseUrl, "/admin/users", { cookie });
    assert.equal(usersAfterDeactivate.status, 200);
    const deactivatedUser = (await usersAfterDeactivate.json()).find(user => user.id === createdAccount.id);
    assert.equal(deactivatedUser?.username, "admin-managed-account-renamed");
    assert.equal(deactivatedUser?.active, false, "la désactivation est persistée");

    const disabledSession = await apiRequest(baseUrl, "/auth/me", { cookie: accountSession });
    assert.equal(disabledSession.status, 401, "la session d'un compte désactivé ne donne plus accès");

    const deleteAccount = await apiRequest(baseUrl, `/admin/users/${createdAccount.id}`, {
      cookie,
      origin,
      method: "DELETE",
    });
    assert.equal(deleteAccount.status, 204, "l'administrateur peut supprimer un compte");
    const usersAfterDelete = await apiRequest(baseUrl, "/admin/users", { cookie });
    assert.equal(usersAfterDelete.status, 200);
    assert.equal(
      (await usersAfterDelete.json()).some(user => user.id === createdAccount.id),
      false,
      "la suppression est persistée",
    );

    const ownService = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — service propre",
      rattachement: division,
      responsableProjet: service,
    });
    const peerServiceConvention = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — service voisin",
      rattachement: division,
      responsableProjet: peerService,
    });
    const divisionWithoutService = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — service non renseigné",
      rattachement: division,
    });
    const otherDivisionConvention = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — autre division",
      rattachement: otherDivision,
      responsableProjet: otherDivisionService,
    });
    const otherDirectionConvention = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — autre direction",
      rattachement: otherDirectionDivision,
      responsableProjet: otherDirectionService,
    });
    const dgsConvention = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — DGS",
      rattachement: "Direction Générale des Services",
      responsableProjet: dgsService,
    });
    const unattachedConvention = await createConvention(baseUrl, cookie, origin, {
      nomConvention: "Test périmètre — sans rattachement historique",
      rattachement: null,
      responsableProjet: null,
    });
    const unattachedHistoricalConvention = insertUnattachedHistoricalConvention(
      "Test périmètre — service connu sans rattachement",
      service,
    );

    const expectedAll = [
      ownService.nomConvention,
      peerServiceConvention.nomConvention,
      divisionWithoutService.nomConvention,
      otherDivisionConvention.nomConvention,
      otherDirectionConvention.nomConvention,
      dgsConvention.nomConvention,
      unattachedConvention.nomConvention,
      unattachedHistoricalConvention.nomConvention,
      conventionFiche.nomConvention,
    ];
    const chefServiceList = await apiRequest(baseUrl, "/conventions", {
      cookie: cookies.chef_service,
    });
    assert.equal(chefServiceList.status, 200);
    const chefServiceData = await chefServiceList.json();
    assertConventionNames(chefServiceData, [ownService.nomConvention], "le chef de service ne voit que son service");
    assert.equal(chefServiceData.total, 1);

    const chefServiceFilter = await apiRequest(
      baseUrl,
      `/conventions?rattachement=${encodeURIComponent(otherDivision)}&responsableProjet=${encodeURIComponent(otherDivisionService)}`,
      { cookie: cookies.chef_service },
    );
    assert.equal(chefServiceFilter.status, 200);
    assertConventionNames(await chefServiceFilter.json(), [], "un filtre hors périmètre ne doit pas élargir la liste");
    const chefServiceOtherId = await apiRequest(baseUrl, `/conventions/${peerServiceConvention.id}`, {
      cookie: cookies.chef_service,
    });
    assert.equal(chefServiceOtherId.status, 404, "un identifiant voisin ne donne pas accès à une autre convention");
    const chefServiceUnattachedId = await apiRequest(baseUrl, `/conventions/${unattachedConvention.id}`, {
      cookie: cookies.chef_service,
    });
    assert.equal(chefServiceUnattachedId.status, 404, "une convention sans rattachement n'est pas attribuée au service");
    const chefServiceHistoricalId = await apiRequest(
      baseUrl,
      `/conventions/${unattachedHistoricalConvention.id}`,
      { cookie: cookies.chef_service },
    );
    assert.equal(chefServiceHistoricalId.status, 404, "le service historique seul ne rattache pas implicitement la convention");

    const chefDivisionList = await apiRequest(baseUrl, "/conventions", {
      cookie: cookies.chef_division,
    });
    assert.equal(chefDivisionList.status, 200);
    const chefDivisionData = await chefDivisionList.json();
    assertConventionNames(
      chefDivisionData,
      [ownService.nomConvention, peerServiceConvention.nomConvention, divisionWithoutService.nomConvention],
      "le chef de division voit les services de sa division, pas les autres rattachements",
    );
    const chefDivisionFilter = await apiRequest(
      baseUrl,
      `/conventions?rattachement=${encodeURIComponent(otherDivision)}`,
      { cookie: cookies.chef_division },
    );
    assert.equal(chefDivisionFilter.status, 200);
    assertConventionNames(await chefDivisionFilter.json(), [], "un filtre explicite ne doit pas outrepasser le périmètre de division");
    const chefDivisionOtherId = await apiRequest(baseUrl, `/conventions/${otherDivisionConvention.id}`, {
      cookie: cookies.chef_division,
    });
    assert.equal(chefDivisionOtherId.status, 404);
    const chefDivisionUnattachedId = await apiRequest(baseUrl, `/conventions/${unattachedConvention.id}`, {
      cookie: cookies.chef_division,
    });
    assert.equal(chefDivisionUnattachedId.status, 404, "une convention sans rattachement n'est pas attribuée à la division");
    const chefDivisionHistoricalId = await apiRequest(
      baseUrl,
      `/conventions/${unattachedHistoricalConvention.id}`,
      { cookie: cookies.chef_division },
    );
    assert.equal(chefDivisionHistoricalId.status, 404, "un service historique sans rattachement ne donne pas accès à la convention");

    for (const role of ["directeur", "directeur_general_services"]) {
      const response = await apiRequest(baseUrl, "/conventions", { cookie: cookies[role] });
      assert.equal(response.status, 200);
      assertConventionNames(await response.json(), expectedAll, `${role} conserve la lecture transversale, y compris sans rattachement`);
    }

    const chefServiceUpdate = await apiRequest(baseUrl, `/conventions/${ownService.id}`, {
      cookie: cookies.chef_service,
      origin,
      method: "PATCH",
      body: { version: ownService.version, nomConvention: "Test périmètre — service modifié" },
    });
    assert.equal(chefServiceUpdate.status, 200, "le chef de service peut modifier une convention de son service");
    const chefServiceEscalation = await apiRequest(baseUrl, `/conventions/${ownService.id}`, {
      cookie: cookies.chef_service,
      origin,
      method: "PATCH",
      body: { version: ownService.version + 1, responsableProjet: peerService },
    });
    assert.equal(chefServiceEscalation.status, 403, "le chef de service ne peut pas réaffecter une convention à un service voisin");
    const chefServiceUpdateOther = await apiRequest(baseUrl, `/conventions/${peerServiceConvention.id}`, {
      cookie: cookies.chef_service,
      origin,
      method: "PATCH",
      body: { version: peerServiceConvention.version, nomConvention: "Modification hors service" },
    });
    assert.equal(chefServiceUpdateOther.status, 404);
    const chefServiceDeleteOther = await apiRequest(
      baseUrl,
      `/conventions/${peerServiceConvention.id}?version=${peerServiceConvention.version}`,
      { cookie: cookies.chef_service, origin, method: "DELETE" },
    );
    assert.equal(chefServiceDeleteOther.status, 404);
    const chefServiceCreate = await createConvention(baseUrl, cookies.chef_service, origin, {
      nomConvention: "Test périmètre — création du service",
    });
    assert.equal(chefServiceCreate.rattachement, division);
    assert.equal(chefServiceCreate.responsableProjet, service);
    const chefServiceCreateOther = await apiRequest(baseUrl, "/conventions", {
      cookie: cookies.chef_service,
      origin,
      method: "POST",
      body: {
        nomConvention: "Test périmètre — création interdite",
        rattachement: division,
        responsableProjet: peerService,
      },
    });
    assert.equal(chefServiceCreateOther.status, 403);

    const chefDivisionUpdateOther = await apiRequest(baseUrl, `/conventions/${otherDivisionConvention.id}`, {
      cookie: cookies.chef_division,
      origin,
      method: "PATCH",
      body: {
        version: otherDivisionConvention.version,
        rattachement: division,
        responsableProjet: service,
      },
    });
    assert.equal(chefDivisionUpdateOther.status, 404, "un identifiant hors division reste inaccessible même si le corps demande une réaffectation locale");
    const chefDivisionEscalation = await apiRequest(baseUrl, `/conventions/${peerServiceConvention.id}`, {
      cookie: cookies.chef_division,
      origin,
      method: "PATCH",
      body: {
        version: peerServiceConvention.version,
        rattachement: otherDivision,
        responsableProjet: otherDivisionService,
      },
    });
    assert.equal(chefDivisionEscalation.status, 403, "le chef de division ne peut pas déplacer une convention hors de sa division");
    const chefDivisionUpdate = await apiRequest(baseUrl, `/conventions/${peerServiceConvention.id}`, {
      cookie: cookies.chef_division,
      origin,
      method: "PATCH",
      body: { version: peerServiceConvention.version, nomConvention: "Test périmètre — division modifiée" },
    });
    assert.equal(chefDivisionUpdate.status, 200, "le chef de division peut modifier une convention de sa division");
    const chefDivisionCreate = await createConvention(baseUrl, cookies.chef_division, origin, {
      nomConvention: "Test périmètre — création de division",
      responsableProjet: peerService,
    });
    assert.equal(chefDivisionCreate.rattachement, division);
    const chefDivisionCreateOther = await apiRequest(baseUrl, "/conventions", {
      cookie: cookies.chef_division,
      origin,
      method: "POST",
      body: {
        nomConvention: "Test périmètre — création hors division",
        rattachement: otherDivision,
        responsableProjet: otherDivisionService,
      },
    });
    assert.equal(chefDivisionCreateOther.status, 403);
    const chefDivisionDeleteOther = await apiRequest(
      baseUrl,
      `/conventions/${otherDivisionConvention.id}?version=${otherDivisionConvention.version}`,
      { cookie: cookies.chef_division, origin, method: "DELETE" },
    );
    assert.equal(chefDivisionDeleteOther.status, 404);

    for (const role of ["directeur", "directeur_general_services"]) {
      const deniedCreate = await apiRequest(baseUrl, "/conventions", {
        cookie: cookies[role],
        origin,
        method: "POST",
        body: { nomConvention: `Test périmètre — création interdite ${role}` },
      });
      assert.equal(deniedCreate.status, 403, `${role} ne peut pas créer de convention`);
      const deniedUpdate = await apiRequest(baseUrl, `/conventions/${ownService.id}`, {
        cookie: cookies[role],
        origin,
        method: "PATCH",
        body: { version: ownService.version + 1 },
      });
      assert.equal(deniedUpdate.status, 403, `${role} ne peut pas modifier de convention`);
      const deniedDelete = await apiRequest(
        baseUrl,
        `/conventions/${ownService.id}?version=${ownService.version + 1}`,
        { cookie: cookies[role], origin, method: "DELETE" },
      );
      assert.equal(deniedDelete.status, 403, `${role} ne peut pas supprimer de convention`);
    }
    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { origin, cookie },
    });
    assert.equal(logout.status, 204);

    const revokedSession = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie },
    });
    assert.equal(revokedSession.status, 401);
  } finally {
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await Promise.race([
        new Promise(resolveExit => serverProcess.once("exit", resolveExit)),
        new Promise(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
    }
  }
});
