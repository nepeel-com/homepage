export const PHOTO_FILTERS = {
  original: {
    label: "원본",
    matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
  warm: {
    label: "온기",
    matrix: [
      0.96, 0, 0, 0, 0.04, 0, 0.94, 0, 0, 0.02, 0, 0, 0.86, 0, 0.01, 0, 0, 0, 1,
      0,
    ],
  },
  cool: {
    label: "청량",
    matrix: [
      0.88, 0, 0, 0, 0.01, 0, 0.96, 0, 0, 0.025, 0, 0, 0.98, 0, 0.02, 0, 0, 0,
      1, 0,
    ],
  },
  mono: {
    label: "흑백",
    matrix: [
      0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126,
      0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0,
    ],
  },
  film: {
    label: "필름",
    matrix: [
      0.76, 0.09, 0.03, 0, 0.1, 0.04, 0.79, 0.03, 0, 0.08, 0.04, 0.07, 0.72, 0,
      0.07, 0, 0, 0, 1, 0,
    ],
  },
} as const;
export type PhotoFilter = keyof typeof PHOTO_FILTERS;
export type PlaceAudience = "private" | "followers" | "members";
export interface PhotoPlace {
  latitude: number;
  longitude: number;
  label: string;
  audience: PlaceAudience;
}
export interface CaptureContext {
  version: 1;
  filter: PhotoFilter;
  place: PhotoPlace | null;
  referencePostId: string | null;
}
export const emptyCaptureContext = (): CaptureContext => ({
  version: 1,
  filter: "original",
  place: null,
  referencePostId: null,
});
export const roundCoordinate = (value: number) =>
  Math.round(value * 1000) / 1000;

export function normalizeCaptureContext(input: unknown): CaptureContext {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("INVALID_CAPTURE_CONTEXT");
  const value = input as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.filter !== "string" ||
    !Object.hasOwn(PHOTO_FILTERS, value.filter) ||
    Object.keys(value).some(
      (k) => !["version", "filter", "place", "referencePostId"].includes(k),
    )
  )
    throw new Error("INVALID_CAPTURE_CONTEXT");
  const reference = value.referencePostId;
  if (
    reference !== null &&
    (typeof reference !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        reference,
      ))
  )
    throw new Error("INVALID_CAPTURE_CONTEXT");
  let place: PhotoPlace | null = null;
  if (value.place !== null) {
    if (
      !value.place ||
      typeof value.place !== "object" ||
      Array.isArray(value.place)
    )
      throw new Error("INVALID_PHOTO_PLACE");
    const p = value.place as Record<string, unknown>;
    if (
      typeof p.latitude !== "number" ||
      !Number.isFinite(p.latitude) ||
      Math.abs(p.latitude) > 90 ||
      typeof p.longitude !== "number" ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.longitude) > 180 ||
      typeof p.label !== "string" ||
      !p.label.trim() ||
      p.label.trim().length > 80 ||
      !["private", "followers", "members"].includes(String(p.audience)) ||
      Object.keys(p).some(
        (k) => !["latitude", "longitude", "label", "audience"].includes(k),
      )
    )
      throw new Error("INVALID_PHOTO_PLACE");
    place = {
      latitude: roundCoordinate(p.latitude),
      longitude: roundCoordinate(p.longitude),
      label: p.label.trim(),
      audience: p.audience as PlaceAudience,
    };
  }
  return {
    version: 1,
    filter: value.filter as PhotoFilter,
    place,
    referencePostId: reference as string | null,
  };
}
export function contextPayload(context: CaptureContext) {
  const c = normalizeCaptureContext(context);
  return [
    c.filter,
    c.place
      ? [c.place.latitude, c.place.longitude, c.place.label, c.place.audience]
      : null,
    c.referencePostId,
  ];
}
export function distanceMeters(
  a: Pick<PhotoPlace, "latitude" | "longitude">,
  b: Pick<PhotoPlace, "latitude" | "longitude">,
) {
  const rad = Math.PI / 180;
  const value =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
