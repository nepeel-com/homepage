import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createComment, getCommentPage } from "./comments";
import type { CommentCursor } from "./comments";
import type { Comment } from "./types";

interface Options { client: SupabaseClient | null; userId?: string; postId: string; enabled: boolean; makeId: () => string }
interface State {
  key: string; comments: Comment[]; body: string; loading: boolean; loadingMore: boolean;
  posting: boolean; hasMore: boolean; loadError: boolean; moreError: boolean; postError: boolean;
}
const empty = (key: string): State => ({ key, comments: [], body: "", loading: false, loadingMore: false,
  posting: false, hasMore: false, loadError: false, moreError: false, postError: false });
interface RequestScope {
  key: string; reading: boolean; posting: boolean; more: boolean; cursor: CommentCursor | null;
  body: string; attempt: { id: string; body: string } | null;
}

export function useComments({ client, userId, postId, enabled, makeId }: Options) {
  const key = JSON.stringify([userId, postId, enabled]);
  const [state, setState] = useState(() => empty(key));
  const scope = useRef<RequestScope | null>(null);
  const retryDraft = useRef<Pick<RequestScope, "key" | "body" | "attempt"> | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const draft = retryDraft.current?.key === key ? retryDraft.current : null;
    retryDraft.current = null;
    const current: RequestScope = { key, reading: true, posting: false, more: false, cursor: null, body: draft?.body ?? "", attempt: draft?.attempt ?? null };
    scope.current = current;
    const valid = () => scope.current === current;
    const cleanup = () => { if (valid()) scope.current = null; };
    if (!client || !userId || !enabled) { current.reading = false; setState(empty(key)); return cleanup; }
    setState({ ...empty(key), body: current.body, loading: true });
    void getCommentPage(client, postId).then(page => {
      if (!valid()) return;
      current.cursor = page.cursor; current.more = page.hasMore;
      setState(old => ({ ...old, comments: page.comments, hasMore: page.hasMore, loading: false }));
    }).catch(() => { if (valid()) setState(old => ({ ...old, loadError: true, loading: false })); })
      .finally(() => { if (valid()) current.reading = false; });
    return cleanup;
  }, [client, key, userId, postId, enabled, retry]);

  const setBody = useCallback((body: string) => {
    const current = scope.current;
    if (!current || current.key !== key || current.posting) return;
    current.body = body;
    setState(old => old.key === key ? { ...old, body, postError: false } : old);
  }, [key]);

  const loadMore = useCallback(async () => {
    const current = scope.current;
    if (!client || !current || current.key !== key || current.reading || !current.more) return;
    current.reading = true;
    const valid = () => scope.current === current;
    setState(old => ({ ...old, loadingMore: true, moreError: false }));
    try {
      const page = await getCommentPage(client, postId, current.cursor);
      if (!valid()) return;
      current.cursor = page.cursor; current.more = page.hasMore;
      setState(old => {
        const known = new Set(old.comments.map(comment => comment.id));
        return { ...old, comments: [...old.comments, ...page.comments.filter(comment => !known.has(comment.id))], hasMore: page.hasMore };
      });
    } catch { if (valid()) setState(old => ({ ...old, moreError: true })); }
    finally {
      if (valid()) { current.reading = false; setState(old => ({ ...old, loadingMore: false })); }
    }
  }, [client, key, postId]);

  const submit = useCallback(async (): Promise<boolean> => {
    const current = scope.current;
    if (!client || !userId || !current || current.key !== key || current.posting || (current.reading && !current.cursor) || !current.body.trim()) return false;
    const body = current.body.trim();
    current.posting = true;
    setState(old => ({ ...old, posting: true, postError: false }));
    const valid = () => scope.current === current;
    try {
      if (!current.attempt || current.attempt.body !== body) current.attempt = { id: makeId(), body };
      const comment = await createComment(client, userId, postId, current.attempt.id, body);
      if (!valid()) return false;
      current.body = ""; current.attempt = null;
      setState(old => ({ ...old, body: "", comments: [comment, ...old.comments.filter(item => item.id !== comment.id)] }));
      return true;
    } catch { if (valid()) setState(old => ({ ...old, postError: true })); return false; }
    finally { if (valid()) { current.posting = false; setState(old => ({ ...old, posting: false })); } }
  }, [client, userId, postId, key, makeId]);

  const visible = state.key === key ? state : { ...empty(key), loading: !!client && !!userId && enabled };
  const reload = () => {
    const current = scope.current;
    if (current?.key === key && !current.posting && !current.reading) {
      retryDraft.current = { key, body: current.body, attempt: current.attempt };
      setRetry(value => value + 1);
    }
  };
  return { ...visible, setBody, loadMore, submit, reload };
}
