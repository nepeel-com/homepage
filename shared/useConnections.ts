import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshInbox, refreshTimeline } from "./connection-cache";
import {
  connections,
  blockedConnections,
  connectAction,
  messages,
  preferences,
  type Connection,
  type ConnectionPreferences,
  type DirectMessage,
  type BlockedConnection,
} from "./connect";

// Mounted only on the Hi surface. No background polling or public presence broadcast.
export function useConnections(
  client: SupabaseClient | null,
  userId: string | undefined,
  active = true,
) {
  const [prefs, setPrefs] = useState<ConnectionPreferences | null>(null);
  const [items, setItems] = useState<Connection[]>([]);
  const [selected, select] = useState<string | null>(null);
  const [history, setHistory] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [messageLoading, setMessageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [more, setMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [liveState, setLiveState] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blocks, setBlocks] = useState<BlockedConnection[]>([]);
  const [blocksMore, setBlocksMore] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const blocksOpenRef = useRef(blocksOpen);
  blocksOpenRef.current = blocksOpen;
  const blocksGeneration = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const historyRef = useRef(history);
  historyRef.current = history;
  const olderRef = useRef(older);
  olderRef.current = older;
  const inboxGeneration = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!client || !userId) return;
    const request = ++inboxGeneration.current;
    const result = await refreshInbox(
      (before) => connections(client, before),
      itemsRef.current,
    );
    if (!mounted.current || request !== inboxGeneration.current) return;
    setItems(result.rows);
    setMore(result.more);
    if (
      selectedRef.current &&
      !result.rows.some((c) => c.id === selectedRef.current)
    )
      select(null);
  }, [client, userId]);
  const refreshMessages = useCallback(async () => {
    const id = selectedRef.current;
    if (!client || !id) return;
    const request = ++generation.current;
    const result = await refreshTimeline(
      (before) => messages(client, id, before),
      historyRef.current,
      olderRef.current,
    );
    if (
      !mounted.current ||
      selectedRef.current !== id ||
      generation.current !== request
    )
      return;
    setHistory(result.rows);
    setOlder(result.older);
  }, [client]);
  const refreshBlocks = useCallback(async () => {
    if (!client || !userId) return;
    const request = ++blocksGeneration.current;
    setBlocksLoading(true);
    try {
      const rows = await blockedConnections(client);
      if (!mounted.current || request !== blocksGeneration.current) return;
      setBlocks(rows);
      setBlocksMore(rows.length === 30);
    } finally {
      if (mounted.current && request === blocksGeneration.current) setBlocksLoading(false);
    }
  }, [client, userId]);
  useEffect(() => {
    if (!blocksOpen || !active) return;
    let disposed = false;
    void refreshBlocks().catch(e => { if (!disposed) setError(e); });
    return () => { disposed = true; blocksGeneration.current++; };
  }, [blocksOpen, active, refreshBlocks]);
  useEffect(() => {
    if (!client || !userId || !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    Promise.all([preferences(client, userId), connections(client)])
      .then(([p, list]) => {
        if (!disposed) {
          setPrefs(p);
          if (!itemsRef.current.length) {
            setItems(list);
            setMore(list.length === 30);
          } else
            void refresh().catch((e) => {
              if (!disposed) setError(e);
            });
          setError(null);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        Promise.all([refresh(), refreshMessages(), blocksOpenRef.current ? refreshBlocks() : undefined]).catch((e) => {
          if (!disposed) setError(e);
        });
      }, 180);
    };
    const channel = client
      .channel(`hi:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `member_a=eq.${userId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `member_b=eq.${userId}`,
        },
        changed,
      )
      .subscribe((status) => {
        if (!disposed) {
          setLiveState(status === "SUBSCRIBED");
          // Realtime does not replay events missed while offline/backgrounded.
          if (status === "SUBSCRIBED") changed();
        }
      });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      setLiveState(false);
      void client.removeChannel(channel);
    };
  }, [client, userId, active, refresh, refreshMessages, refreshBlocks]);
  useEffect(() => {
    let disposed = false;
    setHistory([]);
    historyRef.current = [];
    setOlder(false);
    olderRef.current = false;
    generation.current++;
    if (!selected || !client) return;
    setMessageLoading(true);
    refreshMessages()
      .catch((e) => {
        if (!disposed) setError(e);
      })
      .finally(() => {
        if (!disposed) setMessageLoading(false);
      });
    return () => {
      disposed = true;
      generation.current++;
    };
  }, [selected, client, refreshMessages]);
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function act(name: string, args?: Record<string, unknown>) {
    if (!client) return;
    const result = await connectAction(client, name, args);
    // A committed mutation stays successful even if the subsequent read fails.
    try {
      await refresh();
      await refreshMessages();
      if (blocksOpenRef.current) await refreshBlocks();
    } catch {
      if (mounted.current) setError(new Error("REFRESH_FAILED"));
    }
    return result;
  }
  async function loadMore() {
    if (!client || !items.length) return;
    const next = await connections(client, items[items.length - 1]);
    setItems((old) => [
      ...old,
      ...next.filter((n) => !old.some((i) => i.id === n.id)),
    ]);
    setMore(next.length === 30);
  }
  async function loadOlder() {
    if (!client || !selected || !history.length) return;
    const id = selected;
    const next = await messages(client, id, history[0]);
    if (selectedRef.current !== id) return;
    setHistory((old) => [
      ...next.filter((n) => !old.some((i) => i.id === n.id)),
      ...old,
    ]);
    setOlder(next.length === 40);
  }
  async function loadMoreBlocks() {
    if (!client || !blocks.length) return;
    const request = blocksGeneration.current;
    const next = await blockedConnections(client, blocks[blocks.length - 1]);
    if (!mounted.current || request !== blocksGeneration.current) return;
    setBlocks(old => [...old, ...next.filter(n => !old.some(i => i.peer_id === n.peer_id))]);
    setBlocksMore(next.length === 30);
  }
  return {
    blocksOpen, setBlocksOpen, blocks, blocksMore, blocksLoading,
    refreshBlocks, loadMoreBlocks,
    prefs,
    setPrefs,
    items,
    selected,
    select,
    history,
    loading,
    messageLoading,
    busy,
    error,
    more,
    older,
    liveState,
    refresh,
    refreshMessages,
    run,
    act,
    loadMore,
    loadOlder,
  };
}
