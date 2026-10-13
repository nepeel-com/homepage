import handler, { type CaptureResponse } from "../../server/capture.js";

// Standard Request/Response adapter; capture verification stays provider-independent.
export default async function capture(request: Request): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  let status = 200;
  let payload: unknown;
  const response: CaptureResponse = {
    setHeader: (key, value) => {
      headers.set(key, value);
    },
    status: (value) => {
      status = value;
      return response;
    },
    json: (value) => {
      payload = value;
    },
  };
  let body: unknown;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 3_000_000)
      return Response.json(
        { error: "사진이 너무 큽니다." },
        { status: 413, headers },
      );
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "잘못된 요청입니다." },
        { status: 400, headers },
      );
    }
  }
  await handler(
    {
      method: request.method,
      headers: {
        authorization: request.headers.get("authorization") ?? undefined,
      },
      body,
    },
    response,
  );
  return Response.json(payload, { status, headers });
}
