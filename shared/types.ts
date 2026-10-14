import { contextPayload, type CaptureContext } from "./capture-context";
import type { PhotoDetails } from "./places";
export type FeedMode = "all" | "following" | "saved" | "profile";
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
}
export interface Post {
  id: string;
  user_id: string;
  caption: string;
  image_path: string;
  created_at: string;
  captured_at: string;
  platform: "ios" | "android";
  username: string;
  display_name: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
  image_url: string;
  details?: PhotoDetails;
  sample?: boolean;
}
export interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string };
}
export interface Challenge {
  id: string;
  nonce: string;
  expires_at: string;
}
export type CaptureProof =
  | { platform: "ios"; keyId: string; assertion: string }
  | { platform: "android"; token: string }
  | { platform: "android"; kind: "hardware"; chain: string[] };
export interface CaptureRequest {
  action: "publish";
  challengeId: string;
  imageBase64: string;
  caption: string;
  proof: CaptureProof;
  context?: CaptureContext;
}
export const CAPTURE_MAX_BYTES = 2 * 1024 * 1024;
export const CAPTION_MAX_LENGTH = 1000;
export const ANDROID_HARDWARE_CHALLENGE_PREFIX = "nepeel.capture.android.v1:";
// Stable across native and server: bind the exact bytes, caption, account, and nonce.
export function capturePayload(
  userId: string,
  challenge: Challenge,
  imageHash: string,
  caption: string,
  context?: CaptureContext,
) {
  return JSON.stringify([
    context ? "nepeel.capture.v2" : "nepeel.capture.v1",
    userId,
    challenge.id,
    challenge.nonce,
    imageHash,
    caption,
    ...(context ? [contextPayload(context)] : []),
  ]);
}
