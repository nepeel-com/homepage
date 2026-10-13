import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  LoaderCircle,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Avatar, Dialog, readableError } from "../App";
import { supabase } from "../lib/supabase";
import { addComment, getComments, updateProfile } from "../../shared/data";
import type { Comment, Post, Profile } from "../../shared/types";
import { reportPost, reportReasons } from "../../shared/account";

export function AuthDialog({
  close,
  onDone,
}: {
  close: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
        if (e) throw e;
        setMessage("가입된 이메일이라면 비밀번호 재설정 링크를 보내드려요.");
      } else if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: location.origin,
          },
        });
        if (e) throw e;
        if (data.session) onDone();
        else
          setMessage(
            "메일함을 확인해 주세요. 인증 링크를 누르면 가입이 완료됩니다.",
          );
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (e) throw e;
        onDone();
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setPending(false);
    }
  }
  const change = (next: typeof mode) => {
    setMode(next);
    setError("");
    setMessage("");
  };
  return (
    <Dialog
      title={
        mode === "signup"
          ? "당신의 진짜 세상을 만나볼까요?"
          : mode === "reset"
            ? "비밀번호 다시 설정하기"
            : "다시 만나 반가워요."
      }
      close={close}
    >
      <p className="muted">하나의 계정으로 웹과 앱의 순간을 함께해요.</p>
      {mode !== "reset" && (
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "selected" : ""}
            onClick={() => change("login")}
          >
            로그인
          </button>
          <button
            className={mode === "signup" ? "selected" : ""}
            onClick={() => change("signup")}
          >
            회원가입
          </button>
        </div>
      )}
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        {mode === "signup" && (
          <label>
            이름
            <input
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              placeholder="어떻게 불러드릴까요?"
            />
          </label>
        )}
        <label>
          이메일
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>
        {mode !== "reset" && (
          <label>
            비밀번호
            <input
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="8자 이상 입력해 주세요"
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        {!supabase && (
          <div className="info-box">
            서비스 연결을 준비 중이에요. 지금은 샘플 피드를 둘러볼 수 있어요.
          </div>
        )}
        <button
          className="dark-button full"
          disabled={pending || !supabase || (mode === "signup" && !name.trim())}
        >
          {pending ? (
            <LoaderCircle className="spin" size={18} />
          ) : mode === "signup" ? (
            "내 순간 시작하기"
          ) : mode === "reset" ? (
            "재설정 링크 받기"
          ) : (
            "로그인"
          )}
          <ArrowRight size={17} />
        </button>
      </form>
      <button
        className="text-button auth-reset"
        onClick={() => change(mode === "reset" ? "login" : "reset")}
      >
        {mode === "reset" ? "로그인으로 돌아가기" : "비밀번호를 잊으셨나요?"}
      </button>
      <div className="auth-foot">
        <ShieldCheck size={14} /> 내 일상은 로그인한 멤버에게만 공유돼요.
      </div>
    </Dialog>
  );
}
export function CameraDialog({ close }: { close: () => void }) {
  return (
    <Dialog title="순간은 앱에서 시작돼요." close={close}>
      <div className="camera-dialog-icon">
        <Camera size={40} />
      </div>
      <p className="dialog-lead">
        찍는 건 앱에서.
        <br />
        <b>함께 보는 건 어디서나.</b>
      </p>
      <p className="muted">
        nepeel은 앱 카메라로 직접 촬영한 사진만 게시할 수 있어요. 웹에서는
        피드를 보고, 좋아요와 댓글로 연결돼요.
      </p>
      <ol className="steps">
        <li>
          <span>1</span>공식 nepeel 앱으로 로그인
        </li>
        <li>
          <span>2</span>앱 안에서 지금의 순간 촬영
        </li>
        <li>
          <span>3</span>촬영 확인 후 웹·앱에 함께 게시
        </li>
      </ol>
      <div className="info-box">
        <Smartphone size={18} />
        <span>
          앱 정식 출시 준비 중<br />
          <small>설치한 테스트 앱이 있다면 아래에서 열 수 있어요.</small>
        </span>
      </div>
      <a className="dark-button full" href="nepeel://camera">
        설치된 앱 열기 <ArrowUpRight size={17} />
      </a>
    </Dialog>
  );
}
export function EditProfile({
  profile,
  close,
  saved,
}: {
  profile: Profile;
  close: () => void;
  saved: () => void;
}) {
  const [name, setName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog title="나를 소개해 주세요." close={close}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending || !name.trim()) return;
          setPending(true);
          try {
            await updateProfile(supabase!, profile.id, name, bio);
            saved();
          } catch (e) {
            setError(readableError(e));
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          이름
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          소개
          <textarea
            rows={3}
            maxLength={160}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <small>{bio.length} / 160</small>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="dark-button full" disabled={pending || !name.trim()}>
          저장하기 <Check size={17} />
        </button>
      </form>
    </Dialog>
  );
}
export function Recovery({ close }: { close: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog title="새 비밀번호 설정" close={close}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending) return;
          setPending(true);
          try {
            const { error: e2 } = await supabase!.auth.updateUser({ password });
            if (e2) setError(readableError(e2));
            else close();
          } catch {
            setError("연결을 확인해 주세요.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          새 비밀번호
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="dark-button" disabled={pending}>
          비밀번호 저장
        </button>
      </form>
    </Dialog>
  );
}
export function PostDialog({
  post,
  actions,
  userId,
  close,
  login,
  onComment,
}: {
  post: Post;
  actions: ReactNode;
  userId?: string;
  close: () => void;
  login: () => void;
  onComment: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || post.sample || !userId) return;
    setLoading(true);
    try {
      setComments(await getComments(supabase, post.id));
    } catch {
      setError("댓글을 불러오지 못했어요. 다시 열어 주세요.");
    } finally {
      setLoading(false);
    }
  }, [post.id, post.sample, userId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Dialog title={`${post.display_name}의 순간`} close={close} wide>
      <div className="detail-layout">
        <img
          className="detail-image"
          src={post.image_url}
          alt={post.caption || `${post.display_name}의 사진`}
        />
        <div className="detail-content">
          <div className="detail-caption">
            <Avatar name={post.display_name} />
            <p>
              <b>{post.display_name}</b>
              <span>{post.caption}</span>
            </p>
          </div>
          {actions}
          <div className="comments">
            {loading ? (
              <p className="muted" role="status">
                댓글을 불러오는 중…
              </p>
            ) : comments.length ? (
              comments.map((c) => (
                <div className="comment" key={c.id}>
                  <Avatar name={c.profiles.display_name} size="small" />
                  <p>
                    <b>{c.profiles.display_name}</b>
                    <span>{c.body}</span>
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">
                {post.sample
                  ? "샘플 사진이에요. 가입하고 진짜 순간에 이야기를 남겨보세요."
                  : "첫 번째 이야기를 남겨보세요."}
              </p>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form
            className="comment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!userId || post.sample) return login();
              if (pending || !body.trim()) return;
              setPending(true);
              setError("");
              try {
                await addComment(supabase!, userId, post.id, body);
                setBody("");
                onComment();
                await load();
              } catch {
                setError("댓글을 남기지 못했어요. 다시 시도해 주세요.");
              } finally {
                setPending(false);
              }
            }}
          >
            <input
              aria-label="댓글"
              placeholder="따뜻한 한마디 남기기…"
              maxLength={500}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="댓글 게시"
              disabled={pending || !body.trim()}
            >
              <Send size={20} />
            </button>
          </form>
          <small className="detail-foot">
            {post.sample
              ? "출처: Unsplash · 서비스 화면 예시"
              : "앱 인증을 확인한 사진 · 장면의 진위 자체를 보증하지 않습니다."}
          </small>
        </div>
      </div>
    </Dialog>
  );
}
export function ReportDialog({
  post,
  userId,
  close,
  done,
}: {
  post: Post;
  userId: string;
  close: () => void;
  done: () => void;
}) {
  const [reason, setReason] = useState("synthetic");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog title="이 순간을 신고하기" close={close}>
      <p className="muted">촬영 원칙에 맞지 않거나 불편한 사진을 알려주세요.</p>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending) return;
          setPending(true);
          try {
            await reportPost(supabase!, userId, post.id, reason);
            done();
          } catch {
            setError("연결을 확인해 주세요.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          신고 이유
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {reportReasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="dark-button" disabled={pending}>
          신고 접수
        </button>
      </form>
    </Dialog>
  );
}
export function About({ onCamera }: { onCamera: () => void }) {
  return (
    <section className="about-page">
      <div className="eyebrow">OUR POINT OF VIEW</div>
      <h1>
        LESS FAKE.
        <br />
        <span>MORE LIFE.</span>
      </h1>
      <p className="about-lead">
        완벽하게 만들어진 이미지보다,
        <br />
        조금 서툴러도 직접 살아낸 순간을 믿어요.
      </p>
      <div className="about-photo">
        <img
          src="/images/roadtrip.webp"
          alt="넓은 하늘과 붉은 바위가 펼쳐진 여행지, Unsplash 샘플 사진"
        />
        <span>
          THE WORLD IS STILL OUT THERE. <ArrowUpRight />
        </span>
      </div>
      <h2>
        사진을 고르는 곳이 아니라,
        <br />
        순간을 찍는 곳.
      </h2>
      <p>
        nepeel은 Non-AI를 지향하는 사진 SNS입니다. 사진은 공식 앱의 카메라로만
        촬영하고, 웹과 앱은 같은 계정과 피드로 연결됩니다. 외부 파일 선택이나
        갤러리 업로드는 제공하지 않습니다.
      </p>
      <div className="about-promise">
        <ShieldCheck size={28} />
        <div>
          <h3>‘앱 촬영’ 표시는 무엇을 뜻하나요?</h3>
          <p>
            게시할 때 앱·기기 인증과 사진 데이터의 일치를 서버에서 확인했다는
            뜻입니다. AI 탐지 결과가 아니며, 화면 재촬영이나 모든 기기 변조까지
            막아 장면의 진위를 보장하지는 않습니다.
          </p>
        </div>
      </div>
      <h3>함께 지키는 촬영 원칙</h3>
      <ul>
        <li>내가 직접 마주한 순간을 촬영해 주세요.</li>
        <li>생성 이미지나 다른 사람의 사진을 다시 찍어 올리지 마세요.</li>
        <li>다른 사람의 사생활과 초상권을 존중해 주세요.</li>
        <li>유해한 콘텐츠나 의심스러운 사진은 신고해 주세요.</li>
      </ul>
      <button className="dark-button" onClick={onCamera}>
        내 시선으로 시작하기 <ArrowUpRight size={17} />
      </button>
      <p className="muted">
        둘러보기의 사진은 Unsplash에서 가져온 화면 예시이며, 촬영 인증을 받은
        회원 게시물이 아닙니다.
      </p>
    </section>
  );
}
