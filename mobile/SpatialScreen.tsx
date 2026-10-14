import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { currentPlace } from "./lib/location";
import { supabase } from "./lib/supabase";
import {
  approximateDistance,
  getNearbyPhotos,
  getPhotoDetails,
  type NearbyPhoto,
} from "../shared/places";
import { spatialCues, type Coordinate } from "../shared/spatial";
import { getFeed } from "../shared/data";
import type { Post } from "../shared/types";

export default function SpatialScreen({
  close,
  onOpenPost,
}: {
  close: () => void;
  onOpenPost: (post: Post) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [origin, setOrigin] = useState<Coordinate | null>(null),
    [heading, setHeading] = useState<number | null>(null);
  const [photos, setPhotos] = useState<NearbyPhoto[]>([]),
    [selected, setSelected] = useState<NearbyPhoto | null>(null);
  const [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false),
    [error, setError] = useState("");
  const [compassError, setCompassError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [width, setWidth] = useState(360);
  const [height, setHeight] = useState(400);
  const lifetime = useRef(0),
    openLock = useRef(false),
    headingAt = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const current = ++lifetime.current;
    let compass: Location.LocationSubscription | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    setHeading(null);
    headingAt.current = 0;
    setSelected(null);
    setPhotos([]);
    setOrigin(null);
    setError("");
    setCompassError("");
    setBusy(false);
    setOpening(false);
    if (active && permission?.granted) {
      setBusy(true);
      void (async () => {
        try {
          const place = await currentPlace("followers", false);
          if (!alive) return;
          setOrigin(place);
          timeout = setTimeout(() => {
            if (alive && !headingAt.current)
              setCompassError(
                "방향 센서 응답이 없어요. 아래 사진 목록에서 순간을 열 수 있어요.",
              );
          }, 8000);
          void Location.watchHeadingAsync(
            (value) => {
              if (!alive) return;
              const north =
                value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
              if (!Number.isFinite(north) || north < 0 || value.accuracy < 1) {
                setHeading(null);
                setCompassError(
                  "나침반을 확인해 주세요. 휴대폰을 천천히 8자 모양으로 움직여 보세요.",
                );
                return;
              }
              if (Date.now() - headingAt.current < 100) return;
              headingAt.current = Date.now();
              setHeading(north);
              setCompassError("");
            },
            () => {
              if (alive) {
                setHeading(null);
                setCompassError(
                  "방향 센서를 사용할 수 없어요. 아래 사진 목록을 이용해 주세요.",
                );
              }
            },
          )
            .then((subscription) => {
              if (alive) compass = subscription;
              else subscription.remove();
            })
            .catch(() => {
              if (alive) setCompassError("방향 센서를 사용할 수 없어요.");
            });
          const rows = await getNearbyPhotos(
            supabase!,
            place.latitude,
            place.longitude,
          );
          if (alive) setPhotos(rows);
        } catch (e) {
          if (alive)
            setError(
              e instanceof Error ? e.message : "주변 순간을 찾지 못했어요.",
            );
        } finally {
          if (alive) setBusy(false);
        }
      })();
    }
    return () => {
      alive = false;
      if (lifetime.current === current) lifetime.current++;
      compass?.remove();
      if (timeout) clearTimeout(timeout);
    };
  }, [active, permission?.granted, refresh]);
  const cues = origin ? spatialCues(photos, origin, heading) : [];
  const visible = cues
      .filter((c) => c.inView)
      .slice(0, Math.max(1, Math.min(3, Math.floor((height - 80) / 108)))),
    nearest = cues[0];
  async function open(photo: NearbyPhoto) {
    if (openLock.current || !supabase) return;
    openLock.current = true;
    setOpening(true);
    setError("");
    const generation = lifetime.current;
    try {
      const [details] = await getPhotoDetails(supabase, [photo.post_id]);
      if (!details || details.latitude === null)
        throw Error(
          "이 순간의 장소가 더 이상 공유되지 않아요. 주변을 다시 확인해 주세요.",
        );
      const [post] = await getFeed(supabase, "all", "", 0, photo.post_id);
      if (!post) throw Error("이 게시물을 더 이상 볼 수 없어요.");
      if (lifetime.current === generation) onOpenPost(post);
    } catch (e) {
      if (lifetime.current === generation)
        setError(e instanceof Error ? e.message : "게시물을 열지 못했어요.");
    } finally {
      openLock.current = false;
      if (lifetime.current === generation) setOpening(false);
    }
  }
  const directionText = {
    nearby: "바로 이 부근",
    unknown: "방향 확인 중",
    ahead: "정면",
    behind: "뒤쪽",
    left: "← 왼쪽",
    right: "오른쪽 →",
  };
  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>MOMENTS IN SPACE</Text>
          <Text style={s.title}>공간에 남은 순간</Text>
        </View>
        <Pressable style={s.button} onPress={close} accessibilityRole="button">
          <Text style={s.white}>닫기</Text>
        </Pressable>
      </View>
      <View
        style={s.stage}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
          setHeight(e.nativeEvent.layout.height);
        }}
      >
        {permission?.granted && active ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            enableTorch={false}
            onMountError={() =>
              setError(
                "카메라를 열지 못했어요. 다른 카메라 앱을 닫고 다시 들어와 주세요.",
              )
            }
          />
        ) : (
          <View style={s.permission}>
            <Text style={s.white}>
              카메라로 주변을 비추면 사진이 있는 방향을 보여드려요. 이
              화면에서는 촬영하거나 영상을 저장하지 않아요.
            </Text>
            <Pressable
              style={s.primary}
              onPress={() =>
                permission?.canAskAgain === false
                  ? void Linking.openSettings()
                  : void requestPermission()
              }
            >
              <Text style={s.primaryText}>카메라 사용하기</Text>
            </Pressable>
          </View>
        )}
        {permission?.granted && (
          <>
            <View pointerEvents="none" style={s.compass}>
              <Text style={s.white}>
                {heading === null
                  ? "나침반 확인 중"
                  : `${Math.round(heading)}° · ${nearest ? directionText[nearest.direction] : "주변을 천천히 둘러보세요"}`}
              </Text>
            </View>
            {visible.map((cue, i) => (
              <Pressable
                key={cue.moment.post_id}
                accessibilityRole="button"
                accessibilityLabel={`${cue.moment.display_name}님의 ${cue.moment.label} 사진 선택`}
                style={[
                  s.marker,
                  {
                    left: Math.max(
                      12,
                      Math.min(width - 132, cue.x * width - 60),
                    ),
                    top: 70 + i * 108,
                  },
                  selected?.post_id === cue.moment.post_id && s.markerSelected,
                ]}
                onPress={() => setSelected(cue.moment)}
              >
                <Image
                  source={{ uri: cue.moment.image_url }}
                  style={s.markerImage}
                />
                <Text numberOfLines={1} style={s.markerName}>
                  {cue.moment.display_name}
                </Text>
                <Text style={s.markerDistance}>
                  {cue.close
                    ? "이 부근"
                    : approximateDistance(Math.round(cue.distance / 50) * 50)}
                </Text>
              </Pressable>
            ))}
            {!busy && origin && !photos.length && (
              <View style={s.hint}>
                <Text style={s.white}>
                  이 근처에는 아직 공유된 친구의 순간이 없어요.
                </Text>
              </View>
            )}
            {nearest && !visible.length && (
              <View style={s.hint}>
                <Text style={s.white}>
                  {directionText[nearest.direction]} ·{" "}
                  {approximateDistance(Math.round(nearest.distance / 50) * 50)}
                </Text>
                <Text style={s.small}>
                  휴대폰을 천천히 돌려 친구의 순간을 찾아보세요.
                </Text>
              </View>
            )}
          </>
        )}
      </View>
      <ScrollView style={s.panel} contentContainerStyle={s.panelContent}>
        {busy && (
          <ActivityIndicator
            color="#d4ff3f"
            accessibilityLabel="주변 순간 찾는 중"
          />
        )}
        {!!compassError && <Text style={s.small}>{compassError}</Text>}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {selected ? (
          <View style={s.selected}>
            <Image source={{ uri: selected.image_url }} style={s.preview} />
            <View style={s.copy}>
              <Text style={s.white}>{selected.display_name}님의 순간</Text>
              <Text style={s.small}>
                {selected.label} ·{" "}
                {new Date(selected.created_at).toLocaleDateString("ko-KR")}
              </Text>
              <Pressable
                disabled={opening}
                accessibilityRole="button"
                style={s.primary}
                onPress={() => void open(selected)}
              >
                <Text style={s.primaryText}>
                  {opening ? "게시물 여는 중…" : "이 순간의 피드로 ↗"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={s.small}>
            떠 있는 사진을 눌러 그날의 피드로 들어가 보세요.
          </Text>
        )}
        {!!cues.length && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tray}
          >
            {cues.map((cue) => (
              <Pressable
                key={cue.moment.post_id}
                accessibilityRole="button"
                style={s.trayItem}
                onPress={() => setSelected(cue.moment)}
              >
                <Text style={s.white}>{cue.moment.display_name}</Text>
                <Text style={s.small}>
                  {directionText[cue.direction]} ·{" "}
                  {approximateDistance(Math.round(cue.distance / 50) * 50)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={s.footer}>
          <Text style={[s.small, s.copy]}>
            GPS 방향 보기 · 정밀한 공간 고정은 아니에요.{"\n"}현재 친구 위치가
            아닌 과거 사진의 장소예요.
          </Text>
          <Pressable
            style={s.button}
            disabled={busy}
            onPress={() => setRefresh((n) => n + 1)}
          >
            <Text style={s.white}>위치 갱신</Text>
          </Pressable>
        </View>
        <Text style={s.small}>
          안전한 곳에 멈춰 둘러보세요. 이동했다면 위치를 갱신해 주세요.
        </Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#171c14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: "#d4ff3f" },
  title: { fontSize: 21, fontWeight: "800", color: "#fff", marginTop: 5 },
  white: { color: "#f7faef", fontSize: 14, lineHeight: 21 },
  small: { color: "#c1c9b8", fontSize: 12, lineHeight: 19 },
  button: { minHeight: 48, padding: 12, justifyContent: "center" },
  stage: {
    flex: 1,
    minHeight: 260,
    backgroundColor: "#283222",
    overflow: "hidden",
  },
  permission: { padding: 24, gap: 20 },
  compass: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: "#17200de6",
    padding: 10,
    borderRadius: 20,
  },
  marker: {
    position: "absolute",
    width: 120,
    height: 104,
    backgroundColor: "#17200deF",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d4ff3f88",
    alignItems: "center",
  },
  markerSelected: { borderWidth: 2, borderColor: "#d4ff3f" },
  markerImage: { width: 104, height: 55, borderRadius: 7 },
  markerName: { fontSize: 12, color: "#fff", fontWeight: "700", marginTop: 3 },
  markerDistance: { fontSize: 10, color: "#d4ff3f" },
  hint: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    backgroundColor: "#17200de6",
    borderRadius: 12,
    padding: 14,
    maxWidth: "90%",
    gap: 4,
  },
  panel: { flexGrow: 0, maxHeight: "43%" },
  panelContent: { padding: 16, gap: 14 },
  selected: { flexDirection: "row", gap: 12, alignItems: "center" },
  preview: { width: 80, height: 100, borderRadius: 12 },
  copy: { flex: 1, gap: 5 },
  primary: {
    backgroundColor: "#d4ff3f",
    padding: 12,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { color: "#20221d", fontWeight: "800", fontSize: 13 },
  tray: { gap: 8 },
  trayItem: {
    borderWidth: 1,
    borderColor: "#48503d",
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    gap: 3,
  },
  footer: { flexDirection: "row", alignItems: "center", gap: 8 },
  error: { color: "#ffb7a6", fontSize: 13, lineHeight: 21 },
});
