import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "./lib/supabase";
import { accountAction, reportPost, reportReasons } from "../shared/account";
import type { Post } from "../shared/types";

export default function AccountModal({
  post,
  userId,
  close,
  done,
}: {
  post?: Post;
  userId: string;
  close: () => void;
  done: () => void;
}) {
  const [reason, setReason] = useState("synthetic");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const valid = !!post || (confirmation === "DELETE" && !!password);
  async function submit() {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (post) await reportPost(supabase!, userId, post.id, reason);
      else {
        await accountAction(
          supabase!,
          process.env.EXPO_PUBLIC_API_URL || "https://nepeel.com",
          { action: "deleteAccount", password, confirmation },
          userId,
        );
        const { data } = await supabase!.auth.getSession();
        if (!alive.current || data.session?.user.id !== userId) return;
        setPassword("");
        await supabase!.auth.signOut({ scope: "local" });
      }
      if (alive.current) done();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "요청을 완료하지 못했어요. 다시 시도해 주세요.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={s.page}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              accessibilityRole="button"
              style={s.button}
              disabled={busy}
              onPress={close}
            >
              <Text>← 돌아가기</Text>
            </Pressable>
            <Text style={s.title}>
              {post ? "이 순간을 신고하기" : "nepeel 회원 탈퇴"}
            </Text>
            {post ? (
              <>
                <Text style={s.body}>
                  촬영 원칙에 맞지 않거나 불편한 사진을 알려주세요.
                </Text>
                {reportReasons.map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: reason === value }}
                    disabled={busy}
                    onPress={() => setReason(value)}
                    style={[s.choice, reason === value && s.selected]}
                  >
                    <Text>{label}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Text style={s.body}>
                  계정과 프로필, 게시물, 댓글, 저장 목록, Hi 설정과 대화가
                  삭제됩니다. 상대방의 대화 목록에서도 사라지며 복구할 수
                  없어요.
                </Text>
                <Text style={s.body}>
                  사진 원본도 삭제됩니다. 서버 연결이 지연되면 자동으로 다시
                  정리하며, 이미 저장된 사본은 회수할 수 없어요.
                </Text>
                <Text style={s.label}>현재 비밀번호</Text>
                <TextInput
                  accessibilityLabel="현재 비밀번호"
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  autoCapitalize="none"
                  editable={!busy}
                  maxLength={1024}
                />
                <Text style={s.label}>확인을 위해 DELETE를 입력해 주세요</Text>
                <TextInput
                  accessibilityLabel="DELETE 확인"
                  style={s.input}
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  editable={!busy}
                />
              </>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              style={[s.primary, (busy || !valid) && s.disabled]}
              disabled={busy || !valid}
              onPress={() => void submit()}
            >
              {busy ? (
                <ActivityIndicator color="#d4ff3f" />
              ) : (
                <Text style={s.primaryText}>
                  {post ? "신고 접수" : "계정과 데이터 영구 삭제"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f9faf5" },
  page: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: "800", color: "#20221d" },
  body: { fontSize: 14, lineHeight: 23, color: "#5c6255" },
  button: { minHeight: 48, justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 9,
    padding: 14,
    minHeight: 48,
  },
  choice: {
    padding: 16,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 9,
  },
  selected: { backgroundColor: "#d4ff3f", borderColor: "#20221d" },
  primary: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#20221d",
    borderRadius: 10,
  },
  primaryText: { color: "#d4ff3f", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: "#a13929", lineHeight: 22 },
});
