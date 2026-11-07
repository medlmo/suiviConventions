import assert from "node:assert/strict";
import test from "node:test";
import {
  discardUpload,
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
