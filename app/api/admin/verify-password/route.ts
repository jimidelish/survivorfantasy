import { NextRequest, NextResponse } from "next/server";

// Gate for selecting an admin account on the login page — a single shared
// passphrase (ADMIN_ACCESS_PASSWORD), not per-account credentials. This is
// a deterrent against casually clicking into an admin account in a
// trusted-friend-group app, not a real multi-user auth system: there's
// still no session/token, just this one check before localStorage gets
// set to that admin's identity (see app/login/page.tsx).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const password = (body.password as string) || "";

  const expected = process.env.ADMIN_ACCESS_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Admin password isn't configured. Set ADMIN_ACCESS_PASSWORD in environment variables." },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
