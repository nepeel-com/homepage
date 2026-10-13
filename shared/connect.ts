import type { SupabaseClient } from "@supabase/supabase-js";

export const cities = [
  ["seoul", "서울", "Seoul"],
  ["busan", "부산", "Busan"],
  ["tokyo", "도쿄", "Tokyo"],
  ["osaka", "오사카", "Osaka"],
  ["singapore", "싱가포르", "Singapore"],
  ["taipei", "타이베이", "Taipei"],
  ["hongkong", "홍콩", "Hong Kong"],
  ["london", "런던", "London"],
  ["paris", "파리", "Paris"],
  ["berlin", "베를린", "Berlin"],
  ["newyork", "뉴욕", "New York"],
  ["losangeles", "로스앤젤레스", "Los Angeles"],
  ["toronto", "토론토", "Toronto"],
  ["sydney", "시드니", "Sydney"],
  ["other", "그 외 지역", "Elsewhere"],
] as const;
export type Gender = "woman" | "man" | "nonbinary";
export interface ConnectionPreferences {
  user_id?: string;
  birth_date: string;
  gender: Gender | "";
  interested_in: Gender[];
  city: string;
  scope: "city" | "global";
  intent: "friends" | "dating";
  age_min: number;
  age_max: number;
  enabled: boolean;
  updated_at?: string;
}
export const defaultPreferences: ConnectionPreferences = {
  birth_date: "",
  gender: "",
  interested_in: ["woman", "man", "nonbinary"],
  city: "other",
  scope: "global",
  intent: "friends",
  age_min: 18,
  age_max: 35,
  enabled: false,
};
export interface Connection {
  id: string;
  peer_id: string;
  display_name: string;
  username: string;
  status: "pending" | "accepted" | "declined" | "blocked" | "expired";
  incoming: boolean;
  updated_at: string;
  expires_at: string;
  city: string;
  age_band: string;
  intent: string;
}
export interface DirectMessage {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  client_id: string;
  created_at: string;
}
export async function preferences(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("connection_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionPreferences | null;
}
export async function savePreferences(
  client: SupabaseClient,
  value: ConnectionPreferences,
) {
  const { error } = await client.rpc("save_connection_preferences", {
    p_birth_date: value.birth_date,
    p_gender: value.gender,
    p_interested_in: value.interested_in,
    p_city: value.city,
    p_scope: value.scope,
    p_intent: value.intent,
    p_age_min: value.age_min,
    p_age_max: value.age_max,
    p_enabled: value.enabled,
  });
  if (error) throw error;
}
export async function connectAction(
  client: SupabaseClient,
  action: string,
  args?: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(action, args);
  if (error) throw error;
  return data;
}
export async function connections(
  client: SupabaseClient,
  before?: Connection,
): Promise<Connection[]> {
  return (
    (await connectAction(client, "get_connections", {
      p_before: before?.updated_at ?? null,
      p_before_id: before?.id ?? null,
    })) ?? []
  );
}
export async function messages(
  client: SupabaseClient,
  connection: string,
  before?: DirectMessage,
): Promise<DirectMessage[]> {
  return (
    (await connectAction(client, "get_direct_messages", {
      p_connection: connection,
      p_before: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
    })) ?? []
  ).reverse();
}
export function connectError(error: unknown, en = false) {
  const code =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  const errors = [
    [
      "REFRESH_FAILED",
      "요청은 처리했지만 최신 내용을 불러오지 못했어요. 새로고침해 주세요.",
      "Your action succeeded, but the latest view couldn't load. Please refresh.",
    ],
    [
      "ADULTS_ONLY",
      "Hi 연결은 만 18세 이상만 참여할 수 있어요.",
      "Hi is for adults aged 18 and over.",
    ],
    [
      "BIRTH_DATE_LOCKED",
      "저장한 생년월일은 변경할 수 없어요.",
      "Your saved date of birth cannot be changed.",
    ],
    [
      "OPT_IN_REQUIRED",
      "참여 설정을 먼저 저장해 주세요.",
      "Save your opt-in preferences first.",
    ],
    [
      "DAILY_HI_LIMIT",
      "Hi는 24시간에 5번까지 보낼 수 있어요.",
      "You can send 5 Hi requests per 24 hours.",
    ],
    [
      "HI_COOLDOWN",
      "다음 Hi는 1분 뒤에 보내 주세요.",
      "Wait one minute before sending another Hi.",
    ],
    [
      "MESSAGE_LIMIT",
      "메시지가 많아요. 잠시 쉬었다 보내 주세요.",
      "Please wait before sending more messages.",
    ],
    [
      "REQUEST_CLOSED",
      "아직 수락되지 않았거나 종료된 대화예요. 새로고침해 주세요.",
      "This request is not accepted or has closed. Please refresh.",
    ],
    ["NOT_FOUND", "대화를 찾을 수 없어요.", "Conversation not found."],
    [
      "INVALID_MESSAGE",
      "메시지는 1~1,000자로 입력해 주세요.",
      "Messages must be 1–1,000 characters.",
    ],
  ];
  const match = errors.find(([key]) => code.includes(key));
  return match
    ? match[en ? 2 : 1]
    : en
      ? "Couldn't connect. Check your settings and try again."
      : "연결하지 못했어요. 설정을 확인하고 다시 시도해 주세요.";
}
