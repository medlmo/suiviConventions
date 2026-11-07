import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateDocumentStructure } from "./document-structure.ts";

const namespaces = {
  contentTypes: "http://schemas.openxmlformats.org/package/2006/content-types",
  relationships: "http://schemas.openxmlformats.org/package/2006/relationships",
  officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  word: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
};

function docxParts(overrides = {}) {
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="${namespaces.contentTypes}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="${namespaces.relationships}">
        <Relationship Id="rId1" Type="${namespaces.officeDocument}" Target="word/document.xml"/>
      </Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="${namespaces.word}"><w:body/></w:document>`,
    ...overrides,
  };
}

function buildDocx(parts, omitted = []) {
  const directory = mkdtempSync(join(tmpdir(), "document-structure-test-"));
  const archive = join(directory, "fixture.docx");
  try {
    for (const [name, content] of Object.entries(parts)) {
      if (omitted.includes(name)) continue;
      const path = join(directory, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    const entries = Object.keys(parts).filter(name => !omitted.includes(name));
    execFileSync("7zz", ["a", "-tzip", archive, ...entries], {
      cwd: directory,
      stdio: "ignore",
    });
    return { directory, archive, bytes: readFileSync(archive) };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function rejectsAsInvalid(path, extension, bytes) {
  await assert.rejects(
    validateDocumentStructure(path, extension, bytes),
    error => error?.code === "DOCUMENT_REJECTED",
  );
}

test("accepte un DOCX minimal dont les parties et espaces de noms sont cohérents", async () => {
  const fixture = buildDocx(docxParts());
  try {
    await validateDocumentStructure(fixture.archive, ".docx", fixture.bytes);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("refuse un DOCX auquel il manque une partie obligatoire", async () => {
  const fixture = buildDocx(docxParts(), ["word/document.xml"]);
  try {
    await rejectsAsInvalid(fixture.archive, ".docx", fixture.bytes);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("refuse un DOCX contenant une déclaration DTD ou une entité", async () => {
  const parts = docxParts({
    "word/document.xml": `<!DOCTYPE w:document [<!ENTITY x "test">]>
      <w:document xmlns:w="${namespaces.word}"><w:body>&x;</w:body></w:document>`,
  });
  const fixture = buildDocx(parts);
  try {
    await rejectsAsInvalid(fixture.archive, ".docx", fixture.bytes);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("refuse un DOCX avec une relation externe autre qu’un hyperlien HTTP(S)", async () => {
  const parts = docxParts({
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="${namespaces.relationships}">
        <Relationship Id="rId1" Type="${namespaces.relationships}/oleObject"
          Target="https://example.invalid/object" TargetMode="External"/>
      </Relationships>`,
  });
  const fixture = buildDocx(parts);
  try {
    await rejectsAsInvalid(fixture.archive, ".docx", fixture.bytes);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("refuse une archive DOCX corrompue", async () => {
  await rejectsAsInvalid("/unused/invalid.docx", ".docx", Buffer.from("not a zip archive"));
});

test("refuse les signatures PDF ou DOC invalides et les extensions inconnues", async () => {
  await rejectsAsInvalid("/unused/invalid.pdf", ".pdf", Buffer.from("not a PDF"));
  await rejectsAsInvalid("/unused/invalid.doc", ".doc", Buffer.from("not a Word file"));
  await rejectsAsInvalid("/unused/invalid.txt", ".txt", Buffer.from("text"));
});
