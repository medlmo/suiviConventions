import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const adminPassword = process.env.E2E_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error("Le mot de passe de test est fourni par e2e/run.mjs.");
}
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error("E2E_BASE_URL est défini par e2e/run.mjs.");
}
const origin = new URL(baseURL).origin;
const fixturePassword = "E2e-Scoped-user-42!";
const apiRequire = createRequire(new URL("../../api-server/package.json", import.meta.url));
const ExcelJS = apiRequire("exceljs") as {
  Workbook: new () => {
    xlsx: { load(buffer: Buffer): Promise<void> };
    getWorksheet(name: string): {
      eachRow(callback: (row: { getCell(index: number): { value: unknown } }, rowNumber: number) => void): void;
    } | undefined;
  };
};

async function signIn(
  page: import("@playwright/test").Page,
  username = "admin",
  password = adminPassword,
) {
  await page.getByLabel("Nom d'utilisateur").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Pilotage des Conventions" })).toBeVisible();
}

async function postAsCurrentUser(
  page: import("@playwright/test").Page,
  path: string,
  data: Record<string, unknown>,
) {
  return page.request.post(new URL(`/api${path}`, baseURL).toString(), {
    data,
    headers: { origin },
  });
}

async function createPermissionFixtures(
  page: import("@playwright/test").Page,
  role: "chef_service" | "directeur",
) {
  await page.goto("/");
  await signIn(page);

  const suffix = `${Date.now()}-${role}`;
  const ownTitle = `E2E périmètre autorisé ${suffix}`;
  const outsideTitle = `E2E autre périmètre ${suffix}`;
  const session = new Date().toISOString().slice(0, 10);
  const dgsScope = "Direction Générale des Services";
  const direction = "Direction des Affaires Financières, Territoriales et des Ressources";
  const division = "Division des Ressources Humaines et des Moyens Généraux";

  const ownResponse = await postAsCurrentUser(page, "/conventions", {
    nomConvention: ownTitle,
    rattachement: dgsScope,
    responsableProjet: "Service Coopération",
    session,
  });
  const ownBody = await ownResponse.json();
  expect(ownResponse.status(), JSON.stringify(ownBody)).toBe(201);

  const outsideResponse = await postAsCurrentUser(page, "/conventions", {
    nomConvention: outsideTitle,
    rattachement: division,
    responsableProjet: "Service des Moyens Généraux",
    session,
  });
  const outsideBody = await outsideResponse.json();
  expect(outsideResponse.status(), JSON.stringify(outsideBody)).toBe(201);

  const username = `e2e-${role}-${suffix}`;
  const profile = role === "chef_service"
    ? { role, service: "Service Coopération" }
    : { role, direction };
  const accountResponse = await postAsCurrentUser(page, "/admin/users", {
    username,
    password: fixturePassword,
    ...profile,
  });
  const accountBody = await accountResponse.json();
  expect(accountResponse.status(), JSON.stringify(accountBody)).toBe(201);

  return {
    username,
    ownTitle,
    ownId: ownBody.id as number,
    outsideTitle,
    outsideId: outsideBody.id as number,
    outsideAssignment: { rattachement: division, responsableProjet: "Service des Moyens Généraux" },
  };
}

async function exportTitles(page: import("@playwright/test").Page): Promise<string[]> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Excel (.xlsx)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^conventions-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(filePath!));
  const sheet = workbook.getWorksheet("Conventions");
  expect(sheet).toBeTruthy();

  const titles: string[] = [];
  sheet!.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && typeof row.getCell(1).value === "string") {
      titles.push(row.getCell(1).value as string);
    }
  });
  return titles;
}

test("une page protégée affiche une erreur de connexion puis refuse les mauvais identifiants", async ({ page }) => {
  await page.goto("/conventions");
  await expect(page.getByRole("heading", { name: "Bienvenue." })).toBeVisible();

  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("alert")).toHaveText("Identifiant ou mot de passe incorrect.");
  await expect(page.getByRole("heading", { name: "Bienvenue." })).toBeVisible();
});

