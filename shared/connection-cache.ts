import type { Connection, DirectMessage } from "./connect";

type Cursor = { id: string; created_at: string };
const compare = (a: Cursor, b: Cursor) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

// Messages are immutable. Catch up to the previous newest message before merging,
// otherwise a burst while offline would leave an invisible hole in the timeline.
export async function refreshTimeline(
  fetchPage: (before?: DirectMessage) => Promise<DirectMessage[]>,
  previous: DirectMessage[],
  hadOlder: boolean,
) {
  let fresh = await fetchPage();
  if (!fresh.length) return { rows: [], older: false }; // Closed/blocked/deleted thread.
  let page = fresh;
  const newest = previous.at(-1);
  for (
    let count = 1;
    newest && page.length === 40 && compare(page[0], newest) > 0 && count < 10;
    count++
  ) {
    page = await fetchPage(page[0]);
    fresh = [...page, ...fresh];
  }
  const overlaps = newest && fresh.length && compare(fresh[0], newest) <= 0;
  const rows = [
    ...new Map(
      [...(overlaps ? previous : []), ...fresh].map((m) => [m.id, m]),
    ).values(),
  ].sort(compare);
  const keptEarlierHistory = overlaps && compare(previous[0], fresh[0]) < 0;
  return { rows, older: keptEarlierHistory ? hadOlder : page.length === 40 };
}

// Re-read as many pages as the member has opened, including newly-arrived rows,
// so updates do not collapse a selected older conversation out of the inbox.
export async function refreshInbox(
  fetchPage: (before?: Connection) => Promise<Connection[]>,
  previous: Connection[],
) {
  const anchor = previous.at(-1);
  let rows = await fetchPage();
  let page = rows;
  const cursor = (c: Connection): Cursor => ({
    id: c.id,
    created_at: c.updated_at,
  });
  while (
    anchor &&
    page.length === 30 &&
    compare(cursor(page[page.length - 1]), cursor(anchor)) > 0
  ) {
    page = await fetchPage(page[page.length - 1]);
    rows = [...rows, ...page];
  }
  return {
    rows: [...new Map(rows.map((c) => [c.id, c])).values()],
    more: page.length === 30,
  };
}
