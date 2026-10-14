import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "./lib/supabase";
import { authError, authNotice } from "../shared/auth";
import { useAuthForm } from "../shared/useAuthForm";

export default function AuthScreen({ initialError = false }: { initialError?: boolean }) {
  const [en, setEn] = useState(() => !Intl.DateTimeFormat().resolvedOptions().locale.startsWith("ko"));
  const t = (ko: string, english: string) => en ? english : ko;
  const h = useAuthForm(supabase, process.env.EXPO_PUBLIC_API_URL || "https://nepeel.com");
  const emailOnly = h.mode === "reset" || h.mode === "resend";
  const button = (label: string, action: () => void, primary = false, disabled = false) => <Pressable
    accessibilityRole="button" accessibilityState={{ disabled: disabled || h.pending }}
    disabled={disabled || h.pending} onPress={action}
    style={({ pressed }) => [s.button, primary && s.primary, (disabled || h.pending) && s.disabled, pressed && s.pressed]}>
    <Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text>
  </Pressable>;
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.row}><Text style={s.brand}>nepeel</Text>{button(en ? "한국어" : "English", () => setEn(!en))}</View>
      <Text style={s.hero}>LESS FAKE.{"\n"}MORE LIFE.</Text>
      <Text style={s.muted}>{t("당신이 직접 살아낸 순간으로 연결돼요.", "Connect through moments you lived yourself.")}</Text>
      {emailOnly ? <Text style={s.title}>{h.mode === "reset" ? t("비밀번호 다시 설정하기", "Reset your password") : t("인증메일 다시 받기", "Resend confirmation")}</Text>
        : <View style={s.row}>
          {button(t("로그인", "Sign in"), () => h.change("login"), h.mode === "login")}
          {button(t("회원가입", "Create account"), () => h.change("signup"), h.mode === "signup")}
        </View>}
      {h.mode === "signup" && <><Text style={s.label}>{t("이름", "Name")}</Text>
        <TextInput style={s.input} accessibilityLabel={t("이름", "Name")} autoComplete="nickname" maxLength={40} value={h.name} onChangeText={h.setName} editable={!h.pending} />
      </>}
      <Text style={s.label}>{t("이메일", "Email")}</Text>
      <TextInput style={s.input} accessibilityLabel={t("이메일", "Email")} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" value={h.email} onChangeText={h.setEmail} editable={!h.pending}/>
      {!emailOnly && <><Text style={s.label}>{t("비밀번호", "Password")}</Text>
        <TextInput style={s.input} accessibilityLabel={t("비밀번호", "Password")} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={h.mode === "signup" ? "new-password" : "current-password"} value={h.password} onChangeText={h.setPassword} editable={!h.pending} placeholder={h.mode === "signup" ? t("8자 이상", "At least 8 characters") : t("기존 비밀번호", "Your password")} />
      </>}
      {initialError && <Text style={s.muted}>{t("기존 로그인 상태를 불러오지 못했어요. 다시 로그인해 주세요.", "Couldn't restore your session. Please sign in again.")}</Text>}
      {h.error != null && <Text style={s.error} accessibilityRole="alert">{authError(h.error, en)}</Text>}
      {h.notice && <Text style={s.notice} accessibilityLiveRegion="polite">{authNotice(h.notice, en)}</Text>}
      {!supabase && <Text style={s.error}>{t("서비스 연결을 준비 중입니다.", "We're preparing the service connection.")}</Text>}
      {h.pending && <ActivityIndicator accessibilityLabel={t("처리 중", "Please wait")}/>}
      {button(h.mode === "signup" ? t("내 순간 시작하기", "Create account")
        : h.mode === "reset" ? t("재설정 링크 받기", "Send recovery link")
        : h.mode === "resend" ? t("인증메일 보내기", "Send confirmation") : t("로그인", "Sign in"),
        () => void h.submit(), true, !supabase || (h.mode !== "login" && h.remaining > 0))}
      {h.mode !== "login" && h.remaining > 0 && <Text style={s.muted}>{t(`${h.remaining}초 후 메일을 다시 요청할 수 있어요.`, `You can request another email in ${h.remaining}s.`)}</Text>}
      {h.mode !== "resend" && button(t("인증메일이 안 왔나요?", "Didn't get a confirmation email?"), () => h.change("resend"))}
      {h.mode !== "reset" && button(t("비밀번호를 잊으셨나요?", "Forgot your password?"), () => h.change("reset"))}
      {emailOnly && button(t("로그인으로 돌아가기", "Back to sign in"), () => h.change("login"))}
      <Text style={s.muted}>{t("인증·복구 메일의 링크는 nepeel 웹에서 열려요. 완료한 뒤 같은 계정으로 앱에 로그인해 주세요.", "Confirmation and recovery links open on the nepeel website. Then return and sign in with the same account.")}</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  flex: { flex: 1 }, content: { padding: 24, paddingBottom: 48, gap: 16, width: "100%", maxWidth: 600, alignSelf: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  brand: { fontSize: 34, fontWeight: "900", color: "#20221d", flex: 1 },
  hero: { fontSize: 42, lineHeight: 48, fontWeight: "900", color: "#20221d", marginTop: 20 },
  title: { fontSize: 25, fontWeight: "800", color: "#20221d" }, label: { fontSize: 15, fontWeight: "700", color: "#20221d" },
  muted: { color: "#606459", fontSize: 14, lineHeight: 23 },
  input: { minHeight: 50, borderWidth: 1, borderColor: "#bcc2b3", borderRadius: 10, padding: 12, fontSize: 16, color: "#20221d", backgroundColor: "#fafbf8" },
  button: { minHeight: 48, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: "#bcc2b3", justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#20221d", fontSize: 15, fontWeight: "600" }, primary: { backgroundColor: "#20221d", borderColor: "#20221d" },
  primaryText: { color: "#d4ff3f" }, disabled: { opacity: .45 }, pressed: { opacity: .7 },
  error: { color: "#982e20", backgroundColor: "#fff0ed", padding: 14, fontSize: 14, lineHeight: 22 },
  notice: { color: "#20221d", backgroundColor: "#edf4df", padding: 14, fontSize: 14, lineHeight: 22 },
});