test("un administrateur crée une convention, la retrouve et se déconnecte", async ({ page }) => {
  const initialTitle = `اختبار آلي ${Date.now()}`;
  const updatedTitle = `${initialTitle} — modifiée`;

  await page.goto("/");
  await signIn(page);
  await page.getByRole("link", { name: "Toutes les conventions" }).click();
  await expect(page.getByRole("heading", { name: /^Conventions \(/ })).toBeVisible();
  await page.getByRole("link", { name: "Nouvelle Convention", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle Convention", exact: true })).toBeVisible();

  await page.locator('textarea[name="nomConvention"]').fill(initialTitle);
  await page.getByTestId("select-rattachement").click();
  await page.getByRole("option", { name: "Direction Générale des Services" }).click();
  await page.getByTestId("select-responsable-projet").click();
  await page.getByRole("option", { name: "Service Coopération" }).click();
  await page.locator('input[name="session"]').fill("2026-01-15");

  await page.getByRole("button", { name: "Créer la convention" }).click();
  await expect(page).toHaveURL(/\/conventions\/\d+$/);
  await expect(page.getByRole("heading", { name: "Fiche Convention" })).toBeVisible();
  await expect(page.locator('textarea[name="nomConvention"]')).toHaveValue(initialTitle);

  await page.locator('textarea[name="nomConvention"]').fill(updatedTitle);
  await page.locator("form").getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Convention mise à jour", { exact: true })).toBeVisible();
  await expect(page.locator('textarea[name="nomConvention"]')).toHaveValue(updatedTitle);

  await page.getByRole("link", { name: "Toutes les conventions" }).click();
  await expect(page.getByTitle(updatedTitle)).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue." })).toBeVisible();
});

test("le tableau de bord et la liste restent consultables sur mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Pilotage des Conventions" })).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);

  await page.locator("header").getByRole("button").first().click();
  await page.getByRole("link", { name: "Toutes les conventions" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Conventions \(/ })).toBeVisible();
});

test("un chef de service reste limité à son périmètre dans la liste, les fiches et l’export", async ({ page }) => {
  const fixtures = await createPermissionFixtures(page, "chef_service");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue." })).toBeVisible();
  await page.goto("/");
  await signIn(page, fixtures.username, fixturePassword);
  await page.goto("/conventions");

  await expect(page.getByTitle(fixtures.ownTitle)).toBeVisible();
  await expect(page.getByTitle(fixtures.outsideTitle)).toHaveCount(0);

  await page.goto(`/conventions/${fixtures.outsideId}`);
  await expect(page.getByText("Cette convention est introuvable.", { exact: true })).toBeVisible();

  const deniedCreation = await postAsCurrentUser(page, "/conventions", {
    nomConvention: `E2E création refusée ${Date.now()}`,
    ...fixtures.outsideAssignment,
    session: new Date().toISOString().slice(0, 10),
  });
  expect(deniedCreation.status()).toBe(403);

  await page.goto("/conventions");
  const titles = await exportTitles(page);
  expect(titles).toContain(fixtures.ownTitle);
  expect(titles).not.toContain(fixtures.outsideTitle);
});

test("un directeur peut lire et exporter tout le portefeuille sans pouvoir créer", async ({ page }) => {
  const fixtures = await createPermissionFixtures(page, "directeur");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue." })).toBeVisible();
  await page.goto("/");
  await signIn(page, fixtures.username, fixturePassword);
  await page.goto("/conventions");

  await expect(page.getByTitle(fixtures.ownTitle)).toBeVisible();
  await expect(page.getByTitle(fixtures.outsideTitle)).toBeVisible();
  await expect(page.getByRole("link", { name: "Nouvelle Convention", exact: true })).toHaveCount(0);

  const deniedCreation = await postAsCurrentUser(page, "/conventions", {
    nomConvention: `E2E création directeur refusée ${Date.now()}`,
    rattachement: fixtures.outsideAssignment.rattachement,
    responsableProjet: fixtures.outsideAssignment.responsableProjet,
    session: new Date().toISOString().slice(0, 10),
  });
  expect(deniedCreation.status()).toBe(403);

  const titles = await exportTitles(page);
  expect(titles).toContain(fixtures.ownTitle);
  expect(titles).toContain(fixtures.outsideTitle);
});
