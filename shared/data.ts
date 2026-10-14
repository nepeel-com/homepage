import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedMode, Post, Profile } from "./types";
import { getPhotoDetails } from "./places";

export interface FeedCursor {
  createdAt: string;
  id: string;
}
export interface FeedPage {
  posts: Post[];
  cursor: FeedCursor | null;
  hasMore: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export async function getFeedPage(
  client: SupabaseClient,
  mode: FeedMode = "all",
  search = "",
  cursor: FeedCursor | null = null,
  postId?: string,
): Promise<FeedPage> {
  if (
    cursor &&
    (!uuid.test(cursor.id) ||
      !timestamp.test(cursor.createdAt) ||
      !Number.isFinite(Date.parse(cursor.createdAt)))
  )
    throw new Error("피드 위치를 확인하지 못했어요. 새로고침해 주세요.");
  const { data, error } = await client.rpc("get_feed_page", {
    p_mode: mode,
    p_search: search,
    p_cursor_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_post: postId || null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Post[];
  const visible = rows.slice(0, 20);
  const last = visible.at(-1);
  const next = last ? { createdAt: last.created_at, id: last.id } : null;
  if (
    next &&
    (!uuid.test(next.id) ||
      !timestamp.test(next.createdAt) ||
      !Number.isFinite(Date.parse(next.createdAt)))
  )
    throw new Error("피드 응답을 확인하지 못했어요.");
  return {
    posts: await hydrateFeed(client, visible),
    cursor: next,
    hasMore: rows.length > 20,
  };
}

export async function getFeed(
  client: SupabaseClient,
  mode: FeedMode = "all",
  search = "",
  offset = 0,
  postId?: string,
): Promise<Post[]> {
  const { data, error } = await client.rpc("get_feed", {
    p_mode: mode,
    p_search: search,
    p_offset: offset,
    p_post: postId || null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Post[];
  return hydrateFeed(client, rows);
}
async function hydrateFeed(
  client: SupabaseClient,
  rows: Post[],
): Promise<Post[]> {
  if (!rows.length) return [];
  const [{ data: urls, error: mediaError }, details] = await Promise.all([
    client.storage.from("captures").createSignedUrls(
      rows.map((p) => p.image_path),
      300,
    ),
    getPhotoDetails(
      client,
      rows.map((p) => p.id),
    ),
  ]);
  if (mediaError) throw mediaError;
  const byId = new Map(details.map((d) => [d.post_id, d]));
  return rows.map((p, i) => ({
    ...p,
    details: byId.get(p.id),
    image_url: urls?.[i]?.signedUrl ?? "",
  }));
}
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, display_name, bio")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}
export async function setReaction(
  client: SupabaseClient,
  table: "likes" | "bookmarks",
  userId: string,
  postId: string,
  enabled: boolean,
) {
  const result = enabled
    ? await client
        .from(table)
        .upsert(
          { user_id: userId, post_id: postId },
          { onConflict: "user_id,post_id", ignoreDuplicates: true },
        )
    : await client
        .from(table)
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
  if (result.error) throw result.error;
}
export async function setFollowing(
  client: SupabaseClient,
  userId: string,
  target: string,
  enabled: boolean,
) {
  const result = enabled
    ? await client
        .from("follows")
        .upsert(
          { follower_id: userId, following_id: target },
          { onConflict: "follower_id,following_id", ignoreDuplicates: true },
        )
    : await client
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", target);
  if (result.error) throw result.error;
}
export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  displayName: string,
  bio: string,
) {
  const { error } = await client
    .from("profiles")
    .update({ display_name: displayName.trim(), bio: bio.trim() })
    .eq("id", userId);
  if (error) throw error;
}
