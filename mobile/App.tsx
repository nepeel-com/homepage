import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  getFeed,
  getProfile,
  setFollowing,
  setReaction,
  updateProfile,
} from "../shared/data";
import type { FeedMode, Post, Profile } from "../shared/types";
import { useComments } from "../shared/useComments";
import CameraScreen from "./CameraScreen";
import ConnectionsScreen from "./ConnectionsScreen";
import AccountModal from "./AccountModal";
import AuthScreen from "./AuthScreen";
import { accountAction } from "../shared/account";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <Social />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Social() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [authInitError, setAuthInitError] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feed, setFeed] = useState<Post[]>([]);
  const [mode, setMode] = useState<FeedMode>("all");
  const [camera, setCamera] = useState(false);
  const [hi, setHi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [editing, setEditing] = useState(false);
  const [accountModal, setAccountModal] = useState<Post | "delete" | null>(
    null,
  );
  const actionLocks = useRef(new Set<string>());
  const requestGeneration = useRef(0);
  const loadingRef = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
      setAuthInitError(!!error);
    }).catch(() => { if (active) { setReady(true); setAuthInitError(true); } });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
      if (next) setAuthInitError(false);
      if (!next) {
        setFeed([]);
        setProfile(null);
        setCamera(false);
        setHi(false);
        setEditing(false);
        setAccountModal(null);
        setCommentsPost(null);
      }
    });
    const lifecycle = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase!.auth.startAutoRefresh();
      else supabase!.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    const deepLink = ({ url }: { url: string }) => {
      if (url.startsWith("nepeel://camera")) setCamera(true);
    };
    const links = Linking.addEventListener("url", deepLink);
    void Linking.getInitialURL().then((url) => {
      if (url) deepLink({ url });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      lifecycle.remove();
      links.remove();
      supabase!.auth.stopAutoRefresh();
    };
  }, []);
  async function load(append = false) {
    if (!supabase || !session || (loadingRef.current && append)) return;
    const generation = ++requestGeneration.current;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const data = await getFeed(supabase, mode, "", append ? feed.length : 0);
      if (generation !== requestGeneration.current) return;
      setFeed((old) =>
        append
          ? [...old, ...data.filter((p) => !old.some((o) => o.id === p.id))]
          : data,
      );
      setMore(data.length === 20);
      const nextProfile = await getProfile(supabase, session.user.id);
      if (generation === requestGeneration.current) setProfile(nextProfile);
    } catch {
      if (generation === requestGeneration.current)
        setError("피드를 불러오지 못했어요. 아래로 당겨 다시 시도해 주세요.");
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }
  useEffect(() => {
    setFeed([]);
    void load();
    return () => {
      requestGeneration.current++;
      loadingRef.current = false;
    };
  }, [session?.user.id, mode]);
  async function action(key: string, fn: () => Promise<void>) {
    if (actionLocks.current.has(key)) return;
    actionLocks.current.add(key);
    try {
      await fn();
    } catch {
      Alert.alert("연결을 확인해 주세요.", "잠시 후 다시 시도해 주세요.");
    } finally {
      actionLocks.current.delete(key);
    }
  }
  if (!ready)
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  if (!session) return <AuthScreen initialError={authInitError} />;
  if (hi)
    return (
      <ConnectionsScreen
        key={session.user.id}
        userId={session.user.id}
        close={() => setHi(false)}
      />
    );
  if (camera)
    return (
      <CameraScreen
        userId={session.user.id}
        close={() => setCamera(false)}
        done={() => {
          setCamera(false);
          setMode("all");
          void load();
          Alert.alert(
            "당신의 순간을 나눴어요.",
            "웹에서도 같은 사진을 볼 수 있어요.",
          );
        }}
      />
    );
  const react = (post: Post, table: "likes" | "bookmarks") =>
    void action(`${table}-${post.id}`, async () => {
      const enabled = !(table === "likes" ? post.liked : post.saved);
      await setReaction(supabase!, table, session.user.id, post.id, enabled);
      setFeed((old) =>
        old
          .map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  ...(table === "likes"
                    ? {
                        liked: enabled,
                        like_count: Number(p.like_count) + (enabled ? 1 : -1),
                      }
                    : { saved: enabled }),
                }
              : p,
          )
          .filter((p) => mode !== "saved" || p.saved),
      );
    });
  return (
    <View style={s.flex}>
      <View style={s.header}>
        <Text style={s.brand}>
          nepeel<Text style={s.brandDot}>●</Text>
        </Text>
        <Pressable style={s.button} onPress={() => setCamera(true)}>
          <Text style={s.bold}>지금 촬영 ↗</Text>
        </Pressable>
      </View>
      <FlatList
        data={feed}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl
            refreshing={loading && !feed.length}
            onRefresh={() => void load()}
          />
        }
        contentContainerStyle={s.feed}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.eyebrow}>YOUR LIFE. YOUR LENS.</Text>
            <Text style={s.title}>
              {mode === "profile"
                ? profile?.display_name
                : mode === "saved"
                  ? "저장한 순간."
                  : "있는 그대로, 연결되다."}
            </Text>
            <Text style={s.muted}>
              {mode === "profile"
                ? profile?.bio || "내가 직접 담은 순간들."
                : "가공 없는 우리의 하루. 웹에서도 함께해요."}
            </Text>
            {mode === "profile" ? (
              <View style={s.row}>
                <Pressable style={s.button} onPress={() => setEditing(true)}>
                  <Text>프로필 수정</Text>
                </Pressable>
                <Pressable
                  style={s.button}
                  onPress={() =>
                    void action("logout", async () => {
                      const { error } = await supabase!.auth.signOut();
                      if (error) throw error;
                    })
                  }
                >
                  <Text>로그아웃</Text>
                </Pressable>
                <Pressable
                  style={s.button}
                  onPress={() => setAccountModal("delete")}
                >
                  <Text>회원 탈퇴</Text>
                </Pressable>
              </View>
            ) : mode !== "saved" ? (
              <View style={s.row}>
                <Pressable
                  style={[s.pill, mode === "all" && s.selected]}
                  onPress={() => setMode("all")}
                >
                  <Text>모두의 순간</Text>
                </Pressable>
                <Pressable
                  style={[s.pill, mode === "following" && s.selected]}
                  onPress={() => setMode("following")}
                >
                  <Text>팔로잉</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? (
              <Text style={s.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.title}>첫 순간을 기다려요.</Text>
              <Text style={s.muted}>
                {mode === "saved"
                  ? "마음에 드는 사진을 저장해 보세요."
                  : mode === "following"
                    ? "마음에 드는 사람을 팔로우해 보세요."
                    : "지금 눈앞의 순간을 직접 담아보세요."}
              </Text>
              <Pressable style={s.primary} onPress={() => setCamera(true)}>
                <Text style={s.primaryText}>카메라 열기 ↗</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item: post }) => (
          <View style={s.post}>
            <View style={s.postHeader}>
              <View style={s.avatar}>
                <Text style={s.bold}>{post.display_name.slice(0, 1)}</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.bold}>{post.display_name}</Text>
                <Text style={s.small}>
                  앱 촬영 ·{" "}
                  {new Date(post.created_at).toLocaleDateString("ko-KR")}
                </Text>
              </View>
              {post.user_id !== session.user.id && (
                <Pressable
                  style={s.pill}
                  onPress={() =>
                    void action(`follow-${post.user_id}`, async () => {
                      await setFollowing(
                        supabase!,
                        session.user.id,
                        post.user_id,
                        !post.following,
                      );
                      setFeed((old) =>
                        old.map((p) =>
                          p.user_id === post.user_id
                            ? { ...p, following: !post.following }
                            : p,
                        ),
                      );
                    })
                  }
                >
                  <Text style={s.small}>
                    {post.following ? "팔로잉" : "팔로우"}
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={s.button}
                accessibilityLabel="게시물 메뉴"
                onPress={() => {
                  if (post.user_id !== session.user.id) {
                    setAccountModal(post);
                    return;
                  }
                  Alert.alert(
                    "이 순간을 삭제할까요?",
                    "사진과 댓글이 함께 삭제되며 복구할 수 없어요.",
                    [
                      { text: "취소", style: "cancel" },
                      {
                        text: "삭제",
                        style: "destructive",
                        onPress: () =>
                          void action(`delete-${post.id}`, async () => {
                            await accountAction(
                              supabase!,
                              process.env.EXPO_PUBLIC_API_URL ||
                                "https://nepeel.com",
                              { action: "delete", postId: post.id },
                            );
                            setFeed((old) =>
                              old.filter((p) => p.id !== post.id),
                            );
                          }),
                      },
                    ],
                  );
                }}
              >
                <Text style={s.bold}>···</Text>
              </Pressable>
            </View>
            <Image
              source={{ uri: post.image_url }}
              style={s.photo}
              accessibilityLabel={post.caption || "직접 촬영한 사진"}
            />
            <View style={s.actions}>
              <Pressable
                style={s.button}
                accessibilityLabel="좋아요"
                onPress={() => react(post, "likes")}
              >
                <Text style={post.liked ? s.liked : s.bold}>
                  {post.liked ? "♥" : "♡"} {post.like_count}
                </Text>
              </Pressable>
              <Pressable style={s.button} onPress={() => setCommentsPost(post)}>
                <Text>댓글 {post.comment_count}</Text>
              </Pressable>
              <View style={s.flex} />
              <Pressable
                style={s.button}
                onPress={() => react(post, "bookmarks")}
              >
                <Text style={post.saved ? s.bold : s.muted}>
                  {post.saved ? "저장됨 ✓" : "저장"}
                </Text>
              </Pressable>
            </View>
            <Text style={s.caption}>
              <Text style={s.bold}>{post.display_name} </Text>
              {post.caption}
            </Text>
          </View>
        )}
        ListFooterComponent={
          more ? (
            <Pressable
              style={s.button}
              disabled={loading}
              onPress={() => void load(true)}
            >
              <Text style={s.centerText}>
                {loading ? "불러오는 중…" : "더 많은 순간 보기 ↓"}
              </Text>
            </Pressable>
          ) : (
            <Text style={[s.small, s.end]}>GO LIVE A LITTLE.</Text>
          )
        }
      />
      <View style={s.bottom}>
        <Pressable
          style={s.nav}
          accessibilityRole="button"
          onPress={() => setHi(true)}
        >
          <Text style={s.bold}>Hi 연결</Text>
        </Pressable>
        <Pressable style={s.nav} onPress={() => setMode("all")}>
          <Text
            style={mode === "all" || mode === "following" ? s.bold : s.muted}
          >
            홈 피드
          </Text>
        </Pressable>
        <Pressable
          style={s.captureNav}
          accessibilityLabel="카메라 열기"
          onPress={() => setCamera(true)}
        >
          <Text style={s.plus}>＋</Text>
        </Pressable>
        <Pressable style={s.nav} onPress={() => setMode("saved")}>
          <Text style={mode === "saved" ? s.bold : s.muted}>저장</Text>
        </Pressable>
        <Pressable style={s.nav} onPress={() => setMode("profile")}>
          <Text style={mode === "profile" ? s.bold : s.muted}>프로필</Text>
        </Pressable>
      </View>
      {commentsPost && (
        <CommentsModal
          post={commentsPost}
          userId={session.user.id}
          close={() => {
            setCommentsPost(null);
            void load();
          }}
        />
      )}
      {editing && profile && (
        <EditModal
          profile={profile}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
      {accountModal && (
        <AccountModal
          post={accountModal === "delete" ? undefined : accountModal}
          userId={session.user.id}
          close={() => setAccountModal(null)}
          done={() => {
            setAccountModal(null);
            Alert.alert(
              accountModal === "delete"
                ? "계정이 삭제되었습니다."
                : "신고를 접수했습니다.",
            );
          }}
        />
      )}
    </View>
  );
}
function CommentsModal({
  post,
  userId,
  close,
}: {
  post: Post;
  userId: string;
  close: () => void;
}) {
  const thread = useComments({ client: supabase, userId, postId: post.id, enabled: true, makeId: randomUUID });
  const { comments, body, setBody, posting: busy } = thread;
  const list = useRef<FlatList>(null);
  return (
    <Modal animationType="slide" onRequestClose={() => { if (!busy) close(); }}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Text style={s.title}>이 순간의 이야기</Text>
            <Pressable style={s.button} disabled={busy} onPress={close}>
              <Text>닫기</Text>
            </Pressable>
          </View>
          <FlatList
            ref={list}
            contentContainerStyle={s.feed}
            data={comments}
            keyExtractor={comment => comment.id}
            renderItem={({ item }) => <View style={s.comment}><Text style={s.bold}>{item.profiles.display_name}</Text><Text>{item.body}</Text></View>}
            ListHeaderComponent={<View><Text style={s.muted}>최신 댓글부터 보여요.</Text>{thread.loading && <ActivityIndicator accessibilityLabel="댓글을 불러오는 중" />}</View>}
            ListEmptyComponent={!thread.loading && !thread.loadError ? <Text style={s.muted}>첫 번째 이야기를 남겨보세요.</Text> : null}
            ListFooterComponent={thread.hasMore ? <Pressable style={s.button} accessibilityRole="button" disabled={thread.loadingMore} onPress={() => void thread.loadMore()}><Text>{thread.loadingMore ? "이전 댓글을 불러오는 중…" : "이전 댓글 더 보기"}</Text></Pressable> : null}
          />
          {thread.loadError && <View><Text style={s.error} accessibilityRole="alert">댓글을 불러오지 못했어요.</Text><Pressable style={s.button} onPress={thread.reload}><Text>다시 시도</Text></Pressable></View>}
          {thread.moreError && <Text style={s.error} accessibilityRole="alert">이전 댓글을 불러오지 못했어요. 다시 시도해 주세요.</Text>}
          {thread.postError && <Text style={s.error} accessibilityRole="alert">댓글을 게시하지 못했어요. 작성한 내용으로 다시 시도해 주세요.</Text>}
          <View style={s.commentInput}>
            <TextInput
              style={[s.input, s.flex]}
              value={body}
              onChangeText={setBody}
              maxLength={500}
              placeholder="따뜻한 한마디"
              accessibilityLabel="댓글"
              editable={!busy}
            />
            <Pressable
              style={s.button}
              disabled={busy || thread.loading || !body.trim()}
              accessibilityRole="button"
              accessibilityLabel="댓글 게시"
              accessibilityState={{ busy, disabled: busy || thread.loading || !body.trim() }}
              onPress={async () => {
                if (await thread.submit()) list.current?.scrollToOffset({ offset: 0, animated: true });
              }}
            >
              <Text>{busy ? "게시 중…" : "게시"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
function EditModal({
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
  const [busy, setBusy] = useState(false);
  return (
    <Modal animationType="slide" onRequestClose={close}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.title}>프로필 수정</Text>
          <Pressable style={s.button} onPress={close}>
            <Text>닫기</Text>
          </Pressable>
        </View>
        <View style={s.feed}>
          <Text style={s.label}>이름</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
          <Text style={s.label}>소개</Text>
          <TextInput
            style={s.input}
            value={bio}
            onChangeText={setBio}
            maxLength={160}
            multiline
          />
          <Pressable
            style={s.primary}
            disabled={busy || !name.trim()}
            onPress={async () => {
              setBusy(true);
              try {
                await updateProfile(supabase!, profile.id, name, bio);
                saved();
              } catch {
                Alert.alert("프로필을 저장하지 못했어요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={s.primaryText}>저장하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fafbf8" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e9e1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -2.5,
    color: "#20221d",
  },
  brandDot: { fontSize: 20, color: "#8ab020" },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#20221d",
  },
  bold: { fontWeight: "700", color: "#20221d" },
  muted: { fontSize: 13, lineHeight: 23, color: "#707369" },
  small: { fontSize: 11, lineHeight: 18, color: "#707369" },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#707369",
    fontWeight: "600",
  },
  intro: { gap: 10, marginBottom: 25 },
  feed: { padding: 20, gap: 16 },
  post: {
    marginBottom: 26,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e9e1",
    paddingBottom: 20,
  },
  postHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#e3e9d7",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#e7e9e1",
    borderRadius: 12,
  },
  actions: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  button: { minHeight: 44, padding: 12, justifyContent: "center" },
  caption: { fontSize: 14, lineHeight: 24, color: "#20221d" },
  liked: { color: "#c34242", fontWeight: "700" },
  row: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 },
  pill: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#f0f2eb",
    minHeight: 44,
  },
  selected: { backgroundColor: "#d4ff3f" },
  primary: {
    padding: 17,
    borderRadius: 10,
    backgroundColor: "#20221d",
    alignItems: "center",
    marginVertical: 10,
    minHeight: 52,
  },
  primaryText: { color: "#d4ff3f", fontWeight: "700", fontSize: 14 },
  empty: { alignItems: "center", gap: 18, paddingVertical: 60 },
  error: { color: "#a13929", fontSize: 13, lineHeight: 22, marginVertical: 10 },
  bottom: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e7e9e1",
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 9,
  },
  nav: {
    minHeight: 48,
    minWidth: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  captureNav: {
    backgroundColor: "#d4ff3f",
    width: 52,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  plus: { fontSize: 27, color: "#20221d" },
  centerText: { textAlign: "center" },
  end: { textAlign: "center", padding: 28, letterSpacing: 2 },
  auth: { padding: 30, gap: 12, flexGrow: 1, justifyContent: "center" },
  authHero: { marginVertical: 22, gap: 17 },
  bigText: {
    fontSize: 47,
    lineHeight: 47,
    fontWeight: "900",
    letterSpacing: -2,
    color: "#20221d",
  },
  label: { fontSize: 12, fontWeight: "600", color: "#20221d", marginTop: 8 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 9,
    padding: 14,
    minHeight: 48,
    fontSize: 15,
    color: "#20221d",
  },
  disabled: { opacity: 0.5 },
  comment: {
    gap: 7,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e9e1",
  },
  commentInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 8,
  },
});
