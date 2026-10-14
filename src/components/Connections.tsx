import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  Globe2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  cities,
  connectError,
  defaultPreferences,
  savePreferences,
  type ConnectionPreferences,
  type Gender,
  type BlockedConnection,
} from "../../shared/connect";
import { useConnections } from "../../shared/useConnections";
import { Avatar, Dialog } from "../App";
import "./connections.css";

export default function Connections({
  userId,
  login,
  client = supabase,
}: {
  userId?: string;
  login: () => void;
  client?: SupabaseClient | null;
}) {
  const [en, setEn] = useState(
    () => localStorage.getItem("nepeel.hi.language") === "en",
  );
  const t = (ko: string, english: string) => (en ? english : ko);
  const [active, setActive] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const h = useConnections(client, userId, active);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConnectionPreferences>({
    ...defaultPreferences,
  });
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("other");
  const [unblocking, setUnblocking] = useState<BlockedConnection | null>(null);
  const pendingMessage = useRef<{
    body: string;
    connection: string;
    id: string;
  } | null>(null);
  const conversation = h.items.find((i) => i.id === h.selected);
  useEffect(() => {
    setBody("");
    setReporting(false);
    pendingMessage.current = null;
  }, [h.selected]);
  function openSettings() {
    if (!userId) return login();
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
          : t("응답 기다리는 중", "Awaiting reply")
        : value === "blocked"
          ? t("차단된 대화", "Blocked")
          : value === "expired"
            ? t("요청 만료", "Expired")
            : t("종료된 요청", "Closed");
  async function sayHi() {
    if (!userId) return login();
    if (!h.prefs?.enabled) return openSettings();
    await h.run(async () => {
      setNotice("");
      const id = await h.act("send_random_hi");
      if (id) {
        h.select(id);
        setNotice(
          t(
            "hi를 보냈어요. 상대의 응답을 기다려 주세요.",
            "Hi sent. Give them a moment to reply.",
          ),
        );
      } else
        setNotice(
          t(
            "아직 서로의 조건에 맞는 참여자가 없어요. 범위를 바꾸거나 나중에 다시 와 주세요.",
            "No mutual match right now. Try a wider range or come back later.",
          ),
        );
    });
  }
  return (
    <section className="hi-page" lang={en ? "en" : "ko"}>
      <div className="hi-topline">
        <span>REAL PEOPLE. SMALL HELLOS.</span>
        <button
          className="hi-language"
          aria-label={t("Switch to English", "한국어로 전환")}
          onClick={() => {
            setEn(!en);
            localStorage.setItem("nepeel.hi.language", en ? "ko" : "en");
          }}
        >
          {en ? "한국어" : "EN"}
        </button>
      </div>
      <div className="hi-hero">
        <div>
          <p className="hi-kicker">A LITTLE HI. A NEW POSSIBILITY.</p>
          <h1>{t("우연도, 직접 만나야.", "A hello changes things.")}</h1>
          <p>
            {t(
              "스크롤을 멈추고, 누군가의 오늘에 인사해요.",
              "Pause the scroll. Say hello to someone's day.",
            )}
          </p>
        </div>
        <span className="hi-word" aria-hidden="true">
          hi<span>↗</span>
        </span>
        <button
          className="hi-send"
          disabled={h.busy || h.loading}
          onClick={() => void sayHi()}
        >
          <span>
            {h.busy
              ? t("연결하는 중…", "Connecting…")
              : t("랜덤 Hi 보내기", "Send a random Hi")}
          </span>
          <ArrowUpRight size={24} />
        </button>
        <small>
          {t(
            "조건이 서로 맞는 참여자에게 hi가 바로 전송돼요. 하루 최대 5번.",
            "Sends hi to a mutual match. Up to 5 requests per 24 hours.",
          )}
        </small>
      </div>
      <div className="hi-principles">
        <span>
          <ShieldCheck size={16} />
          {t("18+ · 참여 동의", "18+ · Opt-in")}
        </span>
        <span>
          <MapPin size={16} />
          {t("도시만 공유", "City only")}
        </span>
        <span>
          <MessageCircle size={16} />
          {t("수락 후 대화", "Chat after acceptance")}
        </span>
      </div>
      {!userId ? (
        <div className="hi-empty">
          <h2>{t("필터보다, 공통점.", "More in common.")}</h2>
          <p>
            {t(
              "내 나이대, 관심 성별, 같은 도시 또는 전 세계. 서로의 조건에 맞는 성인 참여자를 연결해요.",
              "Your age range, preferred genders, your city or the world. Both people's preferences count.",
            )}
          </p>
          <button className="dark-button" onClick={login}>
            {t("로그인하고 참여하기", "Sign in to join")}
            <ArrowUpRight size={17} />
          </button>
          <small>
            {t(
              "생년월일은 비공개이며 자기신고 방식입니다. 정확한 GPS 위치는 수집하지 않아요.",
              "Age is self-declared. Birth dates stay private. No precise GPS location is collected.",
            )}
          </small>
        </div>
      ) : (
        <>
          <div className="hi-preferences">
            <div>
              <b>
                {h.prefs?.enabled
                  ? t("새로운 연결을 받고 있어요", "Open to new connections")
                  : t("연결 참여가 꺼져 있어요", "Discovery is paused")}
              </b>
              <p>
                {h.prefs
                  ? `${h.prefs.scope === "city" ? cityName(h.prefs.city) : t("전 세계", "Worldwide")} · ${h.prefs.age_min}–${h.prefs.age_max} · ${h.prefs.intent === "dating" ? t("설레는 만남", "Dating") : t("새로운 친구", "Friends")}`
                  : t(
                      "내 조건을 정하고 시작해요.",
                      "Set your preferences to get started.",
                    )}
              </p>
            </div>
            <button
              className="outline-button"
              disabled={h.loading || h.busy}
              onClick={openSettings}
            >
              <SlidersHorizontal size={16} />
              {t("설정", "Preferences")}
            </button>
          </div>
          {h.prefs?.enabled && (
            <button
              className="text-button hi-pause"
              disabled={h.busy}
              onClick={() =>
                void h.run(async () => {
                  await h.act("pause_connections");
                  h.setPrefs({ ...h.prefs!, enabled: false });
                })
              }
            >
              {t("새로운 연결 잠시 쉬기", "Pause new connections")}
            </button>
          )}
          <div className="hi-inbox-heading">
            <h2>{t("나의 Hi", "Your hellos")}</h2>
            <button className="text-button" disabled={h.busy} onClick={() => {
              setUnblocking(null); setNotice(""); h.setBlocksOpen(true);
            }}>{t("Hi 차단 관리", "Manage Hi blocks")}</button>
            <span>
              {h.liveState
                ? t("실시간 연결됨", "Live updates")
                : t("새로고침으로 확인", "Refresh for updates")}
            </span>
            <button
              className="icon-button"
              aria-label={t("대화 새로고침", "Refresh conversations")}
              disabled={h.busy || h.loading}
              onClick={() =>
                void h.run(async () => {
                  await h.refresh();
                  await h.refreshMessages();
                })
              }
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {h.loading ? (
            <div className="hi-empty" role="status">
              {t("인사를 불러오는 중…", "Loading your hellos…")}
            </div>
          ) : (
            <div className="hi-inbox">
              <div
                className="hi-threads"
                aria-label={t("대화 목록", "Conversations")}
              >
                {h.items.length === 0 ? (
                  <div className="hi-empty compact">
                    <MessageCircle size={28} />
                    <h3>
                      {t("첫 인사를 기다려요.", "Your first hello awaits.")}
                    </h3>
                    <p>
                      {t(
                        "Hi를 보내거나, 참여 설정을 켜고 기다려 보세요.",
                        "Send a Hi or turn on discovery to receive one.",
                      )}
                    </p>
                  </div>
                ) : (
                  h.items.map((item) => (
                    <button
                      key={item.id}
                      className={`hi-thread ${item.id === h.selected ? "selected" : ""}`}
                      aria-pressed={item.id === h.selected}
                      onClick={() => h.select(item.id)}
                    >
                      <Avatar name={item.display_name} />
                      <span>
                        <b>{item.display_name}</b>
                        <small>{status(item.status, item.incoming)}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                )}
                {h.more && (
                  <button
                    className="outline-button"
                    disabled={h.busy}
                    onClick={() => void h.run(h.loadMore)}
                  >
                    {t("이전 대화 더 보기", "Older conversations")}
                  </button>
                )}
              </div>
              {conversation && (
                <div className="hi-conversation">
                  <header>
                    <div>
                      <h3>{conversation.display_name}</h3>
                      <small>
                        {cityName(conversation.city)} · {conversation.age_band}{" "}
                        · {status(conversation.status, conversation.incoming)}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={t("대화 닫기", "Close conversation")}
                      onClick={() => h.select(null)}
                    >
                      <X size={18} />
                    </button>
                  </header>
                  <div
                    className="hi-messages"
                    role="log"
                    aria-label={t("메시지", "Messages")}
                    aria-live="polite"
                  >
                    {h.older && (
                      <button
                        className="text-button"
                        disabled={h.busy}
                        onClick={() => void h.run(h.loadOlder)}
                      >
                        {t("이전 메시지", "Earlier messages")}
                      </button>
                    )}
                    {h.messageLoading ? (
                      <p role="status">{t("불러오는 중…", "Loading…")}</p>
                    ) : (
                      h.history.map((m) => (
                        <div
                          key={m.id}
                          className={`hi-bubble ${m.sender_id === userId ? "mine" : ""}`}
                        >
                          <p>{m.body}</p>
                          <time dateTime={m.created_at}>
                            {new Date(m.created_at).toLocaleTimeString(
                              en ? "en" : "ko",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </time>
                        </div>
                      ))
                    )}
                  </div>
                  {conversation.status === "pending" && (
                    <div className="hi-request">
                      <p>
                        {conversation.incoming
                          ? t(
                              "이 인사를 이어가 볼까요?",
                              "Would you like to say hello back?",
                            )
                          : t(
                              "상대가 수락하면 대화를 시작할 수 있어요. 요청은 24시간 뒤 만료돼요.",
                              "Chat opens when they accept. Requests expire after 24 hours.",
                            )}
                      </p>
                      {conversation.incoming && (
                        <div className="hi-row">
                          <button
                            className="dark-button"
                            disabled={h.busy}
                            onClick={() =>
                              void h.run(() =>
                                h.act("respond_to_hi", {
                                  p_connection: conversation.id,
                                  p_accept: true,
                                }),
                              )
                            }
                          >
                            <Check size={16} />
                            {t("수락", "Accept")}
                          </button>
                          <button
                            className="outline-button"
                            disabled={h.busy}
                            onClick={() =>
                              void h.run(() =>
                                h.act("respond_to_hi", {
                                  p_connection: conversation.id,
                                  p_accept: false,
                                }),
                              )
                            }
                          >
                            {t("거절", "Decline")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {conversation.status === "accepted" && (
                    <form
                      className="hi-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void h.run(async () => {
                          const text = body.trim();
                          if (!text) return;
                          if (
                            !pendingMessage.current ||
                            pendingMessage.current.body !== text ||
                            pendingMessage.current.connection !==
                              conversation.id
                          )
                            pendingMessage.current = {
                              body: text,
                              connection: conversation.id,
                              id: crypto.randomUUID(),
                            };
                          await h.act("send_direct_message", {
                            p_connection: conversation.id,
                            p_body: text,
                            p_client_id: pendingMessage.current.id,
                          });
                          setBody("");
                          pendingMessage.current = null;
                        });
                      }}
                    >
                      <label className="sr-only" htmlFor="hi-message">
                        {t("메시지 입력", "Write a message")}
                      </label>
                      <textarea
                        id="hi-message"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={1000}
                        rows={2}
                        placeholder={t(
                          "있는 그대로, 한마디.",
                          "A little hello, in your own words.",
                        )}
                        disabled={h.busy}
                      />
                      <button
                        className="icon-button"
                        type="submit"
                        disabled={h.busy || !body.trim()}
                        aria-label={t("메시지 보내기", "Send message")}
                      >
                        <Send size={20} />
                      </button>
                    </form>
                  )}
                  {(
                    <button
                      className="text-button hi-safety"
                      onClick={() => setReporting(true)}
                    >
                      {t("차단 · 신고", "Block · Report")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {notice && (
        <p className="hi-notice" role="status">
          {notice}
        </p>
      )}
      {h.error != null && (
        <p className="hi-error" role="alert">
          {connectError(h.error, en)}
        </p>
      )}
      <p className="hi-footnote">
        <Globe2 size={14} />
        {t(
          "전 세계로 열려 있어요. 참여 설정은 7일마다 확인해 주세요. 새로운 연결을 꺼도 기존 대화는 유지돼요.",
          "Open to the world. Renew discovery every 7 days. Pausing discovery keeps existing conversations.",
        )}
      </p>
      {editing && (
        <Dialog
          title={t("나의 연결 조건", "Your connection preferences")}
          close={() => !h.busy && setEditing(false)}
        >
          <form
            className="hi-settings"
            onSubmit={(e) => {
              e.preventDefault();
              void h.run(async () => {
                await savePreferences(client!, draft);
                h.setPrefs(draft);
                setEditing(false);
                setNotice(
                  t(
                    "조건을 저장했어요. 이제 Hi를 보내 보세요.",
                    "Preferences saved. You're ready to say Hi.",
                  ),
                );
              });
            }}
          >
            <p>
              {t(
                "성인끼리, 서로 원하는 연결만. 생년월일·성별·선호 조건은 다른 회원에게 공개하지 않아요. 도시와 5년 단위 나이대는 연결된 상대에게 보여요.",
                "Adults only, with mutual preferences. Birth date, gender and preferences stay private. Connections see your city and five-year age band.",
              )}
            </p>
            <label>
              {t(
                "생년월일 · 저장 후 변경 불가",
                "Date of birth · cannot be changed once saved",
              )}
              <input
                type="date"
                required
                value={draft.birth_date}
                disabled={!!h.prefs}
                onChange={(e) =>
                  setDraft({ ...draft, birth_date: e.target.value })
                }
              />
            </label>
            <div className="hi-form-grid">
              <label>
                {t("내 성별", "My gender")}
                <select
                  required
                  value={draft.gender}
                  onChange={(e) =>
                    setDraft({ ...draft, gender: e.target.value as Gender })
                  }
                >
                  <option value="" disabled>
                    {t("선택해 주세요", "Please choose")}
                  </option>
                  {(["woman", "man", "nonbinary"] as Gender[]).map((g, i) => (
                    <option key={g} value={g}>
                      {t(
                        ["여성", "남성", "논바이너리"][i],
                        ["Woman", "Man", "Nonbinary"][i],
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("연결 목적", "Looking for")}
                <select
                  value={draft.intent}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      intent: e.target.value as "friends" | "dating",
                    })
                  }
                >
                  <option value="friends">{t("새로운 친구", "Friends")}</option>
                  <option value="dating">{t("설레는 만남", "Dating")}</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>
                {t(
                  "만나고 싶은 성별 · 복수 선택",
                  "Interested in · choose one or more",
                )}
              </legend>
              <div className="hi-row">
                {(["woman", "man", "nonbinary"] as Gender[]).map((g, i) => (
                  <label className="hi-check" key={g}>
                    <input
                      type="checkbox"
                      checked={draft.interested_in.includes(g)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          interested_in: e.target.checked
                            ? [...draft.interested_in, g]
                            : draft.interested_in.filter((x) => x !== g),
                        })
                      }
                    />
                    {t(
                      ["여성", "남성", "논바이너리"][i],
                      ["Women", "Men", "Nonbinary"][i],
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="hi-form-grid">
              <label>
                {t("최소 나이", "Minimum age")}
                <input
                  type="number"
                  required
                  min={18}
                  max={100}
                  value={draft.age_min}
                  onChange={(e) =>
                    setDraft({ ...draft, age_min: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {t("최대 나이", "Maximum age")}
                <input
                  type="number"
                  required
                  min={draft.age_min}
                  max={100}
                  value={draft.age_max}
                  onChange={(e) =>
                    setDraft({ ...draft, age_max: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="hi-form-grid">
              <label>
                {t("내 도시 · GPS 사용 안 함", "My city · no GPS")}
                <select
                  value={draft.city}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      city: e.target.value,
                      scope:
                        e.target.value === "other" ? "global" : draft.scope,
                    })
                  }
                >
                  {cities.map((c) => (
                    <option key={c[0]} value={c[0]}>
                      {c[en ? 2 : 1]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("연결 범위", "Connect with")}
                <select
                  value={draft.scope}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scope: e.target.value as "city" | "global",
                    })
                  }
                >
                  <option value="global">{t("전 세계", "Worldwide")}</option>
                  <option value="city" disabled={draft.city === "other"}>
                    {t("같은 도시", "My city")}
                  </option>
                </select>
              </label>
            </div>
            <label className="hi-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              {t("새로운 Hi 요청 받기", "Receive new Hi requests")}
            </label>
            <label className="hi-check">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {t(
                "만 18세 이상이며, 입력한 정보가 사실이고 이 조건으로 연결되는 데 동의합니다. 나이는 자기신고이며 본인인증이 아닙니다.",
                "I am 18 or older, my details are accurate, and I consent to these connections. Age is self-declared, not identity-verified.",
              )}
            </label>
            {h.error != null && (
              <p className="hi-error" role="alert">
                {connectError(h.error, en)}
              </p>
            )}
            <button
              className="dark-button full"
              disabled={
                h.busy ||
                !consent ||
                !draft.gender ||
                !draft.interested_in.length
              }
            >
              {h.busy
                ? t("저장 중…", "Saving…")
                : t("조건 저장", "Save preferences")}
            </button>
          </form>
        </Dialog>
      )}
      {reporting && conversation && (
        <Dialog
          title={t("이 대화 차단하기", "Block this conversation")}
          close={() => !h.busy && setReporting(false)}
        >
          <div className="hi-settings">
            <p>
              {t(
                "차단 중에는 서로 메시지를 보낼 수 없어요. Hi 차단 관리에서 내 차단을 해제할 수 있으며, 기존 메시지는 보관됩니다.",
                "Messages stop while blocked. You can remove your block in Manage Hi blocks. Existing messages are retained.",
              )}
            </p>
            <label>
              {t("신고 사유", "Report reason")}
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="other">{t("기타", "Other")}</option>
                <option value="spam">{t("스팸", "Spam")}</option>
                <option value="harassment">{t("괴롭힘", "Harassment")}</option>
                <option value="underage">
                  {t("미성년자 의심", "Suspected underage user")}
                </option>
              </select>
            </label>
            <div className="hi-row">
              <button
                className="dark-button"
                disabled={h.busy}
                onClick={() =>
                  void h.run(async () => {
                    await h.act("block_connection", {
                      p_connection: conversation.id,
                      p_reason: reason,
                    });
                    setReporting(false);
                  })
                }
              >
                {t("신고하고 차단", "Report and block")}
              </button>
              <button
                className="outline-button"
                disabled={h.busy}
                onClick={() =>
                  void h.run(async () => {
                    await h.act("block_connection", {
                      p_connection: conversation.id,
                    });
                    setReporting(false);
                  })
                }
              >
                {t("차단만", "Block only")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {userId && h.blocksOpen && (
        <Dialog title={t("내가 차단한 Hi 회원", "People you've blocked on Hi")}
          close={() => { if (!h.busy) { h.setBlocksOpen(false); setUnblocking(null); } }}>
          <div className="hi-settings">
            <p>{t("내가 설정한 차단만 표시합니다. 상대가 설정한 차단은 해제할 수 없어요.", "Only your blocks appear here. You cannot remove another person's block.")}</p>
            {unblocking ? <>
              <h3>{unblocking.display_name} {t("님의 차단을 해제할까요?", "— unblock?")}</h3>
              <p>{t("양쪽의 차단이 모두 해제되면, 이전에 수락한 대화와 메시지를 다시 볼 수 있어요. 수락하지 않은 요청은 원래 만료 시간이 유지되며, 신고는 취소되지 않아요.", "Once neither person is blocking, previously accepted chats and messages reopen. Unaccepted requests keep their original expiry. Reports remain submitted.")}</p>
              <div className="hi-row">
                <button className="outline-button" disabled={h.busy} onClick={() => setUnblocking(null)}>{t("취소", "Cancel")}</button>
                <button className="dark-button" disabled={h.busy} onClick={() => void h.run(async () => {
                  await h.act("unblock_connection", { p_connection: unblocking.connection_id });
                  setUnblocking(null);
                  setNotice(t("내 차단을 해제했어요. 상대가 차단한 경우 대화는 계속 닫혀 있습니다.", "Your block was removed. A block set by the other person still keeps the chat closed."));
                })}>{h.busy ? t("해제 중…", "Unblocking…") : t("차단 해제", "Unblock")}</button>
              </div>
            </> : <>
              <button className="outline-button" disabled={h.busy || h.blocksLoading} onClick={() => void h.run(h.refreshBlocks)}>{t("목록 새로고침", "Refresh list")}</button>
              {h.blocksLoading ? <p role="status">{t("차단 목록을 불러오는 중…", "Loading your blocks…")}</p>
                : !h.blocks.length ? <p>{t("내가 차단한 Hi 회원이 없어요.", "You haven't blocked anyone on Hi.")}</p>
                : <ul className="hi-blocks">{h.blocks.map(item => <li key={item.peer_id}>
                  <span><b>{item.display_name}</b><small>@{item.username}</small></span>
                  <button className="outline-button" disabled={h.busy} aria-label={`${item.display_name} · ${t("차단 해제", "Unblock")}`} onClick={() => { setNotice(""); setUnblocking(item); }}>{t("차단 해제", "Unblock")}</button>
                </li>)}</ul>}
              {h.blocksMore && !h.blocksLoading && <button className="outline-button" disabled={h.busy} onClick={() => void h.run(h.loadMoreBlocks)}>{t("더 보기", "Load more")}</button>}
            </>}
            {notice && <p className="hi-notice" role="status">{notice}</p>}
            {h.error != null && <p className="hi-error" role="alert">{connectError(h.error, en)}</p>}
          </div>
        </Dialog>
      )}
    </section>
  );
}
