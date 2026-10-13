import type { SupabaseClient } from "@supabase/supabase-js";

export async function accountAction(
  client: SupabaseClient,
  apiBase: string,
  body: Record<string, unknown>,
) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error("다시 로그인해 주세요.");
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error || "요청을 완료하지 못했어요. 다시 시도해 주세요.",
    );
  return result;
}

export const reportReasons = [
  ["synthetic", "AI 생성물 / 화면 재촬영 의심"],
  ["harmful", "유해하거나 불쾌한 내용"],
  ["spam", "스팸 / 광고"],
  ["other", "기타 커뮤니티 원칙 위반"],
] as const;
export async function reportPost(
  client: SupabaseClient,
  userId: string,
  postId: string,
  reason: string,
) {
  const { error } = await client
    .from("reports")
    .insert({ user_id: userId, post_id: postId, reason });
  // Treat retries of an already-accepted report as success.
  if (error && error.code !== "23505") throw error;
}
