import { useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import { supabase } from "./lib/supabase";
import {
  cities,
  connectError,
  defaultPreferences,
  savePreferences,
  type ConnectionPreferences,
  type Gender,
  type BlockedConnection,
} from "../shared/connect";
import { useConnections } from "../shared/useConnections";

const palette = {
  ink: "#20221d",
  paper: "#fafbf8",
  lime: "#d4ff3f",
  muted: "#707369",
  line: "#e7e9e1",
  wash: "#f0f2eb",
};
export default function ConnectionsScreen({
  userId,
  close,
}: {
  userId: string;
  close: () => void;
}) {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  const h = useConnections(supabase, userId, active);
  const [en, setEn] = useState(false);
  const t = (ko: string, english: string) => (en ? english : ko);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConnectionPreferences>({
    ...defaultPreferences,
  });
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("other");
  const [unblocking, setUnblocking] = useState<BlockedConnection | null>(null);
  const pending = useRef<{
    body: string;
    id: string;
    connection: string;
  } | null>(null);
  const thread = h.items.find((x) => x.id === h.selected);
  useEffect(() => {
    setBody("");
    setReport(false);
    pending.current = null;
  }, [h.selected]);
  const button = (
    label: string,
    onPress: () => void,
    primary = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || h.busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        (disabled || h.busy) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text>
    </Pressable>
  );
  function openSettings() {
    setDraft(h.prefs ? { ...h.prefs } : { ...defaultPreferences });
    setConsent(false);
    setEditing(true);
  }
  const cityName = (id: string) =>
    cities.find((c) => c[0] === id)?.[en ? 2 : 1] ?? id;
  const status = (value: string, incoming: boolean) =>
    value === "accepted"
      ? t("연결됨", "Connected")
      : value === "pending"
        ? incoming
          ? t("받은 Hi", "Received Hi")
          : t("응답 대기", "Awaiting reply")
        : value === "blocked"
          ? t("차단됨", "Blocked")
          : value === "expired"
            ? t("만료됨", "Expired")
            : t("종료됨", "Closed");
  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.header}>
        {button(t("뒤로", "Back"), () => {
          if (unblocking) setUnblocking(null);
          else if (h.blocksOpen) h.setBlocksOpen(false);
          else if (editing) setEditing(false);
          else if (h.selected) h.select(null);
          else close();
        })}
        <Text style={s.brand}>nepeel / hi</Text>
        {button(en ? "한국어" : "EN", () => setEn(!en))}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {h.blocksOpen ? (
          <View style={s.stack}>
            <Text style={s.title}>{t("내가 차단한 Hi 회원", "People you've blocked on Hi")}</Text>
            <Text style={s.muted}>{t("내가 설정한 차단만 표시합니다. 상대가 설정한 차단은 해제할 수 없어요.", "Only your blocks appear here. You cannot remove another person's block.")}</Text>
            {unblocking ? <View style={s.card}>
              <Text style={s.label}>{unblocking.display_name} {t("님의 차단을 해제할까요?", "— unblock?")}</Text>
              <Text style={s.muted}>{t("양쪽의 차단이 모두 해제되면, 이전에 수락한 대화와 메시지가 다시 열려요. 수락하지 않은 요청은 원래 만료 시간이 유지되고 신고는 취소되지 않아요.", "Once neither person is blocking, previously accepted chats and messages reopen. Unaccepted requests keep their expiry. Reports remain submitted.")}</Text>
              {button(t("취소", "Cancel"), () => setUnblocking(null))}
              {button(t("차단 해제", "Unblock"), () => void h.run(async () => {
                await h.act("unblock_connection", { p_connection: unblocking.connection_id });
                setUnblocking(null);
                setNotice(t("내 차단을 해제했어요. 상대가 차단한 경우 대화는 계속 닫혀 있습니다.", "Your block was removed. A block set by the other person still keeps the chat closed."));
              }), true)}
            </View> : <>
              {button(t("목록 새로고침", "Refresh list"), () => void h.run(h.refreshBlocks), false, h.blocksLoading)}
              {h.blocksLoading ? <Text>{t("불러오는 중…", "Loading…")}</Text>
                : !h.blocks.length ? <Text style={s.muted}>{t("내가 차단한 Hi 회원이 없어요.", "You haven't blocked anyone on Hi.")}</Text>
                : h.blocks.map(item => <View key={item.peer_id} style={s.card}>
                  <Text style={s.label}>{item.display_name}</Text><Text style={s.muted}>@{item.username}</Text>
                  {button(`${item.display_name} · ${t("차단 해제", "Unblock")}`, () => { setNotice(""); setUnblocking(item); })}
                </View>)}
              {h.blocksMore && !h.blocksLoading && button(t("더 보기", "Load more"), () => void h.run(h.loadMoreBlocks))}
            </>}
          </View>
        ) : editing ? (
          <View style={s.stack}>
            <Text style={s.title}>
              {t("나의 연결 조건", "Your preferences")}
            </Text>
            <Text style={s.muted}>
              {t(
                "만 18세 이상만 참여해요. 생년월일과 선호 조건은 비공개예요. 상대에게 도시와 5년 단위 나이대가 보여요. GPS를 사용하지 않아요.",
                "For adults 18+. Birth dates and preferences stay private. Connections see your city and five-year age band. No GPS.",
              )}
            </Text>
            <Text style={s.label}>
              {t(
                "생년월일 (YYYY-MM-DD) · 저장 후 변경 불가",
                "Date of birth (YYYY-MM-DD) · cannot be changed",
              )}
            </Text>
            <TextInput
              accessibilityLabel={t("생년월일", "Date of birth")}
              style={s.input}
              value={draft.birth_date}
              editable={!h.prefs && !h.busy}
              autoCapitalize="none"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              onChangeText={(value) =>
                setDraft({ ...draft, birth_date: value })
              }
            />
            <Text style={s.label}>{t("내 성별", "My gender")}</Text>
            <View style={s.row}>
              {(["woman", "man", "nonbinary"] as Gender[]).map((g, i) => (
                <Choice
                  key={g}
                  text={t(
                    ["여성", "남성", "논바이너리"][i],
                    ["Woman", "Man", "Nonbinary"][i],
                  )}
                  selected={draft.gender === g}
                  change={() => setDraft({ ...draft, gender: g })}
                />
              ))}
            </View>
            <Text style={s.label}>
              {t("관심 성별 · 복수 선택", "Interested in · choose one or more")}
            </Text>
            <View style={s.row}>
              {(["woman", "man", "nonbinary"] as Gender[]).map((g, i) => (
                <Choice
                  key={g}
                  text={t(
                    ["여성", "남성", "논바이너리"][i],
                    ["Women", "Men", "Nonbinary"][i],
                  )}
                  selected={draft.interested_in.includes(g)}
                  change={() =>
                    setDraft({
                      ...draft,
                      interested_in: draft.interested_in.includes(g)
                        ? draft.interested_in.filter((x) => x !== g)
                        : [...draft.interested_in, g],
                    })
                  }
                />
              ))}
            </View>
            <Text style={s.label}>{t("연결 목적", "Looking for")}</Text>
            <View style={s.row}>
              {(["friends", "dating"] as const).map((v) => (
                <Choice
                  key={v}
                  text={
                    v === "friends"
                      ? t("새 친구", "Friends")
                      : t("설레는 만남", "Dating")
                  }
                  selected={draft.intent === v}
                  change={() => setDraft({ ...draft, intent: v })}
                />
              ))}
            </View>
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={s.label}>{t("최소 나이", "Minimum age")}</Text>
                <TextInput
                  style={s.input}
                  accessibilityLabel={t("최소 나이", "Minimum age")}
                  keyboardType="number-pad"
                  value={String(draft.age_min || "")}
                  maxLength={3}
                  onChangeText={(v) =>
                    setDraft({ ...draft, age_min: Number(v) })
                  }
                />
              </View>
              <View style={s.flex}>
                <Text style={s.label}>{t("최대 나이", "Maximum age")}</Text>
                <TextInput
                  style={s.input}
                  accessibilityLabel={t("최대 나이", "Maximum age")}
                  keyboardType="number-pad"
                  value={String(draft.age_max || "")}
                  maxLength={3}
                  onChangeText={(v) =>
                    setDraft({ ...draft, age_max: Number(v) })
                  }
                />
              </View>
            </View>
            <Text style={s.label}>{t("내 도시", "My city")}</Text>
            <View style={s.row}>
              {cities.map((c) => (
                <Choice
                  key={c[0]}
                  text={c[en ? 2 : 1]}
                  selected={draft.city === c[0]}
                  change={() =>
                    setDraft({
                      ...draft,
                      city: c[0],
                      scope: c[0] === "other" ? "global" : draft.scope,
                    })
                  }
                />
              ))}
            </View>
            <Text style={s.label}>{t("연결 범위", "Connect with")}</Text>
            <View style={s.row}>
              <Choice
                text={t("전 세계", "Worldwide")}
                selected={draft.scope === "global"}
                change={() => setDraft({ ...draft, scope: "global" })}
              />
              {draft.city !== "other" && (
                <Choice
                  text={t("같은 도시", "My city")}
                  selected={draft.scope === "city"}
                  change={() => setDraft({ ...draft, scope: "city" })}
                />
              )}
            </View>
            <View style={s.toggle}>
              <Text style={s.flex}>
                {t("새 Hi 요청 받기", "Receive new Hi requests")}
              </Text>
              <Switch
                accessibilityLabel={t(
                  "새 Hi 요청 받기",
                  "Receive new Hi requests",
                )}
                value={draft.enabled}
                onValueChange={(v) => setDraft({ ...draft, enabled: v })}
              />
            </View>
            <View style={s.toggle}>
              <Text style={[s.flex, s.muted]}>
                {t(
                  "만 18세 이상이며 정보가 사실이고 연결에 동의합니다. 나이는 자기신고이며 본인인증이 아닙니다.",
                  "I am 18+, my details are accurate, and I consent to matching. Age is self-declared, not verified.",
                )}
              </Text>
              <Switch
                accessibilityLabel={t(
                  "성인 및 연결 동의",
                  "Adult and matching consent",
                )}
                value={consent}
                onValueChange={setConsent}
              />
            </View>
            {button(
              t("조건 저장", "Save preferences"),
              () =>
                void h.run(async () => {
                  await savePreferences(supabase!, draft);
                  h.setPrefs(draft);
                  setEditing(false);
                  setNotice(t("조건을 저장했어요.", "Preferences saved."));
                }),
              true,
              !consent ||
                !draft.gender ||
                !draft.interested_in.length ||
                !/^\d{4}-\d{2}-\d{2}$/.test(draft.birth_date) ||
                draft.age_min < 18 ||
                draft.age_max < draft.age_min ||
                draft.age_max > 100,
            )}
          </View>
        ) : thread ? (
          <View style={s.stack}>
            <Text style={s.title}>{thread.display_name}</Text>
            <Text style={s.muted}>
              {cityName(thread.city)} · {thread.age_band} ·{" "}
              {status(thread.status, thread.incoming)}
            </Text>
            {button(
              t("새로고침", "Refresh"),
              () =>
                void h.run(async () => {
                  await h.refresh();
                  await h.refreshMessages();
                }),
            )}
            {h.older &&
              button(
                t("이전 메시지", "Earlier messages"),
                () => void h.run(h.loadOlder),
              )}
            {h.messageLoading ? (
              <Text>{t("불러오는 중…", "Loading…")}</Text>
            ) : (
              h.history.map((m) => (
                <View
                  key={m.id}
                  style={[s.bubble, m.sender_id === userId && s.mine]}
                >
                  <Text style={s.message}>{m.body}</Text>
                  <Text style={s.time}>
                    {new Date(m.created_at).toLocaleTimeString(
                      en ? "en" : "ko",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </Text>
                </View>
              ))
            )}
            {thread.status === "pending" && (
              <View style={s.card}>
                <Text style={s.muted}>
                  {thread.incoming
                    ? t("이 인사를 이어가 볼까요?", "Say hello back?")
                    : t(
                        "상대가 수락하면 대화가 열려요. 요청은 24시간 뒤 만료됩니다.",
                        "Chat opens when they accept. Requests expire in 24 hours.",
                      )}
                </Text>
                {thread.incoming && (
                  <View style={s.row}>
                    {button(
                      t("수락", "Accept"),
                      () =>
                        void h.run(() =>
                          h.act("respond_to_hi", {
                            p_connection: thread.id,
                            p_accept: true,
                          }),
                        ),
                      true,
                    )}
                    {button(
                      t("거절", "Decline"),
                      () =>
                        void h.run(() =>
                          h.act("respond_to_hi", {
                            p_connection: thread.id,
                            p_accept: false,
                          }),
                        ),
                    )}
                  </View>
                )}
              </View>
            )}
            {thread.status === "accepted" && (
              <View style={s.stack}>
                <Text style={s.label}>{t("메시지", "Message")}</Text>
                <TextInput
                  style={[s.input, s.messageInput]}
                  accessibilityLabel={t("메시지", "Message")}
                  multiline
                  maxLength={1000}
                  value={body}
                  editable={!h.busy}
                  onChangeText={setBody}
                  placeholder={t(
                    "있는 그대로, 한마디.",
                    "A little hello, in your own words.",
                  )}
                />
                {button(
                  t("보내기", "Send"),
                  () =>
                    void h.run(async () => {
                      const text = body.trim();
                      if (!text) return;
                      if (
                        !pending.current ||
                        pending.current.body !== text ||
                        pending.current.connection !== thread.id
                      )
                        pending.current = {
                          body: text,
                          id: Crypto.randomUUID(),
                          connection: thread.id,
                        };
                      await h.act("send_direct_message", {
                        p_connection: thread.id,
                        p_body: text,
                        p_client_id: pending.current.id,
                      });
                      setBody("");
                      pending.current = null;
                    }),
                  true,
                  !body.trim(),
                )}
              </View>
            )}
            {button(t("차단 · 신고", "Block · Report"), () =>
                setReport(!report),
              )}
            {report && (
              <View style={s.card}>
                <Text style={s.muted}>
                  {t(
                    "차단 중에는 서로 메시지를 보낼 수 없어요. Hi 차단 관리에서 내 차단을 해제할 수 있으며, 기존 메시지는 보관됩니다.",
                    "Messages stop while blocked. You can remove your block in Manage Hi blocks. Existing messages are retained.",
                  )}
                </Text>
                <View style={s.row}>
                  {["spam", "harassment", "underage", "other"].map((r, i) => (
                    <Choice
                      key={r}
                      text={t(
                        ["스팸", "괴롭힘", "미성년자 의심", "기타"][i],
                        ["Spam", "Harassment", "Underage", "Other"][i],
                      )}
                      selected={reason === r}
                      change={() => setReason(r)}
                    />
                  ))}
                </View>
                {button(
                  t("신고하고 차단", "Report and block"),
                  () =>
                    void h.run(async () => {
                      await h.act("block_connection", {
                        p_connection: thread.id,
                        p_reason: reason,
                      });
                      setReport(false);
                    }),
                  true,
                )}
                {button(
                  t("차단만", "Block only"),
                  () =>
                    void h.run(async () => {
                      await h.act("block_connection", {
                        p_connection: thread.id,
                      });
                      setReport(false);
                    }),
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={s.stack}>
            <View style={s.hero}>
              <Text style={s.kicker}>A LITTLE HI. A NEW POSSIBILITY.</Text>
              <Text style={s.hi}>hi ↗</Text>
              <Text style={s.title}>
                {t("우연도, 직접 만나야.", "A hello changes things.")}
              </Text>
              <Text style={s.message}>
                {t(
                  "서로의 조건이 맞는 참여자에게 hi가 바로 전송돼요. 24시간에 최대 5번.",
                  "Send hi to a mutual match. Up to 5 requests per 24 hours.",
                )}
              </Text>
              {button(
                h.busy
                  ? t("연결하는 중…", "Connecting…")
                  : t("랜덤 Hi 보내기", "Send a random Hi"),
                () => {
                  if (!h.prefs?.enabled) return openSettings();
                  void h.run(async () => {
                    setNotice("");
                    const id = await h.act("send_random_hi");
                    if (id) {
                      h.select(id);
                      setNotice(t("hi를 보냈어요.", "Hi sent."));
                    } else
                      setNotice(
                        t(
                          "서로의 조건에 맞는 참여자가 아직 없어요. 나중에 다시 와 주세요.",
                          "No mutual match right now. Try again later.",
                        ),
                      );
                  });
                },
                true,
                h.loading,
              )}
            </View>
            <Text style={s.muted}>
              {t(
                "18+ 참여 동의 · 도시만 공유 · 수락 후 대화",
                "18+ opt-in · City only · Chat after acceptance",
              )}
            </Text>
            <View style={s.card}>
              <Text style={s.label}>
                {h.prefs?.enabled
                  ? t("새로운 연결을 받고 있어요", "Open to new connections")
                  : t("연결 참여가 꺼져 있어요", "Discovery is paused")}
              </Text>
              {h.prefs && (
                <Text style={s.muted}>
                  {h.prefs.scope === "global"
                    ? t("전 세계", "Worldwide")
                    : cityName(h.prefs.city)}{" "}
                  · {h.prefs.age_min}–{h.prefs.age_max}
                </Text>
              )}
              {button(
                t("연결 설정", "Preferences"),
                openSettings,
                false,
                h.loading,
              )}
              {h.prefs?.enabled &&
                button(
                  t("새 연결 잠시 쉬기", "Pause discovery"),
                  () =>
                    void h.run(async () => {
                      await h.act("pause_connections");
                      h.setPrefs({ ...h.prefs!, enabled: false });
                    }),
                )}
            </View>
            <View style={s.row}>
              <Text style={[s.title, s.flex]}>
                {t("나의 Hi", "Your hellos")}
              </Text>
              {button(t("새로고침", "Refresh"), () => void h.run(h.refresh))}
            </View>
            {button(t("Hi 차단 관리", "Manage Hi blocks"), () => { setUnblocking(null); setNotice(""); h.setBlocksOpen(true); })}
            <Text style={s.muted}>
              {h.liveState
                ? t("실시간 연결됨", "Live updates")
                : t("새로고침으로 확인", "Refresh for updates")}
            </Text>
            {h.loading ? (
              <Text>{t("불러오는 중…", "Loading…")}</Text>
            ) : !h.items.length ? (
              <View style={s.card}>
                <Text style={s.label}>
                  {t("첫 인사를 기다려요.", "Your first hello awaits.")}
                </Text>
                <Text style={s.muted}>
                  {t(
                    "Hi를 보내거나 참여 설정을 켜고 기다려 보세요.",
                    "Send a Hi or turn on discovery to receive one.",
                  )}
                </Text>
              </View>
            ) : (
              h.items.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => h.select(item.id)}
                  style={({ pressed }) => [s.card, pressed && s.pressed]}
                >
                  <Text style={s.label}>{item.display_name} ↗</Text>
                  <Text style={s.muted}>
                    {status(item.status, item.incoming)}
                  </Text>
                </Pressable>
              ))
            )}
            {h.more &&
              button(
                t("이전 대화", "Older conversations"),
                () => void h.run(h.loadMore),
              )}
            <Text style={s.muted}>
              {t(
                "설정은 7일마다 갱신해 주세요. 참여를 꺼도 기존 대화는 유지됩니다.",
                "Renew discovery every 7 days. Pausing keeps existing conversations.",
              )}
            </Text>
          </View>
        )}
        {!!notice && (
          <Text style={s.notice} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        )}
        {h.error != null && (
          <Text style={s.error} accessibilityRole="alert">
            {connectError(h.error, en)}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function Choice({
  text,
  selected,
  change,
}: {
  text: string;
  selected: boolean;
  change: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={change}
      style={({ pressed }) => [
        s.choice,
        selected && s.selected,
        pressed && s.pressed,
      ]}
    >
      <Text style={s.buttonText}>
        {selected ? "✓ " : ""}
        {text}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  brand: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: palette.ink,
  },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  stack: { gap: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  hero: {
    backgroundColor: palette.lime,
    padding: 24,
    borderRadius: 16,
    gap: 16,
  },
  hi: {
    fontSize: 100,
    lineHeight: 110,
    fontWeight: "900",
    letterSpacing: -8,
    color: palette.ink,
  },
  kicker: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "800", color: palette.ink },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
    lineHeight: 23,
  },
  muted: { color: palette.muted, fontSize: 14, lineHeight: 23 },
  message: { fontSize: 16, lineHeight: 25, color: palette.ink },
  button: {
    minHeight: 48,
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: palette.ink, fontWeight: "600", fontSize: 14 },
  primary: { backgroundColor: palette.ink, borderColor: palette.ink },
  primaryText: { color: palette.paper },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  input: {
    minHeight: 50,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    fontSize: 16,
    color: palette.ink,
    backgroundColor: palette.paper,
  },
  messageInput: { minHeight: 100, textAlignVertical: "top" },
  choice: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 24,
    justifyContent: "center",
  },
  selected: { backgroundColor: palette.lime, borderColor: palette.ink },
  toggle: { flexDirection: "row", gap: 12, alignItems: "center" },
  card: {
    padding: 20,
    borderRadius: 14,
    backgroundColor: palette.wash,
    gap: 12,
  },
  bubble: {
    backgroundColor: palette.wash,
    padding: 14,
    borderRadius: 14,
    alignSelf: "flex-start",
    maxWidth: "88%",
  },
  mine: { backgroundColor: palette.lime, alignSelf: "flex-end" },
  time: {
    fontSize: 10,
    marginTop: 8,
    textAlign: "right",
    color: palette.muted,
  },
  notice: {
    padding: 16,
    backgroundColor: palette.wash,
    fontSize: 14,
    lineHeight: 23,
    color: palette.ink,
  },
  error: {
    padding: 16,
    backgroundColor: "#fff0ed",
    color: "#982e20",
    fontSize: 14,
    lineHeight: 23,
  },
});
