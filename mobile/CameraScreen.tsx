import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  captureApi,
  discardPhoto,
  prepareCamera,
  publishCapture,
} from "./lib/capture";
import type { Challenge } from "../shared/types";

export default function CameraScreen({
  userId,
  done,
  close,
}: {
  userId: string;
  done: () => void;
  close: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const uriRef = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const pendingRef = useRef(false);
  const keyRef = useRef<string | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [photo, setPhoto] = useState<{
    uri: string;
    challenge: Challenge;
  } | null>(null);
  const [size, setSize] = useState<string>();
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(180);
  const reset = () => {
    generation.current++;
    discardPhoto(uriRef.current);
    uriRef.current = undefined;
    setPhoto(null);
    setCaption("");
    setError("");
    setReady(false);
  };
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state !== "active") {
        setReady(false);
        if (!pendingRef.current) reset();
        else generation.current++;
      }
    });
    return () => {
      generation.current++;
      listener.remove();
      discardPhoto(uriRef.current);
    };
  }, []);
  useEffect(() => {
    if (!photo) return;
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(photo.challenge.expires_at) - Date.now()) / 1000,
          ),
        ),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [photo]);
  async function capture() {
    if (
      !camera.current ||
      !ready ||
      pendingRef.current ||
      AppState.currentState !== "active"
    )
      return;
    pendingRef.current = true;
    setError("");
    const current = generation.current;
    try {
      setStatus("공식 앱을 확인하는 중…");
      keyRef.current = await prepareCamera(userId);
      const challenge = await captureApi<Challenge>({
        action: "challenge",
        purpose: "capture",
      });
      if (current !== generation.current || AppState.currentState !== "active")
        return;
      setStatus("지금의 순간을 담는 중…");
      const result = await camera.current.takePictureAsync({
        quality: 0.65,
        exif: false,
        skipProcessing: false,
      });
      if (!result) throw new Error("다시 촬영해 주세요.");
      if (
        current !== generation.current ||
        AppState.currentState !== "active"
      ) {
        discardPhoto(result.uri);
        return;
      }
      uriRef.current = result.uri;
      setPhoto({ uri: result.uri, challenge });
      setRemaining(180);
    } catch (e) {
      setError(e instanceof Error ? e.message : "촬영을 시작하지 못했어요.");
    } finally {
      pendingRef.current = false;
      setStatus("");
    }
  }
  async function publish() {
    if (!photo || pendingRef.current || remaining <= 0) return;
    pendingRef.current = true;
    setStatus("촬영 확인 후 게시하는 중…");
    setError("");
    try {
      await publishCapture(
        userId,
        photo.challenge,
        photo.uri,
        caption,
        keyRef.current,
      );
      discardPhoto(photo.uri);
      uriRef.current = undefined;
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "게시를 완료하지 못했어요.");
    } finally {
      pendingRef.current = false;
      setStatus("");
    }
  }
  if (!permission)
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  if (!permission.granted)
    return (
      <View style={s.permission}>
        <Text style={s.title}>당신의 시선이 필요해요.</Text>
        <Text style={s.muted}>
          nepeel은 직접 촬영한 사진만 게시할 수 있어요. 갤러리에는 접근하지
          않습니다.
        </Text>
        <Pressable
          style={s.primary}
          onPress={() =>
            permission.canAskAgain
              ? void requestPermission()
              : void Linking.openSettings()
          }
        >
          <Text style={s.primaryText}>
            {permission.canAskAgain
              ? "카메라 접근 허용"
              : "설정에서 카메라 허용"}
          </Text>
        </Pressable>
        <Pressable style={s.button} onPress={close}>
          <Text>돌아가기</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable
          accessibilityLabel="촬영 닫기"
          disabled={!!status}
          onPress={close}
          style={s.button}
        >
          <Text>닫기</Text>
        </Pressable>
        <Text style={s.logo}>nepeel / camera</Text>
        <Pressable
          disabled={!!status || !!photo}
          onPress={() => {
            setReady(false);
            setFacing((v) => (v === "back" ? "front" : "back"));
          }}
          style={s.button}
        >
          <Text>전환</Text>
        </Pressable>
      </View>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={s.camera} />
      ) : active ? (
        <CameraView
          ref={camera}
          style={s.camera}
          facing={facing}
          mode="picture"
          pictureSize={size}
          onMountError={() =>
            setError("카메라를 열지 못했어요. 권한을 확인해 주세요.")
          }
          onCameraReady={async () => {
            const current = generation.current;
            try {
              const sizes =
                await camera.current?.getAvailablePictureSizesAsync();
              const candidates = sizes
                ?.filter((v) => /^\d+x\d+$/.test(v))
                .map((v) => ({
                  value: v,
                  pixels: v
                    .split("x")
                    .map(Number)
                    .reduce((a, b) => a * b),
                }))
                .filter((v) => v.pixels <= 2_000_000)
                .sort((a, b) => b.pixels - a.pixels);
              if (candidates?.[0]) setSize(candidates[0].value);
            } catch {
              /* Camera default remains available. */
            }
            if (
              current === generation.current &&
              AppState.currentState === "active"
            )
              setReady(true);
          }}
        />
      ) : (
        <View style={s.camera} />
      )}
      <View style={s.controls}>
        {photo ? (
          <>
            <Text style={s.muted}>
              {remaining > 0
                ? `${remaining}초 안에 이 순간을 나눠주세요.`
                : "시간이 지났어요. 새로운 순간을 촬영해 주세요."}
            </Text>
            <TextInput
              style={s.input}
              placeholder="이 순간에 한마디"
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={1000}
              editable={!status}
            />
            <View style={s.row}>
              <Pressable
                style={s.secondary}
                disabled={!!status}
                onPress={reset}
              >
                <Text>다시 촬영</Text>
              </Pressable>
              <Pressable
                style={[
                  s.primary,
                  s.flex,
                  (!!status || remaining <= 0) && s.disabled,
                ]}
                disabled={!!status || remaining <= 0}
                onPress={() => void publish()}
              >
                <Text style={s.primaryText}>순간 나누기 ↗</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={s.muted}>지금, 눈앞의 진짜 순간.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진 촬영"
              disabled={!ready || !!status}
              style={[s.shutter, (!ready || !!status) && s.disabled]}
              onPress={() => void capture()}
            >
              <View style={s.shutterInner} />
            </Pressable>
            <Text style={s.small}>외부 사진 · AI 생성 이미지 업로드 불가</Text>
          </>
        )}
        {status ? (
          <View style={s.row}>
            <ActivityIndicator />
            <Text style={s.muted}>{status}</Text>
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafbf8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
  },
  logo: { fontSize: 17, fontWeight: "800", letterSpacing: -0.7 },
  button: { padding: 13, minHeight: 44 },
  camera: { flex: 1, backgroundColor: "#20221d" },
  controls: { padding: 22, gap: 16, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%" },
  input: {
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 10,
    padding: 14,
    width: "100%",
    maxHeight: 110,
    minHeight: 54,
    fontSize: 15,
  },
  primary: {
    backgroundColor: "#20221d",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryText: { color: "#d4ff3f", fontWeight: "700" },
  secondary: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 10,
  },
  flex: { flex: 1 },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: "#20221d",
    padding: 5,
  },
  shutterInner: { flex: 1, backgroundColor: "#d4ff3f", borderRadius: 33 },
  muted: { fontSize: 13, color: "#6d7463", lineHeight: 22 },
  small: { fontSize: 11, color: "#707369" },
  disabled: { opacity: 0.4 },
  error: { color: "#ae3725", fontSize: 12, lineHeight: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  permission: { flex: 1, padding: 30, justifyContent: "center", gap: 22 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -1 },
});
