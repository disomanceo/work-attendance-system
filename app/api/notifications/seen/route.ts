import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

type NotificationBody = {
  action?: unknown;
  keys?: unknown;
  key?: unknown;
  kind?: unknown;
  referenceId?: unknown;
  metadata?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export async function POST(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | NotificationBody
    | null;
  const action = text(body?.action);

  if (action === "list") {
    const keys = Array.isArray(body?.keys)
      ? body.keys.map(text).filter(Boolean).slice(0, 100)
      : [];

    if (keys.length === 0) {
      return NextResponse.json({ ok: true, records: {} });
    }

    const { data, error } = await auth.admin
      .from("user_notification_reads")
      .select("notification_key, seen_at, dismissed_at, dismiss_count")
      .eq("user_id", auth.profile.id)
      .in("notification_key", keys);

    if (error) {
      console.error("Load notification seen state error:", error);
      return NextResponse.json(
        { ok: false, message: "โหลดสถานะแจ้งเตือนไม่สำเร็จ" },
        { status: 500 },
      );
    }

    const records = Object.fromEntries(
      (data ?? []).map((item) => [
        item.notification_key,
        {
          seenAt: item.seen_at || "",
          dismissedAt: item.dismissed_at || "",
          dismissCount: Number(item.dismiss_count || 0),
        },
      ]),
    );

    return NextResponse.json({ ok: true, records });
  }

  if (action !== "mark" && action !== "dismiss") {
    return NextResponse.json(
      { ok: false, message: "คำสั่งแจ้งเตือนไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const key = text(body?.key);
  const kind = text(body?.kind);

  if (!key || !kind) {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลแจ้งเตือนไม่ครบถ้วน" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (action === "mark") {
    const { data, error } = await auth.admin
      .from("user_notification_reads")
      .upsert(
        {
          user_id: auth.profile.id,
          notification_key: key,
          notification_kind: kind,
          reference_id: text(body?.referenceId) || null,
          seen_at: now,
          dismissed_at: now,
          metadata: safeMetadata(body?.metadata),
        },
        { onConflict: "user_id,notification_key" },
      )
      .select("notification_key, seen_at, dismissed_at, dismiss_count")
      .single();

    if (error) {
      console.error("Mark notification seen error:", error);
      return NextResponse.json(
        { ok: false, message: "บันทึกสถานะแจ้งเตือนไม่สำเร็จ" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      record: {
        key: data.notification_key,
        seenAt: data.seen_at || "",
        dismissedAt: data.dismissed_at || "",
        dismissCount: Number(data.dismiss_count || 0),
      },
    });
  }

  const { data: existing, error: loadError } = await auth.admin
    .from("user_notification_reads")
    .select("dismiss_count, seen_at")
    .eq("user_id", auth.profile.id)
    .eq("notification_key", key)
    .maybeSingle();

  if (loadError) {
    console.error("Load notification dismiss count error:", loadError);
    return NextResponse.json(
      { ok: false, message: "โหลดสถานะแจ้งเตือนไม่สำเร็จ" },
      { status: 500 },
    );
  }

  const dismissCount = Number(existing?.dismiss_count || 0) + 1;
  const { data, error } = await auth.admin
    .from("user_notification_reads")
    .upsert(
      {
        user_id: auth.profile.id,
        notification_key: key,
        notification_kind: kind,
        reference_id: text(body?.referenceId) || null,
        dismissed_at: now,
        dismiss_count: dismissCount,
        seen_at: existing?.seen_at || null,
        metadata: safeMetadata(body?.metadata),
      },
      { onConflict: "user_id,notification_key" },
    )
    .select("notification_key, seen_at, dismissed_at, dismiss_count")
    .single();

  if (error) {
    console.error("Dismiss notification error:", error);
    return NextResponse.json(
      { ok: false, message: "บันทึกการปิดแจ้งเตือนไม่สำเร็จ" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    record: {
      key: data.notification_key,
      seenAt: data.seen_at || "",
      dismissedAt: data.dismissed_at || "",
      dismissCount: Number(data.dismiss_count || 0),
    },
  });
}
