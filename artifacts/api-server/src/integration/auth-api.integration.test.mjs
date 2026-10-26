import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

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

test("les routes d'authentification créent, valident et révoquent une session en base", {
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

    const currentSession = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie },
    });
    assert.equal(currentSession.status, 200);
    assert.equal((await currentSession.json()).username, "admin");

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
