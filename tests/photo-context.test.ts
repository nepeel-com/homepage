import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { capturePayload } from "../shared/types.js";
import {
  PHOTO_FILTERS,
  normalizeCaptureContext,
  emptyCaptureContext,
  distanceMeters,
} from "../shared/capture-context.js";
import { applyPhotoFilter } from "../server/photo-filter.js";

test("capture metadata strips coordinate precision and rejects unsupported fields and filters", () => {
  const input = {
    ...emptyCaptureContext(),
    place: {
      latitude: 37.5665123,
      longitude: 126.9780567,
      label: "  서울  ",
      audience: "followers",
    },
  };
  const result = normalizeCaptureContext(input);
  assert.deepEqual(result.place, {
    latitude: 37.567,
    longitude: 126.978,
    label: "서울",
    audience: "followers",
  });
  for (const bad of [
    { ...input, filter: "beautify-ai" },
    { ...input, extra: true },
    { ...input, place: { ...input.place, latitude: 91 } },
    { ...input, place: { ...input.place, longitude: NaN } },
    { ...input, place: { ...input.place, audience: "everyone" } },
    { ...input, place: { ...input.place, altitude: 100 } },
    { ...input, referencePostId: "bad" },
  ])
    assert.throws(() => normalizeCaptureContext(bad));
});
test("proof binds location, audience, filter and reference while legacy payload is unchanged", () => {
  const challenge = { id: "id", nonce: "nonce", expires_at: "" };
  const original = emptyCaptureContext();
  const base = capturePayload("user", challenge, "hash", "caption", original);
  for (const changed of [
    { ...original, filter: "warm" as const },
    {
      ...original,
      place: {
        latitude: 0,
        longitude: 0,
        label: "Place",
        audience: "followers" as const,
      },
    },
    { ...original, referencePostId: "00000000-0000-4000-8000-000000000001" },
  ])
    assert.notEqual(
      capturePayload("user", challenge, "hash", "caption", changed),
      base,
    );
  assert.equal(
    capturePayload("user", challenge, "hash", "caption"),
    JSON.stringify([
      "nepeel.capture.v1",
      "user",
      "id",
      "nonce",
      "hash",
      "caption",
    ]),
  );
});
test("every server filter agrees with its preview color matrix within JPEG tolerance", async () => {
  const rgb = [100, 150, 200];
  const source = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
  const initial = await sharp(source).raw().toBuffer();
  for (const [name, preset] of Object.entries(PHOTO_FILTERS)) {
    const rendered = await applyPhotoFilter(
      source,
      name as keyof typeof PHOTO_FILTERS,
    );
    const output = await sharp(rendered).raw().toBuffer();
    for (let channel = 0; channel < 3; channel++) {
      const offset = channel * 5;
      const m = preset.matrix;
      const expected =
        initial[0] * m[offset] +
        initial[1] * m[offset + 1] +
        initial[2] * m[offset + 2] +
        255 * m[offset + 4];
      assert.ok(
        Math.abs(output[channel] - expected) <= 4,
        `${name}, channel ${channel}: ${output[channel]} vs ${expected}`,
      );
    }
    const metadata = await sharp(rendered).metadata();
    assert.equal(metadata.exif, undefined);
  }
  assert.equal(await applyPhotoFilter(source, "original"), source);
});
test("nearby math crosses the international date line and remains stable at poles", () => {
  const across = distanceMeters(
    { latitude: 0, longitude: 179.999 },
    { latitude: 0, longitude: -179.999 },
  );
  assert.ok(across > 200 && across < 230);
  assert.ok(
    distanceMeters(
      { latitude: 90, longitude: 0 },
      { latitude: 90, longitude: 180 },
    ) < 0.001,
  );
});
