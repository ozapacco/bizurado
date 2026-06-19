import { NextRequest, NextResponse } from "next/server";

// Single-password gate via HTTP Basic Auth. The browser prompts once and then
// sends the Authorization header on every same-origin request (pages AND API),
// so the whole app — including data-mutating routes — is protected with no
// custom login UI. Set APP_PASSWORD in the environment (Vercel env var / local
// .env.local). If it is unset, the gate is disabled (handy for local dev).
export const config = {
  // Protect everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (password === expected) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Bizurado", charset="UTF-8"' },
  });
}
