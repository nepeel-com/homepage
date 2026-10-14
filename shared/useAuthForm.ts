import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthRateLimit, performAuth, validateAuth, type AuthMode, type AuthNotice } from "./auth";

// A local usability guard, not a substitute for Supabase's server rate limits.
let emailRetryAt = 0;
export function useAuthForm(client: SupabaseClient | null, redirect: string, onDone?: () => void) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((emailRetryAt-Date.now())/1000)));
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(Math.max(0, Math.ceil((emailRetryAt-Date.now())/1000))), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  function cooldown() { emailRetryAt=Date.now()+60000; if (mounted.current) setRemaining(60); }
  function change(next: AuthMode) {
    if (locked.current) return;
    setMode(next); setPassword(""); setError(null); setNotice(null);
  }
  async function submit() {
    if (!client || locked.current) return;
    const fields = { email, password, name };
    const invalid = validateAuth(mode, fields);
    if (invalid) { setError(new Error(invalid)); return; }
    if (mode !== "login" && Date.now() < emailRetryAt) {
      setError(new Error("rate_limit")); return;
    }
    locked.current = true; setPending(true); setError(null); setNotice(null);
    try {
      const result = await performAuth(client, mode, fields, redirect);
      if (result) cooldown();
      if (!mounted.current) return;
      setPassword("");
      setNotice(result);
      if (!result) onDone?.();
    } catch (e) {
      if (mode !== "login" && isAuthRateLimit(e)) cooldown();
      if (mounted.current) setError(e);
    } finally {
      locked.current=false;
      if (mounted.current) setPending(false);
    }
  }
  return { mode, change, email, setEmail, password, setPassword, name, setName,
    pending, error, notice, remaining, submit };
}
