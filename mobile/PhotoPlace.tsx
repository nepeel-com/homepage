import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Post } from "../shared/types";
import { PHOTO_FILTERS, type PlaceAudience } from "../shared/capture-context";
import { audienceLabel, placeMapUrl, setPlaceAudience } from "../shared/places";
import { supabase } from "./lib/supabase";

export default function PhotoPlace({
  post,
  userId,
  onChange,
}: {
  post: Post;
  userId: string;
  onChange: (patch: Partial<Post>) => void;
}) {
  const [editing, setEditing] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const d = post.details;
  if (!d) return null;
  const hasPlace =
    d.latitude !== null && d.longitude !== null && d.audience !== null;
  async function change(audience: PlaceAudience | null) {
    if (pending || !supabase || !d) return;
    setPending(true);
    setError("");
    try {
      await setPlaceAudience(supabase, post.id, audience);
      onChange({
        details: {
          ...d,
          audience,
          ...(audience === null
            ? { latitude: null, longitude: null, label: null }
            : {}),
        },
      });
      if (audience === null) setEditing(false);
    } catch {
      setError("장소 설정을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }
  async function map() {
    if (!d || !hasPlace) return;
    try {
      await Linking.openURL(
        placeMapUrl({ latitude: d.latitude!, longitude: d.longitude! }),
      );
    } catch {
      setError("지도 앱을 열지 못했어요.");
    }
  }
  if (!hasPlace && d.photo_filter === "original" && !d.reference_post_id)
    return null;
  return (
    <View style={s.card}>
      {hasPlace && (
        <Pressable
          accessibilityRole="link"
          style={s.link}
          onPress={() => void map()}
        >
          <Text style={s.title}>{d.label ?? "촬영 장소"} ↗</Text>
          <Text style={s.small}>대략적 위치 · 외부 지도에서 보기</Text>
        </Pressable>
      )}
      {d.photo_filter !== "original" && (
        <Text style={s.small}>
          색감 · {PHOTO_FILTERS[d.photo_filter]?.label ?? d.photo_filter}
        </Text>
      )}
      {!!d.reference_post_id && (
        <Text style={s.small}>같은 장소, 새로운 시선</Text>
      )}
      {hasPlace && post.user_id === userId && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: editing }}
            style={s.button}
            onPress={() => setEditing(!editing)}
          >
            <Text style={s.small}>
              장소 공개 · {audienceLabel[d.audience!]} {editing ? "⌃" : "⌄"}
            </Text>
          </Pressable>
          {editing && (
            <View style={s.options}>
              {(Object.keys(audienceLabel) as PlaceAudience[]).map((value) => (
                <Pressable
                  key={value}
                  disabled={pending}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: d.audience === value,
                    disabled: pending,
                  }}
                  style={[s.button, d.audience === value && s.selected]}
                  onPress={() => void change(value)}
                >
                  <Text style={s.small}>{audienceLabel[value]}</Text>
                </Pressable>
              ))}
              <Pressable
                disabled={pending}
                accessibilityRole="button"
                style={s.button}
                onPress={() => void change(null)}
              >
                <Text style={s.small}>장소 삭제</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      {pending && (
        <Text accessibilityLiveRegion="polite" style={s.small}>
          저장 중…
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { gap: 4, paddingTop: 8 },
  link: { minHeight: 48, justifyContent: "center", gap: 4 },
  title: { fontSize: 13, fontWeight: "700", color: "#303929" },
  small: { fontSize: 12, lineHeight: 19, color: "#58604e" },
  button: {
    minHeight: 48,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 10,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selected: { backgroundColor: "#e7eed8" },
  error: { fontSize: 13, color: "#ae3725" },
});
