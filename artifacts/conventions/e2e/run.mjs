import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageDir, "../..");
const apiDir = join(workspaceRoot, "artifacts/api-server");
const startupTimeoutMs = 30_000;
const testPassword = "E2e-local-password-42!";
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "conventions-e2e-"));
const databaseDirectory = join(temporaryDirectory, "postgres-data");
const socketDirectory = join(temporaryDirectory, "postgres-socket");
mkdirSync(socketDirectory);

const inheritedEnvironment = {};
for (const key of [
  "HOME", "PATH", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR",
  "TMP", "TEMP", "NIX_PATH", "XDG_CACHE_HOME", "PLAYWRIGHT_BROWSERS_PATH",
]) {
  if (process.env[key] !== undefined) inheritedEnvironment[key] = process.env[key];
}

function environment(overrides = {}) {
  return { ...inheritedEnvironment, ...overrides };
}

function run(command, args, overrides = {}) {
  execFileSync(command, args, {
    cwd: workspaceRoot,
    env: environment(overrides),
    stdio: "inherit",
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Impossible de réserver un port pour les tests E2E.");
  }
  await new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
  });
  return address.port;
}

function startProcess(command, args, { cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: environment(env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.on("error", error => { output += `\n${error.message}`; });
  return { child, get output() { return output; } };
}

async function waitForHttp(url, processInfo, description) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`${description} s’est arrêté au démarrage.\n${processInfo.output}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is not ready yet.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
  }
  throw new Error(`${description} n’a pas démarré à temps.\n${processInfo.output}`);
}

async function stopProcess(processInfo) {
  if (!processInfo || processInfo.child.exitCode !== null) return;
  processInfo.child.kill("SIGTERM");
  const stopped = await new Promise(resolveStop => {
    const timeout = setTimeout(() => resolveStop(false), 5_000);
    processInfo.child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop(true);
    });
  });
  if (stopped) return;
  if (processInfo.child.exitCode === null) {
    processInfo.child.kill("SIGKILL");
    await once(processInfo.child, "exit");
  }
}

let apiProcess;
let webProcess;
let postgresStarted = false;

try {
  run("initdb", ["-D", databaseDirectory, "--auth=trust", "--no-sync"]);
  run("pg_ctl", [
    "-D", databaseDirectory,
    "-l", join(temporaryDirectory, "postgres.log"),
    "-o", `-c listen_addresses='' -c unix_socket_directories=${socketDirectory}`,
    "-w", "start",
  ]);
  postgresStarted = true;

  const databaseUser = process.env.USER || "runner";
  const databaseUrl =
    `postgresql:///postgres?host=${encodeURIComponent(socketDirectory)}&user=${encodeURIComponent(databaseUser)}`;

  run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  });
  run("pnpm", ["--filter", "@workspace/api-server", "run", "build"], {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  });

  const apiPort = await availablePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  apiProcess = startProcess(process.execPath, ["dist/index.mjs"], {
    cwd: apiDir,
    env: {
      DATABASE_URL: databaseUrl,
      PORT: String(apiPort),
      NODE_ENV: "test",
      ADMIN_BOOTSTRAP_PASSWORD: testPassword,
      INITIAL_ADMIN_PASSWORD: "",
    },
  });
  await waitForHttp(`${apiUrl}/api/healthz`, apiProcess, "L’API de test");

  const webPort = await availablePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  webProcess = startProcess(process.execPath, [
    join(packageDir, "node_modules/vite/bin/vite.js"),
    "--config", "vite.config.ts",
    "--host", "127.0.0.1",
  ], {
    cwd: packageDir,
    env: {
      PORT: String(webPort),
      BASE_PATH: "/",
      NODE_ENV: "test",
      E2E_API_PROXY_TARGET: apiUrl,
    },
  });
  await waitForHttp(webUrl, webProcess, "L’interface de test");

  const playwright = spawn(process.execPath, [
    join(packageDir, "node_modules/@playwright/test/cli.js"),
    "test",
    "--config",
    "playwright.config.ts",
  ], {
    cwd: packageDir,
    env: environment({
      E2E_BASE_URL: webUrl,
      E2E_ADMIN_PASSWORD: testPassword,
      ...(systemChromium ? { E2E_CHROMIUM_EXECUTABLE: systemChromium } : {}),
    }),
    stdio: "inherit",
  });
  const [exitCode] = await once(playwright, "exit");
  if (exitCode !== 0) process.exitCode = exitCode ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopProcess(webProcess);
  await stopProcess(apiProcess);
  if (postgresStarted) {
    try {
      run("pg_ctl", ["-D", databaseDirectory, "-m", "fast", "-w", "stop"]);
    } catch (error) {
      console.error("Arrêt de la base de test :", error);
      process.exitCode = 1;
    }
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
