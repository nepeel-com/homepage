import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthMode = "login" | "signup" | "reset" | "resend";
export type AuthNotice = "confirm" | "reset" | "resend";
export interface AuthFields { email: string; password: string; name: string }
export function authRedirect(base: string) {
  const url = new URL(base);
  if (url.username || url.password || (url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new Error("INVALID_REDIRECT");
  // Never carry page hashes, tokens, or user-entered parameters into an email.
  return url.origin;
}
export function validateAuth(mode: AuthMode, fields: AuthFields) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) return "INVALID_EMAIL";
  if (mode === "signup" && (!fields.name.trim() || fields.name.trim().length > 40)) return "INVALID_NAME";
  if ((mode === "signup" && fields.password.length < 8) || (mode === "login" && !fields.password)) return "INVALID_PASSWORD";
  return null;
}
export function authErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return "code" in error && error.code ? String(error.code)
    : "message" in error ? String(error.message) : "";
}
export function isAuthRateLimit(error: unknown) {
  return /over_.*rate_limit|rate.?limit|too many/i.test(authErrorCode(error));
}
export function authError(error: unknown, en = false) {
  const code = typeof error === "string" ? error : authErrorCode(error);
  const entries = [
    [/INVALID_EMAIL|email_address_invalid/i, "이메일 주소를 확인해 주세요.", "Check your email address."],
    [/INVALID_NAME/i, "이름을 1~40자로 입력해 주세요.", "Enter a name with 1–40 characters."],
    [/INVALID_PASSWORD|weak_password/i, "새 비밀번호는 8자 이상이어야 해요. 로그인할 때는 기존 비밀번호를 입력해 주세요.", "Use at least 8 characters for a new password, or enter your existing password to sign in."],
    [/email_not_confirmed|Email not confirmed/i, "이메일 인증이 필요해요. 아래에서 인증메일을 다시 받을 수 있어요.", "Confirm your email first. You can request another confirmation email below."],
    [/invalid_credentials|Invalid login/i, "이메일 또는 비밀번호를 확인해 주세요.", "Check your email or password."],
    [/over_.*rate_limit|rate.?limit|too many/i, "요청이 많아요. 잠시 후 다시 시도해 주세요.", "Too many requests. Please wait before trying again."],
    [/user_already_exists|already registered/i, "이미 가입한 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.", "Try signing in or resetting your password."],
    [/same_password/i, "기존과 다른 새 비밀번호를 입력해 주세요.", "Choose a password different from your current one."],
    [/otp_expired|session_not_found|session_expired|Auth session missing/i, "링크가 만료됐어요. 로그인 화면에서 새 메일을 요청해 주세요.", "This link expired. Request a fresh email from the sign-in screen."],
    [/email_address_not_authorized|email_provider_disabled|unexpected_failure/i, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.", "We couldn't send the email. Please try again later."],
  ] as const;
  const found = entries.find(([pattern]) => pattern.test(code));
  return found ? found[en ? 2 : 1] : en
    ? "Couldn't connect. Check your connection and try again."
    : "연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.";
}
export function authNotice(notice: AuthNotice, en = false) {
  const text = {
    confirm: ["메일함과 스팸함을 확인해 주세요. 인증 링크를 누른 뒤 웹이나 앱에서 로그인할 수 있어요.", "Check your inbox and spam folder. Confirm your email, then sign in on the web or app."],
    reset: ["가입된 주소라면 복구 메일을 보내드려요. 링크에서 새 비밀번호를 저장한 뒤 앱에서도 로그인할 수 있어요.", "If this address has an account, we'll send a recovery email. Save your new password through the link, then sign in on the app too."],
    resend: ["가입 인증이 필요한 주소라면 인증메일을 보내드려요. 메일함과 스팸함을 확인해 주세요.", "If this address needs signup confirmation, we'll send an email. Check your inbox and spam folder."],
  };
  return text[notice][en ? 1 : 0];
}
export async function performAuth(client: SupabaseClient, mode: AuthMode, fields: AuthFields, baseUrl: string): Promise<AuthNotice | null> {
  const invalid = validateAuth(mode, fields);
  if (invalid) throw new Error(invalid);
  const email = fields.email.trim();
  const redirect = authRedirect(baseUrl);
  if (mode === "login") {
    const { data, error } = await client.auth.signInWithPassword({ email, password: fields.password });
    if (error) throw error;
    if (!data.session) throw new Error("SESSION_MISSING");
    return null;
  }
  if (mode === "signup") {
    const { data, error } = await client.auth.signUp({ email, password: fields.password,
      options: { data: { display_name: fields.name.trim() }, emailRedirectTo: redirect } });
    if (error) throw error;
    return data.session ? null : "confirm";
  }
  const { error } = mode === "reset"
    ? await client.auth.resetPasswordForEmail(email, { redirectTo: redirect })
    : await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirect } });
  // Don't expose whether an address is registered through the recovery screens.
  if (error && authErrorCode(error) !== "user_not_found") throw error;
  return mode;
}
