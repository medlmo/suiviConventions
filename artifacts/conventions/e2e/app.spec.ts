import { expect, test } from "@playwright/test";

const adminPassword = process.env.E2E_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error("Le mot de passe de test est fourni par e2e/run.mjs.");
}

async function signIn(page: import("@playwright/test").Page) {
  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.locator("#password").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Pilotage des Conventions" })).toBeVisible();
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
