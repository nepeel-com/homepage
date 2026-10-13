import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshInbox, refreshTimeline } from "../shared/connection-cache.js";
import type { DirectMessage, Connection } from "../shared/connect.js";
const message = (i: number) =>
  ({
    id: String(i).padStart(5, "0"),
    created_at: "2026-10-14T00:00:00Z",
  }) as DirectMessage;
test("realtime catch-up retains loaded history and fills messages missed while offline", async () => {
  const all = Array.from({ length: 180 }, (_, i) => message(i));
  const previous = all.slice(0, 80);
  const result = await refreshTimeline(
    async (before) => {
      const end = before
        ? all.findIndex((m) => m.id === before.id)
        : all.length;
      return all.slice(Math.max(0, end - 40), end);
    },
    previous,
    false,
  );
  assert.deepEqual(result.rows, all);
  assert.equal(result.older, false);
});
test("blocking clears cached messages instead of retaining a private conversation", async () => {
  const result = await refreshTimeline(async () => [], [message(1)], true);
  assert.deepEqual(result, { rows: [], older: false });
});
test("inbox refresh preserves an opened older conversation while adding new conversations", async () => {
  const all = Array.from(
    { length: 100 },
    (_, i) =>
      ({
        id: String(100 - i).padStart(5, "0"),
        updated_at: "2026-10-14T00:00:00Z",
      }) as Connection,
  );
  const result = await refreshInbox(
    async (before) => {
      const start = before ? all.findIndex((c) => c.id === before.id) + 1 : 0;
      return all.slice(start, start + 30);
    },
    all.slice(10, 70),
  );
  assert.ok(result.rows.some((c) => c.id === all[69].id));
  assert.deepEqual(result.rows, all.slice(0, 90));
});
