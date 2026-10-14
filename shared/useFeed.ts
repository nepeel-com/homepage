import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedPage } from "./data";
import type { FeedCursor } from "./data";
import type { FeedMode, Post } from "./types";

interface FeedOptions {
  client: SupabaseClient | null;
  userId?: string;
  enabled: boolean;
  scope: string;
  mode: FeedMode;
  search: string;
  postId: string;
  refresh?: number;
}
interface FeedState {
  key: string;
  posts: Post[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: boolean;
  refreshError: boolean;
  moreError: boolean;
  updatedAt: number;
}
interface RequestScope {
  key: string;
  busy: boolean;
  cursor: FeedCursor | null;
  more: boolean;
  updatedAt: number;
}
const empty = (key: string): FeedState => ({
  key,
  posts: [],
  loading: false,
  refreshing: false,
  loadingMore: false,
  hasMore: false,
  error: false,
  refreshError: false,
  moreError: false,
  updatedAt: 0,
});
const idle = (): RequestScope => ({
  key: "",
  busy: false,
  cursor: null,
  more: false,
  updatedAt: 0,
});

export function useFeed({
  client,
  userId,
  enabled,
  scope,
  mode,
  search,
  postId,
  refresh = 0,
}: FeedOptions) {
  const key = JSON.stringify([
    userId,
    enabled,
    scope,
    mode,
    search,
    postId,
    refresh,
  ]);
  const [state, setState] = useState<FeedState>(() => empty(key));
  const request = useRef<RequestScope>(idle());

  useEffect(() => {
    const current: RequestScope = {
      key,
      busy: true,
      cursor: null,
      more: false,
      updatedAt: 0,
    };
    request.current = current;
    const valid = () => request.current === current;
    const invalidate = () => {
      if (request.current.key === key) request.current = idle();
    };
    if (!client || !userId || !enabled) {
      current.busy = false;
      setState(empty(key));
      return invalidate;
    }
    setState({ ...empty(key), loading: true });
    void getFeedPage(client, mode, search, null, postId)
      .then((page) => {
        if (!valid()) return;
        current.cursor = page.cursor;
        current.more = page.hasMore;
        current.updatedAt = Date.now();
        setState({
          ...empty(key),
          posts: page.posts,
          hasMore: current.more,
          updatedAt: current.updatedAt,
        });
      })
      .catch(() => {
        if (valid()) setState({ ...empty(key), error: true });
      })
      .finally(() => {
        if (valid()) current.busy = false;
      });
    return invalidate;
  }, [client, key, userId, enabled, mode, search, postId]);

  // A completed mutation belongs to the exact displayed request, including A→B→A navigation.
  const renderedRequest = request.current;
  const setPosts = useCallback(
    (update: SetStateAction<Post[]>) => {
      if (request.current !== renderedRequest || renderedRequest.key !== key)
        return;
      setState((old) =>
        old.key !== key || request.current !== renderedRequest
          ? old
          : {
              ...old,
              posts: typeof update === "function" ? update(old.posts) : update,
            },
      );
    },
    [key, renderedRequest],
  );

  const nextPage = useCallback(async () => {
    const current = request.current;
    if (
      !client ||
      !userId ||
      !enabled ||
      current.key !== key ||
      current.busy ||
      !current.more
    )
      return;
    current.busy = true;
    const valid = () => request.current === current;
    setState((old) =>
      old.key === key ? { ...old, loadingMore: true, moreError: false } : old,
    );
    try {
      const page = await getFeedPage(
        client,
        mode,
        search,
        current.cursor,
        postId,
      );
      if (!valid()) return;
      current.cursor = page.cursor;
      current.more = page.hasMore;
      setState((old) => {
        if (old.key !== key) return old;
        const known = new Set(old.posts.map((post) => post.id));
        return {
          ...old,
          posts: [
            ...old.posts,
            ...page.posts.filter((post) => !known.has(post.id)),
          ],
          hasMore: current.more,
        };
      });
    } catch {
      if (valid())
        setState((old) =>
          old.key === key ? { ...old, moreError: true } : old,
        );
    } finally {
      if (valid()) {
        current.busy = false;
        setState((old) =>
          old.key === key ? { ...old, loadingMore: false } : old,
        );
      }
    }
  }, [client, userId, enabled, key, mode, search, postId]);

  const reload = useCallback(
    async (maxAge = 0) => {
      const previous = request.current;
      if (
        !client ||
        !userId ||
        !enabled ||
        previous.key !== key ||
        previous.busy ||
        (maxAge > 0 && Date.now() - previous.updatedAt < maxAge)
      )
        return false;
      const current = { ...previous, busy: true };
      request.current = current;
      const valid = () => request.current === current;
      setState((old) =>
        old.key === key
          ? {
              ...old,
              refreshing: true,
              error: false,
              refreshError: false,
              moreError: false,
            }
          : old,
      );
      try {
        const page = await getFeedPage(client, mode, search, null, postId);
        if (!valid()) return false;
        current.cursor = page.cursor;
        current.more = page.hasMore;
        current.updatedAt = Date.now();
        setState({
          ...empty(key),
          posts: page.posts,
          hasMore: current.more,
          updatedAt: current.updatedAt,
        });
        return true;
      } catch {
        // A temporary refresh failure retains photos and the last successful server cursor.
        if (valid())
          setState((old) =>
            old.key === key ? { ...old, refreshError: true } : old,
          );
        return false;
      } finally {
        if (valid()) {
          current.busy = false;
          setState((old) =>
            old.key === key ? { ...old, refreshing: false } : old,
          );
        }
      }
    },
    [client, userId, enabled, key, mode, search, postId],
  );

  const visible =
    state.key === key
      ? state
      : { ...empty(key), loading: !!client && !!userId && enabled };
  return { ...visible, setPosts, nextPage, reload };
}
