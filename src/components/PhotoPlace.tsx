import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MapPin, SlidersHorizontal } from "lucide-react";
import type { Post } from "../../shared/types";
import {
  PHOTO_FILTERS,
  type PlaceAudience,
} from "../../shared/capture-context";
import {
  audienceLabel,
  placeMapUrl,
  setPlaceAudience,
} from "../../shared/places";
import { supabase } from "../lib/supabase";

export default function PhotoPlace({
  post,
  userId,
  onChange,
  client = supabase,
}: {
  post: Post;
  userId?: string;
  onChange?: (post: Partial<Post>) => void;
  client?: SupabaseClient | null;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const detail = post.details;
  if (!detail || post.sample) return null;
  const hasPlace =
    detail.latitude !== null &&
    detail.longitude !== null &&
    detail.audience !== null;
  async function change(audience: PlaceAudience | null) {
    if (pending || !client || !detail) return;
    setPending(true);
    setError("");
    try {
      await setPlaceAudience(client, post.id, audience);
      onChange?.({
        details: {
          ...detail,
          audience,
          ...(audience === null
            ? { latitude: null, longitude: null, label: null }
            : {}),
        },
      });
    } catch {
      setError("장소 설정을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }
  if (
    !hasPlace &&
    detail.photo_filter === "original" &&
    !detail.reference_post_id
  )
    return null;
  return (
    <div className="photo-place">
      <div className="photo-place-meta">
        {hasPlace && (
          <a
            href={placeMapUrl({
              latitude: detail.latitude!,
              longitude: detail.longitude!,
            })}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${detail.label ?? "촬영 장소"} 대략적 위치를 외부 지도에서 열기`}
          >
            <MapPin size={15} />
            {detail.label ?? "촬영 장소"}
            <span>대략적 위치 ↗</span>
          </a>
        )}
        {detail.photo_filter !== "original" && (
          <span>
            <SlidersHorizontal size={14} />
            {PHOTO_FILTERS[detail.photo_filter]?.label ?? detail.photo_filter}
          </span>
        )}
        {detail.reference_post_id && <span>같은 장소, 새로운 시선</span>}
      </div>
      {hasPlace && post.user_id === userId && onChange && (
        <details className="photo-place-settings">
          <summary>장소 공개 · {audienceLabel[detail.audience!]}</summary>
          <div className="photo-place-options" aria-label="사진 장소 공개 범위">
            {(Object.keys(audienceLabel) as PlaceAudience[]).map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                aria-pressed={detail.audience === value}
                onClick={() => void change(value)}
              >
                {audienceLabel[value]}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={() => void change(null)}
            >
              장소 삭제
            </button>
          </div>
          <small>
            사진의 촬영 장소에만 적용돼요. 현재 위치는 공유하지 않아요.
          </small>
        </details>
      )}
      {pending && <small role="status">저장 중…</small>}
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
