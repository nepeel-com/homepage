import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeed } from "../shared/data";
import type { FeedMode, Post } from "../shared/types";

interface FeedOptions {
  client: SupabaseClient | null;
  userId?: string;
  enabled: boolean;
  scope: string;
  mode: FeedMode;
  search: string;
  postId: string;
  refresh: number;
}
interface FeedState {
  key: string;
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: boolean;
  moreError: boolean;
}
const empty = (key: string): FeedState => ({
  key, posts: [], loading: false, loadingMore: false,
  hasMore: false, error: false, moreError: false,
});

export function useFeed({ client, userId, enabled, scope, mode, search, postId, refresh }: FeedOptions) {
  const key = JSON.stringify([userId, enabled, scope, mode, search, postId, refresh]);
  const [state, setState] = useState<FeedState>(() => empty(key));
  const request = useRef({ key: "", busy: false, offset: 0, more: false });

  useEffect(() => {
    const current = { key, busy: true, offset: 0, more: false };
    request.current = current;
    const valid = () => request.current === current;
    const invalidate = () => {
      if (valid()) request.current = { key: "", busy: false, offset: 0, more: false };
    };
    if (!client || !userId || !enabled) {
      current.busy = false;
      setState(empty(key));
      return invalidate;
    }
    setState({ ...empty(key), loading: true });
    void getFeed(client, mode, search, 0, postId)
      .then((posts) => {
        if (!valid()) return;
        current.offset = posts.length;
        current.more = posts.length === 20;
        setState({ ...empty(key), posts, hasMore: current.more });
      })
      .catch(() => {
        if (valid()) setState({ ...empty(key), error: true });
      })
      .finally(() => {
        if (valid()) current.busy = false;
      });
    return invalidate;
  }, [client, key, userId, enabled, mode, search, postId]);

  const setPosts = useCallback((update: SetStateAction<Post[]>) => {
    setState((old) => old.key !== key ? old : {
      ...old, posts: typeof update === "function" ? update(old.posts) : update,
    });
  }, [key]);

  const nextPage = useCallback(async () => {
    const current = request.current;
    if (!client || !userId || !enabled || current.key !== key || current.busy || !current.more) return;
    current.busy = true;
    const valid = () => request.current === current;
    setState((old) => old.key === key ? { ...old, loadingMore: true, moreError: false } : old);
    try {
      const posts = await getFeed(client, mode, search, current.offset, postId);
      if (!valid()) return;
      // Advance by server rows, including duplicates, so a changing page cannot repeat forever.
      current.offset += posts.length;
      current.more = posts.length === 20 && current.offset <= 10000;
      setState((old) => {
        if (old.key !== key) return old;
        const known = new Set(old.posts.map((post) => post.id));
        return { ...old, posts: [...old.posts, ...posts.filter((post) => !known.has(post.id))], hasMore: current.more };
      });
    } catch {
      if (valid()) setState((old) => old.key === key ? { ...old, moreError: true } : old);
    } finally {
      if (valid()) {
        current.busy = false;
        setState((old) => old.key === key ? { ...old, loadingMore: false } : old);
      }
    }
  }, [client, userId, enabled, key, mode, search, postId]);

  // Never render another account or query's cached photos before the next effect runs.
  const visible = state.key === key ? state : { ...empty(key), loading: !!client && !!userId && enabled };
  return { ...visible, setPosts, nextPage };
}
