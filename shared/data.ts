import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, FeedMode, Post, Profile } from "./types";

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
  if (!rows.length) return [];
  const { data: urls, error: mediaError } = await client.storage
    .from("captures")
    .createSignedUrls(
      rows.map((p) => p.image_path),
      300,
    );
  if (mediaError) throw mediaError;
  return rows.map((p, i) => ({ ...p, image_url: urls?.[i]?.signedUrl ?? "" }));
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
export async function getComments(
  client: SupabaseClient,
  postId: string,
): Promise<Comment[]> {
  const { data, error } = await client
    .from("comments")
    .select("id, body, created_at, user_id, profiles(username, display_name)")
    .eq("post_id", postId)
    .order("created_at")
    .limit(100);
  if (error) throw error;
  return data as unknown as Comment[];
}
export async function addComment(
  client: SupabaseClient,
  userId: string,
  postId: string,
  body: string,
) {
  const { error } = await client
    .from("comments")
    .insert({ user_id: userId, post_id: postId, body: body.trim() });
  if (error) throw error;
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
