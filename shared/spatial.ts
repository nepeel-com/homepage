import { distanceMeters } from "./capture-context";
export type Coordinate = { latitude: number; longitude: number };
export type SpatialMoment = Coordinate & { post_id: string };
export type SpatialDirection =
  "nearby" | "unknown" | "ahead" | "behind" | "left" | "right";
const radians = (degrees: number) => (degrees * Math.PI) / 180;
export const wrapDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;
export const relativeBearing = (bearing: number, heading: number) =>
  ((((bearing - heading + 540) % 360) + 360) % 360) - 180;
export function bearingBetween(from: Coordinate, to: Coordinate): number {
  const a = radians(from.latitude),
    b = radians(to.latitude),
    delta = radians(to.longitude - from.longitude);
  return wrapDegrees(
    (Math.atan2(
      Math.sin(delta) * Math.cos(b),
      Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta),
    ) *
      180) /
      Math.PI,
  );
}
// Presentation-independent geographic cues. A future XR renderer can use its own
// tracked camera pose; phone compass projection is deliberately an approximate HUD.
export function spatialCues<T extends SpatialMoment>(
  moments: T[],
  origin: Coordinate,
  heading: number | null,
) {
  if (
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude) ||
    Math.abs(origin.latitude) > 90 ||
    Math.abs(origin.longitude) > 180
  )
    return [];
  const seen = new Set<string>();
  return moments
    .filter((p) => {
      if (
        seen.has(p.post_id) ||
        !Number.isFinite(p.latitude) ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude) > 90 ||
        Math.abs(p.longitude) > 180
      )
        return false;
      seen.add(p.post_id);
      return true;
    })
    .map((moment) => {
      const distance = distanceMeters(origin, moment);
      const close = distance < 120; // Quantized photo coordinates cannot establish a precise bearing nearby.
      const bearing = bearingBetween(origin, moment);
      const angle =
        heading !== null && Number.isFinite(heading)
          ? relativeBearing(bearing, heading)
          : null;
      const inView = close || (angle !== null && Math.abs(angle) <= 38);
      const direction: SpatialDirection = close
        ? "nearby"
        : angle === null
          ? "unknown"
          : Math.abs(angle) <= 15
            ? "ahead"
            : Math.abs(angle) > 150
              ? "behind"
              : angle < 0
                ? "left"
                : "right";
      return {
        moment,
        distance,
        bearing,
        angle,
        close,
        inView,
        direction,
        x:
          close || angle === null
            ? 0.5
            : Math.max(0.08, Math.min(0.92, 0.5 + angle / 90)),
      };
    })
    .filter((cue) => cue.distance <= 1000)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.moment.post_id.localeCompare(b.moment.post_id),
    );
}
