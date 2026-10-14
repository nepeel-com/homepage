import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment } from "./types";

export const COMMENT_PAGE_SIZE = 30;
const columns = "id, body, created_at, user_id, profiles(username, display_name)";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export type CommentCursor = Pick<Comment, "id" | "created_at">;
export interface CommentPage { comments: Comment[]; cursor: CommentCursor | null; hasMore: boolean }

export async function getCommentPage(client: SupabaseClient, postId: string, before?: CommentCursor | null): Promise<CommentPage> {
  if (!uuid.test(postId)) throw new Error("INVALID_POST");
  let query = client.from("comments").select(columns).eq("post_id", postId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(COMMENT_PAGE_SIZE + 1);
  if (before) {
    if (!uuid.test(before.id) || !timestamp.test(before.created_at) || !Number.isFinite(Date.parse(before.created_at)))
      throw new Error("INVALID_COMMENT_CURSOR");
    // Keep PostgreSQL's microseconds intact; Date.toISOString() would truncate them.
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Comment[];
  const comments = rows.slice(0, COMMENT_PAGE_SIZE);
  const last = comments.at(-1);
  return { comments, cursor: last ? { id: last.id, created_at: last.created_at } : null, hasMore: rows.length > COMMENT_PAGE_SIZE };
}

export async function createComment(client: SupabaseClient, userId: string, postId: string, id: string, body: string): Promise<Comment> {
  const text = body.trim();
  if (![userId, postId, id].every(value => uuid.test(value))) throw new Error("INVALID_COMMENT_ID");
  if (!text || [...text].length > 500) throw new Error("INVALID_COMMENT_BODY");
  const result = await client.from("comments")
    .insert({ id, user_id: userId, post_id: postId, body: text })
    .select(columns).single();
  if (!result.error) return result.data as unknown as Comment;
  if (result.error.code !== "23505") throw result.error;
  // An uncertain network response may have committed. Retry the same ID, then verify ownership and content.
  const existing = await client.from("comments").select(columns).eq("id", id)
    .eq("user_id", userId).eq("post_id", postId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data || existing.data.body !== text) throw result.error;
  return existing.data as unknown as Comment;
}
