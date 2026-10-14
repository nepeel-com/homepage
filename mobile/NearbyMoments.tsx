import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./lib/supabase";
import { currentPlace, placesEnabled, setPlacesEnabled } from "./lib/location";
import {
  approximateDistance,
  getNearbyPhotos,
  refreshReference,
  type NearbyPhoto,
} from "../shared/places";

export default function NearbyMoments({
  userId,
  onFrame,
  onSpace,
}: {
  userId: string;
  onFrame: (photo: NearbyPhoto) => void;
  onSpace: () => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<NearbyPhoto[]>([]),
    [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const mounted = useRef(true),
    generation = useRef(0),
    pending = useRef(false),
    enabledRef = useRef(false),
    lastChecked = useRef(0);
  const dismissKey = `nepeel.places.dismissed.${userId}`;
  async function load(ask = false, manual = false) {
    if (pending.current || !supabase) return;
    const current = ++generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const place = await currentPlace("followers", ask);
      if (!mounted.current || current !== generation.current) return;
      if (ask) {
        await setPlacesEnabled(userId, true);
        enabledRef.current = true;
        if (mounted.current) setEnabled(true);
      }
      const photos = await getNearbyPhotos(
        supabase,
        place.latitude,
        place.longitude,
      );
      let dismissed: { ids: string[]; at: number } | null = null;
      try {
        dismissed = JSON.parse(
          (await AsyncStorage.getItem(dismissKey)) ?? "null",
        );
      } catch {
        /* Invalid local preference is ignored. */
      }
      const hidden =
        !manual && dismissed && Date.now() - dismissed.at < 86_400_000
          ? dismissed.ids
          : [];
      if (mounted.current && current === generation.current) {
        setRows(photos.filter((p) => !hidden.includes(p.post_id)));
        setChecked(true);
        lastChecked.current = Date.now();
      }
    } catch (e) {
      if (mounted.current && current === generation.current)
        setError(
          e instanceof Error ? e.message : "근처 사진을 불러오지 못했어요.",
        );
    } finally {
      pending.current = false;
      if (mounted.current && current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void placesEnabled(userId)
      .then((value) => {
        if (mounted.current) {
          enabledRef.current = value;
          setEnabled(value);
          if (value) void load();
        }
      })
      .catch(() => {
        if (mounted.current)
          setError("장소 설정을 읽지 못했어요. 다시 켜 주세요.");
      });
    const listener = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        enabledRef.current &&
        Date.now() - lastChecked.current > 300_000
      )
        void load();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      listener.remove();
    };
  }, [userId]);
  async function disable() {
    generation.current++;
    enabledRef.current = false;
    setEnabled(false);
    setRows([]);
    setBusy(false);
    setError("");
    try {
      await setPlacesEnabled(userId, false);
    } catch {
      if (mounted.current)
        setError("알림 끄기를 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }
  async function dismiss() {
    try {
      await AsyncStorage.setItem(
        dismissKey,
        JSON.stringify({ ids: rows.map((p) => p.post_id), at: Date.now() }),
      );
      if (mounted.current) setRows([]);
    } catch {
      if (mounted.current)
        setError("닫기 설정을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }
  async function frame(photo: NearbyPhoto) {
    if (opening || !supabase) return;
    setOpening(photo.post_id);
    setError("");
    const current = generation.current;
    try {
      const fresh = await refreshReference(supabase, photo);
      if (mounted.current && current === generation.current) onFrame(fresh);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "사진을 열지 못했어요.");
    } finally {
      if (mounted.current) setOpening(null);
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>SAME PLACE. YOUR PERSPECTIVE.</Text>
      <Text style={s.title}>
        {rows.length
          ? "친구가 남긴 순간, 이 근처에."
          : "같은 장소에서, 다른 순간을."}
      </Text>
      <Text style={s.copy}>
        {enabled
          ? "팔로우한 사람이 공유한 촬영 장소를 1km 안에서 찾아요. 지난 사진의 장소이며 현재 위치가 아니에요."
          : "위치를 켜면 근처의 친구 사진을 알려드려요. 참고 사진을 겹쳐 나만의 구도로 찍어보세요."}
      </Text>
      {!!rows.length && (
        <Text accessibilityLiveRegion="polite" style={s.copy}>
          {rows.length}개의 근처 사진을 찾았어요.
        </Text>
      )}
      {enabled && (
        <Pressable
          accessibilityRole="button"
          style={s.primary}
          onPress={onSpace}
        >
          <Text style={s.primaryText}>공간으로 보기 · 카메라로 찾아보기 ↗</Text>
        </Pressable>
      )}
      {busy && <ActivityIndicator accessibilityLabel="근처 사진을 찾는 중" />}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!busy && checked && enabled && !rows.length && !error && (
        <Text style={s.copy}>지금은 새로 알려드릴 근처 사진이 없어요.</Text>
      )}
      {!!rows.length && (
        <ScrollView
          horizontal
          contentContainerStyle={s.photos}
          showsHorizontalScrollIndicator={false}
        >
          {rows.map((photo) => (
            <View key={photo.post_id} style={s.photoCard}>
              <Image
                source={{ uri: photo.image_url }}
                style={s.image}
                accessibilityLabel={`${photo.display_name}님의 촬영 사진`}
              />
              <Text style={s.name}>
                {photo.display_name} · {approximateDistance(photo.distance_m)}
              </Text>
              <Text style={s.copy} numberOfLines={1}>
                {photo.label}
              </Text>
              <Text style={s.small}>
                {new Date(photo.created_at).toLocaleDateString("ko-KR")}
              </Text>
              <Pressable
                disabled={!!opening}
                accessibilityRole="button"
                style={({ pressed }) => [s.primary, pressed && s.pressed]}
                onPress={() => void frame(photo)}
              >
                <Text style={s.primaryText}>
                  {opening === photo.post_id
                    ? "사진 확인 중…"
                    : "같은 구도로 찍기 ↗"}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={s.actions}>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          style={s.button}
          onPress={() => void load(!enabled, true)}
        >
          <Text style={s.name}>
            {enabled ? "주변 다시 확인" : "근처 순간 알림 켜기"}
          </Text>
        </Pressable>
        {enabled && (
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            style={s.button}
            onPress={() => void disable()}
          >
            <Text>알림 끄기</Text>
          </Pressable>
        )}
        {!!rows.length && (
          <Pressable
            accessibilityRole="button"
            style={s.button}
            onPress={() => void dismiss()}
          >
            <Text>오늘은 닫기</Text>
          </Pressable>
        )}
      </View>
      <Text style={s.small}>
        앱을 사용할 때 확인 · 실시간 이동 경로 저장 안 함
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    backgroundColor: "#f0f2eb",
    borderRadius: 16,
    width: "100%",
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: "#58604e",
    fontWeight: "700",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#20221d" },
  copy: { fontSize: 13, lineHeight: 21, color: "#596151" },
  photos: { gap: 12 },
  photoCard: { width: 208, gap: 6 },
  image: { width: 208, height: 224, borderRadius: 12 },
  name: { fontSize: 13, fontWeight: "700", color: "#20221d" },
  small: { fontSize: 11, lineHeight: 18, color: "#596151" },
  primary: {
    backgroundColor: "#20221d",
    minHeight: 48,
    borderRadius: 10,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { color: "#d4ff3f", fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 48, padding: 10, justifyContent: "center" },
  error: { fontSize: 13, color: "#ae3725", lineHeight: 21 },
});
