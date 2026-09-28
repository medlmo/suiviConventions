import { readFile, writeFile } from "node:fs/promises";

const barrel = new URL("../../api-zod/src/index.ts", import.meta.url);
const source = await readFile(barrel, "utf8");

// Orval appends this export to the package barrel when generating split models.
// Model names can also be Zod validator names, so keep only the namespaced export.
if (
  !source.includes('export * from "./generated/api";') ||
  !source.includes('export * as OpenApiTypes from "./generated/types";')
) {
  throw new Error("The api-zod barrel changed; review its exports before continuing.");
}

const updated = source.replace(
  /^export \* from ['"]\.\/generated\/types['"];?(?:\r?\n|$)/gm,
  "",
);

if (updated !== source) {
  await writeFile(barrel, updated);
}