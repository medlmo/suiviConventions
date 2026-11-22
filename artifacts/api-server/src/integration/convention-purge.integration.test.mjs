import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import test, { after, before } from "node:test";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(packageDir, "../..");
let temporaryDirectory;
let databaseDirectory;
let socketDirectory;
let databaseUrl;
let previousDatabaseUrl;
let purgeBundlePath;
let purgeEntryPath;
let databasePool;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql) {
  return run("psql", [
    "--no-psqlrc",
    "-qAt",
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]).trim();
}

function insertConvention({ name, deletedAt, documents = [], documentConvention = null, pv = null }) {
  const id = query(`
    INSERT INTO conventions (nom_convention, deleted_at, documents, document_convention, pv)
    VALUES (
      ${sqlLiteral(name)},
      NOW() - INTERVAL '${deletedAt} days',
      ${sqlLiteral(JSON.stringify(documents))}::jsonb,
      ${documentConvention === null ? "NULL" : sqlLiteral(documentConvention)},
      ${pv === null ? "NULL" : sqlLiteral(pv)}
    )
    RETURNING id
  `);
  return Number(id);
}

function insertAudit(conventionId, action) {
  query(`
    INSERT INTO convention_audit (convention_id, action, actor_username, "before", "after")
    VALUES (${conventionId}, ${sqlLiteral(action)}, 'purge-test', '{}'::jsonb, '{}'::jsonb)
  `);
}

before(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  temporaryDirectory = mkdtempSync(join(tmpdir(), "convention-purge-integration-"));
  databaseDirectory = join(temporaryDirectory, "postgres-data");
  socketDirectory = join(temporaryDirectory, "socket");
  mkdirSync(socketDirectory);

  run("initdb", ["-D", databaseDirectory, "--auth=trust", "--no-sync"]);
  run("pg_ctl", [
    "-D", databaseDirectory,
    "-l", join(temporaryDirectory, "postgres.log"),
    "-o", `-c listen_addresses='' -c unix_socket_directories=${socketDirectory}`,
    "-w", "start",
  ]);

  const databaseUser = process.env.USER || "runner";
  databaseUrl = `postgresql:///postgres?host=${encodeURIComponent(socketDirectory)}&user=${encodeURIComponent(databaseUser)}`;
  process.env.DATABASE_URL = databaseUrl;

  run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  const mockStoragePath = join(temporaryDirectory, "mock-object-storage.mjs");
  writeFileSync(mockStoragePath, `
    export class ObjectStorageService {
      async deleteDocumentObject(objectPath) {
        globalThis.__purgedDocumentPaths.push(objectPath);
      }
    }
  `);
  const mockLoggerPath = join(temporaryDirectory, "mock-logger.mjs");
  writeFileSync(mockLoggerPath, "export const logger = { error() {} };");
  const mockErrorLoggingPath = join(temporaryDirectory, "mock-error-logging.mjs");
  writeFileSync(mockErrorLoggingPath, "export function safeErrorFields() { return {}; }");
  purgeBundlePath = join(workspaceRoot, "lib/db/dist", `test-convention-purge-${process.pid}.mjs`);
  purgeEntryPath = join(packageDir, "src/integration", `.convention-purge-entry-${process.pid}.ts`);
  writeFileSync(purgeEntryPath, `
    export { purgeDeletedConventions as purgerConventionsSupprimees } from "../lib/convention-purge.ts";
    export { pool } from "@workspace/db";
  `);
  await build({
    entryPoints: [purgeEntryPath],
    outfile: purgeBundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["pg"],
    plugins: [{
      name: "mock-object-storage-for-purge-integration",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/objectStorage$/ }, () => ({ path: mockStoragePath }));
        builder.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: mockLoggerPath }));
        builder.onResolve({ filter: /^\.\/error-logging$/ }, () => ({ path: mockErrorLoggingPath }));
      },
    }],
  });
});

after(async () => {
  if (databasePool) await databasePool.end();
  if (databaseDirectory) {
    try {
      run("pg_ctl", ["-D", databaseDirectory, "-m", "fast", "-w", "stop"]);
    } catch {
      // Remove the temporary cluster even if PostgreSQL could not stop cleanly.
    }
  }
  if (purgeBundlePath) rmSync(purgeBundlePath, { force: true });
  if (purgeEntryPath) rmSync(purgeEntryPath, { force: true });
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

test("la purge respecte la rétention, supprime les documents et conserve l’audit", {
  timeout: 45_000,
}, async () => {
  const recentDocument = "/objects/documents/10000000-0000-4000-8000-000000000001";
  const expiredDocuments = [
    "/objects/documents/20000000-0000-4000-8000-000000000001",
    "/objects/documents/20000000-0000-4000-8000-000000000002",
    "/objects/documents/20000000-0000-4000-8000-000000000003",
  ];
  const recentId = insertConvention({
    name: "Convention supprimée récemment",
    deletedAt: 4,
    documents: [{ objectPath: recentDocument, type: "avenant", name: "récent.pdf", addedAt: null }],
  });
  const expiredId = insertConvention({
    name: "Convention arrivée à échéance",
    deletedAt: 6,
    documents: [{ objectPath: expiredDocuments[0], type: "avenant", name: "avenant.pdf", addedAt: null }],
    documentConvention: expiredDocuments[1],
    pv: expiredDocuments[2],
  });
  insertAudit(recentId, "delete");
  insertAudit(expiredId, "delete");

  globalThis.__purgedDocumentPaths = [];
  const { purgerConventionsSupprimees, pool } = await import(
    `${pathToFileURL(purgeBundlePath).href}?integration=${Date.now()}`
  );
  databasePool = pool;
  const result = await purgerConventionsSupprimees();

  assert.deepEqual(result, {
    conventionsDeleted: 1,
    documentObjectsProcessed: expiredDocuments.length,
    sharedObjectsRetained: 0,
    unmanagedDocumentPaths: 0,
    failures: 0,
  });
  assert.deepEqual(globalThis.__purgedDocumentPaths.sort(), [...expiredDocuments].sort());
  assert.equal(query(`SELECT COUNT(*) FROM conventions WHERE id = ${recentId}`), "1");
  assert.equal(query(`SELECT COUNT(*) FROM conventions WHERE id = ${expiredId}`), "0");
  assert.equal(query("SELECT COUNT(*) FROM convention_audit WHERE action = 'delete'"), "2");
  delete globalThis.__purgedDocumentPaths;
});
