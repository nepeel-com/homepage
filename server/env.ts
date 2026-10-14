import { ApiError } from "./validation.js";

export function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new ApiError(503, "앱 인증 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
  return value;
}
