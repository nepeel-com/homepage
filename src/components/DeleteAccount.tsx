import { useEffect, useRef, useState } from "react";
import { Dialog } from "../App";
import { supabase } from "../lib/supabase";
import { accountAction } from "../../shared/account";

export default function DeleteAccount({
  close,
  done,
  userId,
}: {
  close: () => void;
  done: () => void;
  userId: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Dialog
      title="nepeel 회원 탈퇴"
      close={() => {
        if (!busy) close();
      }}
    >
      <p className="muted">
        계정과 프로필, 게시물, 댓글, 저장 목록, Hi 설정과 대화가 삭제됩니다.
        상대방의 대화 목록에서도 사라지며 복구할 수 없어요.
      </p>
      <div className="info-box">
        사진 원본도 삭제됩니다. 서버 연결이 지연되면 자동으로 다시 정리하며,
        이미 다른 사람이 저장한 사본은 회수할 수 없어요.
      </div>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current || confirmation !== "DELETE" || !password) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await accountAction(
              supabase!,
              "",
              {
                action: "deleteAccount",
                password,
                confirmation,
              },
              userId,
            );
            const { data } = await supabase!.auth.getSession();
            if (!alive.current || data.session?.user.id !== userId) return;
            setPassword("");
            await supabase!.auth.signOut({ scope: "local" });
            if (alive.current) done();
          } catch (e) {
            if (alive.current)
              setError(
                e instanceof Error ? e.message : "탈퇴를 완료하지 못했어요.",
              );
          } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
          }
        }}
      >
        <label>
          현재 비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={1024}
            disabled={busy}
          />
        </label>
        <label>
          확인을 위해 DELETE를 입력해 주세요
          <input
            autoComplete="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="dark-button full"
          disabled={busy || confirmation !== "DELETE" || !password}
        >
          {busy ? "계정을 삭제하는 중…" : "계정과 데이터 영구 삭제"}
        </button>
        <button
          type="button"
          className="outline-button full"
          disabled={busy}
          onClick={close}
        >
          계속 함께하기
        </button>
      </form>
    </Dialog>
  );
}
