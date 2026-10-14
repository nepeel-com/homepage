import sharp from "sharp";
import { PHOTO_FILTERS, type PhotoFilter } from "../shared/capture-context.js";

export async function applyPhotoFilter(
  clean: Buffer,
  filter: PhotoFilter,
): Promise<Buffer> {
  if (filter === "original") return clean;
  const m = PHOTO_FILTERS[filter].matrix;
  // Non-negative matrices stay within gamut before adding their small offsets.
  // These are the same sRGB coefficients used by the native GPU preview.
  return sharp(clean)
    .recomb([
      [m[0], m[1], m[2]],
      [m[5], m[6], m[7]],
      [m[10], m[11], m[12]],
    ])
    .linear([1, 1, 1], [m[4] * 255, m[9] * 255, m[14] * 255])
    .jpeg({ quality: 85 })
    .toBuffer();
}
