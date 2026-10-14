import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  captureApi,
  CaptureApiError,
  discardPhoto,
  prepareCamera,
  prepareCaptureRequest,
} from "./lib/capture";
import type { Challenge } from "../shared/types";
import { CaptureSubmission } from "../shared/capture-submission";
import {
  emptyCaptureContext,
  PHOTO_FILTERS,
  type CaptureContext,
  type PhotoFilter,
  type PlaceAudience,
} from "../shared/capture-context";
import { audienceLabel, type NearbyPhoto } from "../shared/places";
import { currentPlace, placesEnabled, setPlacesEnabled } from "./lib/location";
import FilteredPhoto from "./FilteredPhoto";

export default function CameraScreen({
  userId,
  done,
  close,
  reference = null,
}: {
  userId: string;
  done: () => void;
  close: () => void;
  reference?: NearbyPhoto | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const uriRef = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const pendingRef = useRef(false);
  const keyRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const submission = useRef<CaptureSubmission | null>(null);
  const locationGeneration = useRef(0);
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
  const [context, setContext] = useState<CaptureContext>(() => ({
    ...emptyCaptureContext(),
    referencePostId: reference?.post_id ?? null,
  }));
  const [locked, setLocked] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [overlay, setOverlay] = useState(0.35);
  async function locate(askPermission = false) {
    if (submission.current) return;
    const current = ++locationGeneration.current;
    setLocating(true);
    setLocationError("");
    try {
      const place = await currentPlace(
        context.place?.audience ?? "followers",
        askPermission,
      );
      if (
        !mounted.current ||
        current !== locationGeneration.current ||
        submission.current
      )
        return;
      if (askPermission) await setPlacesEnabled(userId, true);
      if (
        mounted.current &&
        current === locationGeneration.current &&
        !submission.current
      )
        setContext((old) => ({ ...old, place }));
    } catch (e) {
      if (mounted.current && current === locationGeneration.current)
        setLocationError(
          e instanceof Error ? e.message : "위치를 확인하지 못했어요.",
        );
    } finally {
      if (mounted.current && current === locationGeneration.current)
        setLocating(false);
    }
  }
  function removePlace() {
    locationGeneration.current++;
    setLocating(false);
    setLocationError("");
    setContext((old) => ({ ...old, place: null }));
  }
  const reset = () => {
    generation.current++;
    discardPhoto(uriRef.current);
    uriRef.current = undefined;
    setPhoto(null);
    setCaption("");
    setError("");
    setReady(false);
    submission.current = null;
    setLocked(false);
    setPrepared(false);
    setTerminal(false);
    removePlace();
    setContext({
      ...emptyCaptureContext(),
      referencePostId: reference?.post_id ?? null,
    });
  };
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state !== "active") {
        setReady(false);
        // Pause live capture; preserve the photographed draft and prepared upload.
        generation.current++;
      }
    });
    return () => {
      generation.current++;
      mounted.current = false;
      locationGeneration.current++;
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
      if (
        (await placesEnabled(userId)) &&
        mounted.current &&
        current === generation.current
      )
        void locate();
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "촬영을 시작하지 못했어요.");
    } finally {
      pendingRef.current = false;
      if (mounted.current) setStatus("");
    }
  }
  async function publish() {
    if (
      !photo ||
      pendingRef.current ||
      locating ||
      terminal ||
      (!prepared && remaining <= 0)
    )
      return;
    pendingRef.current = true;
    setStatus("촬영 확인 후 게시하는 중…");
    setError("");
    setLocked(true);
    try {
      if (!submission.current)
        submission.current = new CaptureSubmission(
          () =>
            prepareCaptureRequest(
              userId,
              photo.challenge,
              photo.uri,
              caption,
              keyRef.current,
              context,
            ),
          (request) => captureApi<{ id: string }>(request, userId),
        );
      await submission.current.submit();
      discardPhoto(photo.uri);
      uriRef.current = undefined;
      if (mounted.current) done();
    } catch (e) {
      if (mounted.current) {
        setPrepared(!!submission.current?.prepared);
        if (!submission.current?.prepared) {
          submission.current = null;
          setLocked(false);
        }
        if (
          e instanceof CaptureApiError &&
          [400, 403, 409, 410].includes(e.status)
        )
          setTerminal(true);
        setError(e instanceof Error ? e.message : "게시를 완료하지 못했어요.");
      }
    } finally {
      pendingRef.current = false;
      if (mounted.current) setStatus("");
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
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
      <View style={s.camera}>
        {photo ? (
          <FilteredPhoto uri={photo.uri} filter={context.filter} />
        ) : active ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
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
          <View style={StyleSheet.absoluteFill} />
        )}
        {!photo && reference && (
          <>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: reference.image_url }}
                style={[StyleSheet.absoluteFill, { opacity: overlay }]}
                resizeMode="contain"
              />
              <View style={[s.gridHorizontal, { top: "33.33%" }]} />
              <View style={[s.gridHorizontal, { top: "66.66%" }]} />
              <View style={[s.gridVertical, { left: "33.33%" }]} />
              <View style={[s.gridVertical, { left: "66.66%" }]} />
            </View>
            <View style={s.referenceBar}>
              <Text style={s.referenceText}>
                {reference.display_name}님의 구도 참고
              </Text>
              <View style={s.referenceChoices}>
                {[0, 0.2, 0.35, 0.5].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: overlay === value }}
                    accessibilityLabel={
                      value === 0
                        ? "참고 사진 숨기기"
                        : `참고 사진 ${Math.round(value * 100)}퍼센트`
                    }
                    style={[
                      s.overlayChoice,
                      overlay === value && s.filterSelected,
                    ]}
                    onPress={() => setOverlay(value)}
                  >
                    <Text style={s.overlayText}>
                      {value === 0 ? "숨김" : `${Math.round(value * 100)}%`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </View>
      <ScrollView
        style={s.reviewScroll}
        contentContainerStyle={s.controls}
        keyboardShouldPersistTaps="handled"
      >
        {photo ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.filters}
              contentContainerStyle={s.filterRow}
            >
              {(Object.keys(PHOTO_FILTERS) as PhotoFilter[]).map((filter) => (
                <Pressable
                  key={filter}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: context.filter === filter,
                    disabled: locked,
                  }}
                  onPress={() => setContext((old) => ({ ...old, filter }))}
                  style={[
                    s.filterChip,
                    context.filter === filter && s.filterSelected,
                  ]}
                >
                  <Text style={s.filterText}>
                    {PHOTO_FILTERS[filter].label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={s.muted}>
              {prepared
                ? "같은 사진·설정으로 게시를 다시 시도할 수 있어요."
                : remaining > 0
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
              editable={!locked}
              accessibilityLabel="사진 설명"
            />
            <View style={s.placeCard}>
              <Text style={s.sectionTitle}>촬영 장소</Text>
              <Text style={s.small}>
                대략적인 위치만 공유해요. 친구의 현재 위치는 표시하지 않아요.
              </Text>
              {context.place ? (
                <>
                  <TextInput
                    accessibilityLabel="촬영 장소 이름"
                    style={s.input}
                    value={context.place.label}
                    maxLength={80}
                    editable={!locked && !locating}
                    onChangeText={(label) =>
                      setContext((old) => ({
                        ...old,
                        place: old.place ? { ...old.place, label } : null,
                      }))
                    }
                  />
                  <View style={s.audiences}>
                    {(
                      ["private", "followers", "members"] as PlaceAudience[]
                    ).map((audience) => (
                      <Pressable
                        key={audience}
                        disabled={locked || locating}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: context.place?.audience === audience,
                        }}
                        style={[
                          s.audience,
                          context.place?.audience === audience &&
                            s.filterSelected,
                        ]}
                        onPress={() =>
                          setContext((old) => ({
                            ...old,
                            place: old.place
                              ? { ...old.place, audience }
                              : null,
                          }))
                        }
                      >
                        <Text style={s.filterText}>
                          {audienceLabel[audience]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={s.muted}>
                  {locating
                    ? "촬영한 장소를 찾고 있어요…"
                    : "위치를 사용하면 근처의 친구 사진과 연결돼요."}
                </Text>
              )}
              <View style={s.row}>
                <Pressable
                  disabled={locked || locating}
                  style={s.button}
                  onPress={() => void locate(true)}
                >
                  <Text>
                    {context.place ? "위치 다시 확인" : "촬영 장소 사용"}
                  </Text>
                </Pressable>
                {(context.place || locating) && (
                  <Pressable
                    disabled={locked}
                    style={s.button}
                    onPress={removePlace}
                  >
                    <Text>위치 빼기</Text>
                  </Pressable>
                )}
              </View>
              {!!locationError && (
                <Text style={s.error} accessibilityRole="alert">
                  {locationError}
                </Text>
              )}
            </View>
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
                  (!!status ||
                    locating ||
                    terminal ||
                    (!prepared && remaining <= 0)) &&
                    s.disabled,
                ]}
                disabled={
                  !!status ||
                  locating ||
                  terminal ||
                  (!prepared && remaining <= 0)
                }
                onPress={() => void publish()}
              >
                <Text style={s.primaryText}>
                  {prepared ? "다시 게시하기 ↗" : "순간 나누기 ↗"}
                </Text>
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
      </ScrollView>
    </KeyboardAvoidingView>
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
  reviewScroll: { flexGrow: 0, maxHeight: "55%" },
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
  filters: { width: "100%", flexGrow: 0 },
  filterRow: { gap: 8 },
  filterChip: {
    minHeight: 48,
    minWidth: 60,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 24,
  },
  filterSelected: { backgroundColor: "#d4ff3f", borderColor: "#20221d" },
  filterText: { fontSize: 13, fontWeight: "700", color: "#20221d" },
  placeCard: {
    width: "100%",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#f0f2eb",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  audiences: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  audience: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d9ddd0",
    borderRadius: 12,
    justifyContent: "center",
  },
  gridHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#ffffff70",
  },
  gridVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#ffffff70",
  },
  referenceBar: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#20221de6",
  },
  referenceText: { color: "white", fontSize: 13, fontWeight: "700" },
  referenceChoices: { flexDirection: "row", gap: 8 },
  overlayChoice: {
    minWidth: 48,
    minHeight: 48,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#fafbf8",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: { color: "#20221d", fontSize: 12 },
});
