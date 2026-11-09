import assert from "node:assert/strict";
import test from "node:test";
import {
  discardUpload,
  finalizeStagedUpload,
  getStagedUpload,
  reserveUpload,
  UPLOAD_TTL_MS,
} from "./upload-staging.ts";

function reserve(ownerId, name = `test-${ownerId}.pdf`) {
  return reserveUpload({
    ownerId,
    name,
    size: 5,
    contentType: "application/pdf",
  });
}

test("une réservation reste propre à son propriétaire et peut être retirée", () => {
  const upload = reserve(501);
  assert.ok(upload);
  assert.equal(upload.uploadURL, `/api/storage/uploads/${upload.objectPath.split("/").at(-1)}`);
  assert.equal(getStagedUpload(upload.objectPath, 501)?.state, "waiting");
  assert.equal(getStagedUpload(upload.objectPath, 502), undefined);

  discardUpload(upload.objectPath);
  assert.equal(getStagedUpload(upload.objectPath, 501), undefined);
});

test("limite à deux réservations par propriétaire et huit réservations actives", () => {
  const reserved = [];
  try {
    const first = reserve(510);
    assert.ok(first);
    reserved.push(first);
    const second = reserveUpload({
      ownerId: 510, name: "second.pdf", size: 5, contentType: "application/pdf",
    });
    assert.ok(second);
    reserved.push(second);
    assert.equal(reserve(510), null, "un propriétaire ne peut dépasser deux envois actifs");

    for (const ownerId of [511, 512, 513]) {
      reserved.push(reserveUpload({
        ownerId, name: `first-${ownerId}.pdf`, size: 5, contentType: "application/pdf",
      }));
      reserved.push(reserveUpload({
        ownerId, name: `second-${ownerId}.pdf`, size: 5, contentType: "application/pdf",
      }));
    }
    assert.equal(reserved.filter(Boolean).length, 8);
    assert.equal(reserve(514), null, "le neuvième envoi global est refusé");
  } finally {
    for (const upload of reserved) if (upload) discardUpload(upload.objectPath);
  }
});

test("une réservation expirée est inaccessible et libère la capacité au prochain dépôt", () => {
  const upload = reserve(520);
  assert.ok(upload);
  const staged = getStagedUpload(upload.objectPath, 520);
  assert.ok(staged);
  staged.expiresAt = Date.now() - 1;

  assert.equal(getStagedUpload(upload.objectPath, 520), undefined);
  const replacement = reserve(520);
  assert.ok(replacement, "une réservation expirée est purgée avant le contrôle de capacité");
  const replacementState = getStagedUpload(replacement.objectPath, 520);
  assert.ok(replacementState);
  assert.ok(replacementState.expiresAt - Date.now() <= UPLOAD_TTL_MS);
  assert.ok(replacementState.expiresAt > Date.now());
  discardUpload(replacement.objectPath);
});

test("la finalisation conserve le document validé et libère les octets provisoires", async () => {
  const ticket = reserve(530);
  assert.ok(ticket);
  const upload = getStagedUpload(ticket.objectPath, 530);
  assert.ok(upload);
  upload.state = "ready";
  upload.bytes = Buffer.from("test");
  const document = {
    objectPath: "/objects/documents/00000000-0000-4000-8000-000000000001",
    name: upload.name,
    contentType: upload.contentType,
    size: 4,
    generation: "7",
  };

  try {
    const result = await finalizeStagedUpload(upload, async (bytes, name) => {
      assert.deepEqual(bytes, Buffer.from("test"));
      assert.equal(name, upload.name);
      return document;
    });

    assert.deepEqual(result, document);
    assert.equal(upload.state, "completed");
    assert.deepEqual(upload.document, document);
    assert.equal(upload.bytes, undefined);
    assert.ok(upload.expiresAt > Date.now());
  } finally {
    discardUpload(ticket.objectPath);
  }
});

test("un échec de finalisation remet le dépôt en attente sans perdre ses octets", async () => {
  const ticket = reserve(531);
  assert.ok(ticket);
  const upload = getStagedUpload(ticket.objectPath, 531);
  assert.ok(upload);
  upload.state = "ready";
  upload.bytes = Buffer.from("test");
  const bytes = upload.bytes;

  try {
    await assert.rejects(
      finalizeStagedUpload(upload, async () => {
        assert.equal(upload.state, "finalizing");
        throw new Error("échec simulé du stockage");
      }),
      /échec simulé du stockage/,
    );
    assert.equal(upload.state, "ready");
    assert.equal(upload.bytes, bytes);
  } finally {
    discardUpload(ticket.objectPath);
  }
});
