import { crc32 } from "node:zlib";
import { fromBuffer, type Entry } from "yauzl";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { documentRejected } from "./document-security-errors";
import { runDocumentTool } from "./document-tools";

const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_ENTRY = 20 * 1024 * 1024;
const MAX_ENTRIES = 2000;

function hasRootNamespace(xml: string, name: string, uri: string): boolean {
  // removeNSPrefix retire également xmlns. Lire le véritable élément racine,
  // pas une chaîne ressemblante dans un commentaire ou dans une valeur d'attribut.
  let head = xml.trimStart();
  while (head.startsWith("<?") || head.startsWith("<!--")) {
    const end = head.startsWith("<?") ? "?>" : "-->";
    const index = head.indexOf(end);
    if (index < 0) return false;
    head = head.slice(index + end.length).trimStart();
  }
  const root = /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\b(?:[^>"']|"[^"]*"|'[^']*')*>/u.exec(head);
  if (!root || root[1]!.split(":").at(-1) !== name) return false;
  const prefix = root[1]!.includes(":") ? root[1]!.split(":")[0] : "";
  const emptyTag = root[0].endsWith("/>") ? root[0] : root[0].slice(0, -1) + "/>";
  const attributes = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(emptyTag)[root[1]!];
  return attributes?.[prefix ? "@_xmlns:" + prefix : "@_xmlns"] === uri;
}

function validateDocx(bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(documentRejected());
      let finished = false;
      let expanded = 0;
      const names = new Set<string>();
      const parts = new Map<string, string>();
      const fail = () => {
        if (finished) return;
        finished = true;
        zip.close();
        reject(documentRejected());
      };
      zip.on("error", fail);
      zip.on("entry", (entry: Entry) => {
        const name = entry.fileName;
        expanded += entry.uncompressedSize;
        if (names.has(name) || names.size >= MAX_ENTRIES || expanded > MAX_EXPANDED ||
          entry.uncompressedSize > MAX_ENTRY || (entry.generalPurposeBitFlag & 1) !== 0 ||
          ![0, 8].includes(entry.compressionMethod) ||
          (entry.uncompressedSize > 0 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 200) ||
          /(^\/|\\|(^|\/)\.\.?($|\/)|\u0000)/u.test(name) ||
          ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000 ||
          /(?:vbaProject|\/embeddings\/|\.(?:exe|dll|js|vbs|ps1|zip|docm)$)/iu.test(name)) return fail();
        names.add(name);
        if (name.endsWith("/")) {
          if (entry.uncompressedSize !== 0) return fail();
          return zip.readEntry();
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          const isXml = /\.(xml|rels)$/iu.test(name);
          const chunks: Buffer[] = [];
          let count = 0;
          let checksum = 0;
          stream.on("error", fail);
          stream.on("data", (chunk: Buffer) => {
            count += chunk.length;
            if (count > MAX_ENTRY || count > entry.uncompressedSize) {
              stream.destroy();
              return fail();
            }
            checksum = crc32(chunk, checksum);
            if (isXml) chunks.push(chunk);
          });
          stream.on("end", () => {
            if (finished) return;
            if (count !== entry.uncompressedSize || checksum !== entry.crc32) return fail();
            if (isXml) {
              try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
                if (/<!\s*(DOCTYPE|ENTITY)\b/iu.test(text) || XMLValidator.validate(text) !== true) return fail();
                if (name.endsWith(".rels")) {
                  if (text.length > 1_000_000) return fail();
                  const root = new XMLParser({ ignoreAttributes: false, processEntities: false, removeNSPrefix: true }).parse(text).Relationships;
                  const rels = root?.Relationship ? (Array.isArray(root.Relationship) ? root.Relationship : [root.Relationship]) : [];
                  if (rels.some((rel: Record<string, string>) => rel["@_TargetMode"] === "External" &&
                    (rel["@_Type"] !== "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ||
                      !/^https?:\/\//iu.test(rel["@_Target"] ?? "")))) return fail();
                }
                if (["[Content_Types].xml", "_rels/.rels", "word/document.xml"].includes(name)) parts.set(name, text);
              } catch { return fail(); }
            }
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => {
        if (finished) return;
        try {
          const typesXml = parts.get("[Content_Types].xml");
          const relsXml = parts.get("_rels/.rels");
          const mainXml = parts.get("word/document.xml");
          if (!typesXml || !relsXml || !mainXml || typesXml.length > 1_000_000 || relsXml.length > 1_000_000) return fail();
          const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, removeNSPrefix: true });
          const types = parser.parse(typesXml).Types;
          const rels = parser.parse(relsXml).Relationships;
          const list = (v: unknown): Record<string, string>[] => !v ? [] : Array.isArray(v) ? v : [v as Record<string, string>];
          if (!hasRootNamespace(typesXml, "Types", "http://schemas.openxmlformats.org/package/2006/content-types") ||
            !hasRootNamespace(relsXml, "Relationships", "http://schemas.openxmlformats.org/package/2006/relationships") ||
            !list(types?.Override).some(v => v["@_PartName"] === "/word/document.xml" &&
              v["@_ContentType"] === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") ||
            !list(rels?.Relationship).some(v =>
              v["@_Type"] === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" &&
              ["word/document.xml", "/word/document.xml"].includes(v["@_Target"] ?? "") &&
              v["@_TargetMode"] !== "External") ||
            !hasRootNamespace(mainXml, "document", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")) return fail();
          finished = true;
          resolve();
        } catch { fail(); }
      });
      zip.readEntry();
    });
  });
}

export async function validateDocumentStructure(path: string, extension: string, bytes: Buffer): Promise<void> {
  if (extension === ".docx") return validateDocx(bytes);
  if (extension === ".pdf") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" ||
      (await runDocumentTool("qpdf", ["--check", path])).code !== 0) throw documentRejected();
    return;
  }
  if (extension !== ".doc" ||
    !bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) throw documentRejected();
  if ((await runDocumentTool("7zz", ["t", "-tCompound", "-bd", path])).code !== 0) throw documentRejected();
  const listing = await runDocumentTool("7zz", ["l", "-slt", "-tCompound", "-bd", path]);
  const text = listing.stdout.toString("utf8");
  if (listing.code !== 0 || !/^Path = WordDocument\r?$/mu.test(text) ||
    !/^Path = [01]Table\r?$/mu.test(text) || /(?:^|\/)(?:VBA|_VBA_PROJECT)(?:\/|$)/imu.test(text)) throw documentRejected();
  const word = await runDocumentTool("7zz", ["e", "-so", "-tCompound", path, "WordDocument"], 20_000, 10 * 1024 * 1024);
  if (word.code !== 0 || word.stdout.length < 898 || word.stdout.readUInt16LE(0) !== 0xa5ec ||
    (word.stdout.readUInt16LE(10) & 0x8100) !== 0) throw documentRejected();
  const fib = word.stdout;
  if (fib.readUInt16LE(32) !== 14 || fib.readUInt16LE(62) !== 22) throw documentRejected();
  const count = fib.readUInt16LE(152);
  if (count < 34 || count > 512 || 154 + count * 8 > fib.length) throw documentRejected();
  const tableName = (fib.readUInt16LE(10) & 0x200) !== 0 ? "1Table" : "0Table";
  const table = await runDocumentTool("7zz", ["e", "-so", "-tCompound", path, tableName], 20_000, 10 * 1024 * 1024);
  const clxOffset = fib.readUInt32LE(154 + 33 * 8);
  const clxLength = fib.readUInt32LE(158 + 33 * 8);
  if (table.code !== 0 || clxLength === 0 || clxOffset + clxLength > table.stdout.length) throw documentRejected();
}
