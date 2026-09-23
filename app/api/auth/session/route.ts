import {
  getAdminAuth,
  getSessionCookieMaxAgeSeconds,
  SESSION_COOKIE_NAME,
} from "@/lib/firebase/admin";

function buildSessionCookie(value: string, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function clearedSessionCookie(): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function POST(request: Request) {
  const auth = getAdminAuth();
  if (!auth) {
    return Response.json(
      { error: "Server Firebase is not configured. Fill in your .env.local values." },
      { status: 503 },
    );
  }
  let idToken: unknown = null;
  try {
    idToken = (await request.json())["idToken"];
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof idToken !== "string" || idToken === "") {
    return Response.json({ error: "Missing ID token." }, { status: 400 });
  }
  try {
    const maxAgeSeconds = getSessionCookieMaxAgeSeconds();
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: maxAgeSeconds * 1000,
    });
    const response = Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.headers.append("Set-Cookie", buildSessionCookie(sessionCookie, maxAgeSeconds));
    return response;
  } catch {
    return Response.json(
      { error: "Could not verify your login. Please try again." },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const response = Response.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.headers.append("Set-Cookie", clearedSessionCookie());
  return response;
}
