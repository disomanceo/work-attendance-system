import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getLineAdminClient, getLineGroupSummary } from "@/lib/line/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSignature(body: string, signature: string) {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  if (!validSignature(body, signature)) {
    return NextResponse.json({ ok: false, message: "LINE signature ไม่ถูกต้อง" }, { status: 401 });
  }

  const payload = JSON.parse(body) as {
    events?: Array<{ source?: { type?: string; groupId?: string } }>;
  };

  const groupId = payload.events?.find(x => x.source?.type === "group")?.source?.groupId;
  if (!groupId) return NextResponse.json({ ok: true });

  const admin = getLineAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Supabase Environment Variables ยังไม่ครบ" }, { status: 500 });
  }

  const summary = await getLineGroupSummary(groupId);
  const { error } = await admin.from("line_notification_settings").upsert({
    id: 1,
    group_id: groupId,
    group_name: summary?.groupName || null,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
