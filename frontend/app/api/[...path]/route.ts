// Server-side proxy: the browser only ever talks to the Next.js container,
// which forwards /api/* to the FastAPI middleware on the internal network.
// API_URL is read at request time, so the same image works in any environment.
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

// Headers worth passing upstream (identity headers come from the OAuth proxy later).
const FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "x-forwarded-email",
  "x-forwarded-user",
  "x-forwarded-preferred-username",
];

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `${API_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "API unreachable" }, { status: 502 });
  }

  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
