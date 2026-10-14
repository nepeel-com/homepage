import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dialog } from "../App";
import { supabase } from "../lib/supabase";
import { authError } from "../../shared/auth";

export function Recovery({ close, client = supabase }: { close: () => void; client?: SupabaseClient | null }) {
  const [en, setEn] = useState(() => (localStorage.getItem("nepeel.hi.language") || (navigator.language.startsWith("ko") ? "ko" : "en")) === "en");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const t = (ko: string, english: string) => en ? english : ko;
  return <Dialog title={t("새 비밀번호 설정", "Set a new password")} close={() => { if (!locked.current) close(); }}>
    <div lang={en ? "en" : "ko"}>
      <button className="text-button auth-reset" disabled={pending} onClick={() => setEn(!en)}>{en ? "한국어" : "English"}</button>
      {saved ? <>
        <p className="form-success" role="status">{t("새 비밀번호를 저장했어요. 앱에서도 새 비밀번호로 로그인해 주세요.", "Your new password is saved. Use it to sign in on the app too.")}</p>
        <button className="dark-button full" onClick={close}>{t("계속하기", "Continue")}</button>
      </> : <form className="form-stack" onSubmit={async e => {
        e.preventDefault();
        if (locked.current || !client) return;
        if (password.length < 8) { setError(new Error("INVALID_PASSWORD")); return; }
        if (password !== confirmation) { setError("mismatch"); return; }
        locked.current = true; setPending(true); setError(null);
        try {
          const { error: nextError } = await client.auth.updateUser({ password });
          if (nextError) throw nextError;
          setPassword(""); setConfirmation(""); setSaved(true);
        } catch (nextError) { setError(nextError); }
        finally { locked.current = false; setPending(false); }
      }}>
        <label>{t("새 비밀번호", "New password")}
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={pending}/>
        </label>
        <label>{t("새 비밀번호 확인", "Confirm new password")}
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={pending}/>
        </label>
        {error != null && <p role="alert" className="form-error">{error === "mismatch" ? t("두 비밀번호가 일치하지 않아요.", "The passwords don't match.") : authError(error, en)}</p>}
        <button className="dark-button full" disabled={pending || !client}>{pending ? t("저장 중…", "Saving…") : t("비밀번호 저장", "Save password")}</button>
      </form>}
    </div>
  </Dialog>;
}
