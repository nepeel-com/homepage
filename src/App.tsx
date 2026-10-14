import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Aperture,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Flag,
  Heart,
  Home,
  Info,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { sampleMeta, samplePosts } from "./lib/samples";
import { getProfile, setFollowing, setReaction } from "../shared/data";
import { useFeed } from "./useFeed";
import type { FeedMode, Post, Profile } from "../shared/types";
import DeleteAccount from "./components/DeleteAccount";
import PhotoPlace from "./components/PhotoPlace";
import { accountAction } from "../shared/account";
import {
  About,
  AuthDialog,
  CameraDialog,
  EditProfile,
  PostDialog,
  Recovery,
  ReportDialog,
} from "./components/dialogs";

const Connections = lazy(() => import("./components/Connections"));
type View = "feed" | "discover" | "saved" | "profile" | "about" | "hi";
type Modal = "auth" | "camera" | "edit" | "recovery" | "deleteAccount" | null;
const navigation = [
  { id: "feed", label: "홈 피드", icon: Home },
  { id: "discover", label: "발견하기", icon: Compass },
  { id: "hi", label: "Hi 연결", icon: Send },
  { id: "saved", label: "저장한 순간", icon: Bookmark },
  { id: "profile", label: "내 프로필", icon: UserRound },
] as const;
const readView = (): View =>
  ["feed", "discover", "saved", "profile", "about", "hi"].includes(
    location.hash.slice(1),
  )
    ? (location.hash.slice(1) as View)
    : "feed";
export function readableError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (/Invalid login/i.test(message))
    return "이메일 또는 비밀번호를 확인해 주세요.";
  if (/Email not confirmed/i.test(message))
    return "가입 이메일의 인증 링크를 먼저 눌러 주세요.";
  if (/rate limit|too many/i.test(message))
    return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (/already registered/i.test(message))
    return "이미 가입한 이메일입니다. 로그인해 주세요.";
  if (/password/i.test(message))
    return "비밀번호는 8자 이상으로 입력해 주세요.";
  return "연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
