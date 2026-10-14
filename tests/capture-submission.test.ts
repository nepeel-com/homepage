import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureSubmission } from "../shared/capture-submission.js";
import { emptyCaptureContext } from "../shared/capture-context.js";
import type { CaptureRequest } from "../shared/types.js";
const request = (): CaptureRequest => ({
  action: "publish",
  challengeId: "id",
  imageBase64: "jpeg",
  caption: "one moment",
  proof: { platform: "android", token: "proof" },
  context: emptyCaptureContext(),
});
test("simultaneous taps share one preparation and transport; retry preserves signed context", async () => {
  let prepares = 0,
    sends = 0;
  const original = request(),
    sent: CaptureRequest[] = [];
  const submission = new CaptureSubmission(
    async () => {
      prepares++;
      return original;
    },
    async (body) => {
      sent.push(structuredClone(body));
      sends++;
      if (sends === 1) throw Error("response lost");
      return { id: "same-post" };
    },
  );
  const first = submission.submit(),
    second = submission.submit();
  assert.equal(first, second);
  await assert.rejects(first, /response lost/);
  assert.equal(submission.prepared, true);
  original.caption = "changed after signing";
  original.context!.filter = "film";
  assert.deepEqual(await submission.submit(), { id: "same-post" });
  assert.equal(prepares, 1);
  assert.equal(sends, 2);
  assert.deepEqual(sent[0], sent[1]);
});
test("failed preparation can recover without sending an unsigned request", async () => {
  let prepares = 0,
    sends = 0;
  const submission = new CaptureSubmission(
    async () => {
      if (++prepares === 1) throw Error("device temporarily busy");
      return request();
    },
    async () => {
      sends++;
      return { id: "post" };
    },
  );
  await assert.rejects(submission.submit(), /device temporarily busy/);
  assert.equal(submission.prepared, false);
  assert.equal(sends, 0);
  assert.deepEqual(await submission.submit(), { id: "post" });
  assert.equal(prepares, 2);
  assert.equal(sends, 1);
});
