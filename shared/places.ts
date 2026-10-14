import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoFilter, PhotoPlace } from "./capture-context";
import { roundCoordinate } from "./capture-context";

export interface PhotoDetails {
  post_id: string;
  photo_filter: PhotoFilter;
  reference_post_id: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  audience: PhotoPlace["audience"] | null;
}
export interface NearbyPhoto {
  post_id: string;
  user_id: string;
  display_name: string;
  image_path: string;
  image_url: string;
  created_at: string;
  latitude: number;
  longitude: number;
  label: string;
  distance_m: number;
  photo_filter: PhotoFilter;
}
export async function getPhotoDetails(
  client: SupabaseClient,
  ids: string[],
): Promise<PhotoDetails[]> {
  if (!ids.length) return [];
  const { data, error } = await client.rpc("get_photo_details", {
    p_ids: ids.slice(0, 40),
  });
  if (error) throw error;
  return (data ?? []).map((r: PhotoDetails) => ({
    ...r,
    latitude: r.latitude === null ? null : Number(r.latitude),
    longitude: r.longitude === null ? null : Number(r.longitude),
  }));
}
export async function getNearbyPhotos(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
): Promise<NearbyPhoto[]> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error("위치를 확인하지 못했어요.");
  const { data, error } = await client.rpc("nearby_followed_photos", {
    p_latitude: roundCoordinate(latitude),
    p_longitude: roundCoordinate(longitude),
    p_radius: 1000,
  });
  if (error) throw error;
  const rows = (data ?? []) as NearbyPhoto[];
  if (!rows.length) return [];
  const signed = await client.storage.from("captures").createSignedUrls(
    rows.map((r) => r.image_path),
    300,
  );
  if (signed.error) throw signed.error;
  return rows.map((r, i) => ({
    ...r,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    image_url: signed.data?.[i]?.signedUrl ?? "",
  }));
}
export async function setPlaceAudience(
  client: SupabaseClient,
  postId: string,
  audience: PhotoPlace["audience"] | null,
) {
  const { error } = await client.rpc("set_photo_place_audience", {
    p_post: postId,
    p_audience: audience,
  });
  if (error) throw error;
}
export async function refreshReference(
  client: SupabaseClient,
  photo: NearbyPhoto,
): Promise<NearbyPhoto> {
  const [details] = await getPhotoDetails(client, [photo.post_id]);
  if (!details || details.latitude === null || details.longitude === null)
    throw new Error(
      "이 사진의 장소가 더 이상 공유되지 않아요. 주변을 다시 확인해 주세요.",
    );
  const { data, error } = await client.storage
    .from("captures")
    .createSignedUrl(photo.image_path, 300);
  if (error || !data?.signedUrl)
    throw new Error("참고 사진을 열지 못했어요. 다시 시도해 주세요.");
  return {
    ...photo,
    image_url: data.signedUrl,
    latitude: details.latitude,
    longitude: details.longitude,
    label: details.label ?? photo.label,
  };
}
export function placeMapUrl(place: Pick<PhotoPlace, "latitude" | "longitude">) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
}
export const audienceLabel = {
  private: "나만",
  followers: "팔로워",
  members: "모든 회원",
} as const;
export const approximateDistance = (meters: number) =>
  meters < 100
    ? "100m 이내"
    : meters < 1000
      ? `약 ${meters}m`
      : `약 ${(meters / 1000).toFixed(1)}km`;
