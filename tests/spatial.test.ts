import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bearingBetween,
  relativeBearing,
  spatialCues,
} from "../shared/spatial.js";
test("bearing handles compass north wrap and international date line", () => {
  assert.equal(relativeBearing(1, 359), 2);
  assert.equal(relativeBearing(359, 1), -2);
  assert.equal(
    bearingBetween(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    ),
    0,
  );
  assert.equal(
    bearingBetween(
      { latitude: 0, longitude: 179.999 },
      { latitude: 0, longitude: -179.999 },
    ),
    90,
  );
});
test("spatial cards distinguish approximate nearby places, offscreen directions and unknown heading", () => {
  const origin = { latitude: 0, longitude: 0 };
  const photos = [
    { post_id: "near", latitude: 0, longitude: 0 },
    { post_id: "east", latitude: 0, longitude: 0.005 },
    { post_id: "far", latitude: 0, longitude: 0.1 },
  ];
  const north = spatialCues(photos, origin, 0);
  assert.equal(north.length, 2);
  assert.equal(north[0].direction, "nearby");
  assert.equal(north[0].x, 0.5);
  assert.equal(north[1].direction, "right");
  assert.equal(north[1].inView, false);
  const east = spatialCues(photos, origin, 90);
  assert.equal(east[1].direction, "ahead");
  assert.equal(east[1].x, 0.5);
  assert.equal(east[1].inView, true);
  assert.equal(spatialCues(photos, origin, null)[1].direction, "unknown");
  assert.equal(spatialCues(photos, origin, null)[1].inView, false);
});
test("invalid coordinates and duplicate photo anchors cannot produce invalid markers", () => {
  const photo = { post_id: "one", latitude: 89.999, longitude: 179.999 };
  const cues = spatialCues(
    [photo, photo, { post_id: "bad", latitude: NaN, longitude: 0 }],
    { latitude: 90, longitude: 0 },
    359,
  );
  assert.equal(cues.length, 1);
  assert.ok(Number.isFinite(cues[0].bearing));
  assert.ok(cues[0].x >= 0.08 && cues[0].x <= 0.92);
  assert.deepEqual(
    spatialCues([photo], { latitude: 100, longitude: 0 }, 0),
    [],
  );
});