function timeLabel(post: Post) {
  if (post.sample) return "샘플 사진";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(post.created_at)) / 60000),
  );
  return minutes < 1
    ? "방금 전"
    : minutes < 60
      ? `${minutes}분 전`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}시간 전`
        : new Date(post.created_at).toLocaleDateString("ko-KR");
}
export function Avatar({
  name,
  size = "",
  index = 0,
}: {
  name: string;
  size?: string;
  index?: number;
}) {
  return (
    <span aria-hidden="true" className={`avatar ${size} tone-${index % 4}`}>
      {name.slice(0, 1)}
    </span>
  );
}
function Brand() {
  return (
    <span className="brand">
      nepeel
      <Aperture aria-hidden="true" />
    </span>
  );
}
export function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export default function App() {
  const [view, setView] = useState<View>(readView);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [profileState, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<"all" | "following">("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [detail, setDetail] = useState<Post | null>(null);
  const [report, setReport] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const busyRef = useRef(new Set<string>());
  const authUser = useRef<string | null>(null);
  const [postLink, setPostLink] = useState(() =>
    location.hash.startsWith("#post/") ? location.hash.slice(6) : "",
  );
  const preview = !session;
  const userId = session?.user.id;
  const profile = profileState?.id === userId ? profileState : null;
  const notify = (text: string) => setNotice(text);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    const onHash = () => {
      setView(readView());
      setPostLink(
        location.hash.startsWith("#post/") ? location.hash.slice(6) : "",
      );
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEvent = false;
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (active && !authEvent) {
        authUser.current = data.session?.user.id ?? null;
        setSession(data.session);
        setAuthReady(true);
        if (authError) setNotice("로그인 상태를 확인할 수 없습니다.");
      }
    }).catch(() => {
      if (active) { setAuthReady(true); setNotice("로그인 상태를 불러오지 못했어요. 다시 로그인해 주세요."); }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      authEvent = true;
      const changedAccount = !!authUser.current && authUser.current !== next?.user.id;
      authUser.current = next?.user.id ?? null;
      setSession(next);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setModal("recovery");
      if (!next || changedAccount) {
        setProfile(null);
        setDetail(null);
        setReport(null);
        setDeleting(null);
        if (changedAccount) setModal(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }
    let active = true;
    getProfile(supabase, userId)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => {
        if (active)
          setNotice("프로필을 불러오지 못했습니다. 연결 설정을 확인해 주세요.");
      });
    return () => {
      active = false;
    };
  }, [userId, refresh]);
  const feedMode: FeedMode =
    view === "saved"
      ? "saved"
      : view === "profile"
        ? "profile"
        : view === "discover"
          ? "all"
          : mode;
  const feed = useFeed({
    client: supabase, userId, enabled: authReady && view !== "hi" && view !== "about",
    scope: view, mode: feedMode, search, postId: postLink, refresh,
  });
  const { setPosts, loading, hasMore, nextPage, loadingMore: loadMore } = feed;
  const reloadFeed = feed.reload;
  useEffect(() => {
    const resume = () => { if (document.visibilityState === "visible") void reloadFeed(4 * 60_000); };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [reloadFeed]);
  const error = feed.error ? "피드를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." : "";
  const posts = !userId && authReady
    ? view === "saved" || view === "profile" || (mode === "following" && view === "feed")
      ? []
      : samplePosts.filter((post) => `${post.caption}${post.display_name}`.includes(search))
    : feed.posts;
  const go = (next: View) => {
    setSearch("");
    setSearchDraft("");
    setDetail(null);
    location.hash = next;
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const requireMember = (post?: Post) => {
    if (!session || post?.sample) {
      setModal("auth");
      return false;
    }
    return true;
  };
  async function run(key: string, action: () => Promise<void>) {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusy([...busyRef.current]);
    try {
      await action();
    } catch (e) {
      notify(readableError(e));
    } finally {
      busyRef.current.delete(key);
      setBusy([...busyRef.current]);
    }
  }
  const patchPost = (id: string, patch: Partial<Post>) => {
    setPosts((old) => old.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setDetail((old) => (old?.id === id ? { ...old, ...patch } : old));
  };
  async function react(post: Post, kind: "likes" | "bookmarks") {
    if (!requireMember(post) || !supabase || !userId) return;
    const enabled = !(kind === "likes" ? post.liked : post.saved);
    await run(`${kind}-${post.id}`, async () => {
      await setReaction(supabase!, kind, userId, post.id, enabled);
      patchPost(
        post.id,
        kind === "likes"
          ? {
              liked: enabled,
              like_count: Math.max(
                0,
                Number(post.like_count) + (enabled ? 1 : -1),
              ),
            }
          : { saved: enabled },
      );
      if (view === "saved" && !enabled && kind === "bookmarks")
        setPosts((old) => old.filter((p) => p.id !== post.id));
    });
  }
  async function follow(post: Post) {
    if (!requireMember(post) || !supabase || !userId) return;
    await run(`follow-${post.user_id}`, async () => {
      await setFollowing(supabase!, userId, post.user_id, !post.following);
      setPosts((old) =>
        old.map((p) =>
          p.user_id === post.user_id ? { ...p, following: !post.following } : p,
        ),
      );
    });
  }
  async function share(post: Post) {
    if (post.sample)
      return notify("샘플 사진입니다. 실제 게시물은 링크로 공유할 수 있어요.");
    const url = `${location.origin}/#post/${post.id}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "nepeel · 있는 그대로의 순간", url });
      else {
        await navigator.clipboard.writeText(url);
        notify("링크를 복사했어요. 로그인한 멤버에게만 사진이 보여요.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify("링크를 공유하지 못했어요. 다시 시도해 주세요.");
    }
  }
  function searchSubmit(e: FormEvent) {
    e.preventDefault();
    setSearch(searchDraft.trim());
    location.hash = "discover";
    setView("discover");
  }
  const reset = () => {
    setSearch("");
    setSearchDraft("");
    setMode("all");
    location.hash = "feed";
    setRefresh((v) => v + 1);
  };
  const actions = (post: Post) => (
    <div className="post-actions">
      <button
        className={`icon-button ${post.liked ? "liked" : ""}`}
        aria-label={post.liked ? "좋아요 취소" : "좋아요"}
        aria-pressed={post.liked}
        disabled={busy.includes(`likes-${post.id}`)}
        onClick={() => void react(post, "likes")}
      >
        <Heart fill={post.liked ? "currentColor" : "none"} />
      </button>
      <button
        className="icon-button"
        aria-label="댓글 보기"
        onClick={() => setDetail(post)}
      >
        <MessageCircle />
      </button>
      <button
        className="icon-button"
        aria-label="게시물 공유"
        onClick={() => void share(post)}
      >
        <Send />
      </button>
      <span className="action-spacer" />
      <span className={`capture-label ${post.sample ? "sample" : ""}`}>
        {post.sample ? <Info size={13} /> : <ShieldCheck size={13} />}
        {post.sample ? "미리보기" : "앱 촬영"}
      </span>
      <button
        className={`icon-button ${post.saved ? "saved" : ""}`}
        aria-label={post.saved ? "저장 취소" : "사진 저장"}
        aria-pressed={post.saved}
        disabled={busy.includes(`bookmarks-${post.id}`)}
        onClick={() => void react(post, "bookmarks")}
      >
        <Bookmark fill={post.saved ? "currentColor" : "none"} />
      </button>
    </div>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="site-frame">
      <aside className="sidebar">
        <a
          className="brand-link"
          href="#feed"
          onClick={() => go("feed")}
          aria-label="nepeel 홈"
        >
          <Brand />
        </a>
        <div className="brand-caption">LESS FAKE. MORE LIFE.</div>
        <nav aria-label="메인 메뉴">
          {navigation.map((item) => (
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                go(item.id);
              }}
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon strokeWidth={view === item.id ? 2.5 : 1.7} />
              <span>{item.label}</span>
              {view === item.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <button className="capture-button" onClick={() => setModal("camera")}>
          <Plus size={21} />
          <span>순간 기록하기</span>
          <ArrowUpRight size={17} />
        </button>
        <div className="sidebar-manifesto">
          <span className="tiny-label">A LITTLE MORE REAL.</span>
          <p>
            만들어낸 장면 대신,
            <br />
            살아가는 순간들.
          </p>
          <button onClick={() => go("about")}>
            nepeel의 약속 <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          {session ? (
            <button className="account-button" onClick={() => go("profile")}>
              <Avatar name={profile?.display_name ?? "나"} />
              <span>
                <b>{profile?.display_name ?? "내 계정"}</b>
                <small>나의 기록</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button className="account-button" onClick={() => setModal("auth")}>
              <span className="avatar neutral">
                <UserRound size={20} />
              </span>
              <span>
                <b>나답게, 시작하기</b>
                <small>로그인 / 회원가입</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
          <div className="sidebar-foot">
            <span>© 2026 nepeel</span>
            <span>Made for real life.</span>
          </div>
        </div>
      </aside>
      <div className="app-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <a href="#feed" onClick={() => go("feed")} aria-label="nepeel 홈">
              <Brand />
            </a>
          </div>
          <div className="topbar-note">
            <span className="live-dot" /> YOUR LIFE. YOUR LENS.
          </div>
          <form className="search-field" onSubmit={searchSubmit} role="search">
            <Search size={17} />
            <input
              aria-label="사람 또는 순간 검색"
              placeholder="사람, 순간을 찾아보세요"
              value={searchDraft}
              maxLength={80}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <button
            className="top-account"
            onClick={() => (session ? go("profile") : setModal("auth"))}
          >
            {session ? (
              <Avatar name={profile?.display_name ?? "나"} size="small" />
            ) : (
              <>
                함께하기 <ArrowUpRight size={15} />
              </>
            )}
          </button>
        </header>
        <div className="page-layout">
          <main id="main" tabIndex={-1}>
            {view === "about" ? (
              <About onCamera={() => setModal("camera")} />
            ) : view === "hi" ? (
              <Suspense
                fallback={
                  <p className="hi-empty" role="status">
                    Hi를 준비하고 있어요…
                  </p>
                }
              >
                <Connections
                  key={userId ?? "guest"}
                  userId={userId}
                  login={() => setModal("auth")}
                />
              </Suspense>
            ) : (
              <>
                {view === "feed" && !postLink && (
                  <>
                    <div className="page-heading">
                      <div>
                        <div className="eyebrow">THE REAL SIDE OF SOCIAL</div>
                        <h1>
                          있는 그대로, 연결되다
                          <span className="lime-period">.</span>
                        </h1>
                        <p>평범해서 더 소중한, 우리의 오늘.</p>
                      </div>
                      <span className="outline-stamp">
                        YOUR LENS.
                        <br />
                        <b>JUST LIFE.</b>
                      </span>
                    </div>
                    <section className="manifesto-banner">
                      <div>
                        <span className="tiny-label">
                          CAPTURED, NOT GENERATED.
                        </span>
                        <h2>진짜 순간만 들어올 수 있는 곳.</h2>
                        <p>
                          AI 이미지 없이. 갤러리 업로드 없이.
                          <br className="mobile-break" /> 오직 앱에서 직접 찍은
                          사진으로.
                        </p>
                        <button onClick={() => go("about")}>
                          우리가 연결되는 방식 <ArrowRight size={16} />
                        </button>
                      </div>
                      <div className="banner-lens" aria-hidden="true">
                        <Aperture />
                        <span>
                          YOUR
                          <br />
                          POINT
                          <br />
                          OF VIEW.
                        </span>
                      </div>
                    </section>
                    <section
                      className="moment-strip"
                      aria-label="발견할 순간들"
                    >
                      <div className="section-line">
                        <h2>작은 순간, 넓은 세상</h2>
                        <button onClick={() => go("discover")}>
                          둘러보기 <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className="moments">
                        {(preview ? samplePosts : posts)
                          .slice(0, 4)
                          .map((post, i) => (
                            <button
                              className="moment"
                              key={post.id}
                              onClick={() => setDetail(post)}
                            >
                              <span className="moment-image">
                                <img src={post.image_url} alt="" />
                                <span>
                                  <ArrowUpRight size={15} />
                                </span>
                              </span>
                              <b>
                                {post.sample
                                  ? sampleMeta[i].tag
                                  : post.display_name}
                              </b>
                              <small>
                                {post.sample ? "샘플 컬렉션" : "새로운 기록"}
                              </small>
                            </button>
                          ))}
                        {!preview && !posts.length && (
                          <div className="moment-invite">
                            <Camera />
                            <span>오늘의 첫 순간을 남겨보세요.</span>
                            <button onClick={() => setModal("camera")}>
                              앱으로 촬영하기 <ArrowUpRight size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
                {view === "discover" && (
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">A WORLD THROUGH YOUR LENS</div>
                      <h1>
                        발견하기<span className="lime-period">.</span>
                      </h1>
                      <p>
                        {search
                          ? `“${search}”의 순간들`
                          : "스크롤 너머, 누군가의 진짜 하루."}
                      </p>
                    </div>
                    <Compass className="heading-icon" />
                  </div>
                )}
                {view === "saved" && (
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">KEEP A LITTLE INSPIRATION</div>
                      <h1>
                        저장한 순간<span className="lime-period">.</span>
                      </h1>
                      <p>다시 꺼내 보고 싶은 장면들을 모아두세요.</p>
                    </div>
                    <Bookmark className="heading-icon" />
                  </div>
                )}
                {view === "profile" && (
                  <section className="profile-panel">
                    <Avatar name={profile?.display_name ?? "나"} size="large" />
                    <div>
                      <div className="eyebrow">MY POINT OF VIEW</div>
                      <h1>
                        {profile?.display_name ?? "당신의 이야기를 기다려요."}
                      </h1>
                      <p>
                        {profile?.bio ||
                          "작은 순간부터, 있는 그대로 남겨보세요."}
                      </p>
                      {session && <small>@{profile?.username}</small>}
                    </div>
                    {session && (
                      <div className="profile-controls">
                        <button
                          className="outline-button"
                          onClick={() => go("saved")}
                        >
                          <Bookmark size={16} /> 저장한 순간
                        </button>
                        <button
                          className="outline-button"
                          onClick={() => setModal("edit")}
                        >
                          프로필 수정
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            void run("signout", async () => {
                              const { error: e } =
                                await supabase!.auth.signOut();
                              if (e) throw e;
                              go("feed");
                            })
                          }
                        >
                          <LogOut size={15} /> 로그아웃
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setModal("deleteAccount")}
                        >
                          회원 탈퇴
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {postLink && (
                  <button className="back-link" onClick={reset}>
                    <ArrowLeft size={16} /> 전체 피드로
                  </button>
                )}
                <div className="feed-toolbar">
                  <div className="feed-tabs">
                    {view === "feed" && !postLink ? (
                      <>
                        <button
                          className={mode === "all" ? "selected" : ""}
                          onClick={() => setMode("all")}
                        >
                          모두의 순간
                        </button>
                        <button
                          className={mode === "following" ? "selected" : ""}
                          onClick={() => setMode("following")}
                        >
                          팔로잉
                        </button>
                      </>
                    ) : (
                      <h2>
                        {view === "profile"
                          ? "내가 남긴 순간"
                          : postLink
                            ? "공유된 순간"
                            : "모든 순간"}
                      </h2>
                    )}
                  </div>
                  <button
                    className="sort-label"
                    onClick={() => {
                      void reloadFeed();
                      notify("최신 순간을 불러옵니다.");
                    }}
                    aria-label="최신순 피드 새로고침"
                    disabled={feed.refreshing || loading}
                  >
                    <SlidersHorizontal size={14} /> 최신순
                  </button>
                </div>
                {feed.refreshing && <p className="loading-state" role="status"><LoaderCircle className="spin" /> 최신 순간을 불러오는 중</p>}
                {feed.refreshError && <div className="form-error" role="alert">
                  새 사진을 불러오지 못했어요. 기존 사진은 그대로 볼 수 있어요.
                  <button className="text-button" onClick={() => void reloadFeed()}>다시 시도</button>
                </div>}
                {preview && (
                  <div className="preview-note">
                    <span>
                      <Info size={14} />
                      {postLink
                        ? "이 사진은 로그인한 멤버에게만 보여요."
                        : "둘러보기 · 실제 회원 게시물이 아닌 샘플 사진입니다."}
                    </span>
                    <button onClick={() => setModal("auth")}>
                      로그인 <ArrowRight size={13} />
                    </button>
                  </div>
                )}
                {loading || !authReady ? (
                  <div className="loading-state" role="status">
                    <LoaderCircle className="spin" /> 순간들을 불러오는 중
                  </div>
                ) : error ? (
                  <div className="empty-state">
                    <RefreshCw />
                    <h3>잠시 연결이 끊겼어요.</h3>
                    <p>{error}</p>
                    <button
                      className="dark-button"
                      onClick={() => void reloadFeed()}
                    >
                      다시 시도
                    </button>
                  </div>
                ) : !posts.length || (postLink && preview) ? (
                  <div className="empty-state">
                    <Camera />
                    <h3>
                      {preview &&
                      (view === "saved" ||
                        view === "profile" ||
                        mode === "following" ||
                        postLink)
                        ? "당신의 연결을 시작해 보세요."
                        : search
                          ? "아직 발견하지 못한 순간이에요."
                          : "첫 번째 순간을 기다리고 있어요."}
                    </h3>
                    <p>
                      {preview
                        ? "로그인하면 같은 계정으로 웹과 앱을 함께 사용할 수 있어요."
                        : search
                          ? "다른 단어로 찾아보세요."
                          : mode === "following"
                            ? "마음에 드는 사람을 팔로우해 보세요."
                            : view === "saved"
                              ? "마음에 드는 사진의 책갈피를 눌러보세요."
                              : "앱에서 촬영한 사진이 이곳에도 함께 나타납니다."}
                    </p>
                    <button
                      className="dark-button"
                      onClick={() =>
                        preview
                          ? setModal("auth")
                          : search || mode === "following" || view === "saved"
                            ? reset()
                            : setModal("camera")
                      }
                    >
                      {preview
                        ? "로그인 / 회원가입"
                        : search || mode === "following" || view === "saved"
                          ? "모든 순간 보기"
                          : "순간 기록하기"}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    className={
                      view === "discover" ? "explore-grid" : "feed-list"
                    }
                  >
                    {posts.map((post, i) =>
                      view === "discover" ? (
                        <button
                          className="explore-item"
                          key={post.id}
                          onClick={() => setDetail(post)}
                        >
                          <img
                            src={post.image_url}
                            alt={post.caption || `${post.display_name}의 사진`}
                            loading="lazy"
                          />
                          <span className="explore-info">
                            <b>{post.display_name}</b>
                            <span>
                              {post.sample ? "미리보기" : "앱 촬영"}{" "}
                              <ArrowUpRight size={15} />
                            </span>
                          </span>
                        </button>
                      ) : (
                        <article className="post" key={post.id}>
                          <header className="post-header">
                            <Avatar name={post.display_name} index={i} />
                            <div className="post-person">
                              <b>
                                {post.display_name}
                                <span>
                                  @
                                  {post.username.length > 18
                                    ? post.username.slice(0, 12) + "…"
                                    : post.username}
                                </span>
                              </b>
                              <small>
                                {post.sample
                                  ? sampleMeta.find((m) => m.id === post.id)
                                      ?.location
                                  : "직접 남긴 순간"}
                                <i>·</i>
                                {timeLabel(post)}
                              </small>
                            </div>
                            {post.user_id !== userId && (
                              <button
                                className={`follow-button ${post.following ? "is-following" : ""}`}
                                onClick={() => void follow(post)}
                                disabled={busy.includes(
                                  `follow-${post.user_id}`,
                                )}
                              >
                                {post.following ? (
                                  <>
                                    <Check size={13} /> 팔로잉
                                  </>
                                ) : (
                                  "팔로우"
                                )}
                              </button>
                            )}
                            {!post.sample && (
                              <button
                                className="icon-button compact"
                                aria-label={
                                  post.user_id === userId
                                    ? "게시물 삭제"
                                    : "게시물 신고"
                                }
                                onClick={() =>
                                  post.user_id === userId
                                    ? setDeleting(post)
                                    : setReport(post)
                                }
                              >
                                {post.user_id === userId ? (
                                  <Trash2 size={17} />
                                ) : (
                                  <Flag size={17} />
                                )}
                              </button>
                            )}
                          </header>
                          <button
                            className={`post-photo ${post.sample ? post.id : ""}`}
                            onClick={() => setDetail(post)}
                            aria-label={`${post.display_name}의 사진 크게 보기`}
                          >
                            <img
                              src={post.image_url}
                              alt={
                                post.caption || `${post.display_name}의 사진`
                              }
                              loading={i === 0 ? "eager" : "lazy"}
                            />
                            <span className="photo-corner">
                              <Camera size={13} />{" "}
                              {post.sample ? "SAMPLE MOMENT" : "SHOT ON NEPEEL"}
                            </span>
                            <span className="photo-index">
                              {String(i + 1).padStart(2, "0")} / REAL LIFE
                            </span>
                          </button>
                          {actions(post)}
                          <div className="post-copy">
                            {!post.sample && Number(post.like_count) > 0 && (
                              <strong className="like-count">
                                좋아요{" "}
                                {Number(post.like_count).toLocaleString()}개
                              </strong>
                            )}
                            <p>
                              <b>{post.display_name}</b> {post.caption}
                            </p>
                            <PhotoPlace post={post} userId={userId} onChange={patch=>patchPost(post.id,patch)}/>
                            <button
                              className="comment-link"
                              onClick={() => setDetail(post)}
                            >
                              {post.comment_count
                                ? `댓글 ${post.comment_count}개 보기`
                                : "이 순간에 한마디 남기기"}
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                )}
                {feed.moreError && (
                  <p className="form-error" role="alert">
                    다음 사진을 불러오지 못했어요. 다시 눌러 시도해 주세요.
                  </p>
                )}
                {hasMore && (
                  <button
                    className="load-more outline-button"
                    onClick={() => void nextPage()}
                    disabled={loadMore}
                    aria-busy={loadMore}
                  >
                    {loadMore ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ArrowDown size={16} />
                    )}{" "}
                    더 많은 순간 보기
                  </button>
                )}
                {!loading && posts.length > 0 && !hasMore && (
                  <div className="feed-end">
                    <Aperture size={25} />
                    <p>화면 밖에도, 좋은 순간이 기다리고 있어요.</p>
                    <span>GO LIVE A LITTLE.</span>
                  </div>
                )}
              </>
            )}
          </main>
          <aside className="right-rail">
            <section className="hi-invite-card">
              <span>A LITTLE HI. A NEW POSSIBILITY.</span>
              <h2>좋아요, 그다음은 hi.</h2>
              <p>
                같은 도시부터 지구 반대편까지.
                <br />
                서로의 조건이 맞는 사람과 인사해요.
              </p>
              <button className="dark-button" onClick={() => go("hi")}>
                Hi 연결 시작하기 <ArrowUpRight size={17} />
              </button>
            </section>
            <section className="welcome-card">
              <div className="card-eyebrow">
                <span className="live-dot" /> ONLY ON NEPEEL
              </div>
              <h2>
                그럴듯한 세상보다,
                <br />
                <span>당신의 진짜 세상.</span>
              </h2>
              <p>
                잘 나온 사진이 아니어도 괜찮아요.
                <br />
                직접 마주한 순간이면 충분해요.
              </p>
              <button
                className="dark-button"
                onClick={() =>
                  session ? setModal("camera") : setModal("auth")
                }
              >
                {session ? "오늘의 순간 남기기" : "나의 순간 시작하기"}
                <ArrowUpRight size={17} />
              </button>
              <small>
                <ShieldCheck size={13} /> 웹과 앱, 하나의 계정으로
              </small>
            </section>
            <section className="rules-card">
              <div className="section-line">
                <h2>우리의 작은 원칙</h2>
                <Aperture size={19} />
              </div>
              <div className="rule-row">
                <span>01</span>
                <div>
                  <b>직접 찍어요.</b>
                  <p>nepeel 앱 카메라로만 촬영해요.</p>
                </div>
                <Camera size={17} />
              </div>
              <div className="rule-row">
                <span>02</span>
                <div>
                  <b>있는 그대로 나눠요.</b>
                  <p>AI 생성 이미지와 외부 파일은 받지 않아요.</p>
                </div>
                <Sparkles size={17} />
              </div>
              <div className="rule-row">
                <span>03</span>
                <div>
                  <b>진짜 사람과 연결돼요.</b>
                  <p>멤버끼리 서로의 일상을 만나요.</p>
                </div>
                <UserRound size={17} />
              </div>
              <button className="text-button" onClick={() => go("about")}>
                촬영 확인은 어떻게 하나요? <ArrowRight size={13} />
              </button>
            </section>
            <section className="app-card">
              <div className="app-card-art" aria-hidden="true">
                <div className="mini-phone">
                  <div className="mini-notch" />
                  <Aperture />
                  <div className="mini-shutter" />
                </div>
                <span className="orbit-label">
                  GO OUT.
                  <br />
                  LOOK UP.
                  <br />
                  CAPTURE.
                </span>
                <span className="sticker">
                  IT'S YOUR
                  <br />
                  <b>REAL LIFE.</b>
                </span>
              </div>
              <div className="app-card-copy">
                <div>
                  <h3>좋은 순간은, 밖에 있으니까.</h3>
                  <p>앱에서 찍고, 어디서나 연결돼요.</p>
                </div>
                <button
                  className="icon-button"
                  aria-label="앱 촬영 안내"
                  onClick={() => setModal("camera")}
                >
                  <ArrowUpRight />
                </button>
              </div>
            </section>
            <div className="rail-footer">
              <button onClick={() => go("about")}>
                서비스 소개 · 커뮤니티 원칙
              </button>
              <p>© 2026 nepeel. Keep it real.</p>
              <span>NO GENERATED MOMENTS.</span>
            </div>
          </aside>
        </div>
      </div>
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {navigation.slice(0, 2).map((item) => (
          <button
            key={item.id}
            aria-label={item.label}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            <item.icon />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          className="mobile-capture"
          aria-label="앱으로 순간 기록하기"
          onClick={() => setModal("camera")}
        >
          <Plus />
        </button>
        {navigation
          .slice(2)
          .filter((item) => item.id !== "saved")
          .map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "auth" && (
        <AuthDialog
          close={() => setModal(null)}
          onDone={() => {
            setModal(null);
            notify("반가워요. 당신의 순간을 기다렸어요.");
          }}
        />
      )}
      {modal === "camera" && <CameraDialog close={() => setModal(null)} />}
      {modal === "edit" && profile && (
        <EditProfile
          profile={profile}
          close={() => setModal(null)}
          saved={() => {
            setModal(null);
            setRefresh((v) => v + 1);
            notify("프로필을 저장했어요.");
          }}
        />
      )}
      {modal === "recovery" && <Recovery close={() => setModal(null)} />}
      {detail && (
        <PostDialog
          post={detail}
          actions={actions(detail)}
          userId={userId}
          close={() => setDetail(null)}
          onDetails={patch=>patchPost(detail.id,patch)}
          login={() => {
            setDetail(null);
            setModal("auth");
          }}
          onComment={() =>
            patchPost(detail.id, {
              comment_count: Number(detail.comment_count) + 1,
            })
          }
        />
      )}
      {modal === "deleteAccount" && session && (
        <DeleteAccount
          key={userId}
          userId={userId!}
          close={() => setModal(null)}
          done={() => {
            setModal(null);
            go("feed");
            setNotice("계정이 삭제되었습니다.");
          }}
        />
      )}
      {report && (
        <ReportDialog
          post={report}
          userId={userId!}
          close={() => setReport(null)}
          done={() => {
            setReport(null);
            notify("신고를 접수했어요. 운영자가 확인하겠습니다.");
          }}
        />
      )}
      {deleting && (
        <Dialog title="이 순간을 삭제할까요?" close={() => setDeleting(null)}>
          <p className="muted">
            사진과 좋아요, 댓글이 삭제됩니다. 이 작업은 되돌릴 수 없어요.
          </p>
          <button
            className="dark-button full"
            disabled={busy.includes("delete")}
            onClick={() =>
              void run("delete", async () => {
                await accountAction(supabase!, "", { action: "delete", postId: deleting.id }, userId!);
                setPosts((old) => old.filter((p) => p.id !== deleting.id));
                setDeleting(null);
                notify("사진을 삭제했어요.");
              })
            }
          >
            삭제하기
          </button>
        </Dialog>
      )}
    </>
  );
}
